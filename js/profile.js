import { db, auth } from './firebase-config.js';
import { collection, doc, setDoc, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// УНІВЕРСАЛЬНЕ СІРЕ ЛОГО (SVG)
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

document.addEventListener('DOMContentLoaded', () => {
    const profileGrid = document.querySelector('.profile-grid');
    const profileAvatar = document.querySelector('.profile-main-avatar');
    const profileNickname = document.querySelector('.profile-nickname');
    const profileBio = document.querySelector('.profile-bio');
    const avatarWrapper = document.querySelector('.avatar-wrapper.cursor-pointer');

    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        if (profileGrid) {
            onSnapshot(query(collection(db, "posts"), where("authorId", "==", user.uid), orderBy("createdAt", "desc")), (snapshot) => {
                profileGrid.innerHTML = ''; 
                if (snapshot.empty) { profileGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Тут поки порожньо...</p>'; return; }
                snapshot.forEach((postDoc) => {
                    const post = postDoc.data();
                    const tile = document.createElement('div');
                    tile.classList.add('profile-post-tile');
                    if (post.mediaType === 'image') tile.innerHTML = `<img src="${post.mediaUrl}">`;
                    else if (post.mediaType === 'video') tile.innerHTML = `<video src="${post.mediaUrl}" muted></video>`;
                    else tile.innerHTML = `<div class="text-post-preview"><p>${post.text}</p></div>`;
                    profileGrid.appendChild(tile);
                });
            });
        }

        if (profileAvatar && profileNickname) {
            const userRef = doc(db, "users", user.uid);
            const defaultName = user.displayName || (user.email ? user.email.split('@')[0] : "Користувач");

            onSnapshot(userRef, async (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (!data.nickname && !data.username && !data.login) {
                        await setDoc(userRef, { nickname: defaultName }, { merge: true });
                        data.nickname = defaultName;
                    }
                    const displayName = data.nickname || data.username || data.login || defaultName;
                    
                    profileAvatar.src = data.avatarUrl || DEFAULT_AVATAR;
                    profileNickname.innerHTML = `${displayName} <i class="bi bi-pencil edit-icon"></i>`;
                    if(profileBio) profileBio.innerHTML = `${data.bio || "..."} <i class="bi bi-pencil edit-icon"></i>`;
                    if(document.getElementById('my-followers-count')) document.getElementById('my-followers-count').textContent = (data.followers || []).length;
                    if(document.getElementById('my-following-count')) document.getElementById('my-following-count').textContent = (data.following || []).length;
                } else {
                    await setDoc(userRef, { nickname: defaultName }, { merge: true });
                }
            });
        }
    });

    if (profileNickname) {
        profileNickname.addEventListener('click', async () => {
            if (!auth.currentUser) return;
            const newName = await window.showCustomModal({ title: "Ім'я", message: "Новий нікнейм:", type: "prompt" });
            if (newName && newName.trim()) await setDoc(doc(db, "users", auth.currentUser.uid), { nickname: newName.trim() }, { merge: true });
        });
    }

    if (profileBio) {
        profileBio.addEventListener('click', async () => {
            if (!auth.currentUser) return;
            const newBio = await window.showCustomModal({ title: "Про себе", message: "Короткий опис:", type: "prompt" });
            if (newBio && newBio.trim()) await setDoc(doc(db, "users", auth.currentUser.uid), { bio: newBio.trim() }, { merge: true });
        });
    }

    if (avatarWrapper) {
        const avatarInput = document.createElement('input');
        avatarInput.type = 'file'; avatarInput.accept = 'image/*';
        avatarWrapper.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !auth.currentUser) return;
            profileAvatar.style.opacity = "0.5";
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'sensuspace');
                const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/image/upload`, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.secure_url) await setDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }, { merge: true });
            } catch (error) {
                console.error(error);
                await window.showCustomModal({ title: "Помилка", message: "Не вдалося завантажити фото." });
            } finally { profileAvatar.style.opacity = "1"; }
        });
    }
});