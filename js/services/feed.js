import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

const userCache = {}; 
window.currentEditPostId = null;
window.currentEditCollabId = null;
window.currentViewedUserId = null;

document.addEventListener('DOMContentLoaded', () => {

    function ensureUserListener(uid) {
        if (!userCache[uid]) {
            userCache[uid] = { name: "...", avatar: DEFAULT_AVATAR, isListening: true };
            onSnapshot(doc(db, "users", uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const displayName = data.nickname || data.username || data.login || 'Користувач';
                    const avatar = data.avatarUrl || DEFAULT_AVATAR;
                    userCache[uid] = { name: displayName, avatar: avatar, isListening: true };
                    
                    document.querySelectorAll(`.sync-avatar[data-sync-uid="${uid}"]`).forEach(el => el.src = avatar);
                    document.querySelectorAll(`.sync-name[data-sync-uid="${uid}"]`).forEach(el => el.textContent = displayName);
                }
            });
        }
    }

    // =================================================================
    // ВЛАСНИЙ ПРОФІЛЬ
    // =================================================================
    auth.onAuthStateChanged(user => {
        if (user) {
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    
                    const nameEl = document.getElementById('my-profile-fullname');
                    const loginEl = document.getElementById('my-profile-login');
                    
                    // ПУНКТ 1 (Ім'я та Логін)
                    if (data.firstName || data.lastName) {
                        nameEl.textContent = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                        loginEl.textContent = `@${data.login || data.username || 'user'}`;
                        loginEl.style.display = 'block';
                    } else {
                        nameEl.textContent = data.login || data.username || 'Творець';
                        loginEl.style.display = 'none'; 
                    }
                    
                    document.getElementById('my-profile-bio').textContent = data.bio || '';
                    document.getElementById('my-followers-count').textContent = (data.followers || []).length;
                    
                    // ПУНКТ 3 (Налаштування вкладки)
                    const tabPref = data.tabPreference || 'Збережене';
                    document.getElementById('profile-tab-3').textContent = tabPref;
                    document.getElementById('edit-tab-name').value = tabPref;
                    
                    const avatar = data.avatarUrl || DEFAULT_AVATAR;
                    document.getElementById('my-profile-avatar').src = avatar;
                    document.getElementById('edit-profile-avatar-preview').src = avatar;

                    document.getElementById('edit-firstname').value = data.firstName || '';
                    document.getElementById('edit-lastname').value = data.lastName || '';
                    document.getElementById('edit-bio').value = data.bio || '';
                }
            });

            onSnapshot(query(collection(db, "collaborations")), (snapshot) => {
                const badge = document.getElementById('my-profile-collab-badge');
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
                            const now = new Date().getTime();
                            canEditPost = (now - createdTime.getTime()) < (15 * 60 * 1000); 
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
                        const currentAvatar = userCache[user.uid]?.avatar || DEFAULT_AVATAR;
                        const currentName = userCache[user.uid]?.name || "Я";

                        // ПУНКТ 7: Меню через 3 крапки для власних постів
                        const menuHtml = `
                            <div style="position: relative;">
                                <button class="post-menu-trigger-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>
                                <div id="post-menu-dropdown-${postId}" class="hidden" style="position: absolute; right: 0; top: 100%; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 5px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.15); min-width: 140px;">
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
                                    <img class="sync-avatar" data-sync-uid="${user.uid}" src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div class="post-user-info" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                    <span class="post-username sync-name" data-sync-uid="${user.uid}" style="font-size: 15px; font-weight: 600; color: var(--text-color);">${currentName}</span>
                                    <span class="post-time" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${timeString}</span>
                                </div>
                                ${menuHtml}
                            </div>
                            <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                            <div class="post-bottom-actions">
                                <div class="reaction-picker-container">
                                    <button class="add-reaction-btn" data-post-id="${postId}"><i class="bi ${reactionSmileIcon}" style="color: ${reactionSmileColor};"></i></button>
                                    <div class="post-reaction-picker hidden" id="picker-${postId}">
                                        <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}">❤️</span>
                                        <span class="emoji-btn" data-emoji="🔥" data-post-id="${postId}">🔥</span>
                                        <span class="emoji-btn" data-emoji="👏" data-post-id="${postId}">👏</span>
                                        <span class="emoji-btn" data-emoji="💡" data-post-id="${postId}">💡</span>
                                    </div>
                                </div>
                                <div class="post-reactions-list" id="reactions-list-${postId}">${reactionsPillsHtml}</div>
                            </div>
                        `;
                        feed.appendChild(postElement);
                    }
                });
                if (!hasPosts) feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Немає публікацій.</p>';
            });
        }
    });

    // =================================================================
    // СТВОРЕННЯ ПУБЛІКАЦІЙ
    // =================================================================
    const attachImageBtn = document.getElementById('attach-image-btn');
    const attachVideoBtn = document.getElementById('attach-video-btn');
    const imageInput = document.getElementById('image-input');
    const videoInput = document.getElementById('video-input');
    const mediaPreviewContainer = document.getElementById('media-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const removeMediaBtn = document.getElementById('remove-media-btn');

    let currentSelectedFile = null; 

    if (attachImageBtn) attachImageBtn.addEventListener('click', () => imageInput.click());
    if (attachVideoBtn) attachVideoBtn.addEventListener('click', () => videoInput.click());

    function handleFileSelection(file, type) {
        if (!file) return;
        currentSelectedFile = file;
        mediaPreviewContainer.classList.remove('hidden');
        const fileURL = URL.createObjectURL(file);

        if (type === 'image') {
            imagePreview.src = fileURL; imagePreview.classList.remove('hidden');
            videoPreview.classList.add('hidden'); videoPreview.src = ""; 
        } else {
            videoPreview.src = fileURL; videoPreview.classList.remove('hidden');
            imagePreview.classList.add('hidden'); imagePreview.src = ""; 
        }
    }

    if (imageInput) imageInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'image'));
    if (videoInput) videoInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'video'));

    if (removeMediaBtn) {
        removeMediaBtn.addEventListener('click', () => {
            currentSelectedFile = null; mediaPreviewContainer.classList.add('hidden');
            imagePreview.classList.add('hidden'); videoPreview.classList.add('hidden');
            imageInput.value = ""; videoInput.value = "";
        });
    }

    const submitPostBtn = document.getElementById('submit-post-btn');
    const postTextInput = document.getElementById('post-text-input');
    const categorySelect = document.getElementById('post-category-select');

    if (submitPostBtn) {
        submitPostBtn.addEventListener('click', async () => {
            const text = postTextInput.value.trim();
            const postCategory = categorySelect ? categorySelect.value : 'Всі';
            const user = auth.currentUser; 

            if (!user) return window.showCustomModal({ title: "Увага", message: "Увійдіть!" });
            if (!text && !currentSelectedFile) return window.showCustomModal({ title: "Порожньо", message: "Додайте текст або файл!" });

            const originalBtnText = submitPostBtn.textContent;
            submitPostBtn.textContent = 'Публікуємо...'; submitPostBtn.disabled = true; 

            try {
                let mediaUrl = null, mediaType = null;
                if (currentSelectedFile) {
                    const formData = new FormData();
                    formData.append('file', currentSelectedFile);
                    formData.append('upload_preset', 'sensuspace'); 
                    const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.secure_url) { mediaUrl = data.secure_url; mediaType = data.resource_type; } 
                }

                await addDoc(collection(db, "posts"), {
                    text: text, mediaUrl: mediaUrl, mediaType: mediaType, authorId: user.uid,
                    category: postCategory, createdAt: serverTimestamp(), reactions: {}, sharesCount: 0 
                });

                postTextInput.value = '';
                if (categorySelect) categorySelect.value = 'Всі';
                if (removeMediaBtn) removeMediaBtn.click(); 
                document.getElementById('create-post-modal').classList.add('hidden'); 
            } catch (error) { console.error(error); } 
            finally { submitPostBtn.textContent = originalBtnText; submitPostBtn.disabled = false; }
        });
    }

    // =================================================================
    // ГЛОБАЛЬНА СТРІЧКА
    // =================================================================
    let currentFeedFilter = 'Всі';
    let cachedPosts = [];

    const filterBtns = document.querySelectorAll('.feed-filters .space-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (btn.textContent.includes('В процесі')) currentFeedFilter = 'В процесі';
            else if (btn.textContent.includes('критика')) currentFeedFilter = 'Критика';
            else currentFeedFilter = 'Всі';
            renderFeed(); 
        });
    });

    const feedContainer = document.querySelector('.feed-container');

    function renderFeed() {
        if (!feedContainer) return;
        feedContainer.innerHTML = ''; 
        const user = auth.currentUser; 
        let visibleCount = 0;

        cachedPosts.forEach((postDoc) => {
            const post = postDoc.data();
            const postId = postDoc.id; 
            const postCat = post.category || 'Всі';
            
            if (currentFeedFilter !== 'Всі' && postCat !== currentFeedFilter) return;
            visibleCount++;
            ensureUserListener(post.authorId);

            let timeString = 'Щойно';
            let canEditPost = false;
            if (post.createdAt) {
                const createdTime = post.createdAt.toDate();
                timeString = createdTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const now = new Date().getTime();
                canEditPost = (now - createdTime.getTime()) < (15 * 60 * 1000); 
            }

            let mediaHTML = '';
            if (post.mediaUrl) {
                if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post">`;
                else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
            }

            const isAuthor = user && post.authorId === user.uid;
            const currentName = userCache[post.authorId]?.name || "...";
            const currentAvatar = userCache[post.authorId]?.avatar || DEFAULT_AVATAR;

            let badgeHtml = '';
            if (postCat === 'В процесі') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">В процесі 🛠️</span>`;
            else if (postCat === 'Критика') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">Критика 💬</span>`;

            let reactionsPillsHtml = '';
            let iReactedToPost = false;
            if (post.reactions) {
                const currentUserUid = user ? user.uid : null;
                for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                    if (usersArray && usersArray.length > 0) {
                        const isMe = currentUserUid && usersArray.includes(currentUserUid);
                        if (isMe) iReactedToPost = true;
                        const activeClass = isMe ? 'reacted-by-me' : '';
                        reactionsPillsHtml += `<span class="reaction-pill ${activeClass}" data-emoji="${emoji}" data-post-id="${postId}">${emoji} ${usersArray.length}</span>`;
                    }
                }
            }

            const reactionSmileIcon = iReactedToPost ? 'bi-emoji-smile-fill' : 'bi-emoji-smile';
            const reactionSmileColor = iReactedToPost ? 'var(--text-color)' : 'var(--text-secondary)';

            // ПУНКТ 7: Меню через 3 крапки для власних постів
            const menuHtml = isAuthor ? `
                <div style="position: relative;">
                    <button class="post-menu-trigger-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>
                    <div id="post-menu-dropdown-${postId}" class="hidden" style="position: absolute; right: 0; top: 100%; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 5px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.15); min-width: 140px;">
                        ${canEditPost ? `<button class="edit-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: var(--text-color); font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-pencil" style="margin-right: 8px;"></i>Редагувати</button>` : ''}
                        <button class="delete-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: #ff4444; font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-trash" style="margin-right: 8px;"></i>Видалити</button>
                    </div>
                </div>
            ` : `<button style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>`;

            const postElement = document.createElement('div');
            postElement.classList.add('post-card');
            
            postElement.innerHTML = `
                <div class="post-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                    <div class="avatar-wrapper user-profile-trigger" data-user-id="${post.authorId}" style="width: 42px; height: 42px; overflow: hidden; border-radius: 50%; cursor: pointer; flex-shrink: 0; margin-right: 14px;">
                        <img class="sync-avatar" data-sync-uid="${post.authorId}" src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar">
                    </div>
                    <div class="post-user-info" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                        <div style="display: flex; align-items: center;">
                            <span class="post-username user-profile-trigger sync-name" data-sync-uid="${post.authorId}" data-user-id="${post.authorId}" style="cursor: pointer; font-size: 15px; font-weight: 600; color: var(--text-color); line-height: 1.2;">${currentName}</span>
                            ${badgeHtml}
                        </div>
                        <span class="post-time" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${timeString}</span>
                    </div>
                    ${menuHtml}
                </div>
                <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                <div class="post-bottom-actions">
                    <div class="reaction-picker-container">
                        <button class="add-reaction-btn" data-post-id="${postId}"><i class="bi ${reactionSmileIcon}" style="color: ${reactionSmileColor};"></i></button>
                        <div class="post-reaction-picker hidden" id="picker-${postId}">
                            <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}">❤️</span>
                            <span class="emoji-btn" data-emoji="🔥" data-post-id="${postId}">🔥</span>
                            <span class="emoji-btn" data-emoji="👏" data-post-id="${postId}">👏</span>
                            <span class="emoji-btn" data-emoji="💡" data-post-id="${postId}">💡</span>
                            <span class="emoji-btn" data-emoji="😂" data-post-id="${postId}">😂</span>
                        </div>
                    </div>
                    <div class="post-reactions-list" id="reactions-list-${postId}">${reactionsPillsHtml}</div>
                    <button class="action-btn dm-btn" data-post-id="${postId}" data-author-name="${currentName}" data-post-text="${post.text ? post.text.replace(/"/g, '&quot;') : ''}" data-post-media="${post.mediaUrl || ''}" data-post-mediatype="${post.mediaType || ''}" style="margin-left: auto; border: none; background: transparent; color: var(--text-color); cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="bi bi-send" style="font-size: 18px;"></i><span style="font-size: 14px; font-weight: 600;">${post.sharesCount || 0}</span>
                    </button>
                </div>
            `;
            feedContainer.appendChild(postElement);
        });
        if (visibleCount === 0) feedContainer.innerHTML = `<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Немає записів у цій категорії.</p>`;
    }

    if (feedContainer) {
        onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
            cachedPosts = snapshot.docs; renderFeed();
        });
    }

    // =================================================================
    // КОЛАБОРАЦІЇ
    // =================================================================
    const collabContainer = document.getElementById('collaborations-container');
    if (collabContainer) {
        onSnapshot(query(collection(db, "collaborations"), orderBy("createdAt", "desc")), (snapshot) => {
            collabContainer.innerHTML = '';
            snapshot.forEach((docSnap) => {
                const collab = docSnap.data();
                ensureUserListener(collab.authorId);
                const authorName = userCache[collab.authorId]?.name || "...";
                const authorAvatar = userCache[collab.authorId]?.avatar || DEFAULT_AVATAR;

                const isCollabAuthor = auth.currentUser && collab.authorId === auth.currentUser.uid;
                let canEditCollab = false;
                if (isCollabAuthor && collab.createdAt) {
                    const now = new Date().getTime();
                    canEditCollab = (now - collab.createdAt.toDate().getTime()) < (15 * 60 * 1000); 
                }

                const isSearching = collab.type === "Шукаю";
                const badgeBg = isSearching ? "var(--text-color)" : "transparent";
                const badgeColor = isSearching ? "var(--bg-color)" : "var(--text-color)";
                const badgeBorder = isSearching ? "none" : "1px solid var(--text-color)";

                const collabMenuHtml = isCollabAuthor ? `
                    <div style="position:absolute; top:15px; right:15px; display:flex; gap:10px; z-index:10;">
                        ${canEditCollab ? `<button class="edit-collab-btn" data-collab-id="${docSnap.id}" data-type="${collab.type}" data-title="${collab.title.replace(/"/g, '&quot;')}" data-text="${collab.text.replace(/"/g, '&quot;')}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary);"><i class="bi bi-pencil" style="font-size:12px;"></i></button>` : ''}
                        <button class="delete-collab-btn" data-collab-id="${docSnap.id}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ff4444;"><i class="bi bi-trash" style="font-size:12px;"></i></button>
                    </div>` : '';

                collabContainer.innerHTML += `
                    <div style="position: relative; min-width: 260px; width: 260px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 20px; padding-top: 35px; flex-shrink: 0; scroll-snap-align: start; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                        ${collabMenuHtml}
                        <span style="background: ${badgeBg}; color: ${badgeColor}; border: ${badgeBorder}; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 5px 9px; border-radius: 8px; align-self: flex-start; margin-bottom: 14px; letter-spacing: 0.5px; white-space: normal; line-height: 1.3; word-wrap: break-word; max-width: 100%;">${isSearching ? "ШУКАЮ: " : ""}${collab.title}</span>
                        <p style="font-size: 14px; font-weight: 500; color: var(--text-color); line-height: 1.5; margin: 0 0 20px 0; flex: 1; white-space: pre-wrap;">${collab.text}</p>
                        
                        <div class="user-profile-trigger" data-user-id="${collab.authorId}" style="display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--border-color); padding-top: 15px; cursor: pointer;">
                            <img class="sync-avatar" data-sync-uid="${collab.authorId}" src="${authorAvatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                            <span class="sync-name" data-sync-uid="${collab.authorId}" style="font-size: 13px; color: var(--text-secondary); font-weight: 600;">${authorName}</span>
                        </div>
                    </div>
                `;
            });
            if (collabContainer.innerHTML === '') collabContainer.innerHTML = '<p style="font-size: 13px; color: #888; text-align: center; width: 100%; margin-top: 20px;">Поки що немає відкритих колаборацій</p>';
        });
    }

    // =================================================================
    // ВІДКРИТТЯ ДНЯ
    // =================================================================
    async function loadDiscoveries() {
        const discoveriesContainer = document.getElementById('discoveries-container');
        if (!discoveriesContainer) return;
        try {
            const usersSnap = await getDocs(query(collection(db, "users"), limit(6)));
            discoveriesContainer.innerHTML = ''; 
            usersSnap.forEach(docSnap => {
                const u = docSnap.data();
                if (auth.currentUser && docSnap.id === auth.currentUser.uid) return; 
                const uid = docSnap.id;
                ensureUserListener(uid);
                const avatar = userCache[uid]?.avatar || DEFAULT_AVATAR;
                const name = userCache[uid]?.name || '...';
                discoveriesContainer.innerHTML += `
                    <div class="user-profile-trigger" data-user-id="${uid}" style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; cursor: pointer;">
                        <div style="width: 68px; height: 68px; border-radius: 50%; border: 2px solid var(--text-color); padding: 3px; display: flex; align-items: center; justify-content: center;">
                            <img class="sync-avatar" data-sync-uid="${uid}" src="${avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                        </div>
                        <span class="sync-name" data-sync-uid="${uid}" style="font-size: 12px; font-weight: 600; color: var(--text-color); width: 68px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${name}</span>
                    </div>
                `;
            });
        } catch (error) { console.error("Помилка:", error); }
    }
    loadDiscoveries();

    // =================================================================
    // ЄДИНИЙ ГЛОБАЛЬНИЙ ОБРОБНИК КЛІКІВ
    // =================================================================
    
    async function renderUsersListInModal(userId, type) {
        const container = document.getElementById('users-list-container');
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Завантаження...</p>';
        try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (!userDoc.exists()) throw new Error("Користувач не знайдений");
            const uData = userDoc.data();
            
            document.getElementById('modal-count-followers').textContent = (uData.followers || []).length;
            document.getElementById('modal-count-following').textContent = (uData.following || []).length;

            const list = type === 'followers' ? (uData.followers || []) : (uData.following || []);
            
            if (list.length === 0) {
                container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Список порожній</p>';
                return;
            }
            container.innerHTML = '';
            for (const uid of list) {
                const uDoc = await getDoc(doc(db, "users", uid));
                if (uDoc.exists()) {
                    const d = uDoc.data();
                    const avatar = d.avatarUrl || DEFAULT_AVATAR;
                    const name = d.nickname || d.username || d.login || 'Користувач';
                    container.innerHTML += `
                        <div class="user-profile-trigger" data-user-id="${uid}" style="display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); cursor: pointer;">
                            <img src="${avatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
                            <span style="margin-left: 12px; font-weight: 600; color: var(--text-color); font-size: 15px;">${name}</span>
                        </div>
                    `;
                }
            }
        } catch (err) {
            console.error(err);
            container.innerHTML = '<p style="text-align:center; color: #ff4444; margin-top: 20px;">Помилка</p>';
        }
    }

    document.addEventListener('click', async (e) => {

        // --- ВЛАСНИЙ ПРОФІЛЬ ТА МЕНЮ ---
        if (e.target.closest('#profile-tab-all')) {
            const dropdown = document.getElementById('profile-all-dropdown');
            dropdown.classList.toggle('hidden');
            return;
        }
        
        // ПУНКТ 5: Вибір зі списку "Усе"
        if (e.target.closest('.dropdown-item')) {
            const btn = e.target.closest('.dropdown-item');
            // Зберігаємо слово "Усе" і додаємо обраний пункт через крапку
            document.getElementById('profile-tab-all-text').innerHTML = `Усе <span style="color: var(--text-secondary); font-size: 13px; font-weight: 600;">• ${btn.textContent}</span>`;
            document.getElementById('profile-all-dropdown').classList.add('hidden');
            return;
        }

        if (!e.target.closest('#profile-all-dropdown') && !e.target.closest('#profile-tab-all')) {
            const dropdown = document.getElementById('profile-all-dropdown');
            if(dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
        }

        if (e.target.id === 'open-edit-profile-btn') {
            document.getElementById('edit-my-profile-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-edit-my-profile-btn')) {
            document.getElementById('edit-my-profile-modal').classList.add('hidden');
        }
        if (e.target.id === 'change-avatar-btn') document.getElementById('edit-avatar-input').click();
        
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
            } catch (err) { console.error(err); } finally { btn.textContent = "Зберегти зміни"; btn.disabled = false; }
        }

        // --- ВІДКРИТТЯ СПИСКІВ (МОДАЛКА З ВКЛАДКАМИ) ---
        if (e.target.closest('#my-followers-btn') || e.target.closest('#my-following-btn') || 
            e.target.closest('#other-followers-btn') || e.target.closest('#other-following-btn')) {
            
            const btn = e.target.closest('div[id$="-btn"]');
            const isFollowers = btn.id.includes('followers');
            
            if (btn.id.startsWith('my-')) {
                if (!auth.currentUser) return;
                window.currentViewedUserId = auth.currentUser.uid;
            } else {
                window.currentViewedUserId = btn.dataset.userId;
            }

            if (!window.currentViewedUserId) return;

            document.getElementById('users-list-modal').classList.remove('hidden');
            document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            if(isFollowers) document.getElementById('modal-tab-followers').classList.add('active');
            else document.getElementById('modal-tab-following').classList.add('active');

            renderUsersListInModal(window.currentViewedUserId, isFollowers ? 'followers' : 'following');
            return;
        }

        if (e.target.closest('#modal-tab-followers')) {
            document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            renderUsersListInModal(window.currentViewedUserId, 'followers');
        }
        if (e.target.closest('#modal-tab-following')) {
            document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.closest('button').classList.add('active');
            renderUsersListInModal(window.currentViewedUserId, 'following');
        }

        if (e.target.closest('#close-users-list-btn')) {
            document.getElementById('users-list-modal').classList.add('hidden');
            return;
        }

        // --- ПУНКТ 7: ВІДКРИТТЯ МЕНЮ ПОСТА (3 КРАПКИ) ---
        if (e.target.closest('.post-menu-trigger-btn')) {
            const postId = e.target.closest('.post-menu-trigger-btn').dataset.postId;
            const dropdown = document.getElementById(`post-menu-dropdown-${postId}`);
            document.querySelectorAll('[id^="post-menu-dropdown-"]').forEach(d => { if(d !== dropdown) d.classList.add('hidden'); });
            dropdown.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.post-menu-trigger-btn')) {
            document.querySelectorAll('[id^="post-menu-dropdown-"]').forEach(d => d.classList.add('hidden'));
        }

        // --- ВИДАЛЕННЯ/РЕДАГУВАННЯ ПОСТІВ ТА КОЛАБОРАЦІЙ ---
        if (e.target.closest('.delete-post-btn')) {
            e.stopPropagation();
            const postId = e.target.closest('.delete-post-btn').dataset.postId;
            const confirmed = await window.showCustomModal({ title: "Видалення", message: "Видалити цю публікацію?", type: "confirm" });
            if (confirmed) await deleteDoc(doc(db, "posts", postId));
            return;
        }

        if (e.target.closest('.edit-post-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.edit-post-btn');
            window.currentEditPostId = btn.dataset.postId;
            
            // Шукаємо пост у загальному кеші
            let postDoc = cachedPosts.find(p => p.id === window.currentEditPostId);
            
            // Якщо його там немає (напр., ми в своєму профілі), дістаємо з бази
            if (!postDoc) {
                const snap = await getDoc(doc(db, "posts", window.currentEditPostId));
                if (snap.exists()) postDoc = { data: () => snap.data() };
            }

            if (postDoc) {
                document.getElementById('edit-post-text-input').value = postDoc.data().text || '';
                document.getElementById('edit-post-modal').classList.remove('hidden');
            }
            return;
        }

        if (e.target.closest('#close-edit-post-btn')) document.getElementById('edit-post-modal').classList.add('hidden');

        if (e.target.closest('#submit-edit-post-btn')) {
            const newText = document.getElementById('edit-post-text-input').value.trim();
            const btn = document.getElementById('submit-edit-post-btn');
            btn.textContent = "Зберігаємо..."; btn.disabled = true;
            try {
                await updateDoc(doc(db, "posts", window.currentEditPostId), { text: newText });
                document.getElementById('edit-post-modal').classList.add('hidden');
            } catch(err) { console.error(err); }
            finally { btn.textContent = "Зберегти"; btn.disabled = false; }
        }

        if (e.target.closest('.delete-collab-btn')) {
            e.stopPropagation(); 
            const id = e.target.closest('.delete-collab-btn').dataset.collabId;
            const confirm = await window.showCustomModal({ title: "Видалення", message: "Видалити цю колаборацію?", type: "confirm" });
            if (confirm) await deleteDoc(doc(db, "collaborations", id));
            return;
        }
        
        if (e.target.closest('.edit-collab-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.edit-collab-btn');
            window.currentEditCollabId = btn.dataset.collabId;
            document.getElementById('edit-collab-type').value = btn.dataset.type;
            document.getElementById('edit-collab-title').value = btn.dataset.title;
            document.getElementById('edit-collab-text').value = btn.dataset.text;
            document.getElementById('edit-collab-modal').classList.remove('hidden');
            return;
        }

        if (e.target.closest('#close-edit-collab-modal-btn')) document.getElementById('edit-collab-modal').classList.add('hidden');

        if (e.target.closest('#submit-edit-collab-btn')) {
            const btn = document.getElementById('submit-edit-collab-btn');
            const type = document.getElementById('edit-collab-type').value;
            const title = document.getElementById('edit-collab-title').value.trim();
            const text = document.getElementById('edit-collab-text').value.trim();
            if (!title || !text) return window.showCustomModal({ title: "Помилка", message: "Заповніть всі поля!" });
            btn.textContent = "Зберігаємо..."; btn.disabled = true;
            try {
                await updateDoc(doc(db, "collaborations", window.currentEditCollabId), { type, title, text });
                document.getElementById('edit-collab-modal').classList.add('hidden');
            } catch (err) { console.error(err); } finally { btn.textContent = "Зберегти зміни"; btn.disabled = false; }
        }

        // --- РЕАКЦІЇ ---
        if (e.target.closest('.add-reaction-btn')) {
            const btn = e.target.closest('.add-reaction-btn');
            const picker = document.getElementById(`picker-${btn.dataset.postId}`);
            document.querySelectorAll('.post-reaction-picker').forEach(p => { if (p !== picker) p.classList.add('hidden'); });
            picker.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.reaction-picker-container')) {
            document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));
        }
        if (e.target.classList.contains('emoji-btn') || e.target.closest('.reaction-pill')) {
            const currentUser = auth.currentUser;
            if (!currentUser) { window.showCustomModal({ title: "Увага", message: "Увійдіть!" }); return; }
            let target = e.target.classList.contains('emoji-btn') ? e.target : e.target.closest('.reaction-pill');
            const emoji = target.dataset.emoji;
            const postId = target.dataset.postId;
            document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));
            try {
                const postRef = doc(db, "posts", postId);
                const postSnap = await getDoc(postRef);
                if (!postSnap.exists()) return;
                const usersWhoReacted = (postSnap.data().reactions || {})[emoji] || [];
                await updateDoc(postRef, { [`reactions.${emoji}`]: usersWhoReacted.includes(currentUser.uid) ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) });
            } catch (error) { console.error("Помилка реакції:", error); }
        }

        // --- ПОШИРЕННЯ ПУБЛІКАЦІЇ ---
        if (e.target.closest('.dm-btn')) {
            const btn = e.target.closest('.dm-btn');
            const currentUser = auth.currentUser;
            if (!currentUser) { window.showCustomModal({ title: "Увага", message: "Увійдіть!" }); return; }
            window.currentSharePostData = { id: btn.dataset.postId, authorName: btn.dataset.authorName, text: btn.dataset.postText, mediaUrl: btn.dataset.postMedia, mediaType: btn.dataset.postMediatype };
            const shareModal = document.getElementById('share-post-modal');
            const friendsContainer = document.getElementById('share-friends-container');
            friendsContainer.innerHTML = '<p style="text-align:center; font-size: 13px; color: #888;">Завантаження...</p>';
            shareModal.classList.remove('hidden');
            try {
                const following = (await getDoc(doc(db, "users", currentUser.uid))).data()?.following || [];
                friendsContainer.innerHTML = '';
                if (following.length === 0) {
                    friendsContainer.innerHTML = '<p style="text-align:center; font-size: 13px; color: #888; margin-top: 10px;">Ви ще ні на кого не підписані</p>';
                } else {
                    const usersSnap = await getDocs(collection(db, "users"));
                    usersSnap.forEach(uSnap => {
                        if (following.includes(uSnap.id)) {
                            const u = uSnap.data();
                            const avatar = u.avatarUrl || DEFAULT_AVATAR;
                            const name = u.nickname || u.username || u.login || 'Користувач';
                            friendsContainer.innerHTML += `
                                <div style="display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                                    <img src="${avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">
                                    <div style="flex: 1; margin-left: 14px;"><h4 style="font-size: 16px; font-weight: 600; margin: 0;">${name}</h4></div>
                                    <button class="send-share-btn" data-target-uid="${uSnap.id}" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-color);">Надіслати</button>
                                </div>
                            `;
                        }
                    });
                }
            } catch (err) { console.error(err); }
        }
        if (e.target.closest('.send-share-btn')) {
            const currentUser = auth.currentUser;
            if (!currentUser || !window.currentSharePostData) return;
            const btn = e.target.closest('button');
            const targetUid = btn.dataset.targetUid;
            const roomId = currentUser.uid < targetUid ? `${currentUser.uid}_${targetUid}` : `${targetUid}_${currentUser.uid}`;
            const postData = window.currentSharePostData;
            btn.textContent = "Надіслано!"; btn.style.background = "var(--text-color)"; btn.style.color = "var(--bg-color)"; btn.disabled = true;
            try {
                let msgText = `📌 Публікація від ${postData.authorName}`;
                if (postData.text) msgText += `:\n"${postData.text.length > 80 ? postData.text.substring(0, 80) + '...' : postData.text}"`;
                await addDoc(collection(db, "chats", roomId, "messages"), { senderId: currentUser.uid, text: msgText, mediaUrl: postData.mediaUrl || null, mediaType: postData.mediaType || null, timestamp: serverTimestamp() });
                await setDoc(doc(db, "chats", roomId), { participants: [currentUser.uid, targetUid], lastMessage: "📌 Поширена публікація", timestamp: serverTimestamp() }, { merge: true });
                await updateDoc(doc(db, "posts", postData.id), { sharesCount: increment(1) });
                setTimeout(() => { document.getElementById('share-post-modal').classList.add('hidden'); btn.textContent = "Надіслати"; btn.style.background = ""; btn.style.color = ""; btn.disabled = false; }, 800);
            } catch (err) { console.error(err); btn.textContent = "Помилка"; }
        }
        if (e.target.closest('#close-share-modal-btn')) document.getElementById('share-post-modal').classList.add('hidden');
        
        // --- СТВОРЕННЯ КОЛАБОРАЦІЙ ---
        if (e.target.closest('#add-collab-btn')) {
            if (!auth.currentUser) return window.showCustomModal({ title: "Увага", message: "Увійдіть!" });
            document.getElementById('create-collab-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-collab-modal-btn')) document.getElementById('create-collab-modal').classList.add('hidden');
        if (e.target.closest('#submit-collab-btn')) {
            const submitCollabBtn = document.getElementById('submit-collab-btn');
            const type = document.getElementById('collab-type').value;
            const title = document.getElementById('collab-title').value.trim();
            const text = document.getElementById('collab-text').value.trim();
            if (!auth.currentUser) return window.showCustomModal({ title: "Увага", message: "Увійдіть!" });
            if (!title || !text) return window.showCustomModal({ title: "Помилка", message: "Заповніть всі поля!" });
            submitCollabBtn.textContent = "Публікуємо..."; submitCollabBtn.disabled = true;
            try {
                await addDoc(collection(db, "collaborations"), { type, title, text, authorId: auth.currentUser.uid, createdAt: serverTimestamp() });
                document.getElementById('collab-title').value = ''; document.getElementById('collab-text').value = '';
                document.getElementById('create-collab-modal').classList.add('hidden');
            } catch (err) { console.error(err); } finally { submitCollabBtn.textContent = "Опублікувати"; submitCollabBtn.disabled = false; }
        }

        // --- ВІДКРИТТЯ ЧУЖОГО ПРОФІЛЮ ---
        if (e.target.closest('.user-profile-trigger')) {
            e.preventDefault();
            const trigger = e.target.closest('.user-profile-trigger');
            const targetUserId = trigger.getAttribute('data-user-id') || trigger.dataset.userId;
            if (!targetUserId) return;

            const usersListModal = document.getElementById('users-list-modal');
            if(usersListModal) usersListModal.classList.add('hidden');

            const currentUser = auth.currentUser;
            if (currentUser && targetUserId === currentUser.uid) {
                document.querySelectorAll('.app-screen').forEach(s => s.classList.add('hidden'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                const profileScreen = document.getElementById('screen-profile');
                if(profileScreen) { profileScreen.classList.remove('hidden'); profileScreen.classList.add('active'); profileScreen.style.display = 'block'; }
                const navBtn = document.querySelector('.nav-btn[data-screen="screen-profile"]');
                if(navBtn) navBtn.classList.add('active');
                return;
            }

            const modal = document.getElementById('other-user-profile-modal');
            if (modal) { modal.classList.remove('hidden'); modal.classList.remove('app-screen'); modal.style.display = 'block'; modal.style.zIndex = '9999'; }
            
            document.getElementById('other-profile-nickname').textContent = "Завантаження...";
            document.getElementById('other-profile-bio').style.display = 'none';
            document.getElementById('other-profile-avatar').src = DEFAULT_AVATAR;
            
            const feed = document.getElementById('other-profile-grid');
            if (feed) feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Завантаження портфоліо...</p>';

            try {
                const userDoc = await getDoc(doc(db, "users", targetUserId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    const nameEl = document.getElementById('other-profile-nickname');
                    const loginEl = document.getElementById('other-profile-login');
                    
                    if (data.firstName || data.lastName) {
                        nameEl.textContent = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                        if(loginEl) {
                            loginEl.textContent = `@${data.login || data.username || 'user'}`;
                            loginEl.style.display = 'block';
                        }
                    } else {
                        nameEl.textContent = data.login || data.username || 'Творець';
                        if(loginEl) loginEl.style.display = 'none'; 
                    }

                    if (data.avatarUrl) document.getElementById('other-profile-avatar').src = data.avatarUrl;
                    if (data.bio) {
                        const bioEl = document.getElementById('other-profile-bio');
                        bioEl.textContent = data.bio; bioEl.style.display = 'block';
                    }
                    
                    document.getElementById('other-followers-count').textContent = (data.followers || []).length;
                    document.getElementById('other-following-count').textContent = (data.following || []).length;
                    document.getElementById('other-followers-btn').dataset.userId = targetUserId;
                    document.getElementById('other-following-btn').dataset.userId = targetUserId;
                }

                const postsSnap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
                if (feed) {
                    feed.innerHTML = '';
                    let hasPosts = false;
                    postsSnap.forEach(pDoc => {
                        const post = pDoc.data();
                        const postId = pDoc.id;
                        if (post.authorId === targetUserId) {
                            hasPosts = true;
                            let timeString = 'Щойно';
                            if (post.createdAt) {
                                const createdTime = post.createdAt.toDate();
                                timeString = createdTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            }

                            let mediaHTML = '';
                            if (post.mediaUrl) {
                                if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post">`;
                                else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
                            }

                            let reactionsPillsHtml = '';
                            let iReactedToPost = false;
                            if (post.reactions) {
                                const currentUserUid = currentUser ? currentUser.uid : null;
                                for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                                    if (usersArray && usersArray.length > 0) {
                                        const isMe = currentUserUid && usersArray.includes(currentUserUid);
                                        if (isMe) iReactedToPost = true;
                                        const activeClass = isMe ? 'reacted-by-me' : '';
                                        reactionsPillsHtml += `<span class="reaction-pill ${activeClass}" data-emoji="${emoji}" data-post-id="${postId}">${emoji} ${usersArray.length}</span>`;
                                    }
                                }
                            }

                            const reactionSmileIcon = iReactedToPost ? 'bi-emoji-smile-fill' : 'bi-emoji-smile';
                            const reactionSmileColor = iReactedToPost ? 'var(--text-color)' : 'var(--text-secondary)';
                            const currentAvatar = userCache[post.authorId]?.avatar || DEFAULT_AVATAR;
                            const currentName = userCache[post.authorId]?.name || "...";

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
                                    <button style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>
                                </div>
                                <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                                <div class="post-bottom-actions">
                                    <div class="reaction-picker-container">
                                        <button class="add-reaction-btn" data-post-id="${postId}"><i class="bi ${reactionSmileIcon}" style="color: ${reactionSmileColor};"></i></button>
                                        <div class="post-reaction-picker hidden" id="picker-${postId}">
                                            <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}">❤️</span>
                                            <span class="emoji-btn" data-emoji="🔥" data-post-id="${postId}">🔥</span>
                                            <span class="emoji-btn" data-emoji="👏" data-post-id="${postId}">👏</span>
                                            <span class="emoji-btn" data-emoji="💡" data-post-id="${postId}">💡</span>
                                        </div>
                                    </div>
                                    <div class="post-reactions-list" id="reactions-list-${postId}">${reactionsPillsHtml}</div>
                                </div>
                            `;
                            feed.appendChild(postElement);
                        }
                    });
                    if (!hasPosts) feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Немає публікацій</p>';
                }
            } catch (error) { console.error(error); if (feed) feed.innerHTML = '<p style="text-align:center; color: #ff4444; margin-top: 40px;">Помилка завантаження</p>'; }
        }

        if (e.target.closest('#close-other-profile-btn')) {
            const modal = document.getElementById('other-user-profile-modal');
            if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
        }
        
        if (e.target.closest('#follow-user-btn')) window.showCustomModal({ title: "Підписка", message: "Функція підписки буде додана в наступному кроці!" });
        if (e.target.closest('#message-user-btn')) window.showCustomModal({ title: "Повідомлення", message: "Чат з цим користувачем буде доданий в наступному кроці!" });
    });

    const editAvatarInput = document.getElementById('edit-avatar-input');
    if (editAvatarInput) {
        editAvatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) document.getElementById('edit-profile-avatar-preview').src = URL.createObjectURL(file);
        });
    }
});