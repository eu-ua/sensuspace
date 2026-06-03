import { db, auth } from '../firebase-config.js';
import { collection, getDocs, doc, setDoc, getDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    const globalSearchInput = document.querySelector('.global-search-input');
    const globalContentArea = document.querySelector('.global-content-area');
    const otherProfileModal = document.getElementById('other-user-profile-modal');
    const closeOtherProfileBtn = document.getElementById('close-other-profile-btn');
    const followBtn = document.getElementById('follow-user-btn');
    const messageUserBtn = document.getElementById('message-user-btn');
    
    let currentViewedUserId = null;
    let otherProfileUnsubscribe = null;

    if (globalSearchInput && globalContentArea) {
        globalSearchInput.addEventListener('input', async (e) => {
            const queryText = e.target.value.toLowerCase().trim();
            if (!queryText) { globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Введіть ім\'я для пошуку...</p>'; return; }
            
            const usersSnap = await getDocs(collection(db, "users"));
            globalContentArea.innerHTML = ''; 
            let found = false;
            
            usersSnap.forEach(docSnap => {
                const data = docSnap.data();
                const userId = docSnap.id;
                const searchName = (data.nickname || data.username || data.login || "").toLowerCase();
                
                if (searchName.includes(queryText) && userId !== auth.currentUser?.uid) {
                    found = true;
                    const avatar = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                    const card = document.createElement('div');
                    card.className = 'search-user-card';
                    const displayName = data.nickname || data.username || data.login || (data.email ? data.email.split('@')[0] : null) || 'Користувач';
                    card.innerHTML = `<img src="${avatar}" alt="user"><div class="search-user-info"><h4>${displayName}</h4><p>${data.bio ? data.bio.substring(0, 30) + '...' : 'Новий учасник платформи'}</p></div>`;
                    card.addEventListener('click', () => window.openOtherProfile(userId, { nickname: displayName, avatarUrl: avatar }));
                    globalContentArea.appendChild(card);
                }
            });
            if (!found) globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Нікого не знайдено :(</p>';
        });
    }

    if (closeOtherProfileBtn) {
        closeOtherProfileBtn.addEventListener('click', () => {
            document.querySelector('.nav-btn.active')?.click();
            if(otherProfileUnsubscribe) otherProfileUnsubscribe();
        });
    }

    window.openOtherProfile = async (userId, initialData = {}) => {
        currentViewedUserId = userId;
        document.querySelectorAll('.app-screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
        otherProfileModal.classList.add('active');
        otherProfileModal.classList.remove('hidden');

        const fallbackAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
        document.getElementById('other-profile-avatar').src = initialData.avatarUrl || fallbackAvatar;
        document.getElementById('other-profile-nickname').textContent = initialData.nickname || "Користувач";
        document.getElementById('other-profile-bio').textContent = initialData.bio || "";
        document.getElementById('other-followers-count').textContent = (initialData.followers || []).length;
        document.getElementById('other-following-count').textContent = (initialData.following || []).length;
        
        const grid = document.getElementById('other-profile-grid');
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">Завантаження...</p>';
        
        if (otherProfileUnsubscribe) otherProfileUnsubscribe();
        otherProfileUnsubscribe = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('other-profile-avatar').src = data.avatarUrl || fallbackAvatar;
                document.getElementById('other-profile-nickname').textContent = data.nickname || data.username || data.login || "Користувач";
                document.getElementById('other-profile-bio').textContent = data.bio || "";
                
                const followers = data.followers || [];
                const following = data.following || [];
                document.getElementById('other-followers-count').textContent = followers.length;
                document.getElementById('other-following-count').textContent = following.length;
                
                const myUid = auth.currentUser?.uid;
                if (myUid && followers.includes(myUid)) {
                    followBtn.textContent = "Відписатися"; followBtn.style.background = "var(--bg-secondary)"; followBtn.style.color = "var(--text-primary)";
                } else {
                    followBtn.textContent = "Підписатися"; followBtn.style.background = "var(--accent-color)"; followBtn.style.color = "white";
                }
            }
        });

        try {
            const postsSnap = await getDocs(query(collection(db, "posts"), where("authorId", "==", userId), orderBy("createdAt", "desc")));
            grid.innerHTML = '';
            if (postsSnap.empty) grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#888;">Немає публікацій</p>';
            else {
                postsSnap.forEach(pSnap => {
                     const post = pSnap.data();
                     const tile = document.createElement('div');
                     tile.className = 'profile-post-tile';
                     if (post.mediaType === 'image' && post.mediaUrl) tile.innerHTML = `<img src="${post.mediaUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                     else if (post.mediaType === 'video' && post.mediaUrl) tile.innerHTML = `<video src="${post.mediaUrl}" muted style="width:100%; height:100%; object-fit:cover;"></video>`;
                     else if (post.text) tile.innerHTML = `<div class="text-post-preview" style="padding:10px;"><p style="font-size:12px; margin:0;">${post.text}</p></div>`;
                     grid.appendChild(tile);
                });
            }
        } catch (error) { console.error(error); }
    };

    if (followBtn) {
        followBtn.addEventListener('click', async () => {
            const myUid = auth.currentUser?.uid;
            if (!myUid || !currentViewedUserId) return;
            const myRef = doc(db, "users", myUid);
            const targetRef = doc(db, "users", currentViewedUserId);
            followBtn.disabled = true; 
            try {
                const targetSnap = await getDoc(targetRef);
                const isFollowing = targetSnap.exists() && (targetSnap.data().followers || []).includes(myUid);
                if (isFollowing) {
                    await setDoc(myRef, { following: arrayRemove(currentViewedUserId) }, { merge: true });
                    await setDoc(targetRef, { followers: arrayRemove(myUid) }, { merge: true });
                } else {
                    await setDoc(myRef, { following: arrayUnion(currentViewedUserId) }, { merge: true });
                    await setDoc(targetRef, { followers: arrayUnion(myUid) }, { merge: true });
                }
            } catch(e) { console.error(e); }
            followBtn.disabled = false;
        });
    }

    if (messageUserBtn) {
        messageUserBtn.addEventListener('click', () => {
            const nickname = document.getElementById('other-profile-nickname').textContent;
            const avatar = document.getElementById('other-profile-avatar').src;
            if (window.openChatWithUser) window.openChatWithUser(currentViewedUserId, nickname, avatar);
        });
    }
});