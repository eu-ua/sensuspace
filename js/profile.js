import { db, auth } from './firebase-config.js';
import { collection, doc, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

document.addEventListener('DOMContentLoaded', () => {
    
    // Кеш для вирішення "гонки даних"
    let myProfileName = "Завантаження...";
    let myProfileAvatar = DEFAULT_AVATAR;

    // --- ЗАВАНТАЖЕННЯ ВЛАСНОГО ПРОФІЛЮ ---
    auth.onAuthStateChanged(user => {
        if (user) {
            // Завантажуємо основну інформацію
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    
                    const nameEl = document.getElementById('my-profile-fullname');
                    const loginEl = document.getElementById('my-profile-login');
                    
                    if (data.firstName || data.lastName) {
                        myProfileName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                        if (nameEl) nameEl.textContent = myProfileName;
                        if (loginEl) {
                            loginEl.textContent = `@${data.login || data.username || 'user'}`;
                            loginEl.style.display = 'block';
                        }
                    } else {
                        myProfileName = data.login || data.username || 'Творець';
                        if (nameEl) nameEl.textContent = myProfileName;
                        if (loginEl) loginEl.style.display = 'none'; 
                    }
                    
                    myProfileAvatar = data.avatarUrl || DEFAULT_AVATAR;

                    const bioEl = document.getElementById('my-profile-bio');
                    if (bioEl) bioEl.textContent = data.bio || '';
                    
                    const followersEl = document.getElementById('my-followers-count');
                    if (followersEl) followersEl.textContent = (data.followers || []).length;
                    
                    const tabPref = data.tabPreference || 'Збережене';
                    const tab3 = document.getElementById('profile-tab-3');
                    if (tab3) tab3.textContent = tabPref;
                    const editTab = document.getElementById('edit-tab-name');
                    if (editTab) editTab.value = tabPref;
                    
                    const avatarEl = document.getElementById('my-profile-avatar');
                    if (avatarEl) avatarEl.src = myProfileAvatar;
                    const previewEl = document.getElementById('edit-profile-avatar-preview');
                    if (previewEl) previewEl.src = myProfileAvatar;

                    // Оновлюємо пости, якщо вони завантажилися швидше за профіль
                    document.querySelectorAll('#my-profile-feed .post-username').forEach(el => el.textContent = myProfileName);
                    document.querySelectorAll('#my-profile-feed .avatar-wrapper img').forEach(el => el.src = myProfileAvatar);

                    // Заповнюємо вікно редагування
                    const editFName = document.getElementById('edit-firstname');
                    if (editFName) editFName.value = data.firstName || '';
                    const editLName = document.getElementById('edit-lastname');
                    if (editLName) editLName.value = data.lastName || '';
                    const editBio = document.getElementById('edit-bio');
                    if (editBio) editBio.value = data.bio || '';
                }
            });

            // Завантажуємо бейдж колаборації
            onSnapshot(query(collection(db, "collaborations")), (snapshot) => {
                const badge = document.getElementById('my-profile-collab-badge');
                if(!badge) return;
                let activeCollab = null;
                snapshot.forEach(doc => {
                    const cData = doc.data();
                    if (cData.authorId === user.uid) activeCollab = cData;
                });
                if (activeCollab) {
                    badge.textContent = `${activeCollab.type === "Шукаю" ? "Шукаю:" : "Відкритий:"} ${activeCollab.title}`;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            });

            // Завантажуємо власні пости у вигляді стрічки
            onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
                const feed = document.getElementById('my-profile-feed');
                if(!feed) return;
                feed.innerHTML = '';
                let hasPosts = false;
                
                snapshot.forEach(pDoc => {
                    const post = pDoc.data();
                    const postId = pDoc.id;
                    
                    if (post.authorId === user.uid) {
                        hasPosts = true;
                        
                        let timeString = 'Щойно';
                        let canEditPost = false;
                        if (post.createdAt) {
                            const createdTime = post.createdAt.toDate();
                            timeString = createdTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            canEditPost = (new Date().getTime() - createdTime.getTime()) < (15 * 60 * 1000); 
                        }

                        let mediaHTML = '';
                        if (post.mediaUrl) {
                            if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post">`;
                            else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
                        }

                        let reactionsPillsHtml = '';
                        let iReactedToPost = false;
                        if (post.reactions) {
                            for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                                if (usersArray && usersArray.length > 0) {
                                    const isMe = usersArray.includes(user.uid);
                                    if (isMe) iReactedToPost = true;
                                    const activeClass = isMe ? 'reacted-by-me' : '';
                                    reactionsPillsHtml += `<span class="reaction-pill ${activeClass}" data-emoji="${emoji}" data-post-id="${postId}">${emoji} ${usersArray.length}</span>`;
                                }
                            }
                        }

                        const reactionSmileIcon = iReactedToPost ? 'bi-emoji-smile-fill' : 'bi-emoji-smile';
                        const reactionSmileColor = iReactedToPost ? 'var(--text-color)' : 'var(--text-secondary)';
                        
                        const currentAvatar = myProfileAvatar;
                        const currentName = myProfileName;

                        const menuHtml = `
                            <div style="position: relative;">
                                <button class="post-menu-trigger-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>
                                <div class="post-menu-dropdown hidden" style="position: absolute; right: 0; top: 100%; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 5px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.15); min-width: 140px;">
                                    ${canEditPost ? `<button class="edit-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: var(--text-color); font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-pencil" style="margin-right: 8px;"></i>Редагувати</button>` : ''}
                                    <button class="delete-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: #ff4444; font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-trash" style="margin-right: 8px;"></i>Видалити</button>
                                </div>
                            </div>
                        `;

                        const postElement = document.createElement('div');
                        postElement.classList.add('post-card');
                        postElement.innerHTML = `
                            <div class="post-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                                <div class="avatar-wrapper" style="width: 42px; height: 42px; overflow: hidden; border-radius: 50%; flex-shrink: 0; margin-right: 14px;">
                                    <img src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div class="post-user-info" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                    <span class="post-username" style="font-size: 15px; font-weight: 600; color: var(--text-color);">${currentName}</span>
                                    <span class="post-time" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${timeString}</span>
                                </div>
                                ${menuHtml}
                            </div>
                            <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                            <div class="post-bottom-actions">
                                <div class="reaction-picker-container">
                                    <button class="add-reaction-btn" data-post-id="${postId}"><i class="bi ${reactionSmileIcon}" style="color: ${reactionSmileColor};"></i></button>
                                    <div class="post-reaction-picker hidden" style="position: absolute; bottom: 35px; left: -10px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 8px 12px; display: flex; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 100;">
                                        <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}">❤️</span>
                                        <span class="emoji-btn" data-emoji="🔥" data-post-id="${postId}">🔥</span>
                                        <span class="emoji-btn" data-emoji="👏" data-post-id="${postId}">👏</span>
                                        <span class="emoji-btn" data-emoji="💡" data-post-id="${postId}">💡</span>
                                    </div>
                                </div>
                                <div class="post-reactions-list">${reactionsPillsHtml}</div>
                            </div>
                        `;
                        feed.appendChild(postElement);
                    }
                });
                if (!hasPosts) feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Немає публікацій.</p>';
            });
        }
    });

    // --- ЛОГІКА КЛІКІВ У ПРОФІЛІ ---
    document.addEventListener('click', async (e) => {
        if (e.target.closest('#profile-tab-all')) {
            const dp = document.getElementById('profile-all-dropdown');
            if(dp) dp.classList.toggle('hidden');
            return;
        }
        
        if (e.target.closest('.dropdown-item')) {
            const btn = e.target.closest('.dropdown-item');
            const textEl = document.getElementById('profile-tab-all-text');
            if(textEl) textEl.innerHTML = `Усе <span style="color: var(--text-secondary); font-size: 13px; font-weight: 600;">• ${btn.textContent}</span>`;
            document.getElementById('profile-all-dropdown').classList.add('hidden');
            return;
        }

        if (!e.target.closest('#profile-all-dropdown') && !e.target.closest('#profile-tab-all')) {
            const dropdown = document.getElementById('profile-all-dropdown');
            if(dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
        }

        if (e.target.id === 'open-edit-profile-btn') {
            const modal = document.getElementById('edit-my-profile-modal');
            if(modal) modal.classList.remove('hidden');
        }
        if (e.target.closest('#close-edit-my-profile-btn')) {
            const modal = document.getElementById('edit-my-profile-modal');
            if(modal) modal.classList.add('hidden');
        }
        if (e.target.id === 'change-avatar-btn') {
            const input = document.getElementById('edit-avatar-input');
            if(input) input.click();
        }
        
        // ЗБЕРЕЖЕННЯ ПРОФІЛЮ
        if (e.target.id === 'save-my-profile-btn') {
            const user = auth.currentUser;
            if (!user) return;
            const btn = document.getElementById('save-my-profile-btn');
            btn.textContent = "Зберігаємо..."; btn.disabled = true;
            
            const fName = document.getElementById('edit-firstname').value.trim();
            const lName = document.getElementById('edit-lastname').value.trim();
            const bio = document.getElementById('edit-bio').value.trim();
            const tabPref = document.getElementById('edit-tab-name').value;
            const avatarFile = document.getElementById('edit-avatar-input').files[0];
            
            try {
                let newAvatarUrl = null;
                if (avatarFile) {
                    const formData = new FormData();
                    formData.append('file', avatarFile);
                    formData.append('upload_preset', 'sensuspace'); 
                    const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.secure_url) newAvatarUrl = data.secure_url;
                }
                const updateData = { firstName: fName, lastName: lName, bio: bio, tabPreference: tabPref };
                if (newAvatarUrl) updateData.avatarUrl = newAvatarUrl;
                
                await updateDoc(doc(db, "users", user.uid), updateData);
                document.getElementById('edit-my-profile-modal').classList.add('hidden');
            } catch (err) { 
                console.error(err); 
            } finally { 
                btn.textContent = "Зберегти зміни"; btn.disabled = false; 
            }
        }
    });

    const editAvatarInput = document.getElementById('edit-avatar-input');
    if (editAvatarInput) {
        editAvatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const preview = document.getElementById('edit-profile-avatar-preview');
                if(preview) preview.src = URL.createObjectURL(file);
            }
        });
    }
});