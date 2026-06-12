import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

const userCache = {}; 
window.currentEditPostId = null;
window.currentEditCollabId = null;
let activeCollabDetailsId = null; // Для вікна деталей колаборації

document.addEventListener('DOMContentLoaded', () => {

    let myBlockedUsers = [];

    auth.onAuthStateChanged(user => {
        if(user) {
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if(docSnap.exists()) {
                    myBlockedUsers = docSnap.data().blockedUsers || [];
                    renderFeed(); // Перемалювати стрічку, щоб сховати заблокованих
                }
            });
        }
    });

    function ensureUserListener(uid) {
        if (!userCache[uid]) {
            userCache[uid] = { name: "...", avatar: DEFAULT_AVATAR, isListening: true };
            onSnapshot(doc(db, "users", uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let displayName = data.login || data.username || 'Користувач';
                    if (data.firstName || data.lastName) displayName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                    
                    const avatar = data.avatarUrl || DEFAULT_AVATAR;
                    userCache[uid] = { name: displayName, avatar: avatar, isListening: true };
                    
                    document.querySelectorAll(`.sync-avatar[data-sync-uid="${uid}"]`).forEach(el => el.src = avatar);
                    document.querySelectorAll(`.sync-name[data-sync-uid="${uid}"]`).forEach(el => el.textContent = displayName);
                }
            });
        }
    }

    // --- СТВОРЕННЯ ПУБЛІКАЦІЙ ---
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
        if (type === 'image') { imagePreview.src = fileURL; imagePreview.classList.remove('hidden'); videoPreview.classList.add('hidden'); } 
        else { videoPreview.src = fileURL; videoPreview.classList.remove('hidden'); imagePreview.classList.add('hidden'); }
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

            if (!user || (!text && !currentSelectedFile)) return;

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

    // --- ГЛОБАЛЬНА СТРІЧКА ---
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
            
            // Фільтр категорій і чорний список
            if (currentFeedFilter !== 'Всі' && postCat !== currentFeedFilter) return;
            if (myBlockedUsers.includes(post.authorId)) return; // Приховуємо пости заблокованих користувачів

            visibleCount++;
            ensureUserListener(post.authorId);

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

            // Меню 3 крапок. Додано пункт "Заблокувати" для чужих постів.
            let menuItems = '';
            if (isAuthor) {
                if (canEditPost) menuItems += `<button class="edit-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: var(--text-color); font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-pencil" style="margin-right: 8px;"></i>Редагувати</button>`;
                menuItems += `<button class="delete-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: #ff4444; font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-trash" style="margin-right: 8px;"></i>Видалити</button>`;
            } else {
                menuItems += `<button class="block-user-btn" data-user-id="${post.authorId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: #ff4444; font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-slash-circle" style="margin-right: 8px;"></i>Заблокувати</button>`;
            }

            const menuHtml = `
                <div style="position: relative;">
                    <button class="post-menu-trigger-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>
                    <div class="post-menu-dropdown hidden" style="position: absolute; right: 0; top: 100%; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 5px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.15); min-width: 160px;">
                        ${menuItems}
                    </div>
                </div>
            `;

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
            feedContainer.appendChild(postElement);
        });
        if (visibleCount === 0) feedContainer.innerHTML = `<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; padding: 0 20px;">Немає записів.</p>`;
    }

    if (feedContainer) {
        onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
            cachedPosts = snapshot.docs; renderFeed();
        });
    }

    // --- КОЛАБОРАЦІЇ ---
    let cachedCollabs = [];
    const collabContainer = document.getElementById('collaborations-container');
    const allCollabsListContainer = document.getElementById('all-collabs-list-container');
    
    function renderCollabCard(docSnap, isFullList = false) {
        const collab = docSnap.data();
        const collabId = docSnap.id;
        ensureUserListener(collab.authorId);
        const authorName = userCache[collab.authorId]?.name || "...";
        const authorAvatar = userCache[collab.authorId]?.avatar || DEFAULT_AVATAR;

        const isCollabAuthor = auth.currentUser && collab.authorId === auth.currentUser.uid;
        let canEditCollab = false;
        if (isCollabAuthor && collab.createdAt) {
            canEditCollab = (new Date().getTime() - collab.createdAt.toDate().getTime()) < (15 * 60 * 1000); 
        }

        const isSearching = collab.type === "Шукаю";
        const badgeBg = isSearching ? "var(--text-color)" : "transparent";
        const badgeColor = isSearching ? "var(--bg-color)" : "var(--text-color)";
        const badgeBorder = isSearching ? "none" : "1px solid var(--text-color)";

        const collabMenuHtml = isCollabAuthor ? `
            <div style="position:absolute; top:15px; right:15px; display:flex; gap:10px; z-index:10;">
                ${canEditCollab ? `<button class="edit-collab-btn" data-collab-id="${collabId}" data-type="${collab.type}" data-title="${collab.title.replace(/"/g, '&quot;')}" data-text="${collab.text.replace(/"/g, '&quot;')}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary);"><i class="bi bi-pencil" style="font-size:12px;"></i></button>` : ''}
                <button class="delete-collab-btn" data-collab-id="${collabId}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ff4444;"><i class="bi bi-trash" style="font-size:12px;"></i></button>
            </div>` : '';

        return `
            <div class="collab-card-trigger" data-collab-id="${collabId}" style="position: relative; ${isFullList ? 'width: 100%;' : 'min-width: 260px; width: 260px;'} background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 20px; padding-top: 35px; flex-shrink: 0; scroll-snap-align: start; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.03); cursor: pointer; transition: 0.2s;">
                ${collabMenuHtml}
                <span style="background: ${badgeBg}; color: ${badgeColor}; border: ${badgeBorder}; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 5px 9px; border-radius: 8px; align-self: flex-start; margin-bottom: 14px; letter-spacing: 0.5px; white-space: normal; line-height: 1.3; word-wrap: break-word; max-width: 100%;">${isSearching ? "ШУКАЮ: " : ""}${collab.title}</span>
                <p style="font-size: 14px; font-weight: 500; color: var(--text-color); line-height: 1.5; margin: 0 0 20px 0; flex: 1; white-space: pre-wrap;">${collab.text}</p>
                <div style="display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <img class="sync-avatar" data-sync-uid="${collab.authorId}" src="${authorAvatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                    <span class="sync-name" data-sync-uid="${collab.authorId}" style="font-size: 13px; color: var(--text-secondary); font-weight: 600;">${authorName}</span>
                </div>
            </div>
        `;
    }

    if (collabContainer) {
        onSnapshot(query(collection(db, "collaborations"), orderBy("createdAt", "desc")), (snapshot) => {
            cachedCollabs = snapshot.docs;
            collabContainer.innerHTML = '';
            cachedCollabs.forEach((docSnap) => {
                collabContainer.innerHTML += renderCollabCard(docSnap);
            });
            if (collabContainer.innerHTML === '') collabContainer.innerHTML = '<p style="font-size: 13px; color: #888; text-align: center; width: 100%; margin-top: 20px;">Поки що немає відкритих колаборацій</p>';
        });
    }

    const collabsSearchInput = document.getElementById('collabs-search-input');
    function renderAllCollabs(filterText = '') {
        if(!allCollabsListContainer) return;
        allCollabsListContainer.innerHTML = '';
        let count = 0;
        cachedCollabs.forEach(docSnap => {
            const data = docSnap.data();
            const textToSearch = (data.title + ' ' + data.text).toLowerCase();
            if (textToSearch.includes(filterText.toLowerCase())) {
                allCollabsListContainer.innerHTML += renderCollabCard(docSnap, true);
                count++;
            }
        });
        if(count === 0) allCollabsListContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Нічого не знайдено</p>';
    }

    if(collabsSearchInput) {
        collabsSearchInput.addEventListener('input', (e) => {
            renderAllCollabs(e.target.value);
        });
    }

    // --- ВІДКРИТТЯ ДНЯ ---
    async function loadDiscoveries() {
        const discoveriesContainer = document.getElementById('discoveries-container');
        const discoveriesModalList = document.getElementById('discoveries-list-container');
        
        if (!discoveriesContainer && !discoveriesModalList) return;
        try {
            const usersSnap = await getDocs(query(collection(db, "users"), limit(10)));
            if(discoveriesContainer) discoveriesContainer.innerHTML = ''; 
            if(discoveriesModalList) discoveriesModalList.innerHTML = '';

            usersSnap.forEach(async (docSnap) => {
                const u = docSnap.data();
                if (auth.currentUser && docSnap.id === auth.currentUser.uid) return; 
                const uid = docSnap.id;
                ensureUserListener(uid);
                const avatar = userCache[uid]?.avatar || DEFAULT_AVATAR;
                const name = userCache[uid]?.name || '...';
                
                // Рендер для головної сторінки (кружечки)
                if(discoveriesContainer) {
                    discoveriesContainer.innerHTML += `
                        <div class="user-profile-trigger" data-user-id="${uid}" style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; cursor: pointer;">
                            <div style="width: 68px; height: 68px; border-radius: 50%; border: 2px solid var(--text-color); padding: 3px; display: flex; align-items: center; justify-content: center;">
                                <img class="sync-avatar" data-sync-uid="${uid}" src="${avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                            </div>
                            <span class="sync-name" data-sync-uid="${uid}" style="font-size: 12px; font-weight: 600; color: var(--text-color); width: 68px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${name}</span>
                        </div>
                    `;
                }

                // Рендер для вікна "Більше" (Плитки з останнім постом)
                if (discoveriesModalList) {
                    const tileId = `discovery-tile-${uid}`;
                    discoveriesModalList.innerHTML += `
                        <div id="${tileId}" class="user-profile-trigger" data-user-id="${uid}" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; cursor: pointer; display: flex; flex-direction: column; aspect-ratio: 1; position: relative;">
                            <div style="position: absolute; top: 10px; left: 10px; display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 12px; z-index: 5;">
                                <img class="sync-avatar" data-sync-uid="${uid}" src="${avatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                                <span class="sync-name" data-sync-uid="${uid}" style="color: #fff; font-size: 11px; font-weight: 600; max-width: 60px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                            </div>
                            <div class="tile-content" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg-color);">
                                <span style="font-size: 12px; color: var(--text-secondary);">Завантаження...</span>
                            </div>
                        </div>
                    `;

                    // Підтягуємо останній пост
                    const lastPostQ = query(collection(db, "posts"), where("authorId", "==", uid), orderBy("createdAt", "desc"), limit(1));
                    const lastPostSnap = await getDocs(lastPostQ);
                    const tileEl = document.getElementById(tileId);
                    if (tileEl) {
                        const contentEl = tileEl.querySelector('.tile-content');
                        if (!lastPostSnap.empty) {
                            const postData = lastPostSnap.docs[0].data();
                            if (postData.mediaUrl && postData.mediaType === 'image') {
                                contentEl.innerHTML = `<img src="${postData.mediaUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                            } else if (postData.text) {
                                contentEl.innerHTML = `<p style="padding: 10px; font-size: 12px; font-weight: 600; color: var(--text-color); text-align: center; margin: 0; line-height: 1.4;">${postData.text.length > 50 ? postData.text.substring(0, 50) + '...' : postData.text}</p>`;
                            } else {
                                contentEl.innerHTML = `<span style="font-size: 12px; color: var(--text-secondary);">Пост</span>`;
                            }
                        } else {
                            contentEl.innerHTML = `<span style="font-size: 12px; color: var(--text-secondary);">Новий користувач</span>`;
                        }
                    }
                }
            });
        } catch (error) { console.error("Помилка:", error); }
    }
    loadDiscoveries();

    // --- КЛІКИ: МЕНЮ, ВІКНА, КОЛАБОРАЦІЇ ---
    document.addEventListener('click', async (e) => {
        // Три крапки
        if (e.target.closest('.post-menu-trigger-btn')) {
            const btn = e.target.closest('.post-menu-trigger-btn');
            const dropdown = btn.nextElementSibling; 
            document.querySelectorAll('.post-menu-dropdown').forEach(d => { if(d !== dropdown) d.classList.add('hidden'); });
            if(dropdown) dropdown.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.post-menu-trigger-btn')) {
            document.querySelectorAll('.post-menu-dropdown').forEach(d => d.classList.add('hidden'));
        }

        // Блокування користувача
        if (e.target.closest('.block-user-btn')) {
            const btn = e.target.closest('.block-user-btn');
            const uidToBlock = btn.dataset.userId;
            const confirm = await window.showCustomModal({ title: "Блокування", message: "Заблокувати цього користувача? Ви більше не побачите його публікації.", type: "confirm" });
            if (confirm) {
                if (auth.currentUser) {
                    await setDoc(doc(db, "users", auth.currentUser.uid), { blockedUsers: arrayUnion(uidToBlock) }, { merge: true });
                    window.showCustomModal({ title: "Заблоковано", message: "Користувача заблоковано." });
                }
            }
            return;
        }

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
            let postDoc = cachedPosts.find(p => p.id === window.currentEditPostId);
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
            } catch(err) {} finally { btn.textContent = "Зберегти"; btn.disabled = false; }
        }

        // КОЛАБОРАЦІЇ: Відкриття деталей
        if (e.target.closest('.collab-card-trigger')) {
            // Щоб не перебивати кліки по кнопках редагування/профілю
            if (e.target.closest('.edit-collab-btn') || e.target.closest('.delete-collab-btn') || e.target.closest('.user-profile-trigger')) return;
            
            const card = e.target.closest('.collab-card-trigger');
            activeCollabDetailsId = card.dataset.collabId;
            const collabDoc = cachedCollabs.find(c => c.id === activeCollabDetailsId);
            if(!collabDoc) return;
            
            // Заповнюємо інформацію
            document.getElementById('collab-details-content').innerHTML = renderCollabCard(collabDoc, true).replace('collab-card-trigger', '').replace('cursor: pointer;', '');
            
            // Відкриваємо модалку
            document.getElementById('collab-details-modal').classList.remove('hidden');

            // Завантажуємо коментарі
            const commentsContainer = document.getElementById('collab-comments-container');
            commentsContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size: 13px;">Завантаження...</p>';
            onSnapshot(query(collection(db, `collaborations/${activeCollabDetailsId}/comments`), orderBy("timestamp", "asc")), (snap) => {
                commentsContainer.innerHTML = '';
                if(snap.empty) { commentsContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size: 13px;">Немає коментарів. Напишіть першим!</p>'; return; }
                snap.forEach(cDoc => {
                    const cData = cDoc.data();
                    ensureUserListener(cData.authorId);
                    const avatar = userCache[cData.authorId]?.avatar || DEFAULT_AVATAR;
                    const name = userCache[cData.authorId]?.name || "...";
                    commentsContainer.innerHTML += `
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
                            <img class="sync-avatar" data-sync-uid="${cData.authorId}" src="${avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                            <div style="flex: 1;">
                                <span class="sync-name" data-sync-uid="${cData.authorId}" style="font-weight: 700; font-size: 14px; color: var(--text-color);">${name}</span>
                                <p style="margin: 2px 0 0 0; font-size: 14px; color: var(--text-color); line-height: 1.4;">${cData.text}</p>
                            </div>
                        </div>
                    `;
                });
            });
        }
        if (e.target.closest('#close-collab-details-btn')) document.getElementById('collab-details-modal').classList.add('hidden');
        
        // Відправка коментаря до колаборації
        if (e.target.closest('#send-collab-comment-btn')) {
            const input = document.getElementById('collab-comment-input');
            const text = input.value.trim();
            if(!text || !auth.currentUser || !activeCollabDetailsId) return;
            const btn = e.target.closest('#send-collab-comment-btn');
            btn.innerHTML = '<i class="bi bi-hourglass"></i>'; btn.disabled = true;
            try {
                await addDoc(collection(db, `collaborations/${activeCollabDetailsId}/comments`), {
                    text: text, authorId: auth.currentUser.uid, timestamp: serverTimestamp()
                });
                input.value = '';
            } catch(e) { console.error(e); } finally { btn.innerHTML = '<i class="bi bi-send-fill"></i>'; btn.disabled = false; }
        }

        if (e.target.closest('.delete-collab-btn')) {
            e.stopPropagation(); 
            const id = e.target.closest('.delete-collab-btn').dataset.collabId;
            const confirm = await window.showCustomModal({ title: "Видалення", message: "Видалити?", type: "confirm" });
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
            btn.textContent = "Зберігаємо..."; btn.disabled = true;
            try {
                await updateDoc(doc(db, "collaborations", window.currentEditCollabId), { type, title, text });
                document.getElementById('edit-collab-modal').classList.add('hidden');
            } catch (err) {} finally { btn.textContent = "Зберегти зміни"; btn.disabled = false; }
        }

        // РЕАКЦІЇ
        if (e.target.closest('.add-reaction-btn')) {
            const btn = e.target.closest('.add-reaction-btn');
            const picker = btn.closest('.reaction-picker-container').querySelector('.post-reaction-picker');
            document.querySelectorAll('.post-reaction-picker').forEach(p => { if (p !== picker) p.classList.add('hidden'); });
            if(picker) picker.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.reaction-picker-container')) {
            document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));
        }
        if (e.target.classList.contains('emoji-btn') || e.target.closest('.reaction-pill')) {
            const currentUser = auth.currentUser;
            if (!currentUser) return window.showCustomModal({ title: "Увага", message: "Увійдіть!" });
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
            } catch (error) { }
        }

        // ВІКНА ТА КНОПКИ
        if (e.target.closest('#open-notifications-btn')) document.getElementById('notifications-modal').classList.remove('hidden');
        if (e.target.closest('#close-notifications-btn')) document.getElementById('notifications-modal').classList.add('hidden');

        if (e.target.closest('#open-discoveries-btn')) document.getElementById('discoveries-modal').classList.remove('hidden');
        if (e.target.closest('#close-discoveries-btn')) document.getElementById('discoveries-modal').classList.add('hidden');

        if (e.target.closest('#open-all-collabs-btn')) {
            renderAllCollabs(''); document.getElementById('all-collabs-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-all-collabs-btn')) document.getElementById('all-collabs-modal').classList.add('hidden');

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
            submitCollabBtn.textContent = "Публікуємо..."; submitCollabBtn.disabled = true;
            try {
                await addDoc(collection(db, "collaborations"), { type, title, text, authorId: auth.currentUser.uid, createdAt: serverTimestamp() });
                document.getElementById('collab-title').value = ''; document.getElementById('collab-text').value = '';
                document.getElementById('create-collab-modal').classList.add('hidden');
            } catch (err) {} finally { submitCollabBtn.textContent = "Опублікувати"; submitCollabBtn.disabled = false; }
        }
    });
});