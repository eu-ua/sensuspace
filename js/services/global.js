import { db, auth } from '../firebase-config.js';
import { collection, doc, setDoc, getDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

document.addEventListener('DOMContentLoaded', () => {

    const globalSearchInput = document.querySelector('.global-search-input');
    const globalContentArea = document.querySelector('.global-content-area');
    const otherProfileModal = document.getElementById('other-user-profile-modal');
    const closeOtherProfileBtn = document.getElementById('close-other-profile-btn');
    const followBtn = document.getElementById('follow-user-btn');
    const messageUserBtn = document.getElementById('message-user-btn');
    
    let currentViewedUserId = null;
    let otherProfileUnsubscribe = null;
    let otherProfilePostsUnsubscribe = null;

    let currentOtherFollowers = [];
    let currentOtherFollowing = [];

    let allUsers = [];
    let currentSearchQuery = "";

    const usersListModal = document.getElementById('users-list-modal');
    const closeUsersListBtn = document.getElementById('close-users-list-btn');
    const usersListTitle = document.getElementById('users-list-title');
    const usersListContainer = document.getElementById('users-list-container');

    onSnapshot(collection(db, "users"), (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentSearchQuery) renderSearchResults();
    });

    if (globalSearchInput && globalContentArea) {
        globalSearchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            renderSearchResults();
        });
    }

    function renderSearchResults() {
        if (!currentSearchQuery) { 
            globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Введіть ім\'я для пошуку...</p>'; 
            return; 
        }
        
        globalContentArea.innerHTML = ''; 
        let found = false;
        
        allUsers.forEach(data => {
            const searchName = (data.nickname || data.username || data.login || "").toLowerCase();
            
            if (searchName.includes(currentSearchQuery) && data.id !== auth.currentUser?.uid) {
                found = true;
                const avatar = data.avatarUrl || DEFAULT_AVATAR;
                const card = document.createElement('div');
                card.className = 'search-user-card';
                const displayName = data.nickname || data.username || data.login || '...';
                
                card.innerHTML = `<img src="${avatar}" alt="user"><div class="search-user-info"><h4>${displayName}</h4><p>${data.bio ? data.bio.substring(0, 30) + '...' : 'Новий учасник платформи'}</p></div>`;
                card.addEventListener('click', () => window.openOtherProfile(data.id, { nickname: displayName, avatarUrl: avatar }));
                
                globalContentArea.appendChild(card);
            }
        });
        
        if (!found) globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Нікого не знайдено :(</p>';
    }

    // ==========================================
    // ЛОГІКА СПИСКУ ПІДПИСНИКІВ
    // ==========================================
    if (closeUsersListBtn) {
        closeUsersListBtn.addEventListener('click', () => usersListModal.classList.add('hidden'));
    }

    if (usersListModal) {
        usersListModal.addEventListener('click', (e) => {
            if (e.target === usersListModal) {
                usersListModal.classList.add('hidden');
            }
        });
    }

    window.openUsersList = (title, userIdsArray) => {
        if (!usersListModal) return;
        usersListTitle.textContent = title;
        usersListContainer.innerHTML = '';

        if (!userIdsArray || userIdsArray.length === 0) {
            usersListContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin: 30px 0;">Поки що нікого немає</p>';
            usersListModal.classList.remove('hidden');
            return;
        }

        let found = false;
        allUsers.forEach(u => {
            if (userIdsArray.includes(u.id)) {
                found = true;
                const avatar = u.avatarUrl || DEFAULT_AVATAR;
                const displayName = u.nickname || u.username || u.login || 'Користувач';
                
                const card = document.createElement('div');
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.padding = '12px 0';
                card.style.borderBottom = '1px solid var(--border-color)';
                card.style.cursor = 'pointer';
                
                // ОНОВЛЕНИЙ МІНІМАЛІСТИЧНИЙ ДИЗАЙН КАРТКИ
                card.innerHTML = `
                    <img src="${avatar}" alt="Avatar" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid var(--border-color);">
                    <div style="flex: 1; margin-left: 14px; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">
                        <h4 style="font-size: 16px; font-weight: 600; color: var(--text-color); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</h4>
                        ${u.bio ? `<p style="font-size: 13px; color: var(--text-secondary); margin: 2px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.bio.substring(0, 30)}...</p>` : ''}
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    usersListModal.classList.add('hidden');
                    if (auth.currentUser && u.id === auth.currentUser.uid) {
                        document.querySelector('.nav-btn[data-screen="screen-profile"]')?.click();
                    } else {
                        window.openOtherProfile(u.id, { nickname: displayName, avatarUrl: avatar });
                    }
                });
                usersListContainer.appendChild(card);
            }
        });

        if (!found) {
            usersListContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin: 30px 0;">Користувачів не знайдено</p>';
        }

        usersListModal.classList.remove('hidden');
    };

    document.getElementById('other-followers-btn')?.addEventListener('click', () => {
        window.openUsersList('Читачі', currentOtherFollowers);
    });
    document.getElementById('other-following-btn')?.addEventListener('click', () => {
        window.openUsersList('Підписки', currentOtherFollowing);
    });

    document.getElementById('my-followers-btn')?.addEventListener('click', () => {
        if (!auth.currentUser) return;
        const me = allUsers.find(u => u.id === auth.currentUser.uid);
        if (me) window.openUsersList('Мої читачі', me.followers || []);
    });
    document.getElementById('my-following-btn')?.addEventListener('click', () => {
        if (!auth.currentUser) return;
        const me = allUsers.find(u => u.id === auth.currentUser.uid);
        if (me) window.openUsersList('Мої підписки', me.following || []);
    });


    // ==========================================
    // ЛОГІКА ВІДКРИТТЯ ПРОФІЛЮ
    // ==========================================
    if (closeOtherProfileBtn) {
        closeOtherProfileBtn.addEventListener('click', () => {
            if(otherProfileUnsubscribe) otherProfileUnsubscribe();
            if(otherProfilePostsUnsubscribe) otherProfilePostsUnsubscribe();
            
            if (window.previousScreenForProfile === 'chat-room-modal') {
                document.querySelectorAll('.app-screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
                document.getElementById('chat-room-modal').classList.add('active');
                document.getElementById('chat-room-modal').classList.remove('hidden');
            } else {
                document.querySelector('.nav-btn.active')?.click();
            }
            window.previousScreenForProfile = null;
        });
    }

    window.openOtherProfile = async (userId, initialData = {}) => {
        if (document.getElementById('chat-room-modal') && !document.getElementById('chat-room-modal').classList.contains('hidden')) {
            window.previousScreenForProfile = 'chat-room-modal';
        } else {
            window.previousScreenForProfile = 'main';
        }

        currentViewedUserId = userId;
        document.querySelectorAll('.app-screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
        otherProfileModal.classList.add('active');
        otherProfileModal.classList.remove('hidden');

        document.getElementById('other-profile-avatar').src = initialData.avatarUrl || DEFAULT_AVATAR;
        document.getElementById('other-profile-nickname').textContent = initialData.nickname || "...";
        
        const initBio = initialData.bio ? initialData.bio.trim() : "";
        document.getElementById('other-profile-bio').textContent = initBio;
        document.getElementById('other-profile-bio').style.display = initBio ? 'block' : 'none';

        document.getElementById('other-followers-count').textContent = (initialData.followers || []).length;
        document.getElementById('other-following-count').textContent = (initialData.following || []).length;
        currentOtherFollowers = initialData.followers || [];
        currentOtherFollowing = initialData.following || [];
        
        const grid = document.getElementById('other-profile-grid');
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">Завантаження...</p>';
        
        if (otherProfileUnsubscribe) otherProfileUnsubscribe();
        otherProfileUnsubscribe = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('other-profile-avatar').src = data.avatarUrl || DEFAULT_AVATAR;
                document.getElementById('other-profile-nickname').textContent = data.nickname || data.username || data.login || "...";
                
                const userBio = data.bio ? data.bio.trim() : "";
                document.getElementById('other-profile-bio').textContent = userBio;
                document.getElementById('other-profile-bio').style.display = userBio ? 'block' : 'none';
                
                const followers = data.followers || [];
                const following = data.following || [];
                
                currentOtherFollowers = followers;
                currentOtherFollowing = following;

                document.getElementById('other-followers-count').textContent = followers.length;
                document.getElementById('other-following-count').textContent = following.length;
                
                const myUid = auth.currentUser?.uid;
                if (myUid && followers.includes(myUid)) {
                    followBtn.textContent = "Відписатися"; 
                    followBtn.style.background = "transparent"; 
                    followBtn.style.color = "var(--text-color, #000)";
                    followBtn.style.border = "1px solid var(--border-color, #ccc)";
                } else {
                    followBtn.textContent = "Підписатися"; 
                    followBtn.style.background = "var(--text-color, #000)"; 
                    followBtn.style.color = "var(--bg-color, #fff)";
                    followBtn.style.border = "none";
                }
            }
        });

        if (otherProfilePostsUnsubscribe) otherProfilePostsUnsubscribe();
        otherProfilePostsUnsubscribe = onSnapshot(query(collection(db, "posts"), where("authorId", "==", userId), orderBy("createdAt", "desc")), (snapshot) => {
            grid.innerHTML = '';
            if (snapshot.empty) grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#888;">Немає публікацій</p>';
            else {
                snapshot.forEach(pSnap => {
                     const post = pSnap.data();
                     const tile = document.createElement('div');
                     tile.className = 'profile-post-tile';
                     if (post.mediaType === 'image' && post.mediaUrl) tile.innerHTML = `<img src="${post.mediaUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                     else if (post.mediaType === 'video' && post.mediaUrl) tile.innerHTML = `<video src="${post.mediaUrl}" muted style="width:100%; height:100%; object-fit:cover;"></video>`;
                     else if (post.text) tile.innerHTML = `<div class="text-post-preview" style="padding:10px;"><p style="font-size:12px; margin:0;">${post.text}</p></div>`;
                     grid.appendChild(tile);
                });
            }
        });
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