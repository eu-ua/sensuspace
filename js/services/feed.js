import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

const userCache = {}; 

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

            if (!user) { await window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб створити публікацію." }); return; }
            if (!text && !currentSelectedFile) { await window.showCustomModal({ title: "Порожньо", message: "Додайте текст або файл!" }); return; }

            const originalBtnText = submitPostBtn.textContent;
            submitPostBtn.textContent = 'Публікуємо...';
            submitPostBtn.disabled = true; 

            try {
                let mediaUrl = null, mediaType = null;
                if (currentSelectedFile) {
                    const formData = new FormData();
                    formData.append('file', currentSelectedFile);
                    formData.append('upload_preset', 'sensuspace'); 
                    const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.secure_url) { mediaUrl = data.secure_url; mediaType = data.resource_type; } 
                    else throw new Error('Хмара помилка');
                }

                await addDoc(collection(db, "posts"), {
                    text: text, mediaUrl: mediaUrl, mediaType: mediaType, authorId: user.uid,
                    category: postCategory, createdAt: serverTimestamp(), reactions: {}, sharesCount: 0 
                });

                postTextInput.value = '';
                if (categorySelect) categorySelect.value = 'Всі';
                if (removeMediaBtn) removeMediaBtn.click(); 
                document.getElementById('create-post-modal').classList.add('hidden'); 
            } catch (error) {
                console.error(error); await window.showCustomModal({ title: "Помилка", message: "Сталася помилка." });
            } finally {
                submitPostBtn.textContent = originalBtnText; submitPostBtn.disabled = false;
            }
        });
    }

    // =================================================================
    // РЕНДЕР СТРІЧКИ ТА ФІЛЬТРИ
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
            if (postCat === 'В процесі') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color); vertical-align: middle; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">В процесі 🛠️</span>`;
            else if (postCat === 'Критика') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color); vertical-align: middle; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">Критика 💬</span>`;

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
                    ${isAuthor ? `
                        <div style="display: flex; gap: 8px;">
                            ${canEditPost ? `<button class="post-menu-btn edit-post-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-pencil" style="font-size: 16px;"></i></button>` : ''}
                            <button class="post-menu-btn delete-post-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; padding: 4px;"><i class="bi bi-trash" style="color: #ff4444; font-size: 18px;"></i></button>
                        </div>
                    ` : `<button class="post-menu-btn" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>`}
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
            cachedPosts = snapshot.docs;
            renderFeed();
        });
    }

    // =================================================================
    // КОЛАБОРАЦІЇ (РЕНДЕР ТА КНОПКИ РЕДАГУВАННЯ)
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
                    const createdTime = collab.createdAt.toDate().getTime();
                    canEditCollab = (now - createdTime) < (15 * 60 * 1000); 
                }

                const isSearching = collab.type === "Шукаю";
                const badgeBg = isSearching ? "var(--text-color)" : "transparent";
                const badgeColor = isSearching ? "var(--bg-color)" : "var(--text-color)";
                const badgeBorder = isSearching ? "none" : "1px solid var(--text-color)";

                const collabMenuHtml = isCollabAuthor ? `
                    <div style="position:absolute; top:15px; right:15px; display:flex; gap:10px; z-index:10;">
                        ${canEditCollab ? `<button class="edit-collab-btn" data-collab-id="${docSnap.id}" data-type="${collab.type}" data-title="${collab.title.replace(/"/g, '&quot;')}" data-text="${collab.text.replace(/"/g, '&quot;')}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary); box-shadow:0 2px 4px rgba(0,0,0,0.1);"><i class="bi bi-pencil" style="font-size:12px;"></i></button>` : ''}
                        <button class="delete-collab-btn" data-collab-id="${docSnap.id}" style="background:var(--bg-color); border:1px solid var(--border-color); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#ff4444; box-shadow:0 2px 4px rgba(0,0,0,0.1);"><i class="bi bi-trash" style="font-size:12px;"></i></button>
                    </div>
                ` : '';

                // КЛАС user-profile-trigger ПРИБРАНО З ГОЛОВНОГО DIV
                collabContainer.innerHTML += `
                    <div style="position: relative; min-width: 260px; width: 260px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 20px; padding-top: 35px; flex-shrink: 0; scroll-snap-align: start; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                        ${collabMenuHtml}
                        <span style="background: ${badgeBg}; color: ${badgeColor}; border: ${badgeBorder}; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 5px 9px; border-radius: 8px; align-self: flex-start; margin-bottom: 14px; letter-spacing: 0.5px;">${isSearching ? "ШУКАЮ: " : ""}${collab.title}</span>
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
            if (discoveriesContainer.innerHTML === '') discoveriesContainer.innerHTML = '<p style="font-size:13px; color:var(--text-secondary);">Тут з\'являться нові автори</p>';
        } catch (error) { console.error("Помилка:", error); }
    }
    loadDiscoveries();

    // =================================================================
    // ЄДИНИЙ ГЛОБАЛЬНИЙ ОБРОБНИК КЛІКІВ
    // =================================================================
    window.currentEditPostId = null;
    window.currentEditCollabId = null;

    document.addEventListener('click', async (e) => {
        
        // --- 1. РЕДАГУВАННЯ ТА ВИДАЛЕННЯ ПОСТІВ ---
        if (e.target.closest('.delete-post-btn')) {
            e.stopPropagation();
            const postId = e.target.closest('.delete-post-btn').dataset.postId;
            const confirmed = await window.showCustomModal({ title: "Видалення", message: "Ви впевнені?", type: "confirm" });
            if (confirmed) await deleteDoc(doc(db, "posts", postId));
            return;
        }

        if (e.target.closest('.edit-post-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.edit-post-btn');
            window.currentEditPostId = btn.dataset.postId;
            const postDoc = cachedPosts.find(p => p.id === window.currentEditPostId);
            if (postDoc) {
                document.getElementById('edit-post-text-input').value = postDoc.data().text || '';
                document.getElementById('edit-post-modal').classList.remove('hidden');
            }
            return;
        }

        if (e.target.closest('#close-edit-post-btn')) {
            document.getElementById('edit-post-modal').classList.add('hidden');
        }

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

        // --- 2. РЕДАГУВАННЯ ТА ВИДАЛЕННЯ КОЛАБОРАЦІЙ ---
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

        if (e.target.closest('#close-edit-collab-modal-btn')) {
            document.getElementById('edit-collab-modal').classList.add('hidden');
        }

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
            } catch (err) { console.error(err); window.showCustomModal({ title: "Помилка", message: "Помилка при збереженні." }); }
            finally { btn.textContent = "Зберегти зміни"; btn.disabled = false; }
        }

        // --- 3. РЕАКЦІЇ ---
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
            if (!currentUser) { window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб залишати реакції!" }); return; }
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

        // --- 4. ПОШИРЕННЯ ПУБЛІКАЦІЇ ---
        if (e.target.closest('.dm-btn')) {
            const btn = e.target.closest('.dm-btn');
            const currentUser = auth.currentUser;
            if (!currentUser) { window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб ділитися публікаціями." }); return; }
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
                            const friendCard = document.createElement('div');
                            friendCard.style.display = 'flex'; friendCard.style.alignItems = 'center'; friendCard.style.padding = '12px 0'; friendCard.style.borderBottom = '1px solid var(--border-color)';
                            friendCard.innerHTML = `
                                <img src="${avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">
                                <div style="flex: 1; margin-left: 14px;"><h4 style="font-size: 16px; font-weight: 600; margin: 0;">${name}</h4></div>
                                <button class="send-share-btn" data-target-uid="${uSnap.id}" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-color);">Надіслати</button>
                            `;
                            friendsContainer.appendChild(friendCard);
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
        if (e.target.closest('#close-share-modal-btn') || e.target.id === 'share-post-modal') document.getElementById('share-post-modal').classList.add('hidden');
        
        // --- 5. СТВОРЕННЯ КОЛАБОРАЦІЙ ---
        if (e.target.closest('#add-collab-btn')) {
            if (!auth.currentUser) return window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб створити запит." });
            document.getElementById('create-collab-modal').classList.remove('hidden');
        }
        if (e.target.closest('#close-collab-modal-btn')) document.getElementById('create-collab-modal').classList.add('hidden');
        if (e.target.closest('#submit-collab-btn')) {
            const submitCollabBtn = document.getElementById('submit-collab-btn');
            const type = document.getElementById('collab-type').value;
            const title = document.getElementById('collab-title').value.trim();
            const text = document.getElementById('collab-text').value.trim();
            if (!auth.currentUser) return window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб створити запит." });
            if (!title || !text) return window.showCustomModal({ title: "Помилка", message: "Заповніть всі поля!" });
            submitCollabBtn.textContent = "Публікуємо..."; submitCollabBtn.disabled = true;
            try {
                await addDoc(collection(db, "collaborations"), { type, title, text, authorId: auth.currentUser.uid, createdAt: serverTimestamp() });
                document.getElementById('collab-title').value = ''; document.getElementById('collab-text').value = '';
                document.getElementById('create-collab-modal').classList.add('hidden');
            } catch (err) { console.error(err); window.showCustomModal({ title: "Помилка", message: "Помилка при збереженні." }); } 
            finally { submitCollabBtn.textContent = "Опублікувати"; submitCollabBtn.disabled = false; }
        }

        // --- 6. ВІДКРИТТЯ ЧУЖОГО ПРОФІЛЮ ---
        if (e.target.closest('.user-profile-trigger')) {
            e.preventDefault();
            const trigger = e.target.closest('.user-profile-trigger');
            const targetUserId = trigger.getAttribute('data-user-id') || trigger.dataset.userId;
            
            if (!targetUserId) return;

            const currentUser = auth.currentUser;
            if (currentUser && targetUserId === currentUser.uid) {
                document.querySelectorAll('.app-screen').forEach(s => s.classList.add('hidden'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                
                const profileScreen = document.getElementById('screen-profile');
                if(profileScreen) {
                    profileScreen.classList.remove('hidden');
                    profileScreen.classList.add('active'); 
                    profileScreen.style.display = 'block';
                }
                const navBtn = document.querySelector('.nav-btn[data-screen="screen-profile"]');
                if(navBtn) navBtn.classList.add('active');
                return;
            }

            const modal = document.getElementById('other-user-profile-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.remove('app-screen');
                modal.style.display = 'block'; 
                modal.style.zIndex = '9999'; 
            }
            
            document.getElementById('other-profile-nickname').textContent = "Завантаження...";
            document.getElementById('other-profile-bio').style.display = 'none';
            document.getElementById('other-profile-avatar').src = DEFAULT_AVATAR;
            
            const grid = document.getElementById('other-profile-grid');
            if (grid) {
                grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; grid.style.gap = '2px';
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px 20px;">Завантаження портфоліо...</div>';
            }

            try {
                const userDoc = await getDoc(doc(db, "users", targetUserId));
                if (userDoc.exists()) {
                    const uData = userDoc.data();
                    document.getElementById('other-profile-nickname').textContent = uData.nickname || uData.username || uData.login || "Користувач";
                    if (uData.avatarUrl) document.getElementById('other-profile-avatar').src = uData.avatarUrl;
                    if (uData.bio) {
                        const bioEl = document.getElementById('other-profile-bio');
                        bioEl.textContent = uData.bio; bioEl.style.display = 'block';
                    }
                    document.getElementById('other-followers-count').textContent = (uData.followers || []).length;
                    document.getElementById('other-following-count').textContent = (uData.following || []).length;
                }

                const postsSnap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
                if (grid) {
                    grid.innerHTML = '';
                    let hasMedia = false;
                    postsSnap.forEach(pDoc => {
                        const pData = pDoc.data();
                        if (pData.authorId === targetUserId && pData.mediaUrl) {
                            hasMedia = true;
                            const card = document.createElement('div');
                            card.style.aspectRatio = "1"; card.style.overflow = "hidden"; card.style.backgroundColor = "var(--bg-secondary)"; card.style.cursor = "pointer";
                            if (pData.mediaType === 'image') card.innerHTML = `<img src="${pData.mediaUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                            else card.innerHTML = `<video src="${pData.mediaUrl}" style="width: 100%; height: 100%; object-fit: cover;" muted></video>`;
                            grid.appendChild(card);
                        }
                    });
                    if (!hasMedia) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px 20px;">У користувача немає візуальних робіт</div>';
                }
            } catch (error) {
                console.error("Помилка:", error);
                if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ff4444; padding: 20px;">Помилка завантаження</div>';
            }
        }

        if (e.target.closest('#close-other-profile-btn')) {
            const modal = document.getElementById('other-user-profile-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none'; 
            }
        }
        
        if (e.target.closest('#follow-user-btn')) window.showCustomModal({ title: "Підписка", message: "Функція підписки буде додана в наступному кроці!" });
        if (e.target.closest('#message-user-btn')) window.showCustomModal({ title: "Повідомлення", message: "Чат з цим користувачем буде доданий в наступному кроці!" });
    });

});