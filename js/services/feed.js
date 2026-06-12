import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, where, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

const userCache = {}; 
window.currentEditPostId = null;
window.currentEditCollabId = null;
let activeCollabDetailsId = null; 

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('post-comments-modal')) {
        const commentsModalHtml = `
            <div id="post-comments-modal" class="app-screen hidden" style="z-index: 5000; position: fixed; top: 0; left: 0; width: 100%; height: 100dvh; background: var(--bg-color); display: flex; flex-direction: column; overflow: hidden; align-items: center; justify-content: flex-start; padding: 0;">
                <div style="width: 100%; max-width: 600px; height: 100%; display: flex; flex-direction: column; background: var(--bg-color); position: relative;">
                    <div style="display: flex; align-items: center; padding: 15px 20px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; gap: 15px;">
                        <button id="close-comments-modal-btn" class="icon-btn" style="color: var(--text-color); margin: 0; padding: 0; font-size: 24px;"><i class="bi bi-arrow-left"></i></button>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--text-color);">Публікація</h3>
                    </div>
                    <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding-bottom: 20px;" class="hide-scroll">
                        <div id="original-post-view" style="padding: 15px 20px 0 20px;"></div>
                        <div style="padding: 12px 20px; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); display: flex; gap: 12px; align-items: center; background: var(--bg-color); margin-bottom: 15px;">
                            <img id="my-reply-avatar" src="${DEFAULT_AVATAR}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                            <input type="text" id="post-comment-input" placeholder="Відповісти..." autocomplete="off" style="flex: 1; background: transparent; border: none; color: var(--text-color); outline: none; font-size: 15px;">
                            <button id="submit-post-comment-btn" style="background: none; color: var(--accent-color); border: none; font-weight: 700; font-size: 14px; cursor: pointer; padding: 0;">Опублікувати</button>
                        </div>
                        <div id="comment-reply-indicator" class="hidden" style="padding: 0 20px 10px 20px; font-size: 13px; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
                            <span>Відповідь користувачу <strong id="reply-target-name"></strong></span>
                            <button id="cancel-comment-reply-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 12px; font-weight: 600;">Скасувати</button>
                        </div>
                        <div id="post-comments-list" style="padding: 0 20px; display: flex; flex-direction: column; gap: 18px;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', commentsModalHtml);
    }

    let myBlockedUsers = [];
    window.currentActiveCommentPostId = null;
    window.currentActiveCommentParentId = null;
    let commentsUnsubscribe = null;
    let notificationsUnsubscribe = null;

    auth.onAuthStateChanged(user => {
        if(user) {
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if(docSnap.exists()) {
                    myBlockedUsers = docSnap.data().blockedUsers || [];
                    renderFeed(); 
                }
            });

            // --- СИСТЕМА СПОВІЩЕНЬ ---
            if (notificationsUnsubscribe) notificationsUnsubscribe();
            notificationsUnsubscribe = onSnapshot(query(collection(db, `users/${user.uid}/notifications`), orderBy("createdAt", "desc"), limit(40)), (snap) => {
                const container = document.getElementById('notifications-list-container');
                const bellBtn = document.getElementById('open-notifications-btn');
                if (!container || !bellBtn) return;

                let unreadCount = 0;
                let playSound = false;
                container.innerHTML = '';

                if (snap.empty) {
                    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Нових сповіщень немає</p>';
                } else {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            const d = change.doc.data();
                            if (!d.read && d.createdAt && (Date.now() - d.createdAt.toMillis() < 5000)) playSound = true;
                        }
                    });

                    snap.forEach(docSnap => {
                        const data = docSnap.data();
                        if (!data.read) unreadCount++;
                        ensureUserListener(data.fromUserId);
                        
                        const fromName = userCache[data.fromUserId]?.name || 'Користувач';
                        const fromAvatar = userCache[data.fromUserId]?.avatar || DEFAULT_AVATAR;
                        
                        let text = ''; let icon = '';
                        if (data.type === 'reaction') { text = `відреагував(ла) ${data.emoji} на вашу публікацію`; icon = '<i class="bi bi-heart-fill" style="color:#ff4444;"></i>'; }
                        if (data.type === 'comment') { text = `залишив(ла) коментар під вашою публікацією`; icon = '<i class="bi bi-chat-fill" style="color:var(--text-color);"></i>'; }
                        if (data.type === 'repost') { text = `зробив(ла) репост вашої публікації`; icon = '<i class="bi bi-arrow-repeat" style="color:var(--accent-color);"></i>'; }
                        if (data.type === 'follow') { text = `почав(ла) читати вас`; icon = '<i class="bi bi-person-plus-fill" style="color:var(--text-color);"></i>'; }

                        const timeString = data.createdAt ? data.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

                        container.innerHTML += `
                            <div class="user-profile-trigger" data-user-id="${data.fromUserId}" style="display:flex; gap:12px; align-items:center; padding: 12px; background: ${data.read ? 'transparent' : 'var(--bg-secondary)'}; border-radius: 16px; cursor:pointer; margin-bottom: 8px;">
                                <div style="position:relative;">
                                    <img src="${fromAvatar}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink:0;">
                                    <div style="position:absolute; bottom:-4px; right:-4px; background:var(--bg-color); border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px;">${icon}</div>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:14px; color:var(--text-color); line-height: 1.4;"><strong>${fromName}</strong> ${text}</div>
                                    <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">${timeString}</div>
                                </div>
                                ${!data.read ? `<div style="width:8px; height:8px; background:var(--accent-color); border-radius:50%;"></div>` : ''}
                            </div>
                        `;
                    });
                }

                if (playSound) notifSound.play().catch(e=>console.log(e));

                let badge = bellBtn.querySelector('.notif-badge');
                if (unreadCount > 0) {
                    if (!badge) {
                        bellBtn.style.position = 'relative';
                        badge = document.createElement('div');
                        badge.className = 'notif-badge';
                        badge.style = 'position:absolute; top:-2px; right:-2px; background:#ff4444; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; border: 2px solid var(--bg-color); pointer-events: none;';
                        bellBtn.appendChild(badge);
                    }
                    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                } else if (badge) badge.remove();
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

    const imageInput = document.getElementById('image-input');
    const videoInput = document.getElementById('video-input');
    const mediaPreviewContainer = document.getElementById('media-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const removeMediaBtn = document.getElementById('remove-media-btn');
    let currentSelectedFile = null; 

    if (document.getElementById('attach-image-btn')) document.getElementById('attach-image-btn').addEventListener('click', () => imageInput.click());
    if (document.getElementById('attach-video-btn')) document.getElementById('attach-video-btn').addEventListener('click', () => videoInput.click());

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
                }

                await addDoc(collection(db, "posts"), {
                    text: text, mediaUrl: mediaUrl, mediaType: mediaType, authorId: user.uid, category: postCategory, 
                    createdAt: serverTimestamp(), reactions: {}, commentsCount: 0, sharesCount: 0, commentedBy: [], sharedBy: [] 
                });

                postTextInput.value = '';
                if (removeMediaBtn) removeMediaBtn.click(); 
                document.getElementById('create-post-modal').classList.add('hidden'); 
            } catch (error) { console.error(error); } 
            finally { submitPostBtn.disabled = false; }
        });
    }

    let currentFeedFilter = 'Всі';
    let cachedPosts = [];
    const feedContainer = document.querySelector('.feed-container');

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

    async function resolveAndRenderRepost(originalPostId, targetContainerId) {
        try {
            const container = document.getElementById(targetContainerId);
            if (!container) return;
            
            let origDoc = cachedPosts.find(p => p.id === originalPostId);
            let postData = origDoc ? origDoc.data() : null;

            if (!postData) {
                const snap = await getDoc(doc(db, "posts", originalPostId));
                if (snap.exists()) postData = snap.data();
            }

            if (!postData) {
                container.innerHTML = `<div style="border: 1px solid var(--border-color); padding: 12px; border-radius: 12px; color: var(--text-secondary); font-size: 14px; margin-top: 6px;">Публікація недоступна</div>`;
                return;
            }

            ensureUserListener(postData.authorId);
            const origName = userCache[postData.authorId]?.name || "...";
            const origAvatar = userCache[postData.authorId]?.avatar || DEFAULT_AVATAR;

            let mediaHTML = '';
            if (postData.mediaUrl) {
                if (postData.mediaType === 'image') mediaHTML = `<img src="${postData.mediaUrl}" class="post-media" style="width:100%; max-height:300px; object-fit:cover; border-radius:8px; margin-top:8px;">`;
                else if (postData.mediaType === 'video') mediaHTML = `<video src="${postData.mediaUrl}" controls style="width:100%; max-height:300px; border-radius:8px; margin-top:8px;"></video>`;
            }

            container.innerHTML = `
                <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: 14px; margin-top: 8px; background: rgba(255,255,255,0.01);">
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                        <img class="sync-avatar user-profile-trigger" data-user-id="${postData.authorId}" data-sync-uid="${postData.authorId}" src="${origAvatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; cursor:pointer;">
                        <span class="sync-name user-profile-trigger" data-user-id="${postData.authorId}" data-sync-uid="${postData.authorId}" style="font-size:13px; font-weight:600; color:var(--text-color); cursor:pointer;">${origName}</span>
                    </div>
                    <p style="margin:0; font-size:14px; color:var(--text-color); line-height:1.4;">${postData.text || ''}</p>
                    ${mediaHTML}
                </div>
            `;
        } catch (e) { console.error(e); }
    }

    function renderFeed() {
        if (!feedContainer) return;
        feedContainer.innerHTML = ''; 
        const user = auth.currentUser; 
        const currentUserUid = user ? user.uid : null;
        let visibleCount = 0;

        cachedPosts.forEach((postDoc) => {
            const post = postDoc.data();
            const postId = postDoc.id; 
            const postCat = post.category || 'Всі';
            
            if (currentFeedFilter !== 'Всі' && postCat !== currentFeedFilter) return;
            if (myBlockedUsers.includes(post.authorId)) return;

            visibleCount++;
            ensureUserListener(post.authorId);

            let timeString = 'Щойно';
            let canEditPost = false;
            if (post.createdAt) {
                const createdTime = post.createdAt.toDate();
                timeString = createdTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                canEditPost = (new Date().getTime() - createdTime.getTime()) < (15 * 60 * 1000); 
            }

            const isAuthor = user && post.authorId === user.uid;
            const currentName = userCache[post.authorId]?.name || "...";
            const currentAvatar = userCache[post.authorId]?.avatar || DEFAULT_AVATAR;

            let badgeHtml = '';
            if (postCat === 'В процесі') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">В процесі 🛠️</span>`;
            else if (postCat === 'Критика') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">Критика 💬</span>`;

            let myReaction = null;
            let anyReaction = null; 
            let totalReactions = 0;
            if (post.reactions) {
                for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                    if (usersArray && usersArray.length > 0) {
                        totalReactions += usersArray.length;
                        anyReaction = emoji; 
                        if (currentUserUid && usersArray.includes(currentUserUid)) myReaction = emoji;
                    }
                }
            }

            let reactionToDisplay = myReaction || anyReaction;
            let reactionIconHtml = '<i class="bi bi-heart" style="font-size: 18px;"></i>';
            let reactionColor = 'var(--text-secondary)';

            if (reactionToDisplay) {
                if (reactionToDisplay === '❤️') {
                    reactionIconHtml = '<i class="bi bi-heart-fill" style="color: #ff4444; font-size: 18px;"></i>';
                    reactionColor = '#ff4444';
                } else {
                    reactionIconHtml = `<span style="font-size: 18px; line-height: 1;">${reactionToDisplay}</span>`;
                    reactionColor = 'var(--text-color)';
                }
            }

            const reactionFontWeight = myReaction ? '800' : '500';
            const reactionTextColor = myReaction ? 'var(--text-color)' : 'var(--text-secondary)';

            const iCommented = currentUserUid && post.commentedBy && post.commentedBy.includes(currentUserUid);
            const commentFontWeight = iCommented ? '800' : '500';
            const commentTextColor = iCommented ? 'var(--text-color)' : 'var(--text-secondary)';
            const commentsCount = post.commentsCount || 0;

            const totalReposts = cachedPosts.filter(p => p.data().originalPostId === postId && p.data().type === "repost").length;
            const iReposted = currentUserUid && cachedPosts.some(p => p.data().originalPostId === postId && p.data().authorId === currentUserUid && p.data().type === "repost");
            const repostFontWeight = iReposted ? '800' : '500';
            const repostTextColor = iReposted ? 'var(--text-color)' : 'var(--text-secondary)';

            const iShared = currentUserUid && post.sharedBy && post.sharedBy.includes(currentUserUid);
            const shareFontWeight = iShared ? '800' : '500';
            const shareTextColor = iShared ? 'var(--text-color)' : 'var(--text-secondary)';
            const sharesCount = post.sharesCount || 0;

            let menuItems = `<button class="save-post-btn" data-post-id="${postId}" style="width:100%; text-align:left; padding:10px; background:none; border:none; color:var(--text-color); font-weight:600; font-size:14px; cursor:pointer; border-radius:8px;"><i class="bi bi-bookmark" style="margin-right:8px;"></i>Зберегти</button>`;
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
            
            const randomTargetId = `repost-target-${postId}-${Math.floor(Math.random() * 100000)}`;

            let bodyHTML = '';
            if (post.type === "repost") {
                bodyHTML = `
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="bi bi-arrow-repeat" style="color:var(--accent-color);"></i> <span>репостнув(ла)</span>
                    </div>
                    <div id="${randomTargetId}">
                        <div style="font-size:13px; color:var(--text-secondary); padding:10px;">Завантаження оригіналу...</div>
                    </div>
                `;
                setTimeout(() => resolveAndRenderRepost(post.originalPostId, randomTargetId), 50);
            } else {
                let mediaHTML = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post" style="width:100%; border-radius:12px; margin-top:8px;">`;
                    else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls style="width:100%; border-radius:12px; margin-top:8px;"></video>`;
                }
                bodyHTML = `${post.text ? `<p class="post-text" style="margin: 0; font-size:15px; line-height:1.4;">${post.text}</p>` : ''}${mediaHTML}`;
            }

            postElement.innerHTML = `
                <div style="display: flex; gap: 12px; align-items: flex-start; width: 100%;">
                    <div class="avatar-wrapper user-profile-trigger" data-user-id="${post.authorId}" style="width: 40px; height: 40px; overflow: hidden; border-radius: 50%; cursor: pointer; flex-shrink: 0;">
                        <img class="sync-avatar" data-sync-uid="${post.authorId}" src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar">
                    </div>
                    <div class="post-body" style="flex: 1; min-width: 0;">
                        <div class="post-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="post-username user-profile-trigger sync-name" data-sync-uid="${post.authorId}" data-user-id="${post.authorId}" style="cursor: pointer; font-size: 15px; font-weight: 600; color: var(--text-color);">${currentName}</span>
                                <span class="post-time" style="font-size: 14px; color: var(--text-secondary);">${timeString}</span>
                                ${badgeHtml}
                            </div>
                            ${menuHtml}
                        </div>
                        <div class="post-content" style="color: var(--text-color); margin-bottom: 12px; word-wrap: break-word;">
                            ${bodyHTML}
                        </div>
                        <div class="post-actions" style="display: flex; gap: 24px; align-items: center; color: var(--text-secondary);">
                            <div class="reaction-picker-container" style="position: relative; display: flex; align-items: center; gap: 6px;">
                                <button class="add-reaction-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; color: ${reactionColor}; padding: 0; display: flex; align-items: center;">
                                    ${reactionIconHtml}
                                </button>
                                ${totalReactions > 0 ? `<span style="font-size: 14px; font-weight: ${reactionFontWeight}; color: ${reactionTextColor};">${totalReactions}</span>` : ''}
                                <div class="post-reaction-picker hidden" style="position: absolute; bottom: 30px; left: -10px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 6px 12px; display: flex; gap: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 100;">
                                    <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">❤️</span>
                                    <span class="emoji-btn" data-emoji="😂" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😂</span>
                                    <span class="emoji-btn" data-emoji="😮" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😮</span>
                                    <span class="emoji-btn" data-emoji="😢" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😢</span>
                                </div>
                            </div>
                            <div class="comment-post-btn" data-post-id="${postId}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: ${commentTextColor};">
                                <i class="bi bi-chat" style="font-size: 17px;"></i>
                                ${commentsCount > 0 ? `<span style="font-size:14px; font-weight: ${commentFontWeight};">${commentsCount}</span>` : ''}
                            </div>
                            <div class="repost-post-btn" data-post-id="${postId}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: ${repostTextColor};">
                                <i class="bi bi-arrow-repeat" style="font-size: 19px;"></i>
                                ${totalReposts > 0 ? `<span style="font-size:14px; font-weight: ${repostFontWeight};">${totalReposts}</span>` : ''}
                            </div>
                            <div class="share-to-chat-btn" data-post-id="${postId}" style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: ${shareTextColor};">
                                <i class="bi bi-send" style="font-size: 17px;"></i>
                                ${sharesCount > 0 ? `<span style="font-size:14px; font-weight: ${shareFontWeight};">${sharesCount}</span>` : ''}
                            </div>
                        </div>
                    </div>
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
    if(collabsSearchInput) collabsSearchInput.addEventListener('input', (e) => renderAllCollabs(e.target.value));

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

    // --- ГОЛОВНИЙ ОБРОБНИК КЛІКІВ ---
    document.addEventListener('click', async (e) => {
        const user = auth.currentUser;

        // ВІДКРИТТЯ СПОВІЩЕНЬ І ПОЗНАЧЕННЯ ПРОЧИТАНИМИ
        if (e.target.closest('#open-notifications-btn')) {
            document.getElementById('notifications-modal').classList.remove('hidden');
            if (user) {
                getDocs(query(collection(db, `users/${user.uid}/notifications`), where("read", "==", false))).then(snap => {
                    snap.forEach(d => updateDoc(doc(db, `users/${user.uid}/notifications`, d.id), { read: true }));
                });
            }
            return;
        }

        if (e.target.closest('.post-menu-trigger-btn')) {
            const dropdown = e.target.closest('.post-menu-trigger-btn').nextElementSibling; 
            document.querySelectorAll('.post-menu-dropdown').forEach(d => { if(d !== dropdown) d.classList.add('hidden'); });
            if(dropdown) dropdown.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.post-menu-trigger-btn')) document.querySelectorAll('.post-menu-dropdown').forEach(d => d.classList.add('hidden'));

        if (e.target.closest('.save-post-btn')) {
            if (!user) return;
            const postId = e.target.closest('.save-post-btn').dataset.postId;
            await updateDoc(doc(db, "users", user.uid), { savedPosts: arrayUnion(postId) });
            document.querySelectorAll('.post-menu-dropdown').forEach(d => d.classList.add('hidden'));
            return;
        }

        // РЕПОСТИ
        if (e.target.closest('.repost-post-btn')) {
            if (!user) return;
            const postId = e.target.closest('.repost-post-btn').dataset.postId;
            const existingRepost = cachedPosts.find(p => p.data().originalPostId === postId && p.data().authorId === user.uid && p.data().type === "repost");
            
            if (existingRepost) {
                await deleteDoc(doc(db, "posts", existingRepost.id));
            } else {
                await addDoc(collection(db, "posts"), { type: "repost", originalPostId: postId, authorId: user.uid, createdAt: serverTimestamp() });
                
                // СПОВІЩЕННЯ ПРО РЕПОСТ
                const origSnap = await getDoc(doc(db, "posts", postId));
                if (origSnap.exists() && origSnap.data().authorId !== user.uid) {
                    await addDoc(collection(db, `users/${origSnap.data().authorId}/notifications`), {
                        type: 'repost', postId: postId, fromUserId: user.uid, createdAt: serverTimestamp(), read: false
                    });
                }
            }
            return;
        }

        if (e.target.closest('.comment-post-btn')) {
            if (!user) return;
            const postId = e.target.closest('.comment-post-btn').dataset.postId;
            window.currentActiveCommentPostId = postId;
            window.currentActiveCommentParentId = null;
            document.getElementById('comment-reply-indicator').classList.add('hidden');
            document.getElementById('post-comments-modal').classList.remove('hidden');
            loadPostComments(postId);
            return;
        }

        if (e.target.closest('#close-comments-modal-btn')) {
            document.getElementById('post-comments-modal').classList.add('hidden');
            if (commentsUnsubscribe) commentsUnsubscribe();
            return;
        }

        if (e.target.closest('.reply-to-comment-uid-btn')) {
            const btn = e.target.closest('.reply-to-comment-uid-btn');
            window.currentActiveCommentParentId = btn.dataset.commentId;
            document.getElementById('reply-target-name').textContent = btn.dataset.username;
            document.getElementById('comment-reply-indicator').classList.remove('hidden');
            document.getElementById('post-comment-input').focus();
            return;
        }

        if (e.target.closest('#cancel-comment-reply-btn')) {
            window.currentActiveCommentParentId = null;
            document.getElementById('comment-reply-indicator').classList.add('hidden');
            return;
        }

        // КОМЕНТАРІ
        if (e.target.closest('#submit-post-comment-btn')) {
            const input = document.getElementById('post-comment-input');
            const text = input.value.trim();
            if (!text || !user || !window.currentActiveCommentPostId) return;

            const targetPostId = window.currentActiveCommentPostId;
            const parentId = window.currentActiveCommentParentId || null;

            await addDoc(collection(db, `posts/${targetPostId}/comments`), {
                text: text, authorId: user.uid, parentId: parentId, createdAt: serverTimestamp(), likes: []
            });

            await updateDoc(doc(db, "posts", targetPostId), { 
                commentsCount: increment(1),
                commentedBy: arrayUnion(user.uid) 
            });

            // СПОВІЩЕННЯ ПРО КОМЕНТАР
            const origSnap = await getDoc(doc(db, "posts", targetPostId));
            if (origSnap.exists() && origSnap.data().authorId !== user.uid) {
                await addDoc(collection(db, `users/${origSnap.data().authorId}/notifications`), {
                    type: 'comment', postId: targetPostId, fromUserId: user.uid, createdAt: serverTimestamp(), read: false
                });
            }

            input.value = '';
            window.currentActiveCommentParentId = null;
            document.getElementById('comment-reply-indicator').classList.add('hidden');
            return;
        }

        if (e.target.closest('.like-comment-btn')) {
            if (!user) return;
            const btn = e.target.closest('.like-comment-btn');
            const commentId = btn.dataset.commentId;
            const commentRef = doc(db, `posts/${window.currentActiveCommentPostId}/comments`, commentId);
            if (btn.classList.contains('liked')) await updateDoc(commentRef, { likes: arrayRemove(user.uid) });
            else await updateDoc(commentRef, { likes: arrayUnion(user.uid) });
            return;
        }

        if (e.target.closest('.share-to-chat-btn')) {
            if (!user) return;
            const postId = e.target.closest('.share-to-chat-btn').dataset.postId;
            const friendsSnap = await getDoc(doc(db, "users", user.uid));
            const following = friendsSnap.data()?.following || [];
            
            if (following.length === 0) return;
            window.currentSharePostId = postId; 
            const shareFriendsContainer = document.getElementById('share-friends-container');
            if (shareFriendsContainer) {
                shareFriendsContainer.innerHTML = '';
                for (const uid of following) {
                    const uDoc = await getDoc(doc(db, "users", uid));
                    if (uDoc.exists()) {
                        const d = uDoc.data();
                        const name = d.nickname || d.username || 'Користувач';
                        const avatar = d.avatarUrl || DEFAULT_AVATAR;
                        shareFriendsContainer.innerHTML += `
                            <div class="share-user-item-trigger" data-uid="${uid}" style="display:flex; align-items:center; justify-content:between; padding:10px 0; border-bottom:1px solid var(--border-color); cursor:pointer;">
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <img src="${avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                                    <span style="font-weight:600; font-size:14px; color:var(--text-color);">${name}</span>
                                </div>
                                <button style="background:var(--text-color); color:var(--bg-color); border:none; padding:5px 12px; border-radius:12px; font-weight:700; font-size:12px; cursor:pointer;">Надіслати</button>
                            </div>
                        `;
                    }
                }
                document.getElementById('share-post-modal').classList.remove('hidden');
            }
            return;
        }

        if (e.target.closest('.share-user-item-trigger')) {
            const targetUid = e.target.closest('.share-user-item-trigger').dataset.uid;
            const pId = window.currentSharePostId;
            if (!user || !targetUid || !pId) return;

            const roomId = user.uid < targetUid ? `${user.uid}_${targetUid}` : `${targetUid}_${user.uid}`;
            
            await addDoc(collection(db, "chats", roomId, "messages"), {
                text: `Стрічка контенту: Посилання на пост ID #${pId}`, senderId: user.uid, timestamp: serverTimestamp()
            });
            await setDoc(doc(db, "chats", roomId), {
                participants: [user.uid, targetUid], 
                lastMessage: "🔗 Поділився(лась) публікацією", 
                lastMessageSenderId: user.uid,
                [`readStatus.${targetUid}`]: false,
                [`readStatus.${user.uid}`]: true,
                timestamp: serverTimestamp()
            }, { merge: true });

            await updateDoc(doc(db, "posts", pId), { sharesCount: increment(1), sharedBy: arrayUnion(user.uid) });
            document.getElementById('share-post-modal').classList.add('hidden');
        }

        if (e.target.closest('.add-reaction-btn')) {
            const picker = e.target.closest('.reaction-picker-container').querySelector('.post-reaction-picker');
            document.querySelectorAll('.post-reaction-picker').forEach(p => { if (p !== picker) p.classList.add('hidden'); });
            if(picker) picker.classList.toggle('hidden');
            return;
        }
        if (!e.target.closest('.reaction-picker-container')) document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));

        // РЕАКЦІЇ
        if (e.target.classList.contains('emoji-btn')) {
            if (!user) return;
            const emoji = e.target.dataset.emoji;
            const postId = e.target.dataset.postId;
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists()) return;
            
            const reactions = postSnap.data().reactions || {};
            let updates = {};
            for (const [exEmoji, usersArray] of Object.entries(reactions)) {
                if (usersArray.includes(user.uid)) updates[`reactions.${exEmoji}`] = arrayRemove(user.uid);
            }
            const currentReactionUsers = reactions[emoji] || [];
            if (!currentReactionUsers.includes(user.uid)) {
                updates[`reactions.${emoji}`] = arrayUnion(user.uid);
                
                // СПОВІЩЕННЯ ПРО РЕАКЦІЮ
                if (postSnap.data().authorId !== user.uid) {
                    await addDoc(collection(db, `users/${postSnap.data().authorId}/notifications`), {
                        type: 'reaction', emoji: emoji, postId: postId, fromUserId: user.uid, createdAt: serverTimestamp(), read: false
                    });
                }
            }
            if (Object.keys(updates).length > 0) await updateDoc(postRef, updates);
        }

        // ІНШІ ВІКНА ТА КНОПКИ
        if (e.target.closest('#close-notifications-btn')) document.getElementById('notifications-modal').classList.add('hidden');
        if (e.target.closest('#open-discoveries-btn')) document.getElementById('discoveries-modal').classList.remove('hidden');
        if (e.target.closest('#close-discoveries-btn')) document.getElementById('discoveries-modal').classList.add('hidden');
        if (e.target.closest('#open-all-collabs-btn')) { renderAllCollabs(''); document.getElementById('all-collabs-modal').classList.remove('hidden'); }
        if (e.target.closest('#close-all-collabs-btn')) document.getElementById('all-collabs-modal').classList.add('hidden');
        if (e.target.closest('#add-collab-btn')) { if (!auth.currentUser) return; document.getElementById('create-collab-modal').classList.remove('hidden'); }
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

    function loadPostComments(postId) {
        const listContainer = document.getElementById('post-comments-list');
        listContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:14px;">Завантаження...</p>';
        document.getElementById('original-post-view').innerHTML = ''; 

        getDoc(doc(db, "posts", postId)).then(postSnap => {
            if (postSnap.exists()) {
                const post = postSnap.data();
                const currentUserUid = auth.currentUser ? auth.currentUser.uid : null;
                
                let totalReactions = 0;
                let myReaction = null, anyReaction = null;
                if (post.reactions) {
                    for (const [emoji, users] of Object.entries(post.reactions)) {
                        if (users && users.length > 0) {
                            totalReactions += users.length;
                            anyReaction = emoji;
                            if (currentUserUid && users.includes(currentUserUid)) myReaction = emoji;
                        }
                    }
                }
                let reactionIconHtml = '<i class="bi bi-heart" style="font-size: 18px;"></i>';
                let reactionColor = 'var(--text-secondary)';
                if (myReaction || anyReaction) {
                    const r = myReaction || anyReaction;
                    if (r === '❤️') { reactionIconHtml = '<i class="bi bi-heart-fill" style="color: #ff4444; font-size: 18px;"></i>'; reactionColor = '#ff4444'; }
                    else { reactionIconHtml = `<span style="font-size: 18px; line-height: 1;">${r}</span>`; reactionColor = 'var(--text-color)'; }
                }
                
                const commentsCount = post.commentsCount || 0;
                ensureUserListener(post.authorId);
                
                setTimeout(() => {
                    const currentName = userCache[post.authorId]?.name || "...";
                    const currentAvatar = userCache[post.authorId]?.avatar || DEFAULT_AVATAR;
                    
                    const inputEl = document.getElementById('post-comment-input');
                    if (inputEl) inputEl.placeholder = `Відповісти користувачу ${currentName}...`;
                    
                    if (currentUserUid && userCache[currentUserUid]) {
                        document.getElementById('my-reply-avatar').src = userCache[currentUserUid].avatar;
                    }

                    const randomTargetId = `modal-repost-target-${postId}-${Math.floor(Math.random() * 100000)}`;
                    let bodyHTML = '';
                    
                    if (post.type === "repost") {
                        bodyHTML = `
                            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                                <i class="bi bi-arrow-repeat" style="color:var(--accent-color);"></i> <span>репостнув(ла)</span>
                            </div>
                            <div id="${randomTargetId}">
                                <div style="font-size:13px; color:var(--text-secondary); padding:10px;">Завантаження оригіналу...</div>
                            </div>
                        `;
                        setTimeout(() => resolveAndRenderRepost(post.originalPostId, randomTargetId), 50);
                    } else {
                        let mediaHTML = '';
                        if (post.mediaUrl) {
                            if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" style="width:100%; border-radius:12px; margin-top:8px;">`;
                            else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" controls style="width:100%; border-radius:12px; margin-top:8px;"></video>`;
                        }
                        bodyHTML = `${post.text ? `<p style="margin: 0; line-height: 1.4;">${post.text}</p>` : ''}${mediaHTML}`;
                    }

                    document.getElementById('original-post-view').innerHTML = `
                        <div style="display: flex; gap: 12px; align-items: flex-start; width: 100%; margin-bottom: 15px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0;">
                                <img src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                    <span style="font-size: 15px; font-weight: 600; color: var(--text-color);">${currentName}</span>
                                </div>
                                <div style="color: var(--text-color); margin-bottom: 12px; word-wrap: break-word; font-size: 15px;">
                                    ${bodyHTML}
                                </div>
                                
                                <div class="post-actions" style="display: flex; gap: 24px; align-items: center; color: var(--text-secondary);">
                                    <div class="reaction-picker-container" style="position: relative; display: flex; align-items: center; gap: 6px;">
                                        <button class="add-reaction-btn" data-post-id="${postId}" style="background: none; border: none; cursor: pointer; color: ${reactionColor}; padding: 0; display: flex; align-items: center;">
                                            ${reactionIconHtml}
                                        </button>
                                        ${totalReactions > 0 ? `<span style="font-size: 14px; font-weight: ${myReaction?'800':'500'}; color: ${myReaction?'var(--text-color)':'var(--text-secondary)'};">${totalReactions}</span>` : ''}
                                        <div class="post-reaction-picker hidden" style="position: absolute; top: -45px; left: -10px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 20px; padding: 6px 12px; display: flex; gap: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 100;">
                                            <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">❤️</span>
                                            <span class="emoji-btn" data-emoji="😂" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😂</span>
                                            <span class="emoji-btn" data-emoji="😮" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😮</span>
                                            <span class="emoji-btn" data-emoji="😢" data-post-id="${postId}" style="cursor:pointer; font-size: 22px;">😢</span>
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-color);">
                                        <i class="bi bi-chat" style="font-size: 17px;"></i>
                                        ${commentsCount > 0 ? `<span style="font-size:14px; font-weight: 800;">${commentsCount}</span>` : ''}
                                    </div>
                                    <div class="repost-post-btn" data-post-id="${postId}" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <i class="bi bi-arrow-repeat" style="font-size: 19px;"></i>
                                    </div>
                                    <div class="share-to-chat-btn" data-post-id="${postId}" style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <i class="bi bi-send" style="font-size: 17px;"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }, 100);
            }
        });

        if (commentsUnsubscribe) commentsUnsubscribe();
        commentsUnsubscribe = onSnapshot(query(collection(db, `posts/${postId}/comments`), orderBy("createdAt", "asc")), (snapshot) => {
            listContainer.innerHTML = '';
            if (snapshot.empty) {
                listContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:14px; margin-top:20px;">Немає відповідей. Будьте першим!</p>';
                return;
            }

            const allComments = [];
            snapshot.forEach(d => allComments.push({ id: d.id, ...d.data() }));
            const rootComments = allComments.filter(c => !c.parentId);
            
            rootComments.forEach(comment => {
                ensureUserListener(comment.authorId);
                const name = userCache[comment.authorId]?.name || "...";
                const avatar = userCache[comment.authorId]?.avatar || DEFAULT_AVATAR;
                const likesCount = (comment.likes || []).length;
                const iLiked = auth.currentUser && (comment.likes || []).includes(auth.currentUser.uid);

                const commentEl = document.createElement('div');
                commentEl.style.display = 'flex'; commentEl.style.flexDirection = 'column'; commentEl.style.gap = '8px';

                commentEl.innerHTML = `
                    <div style="display:flex; gap:12px; align-items:flex-start;">
                        <img class="sync-avatar" data-sync-uid="${comment.authorId}" src="${avatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; justify-content:between; align-items:center;">
                                <strong class="sync-name" data-sync-uid="${comment.authorId}" style="font-size:14px; color:var(--text-color);">${name}</strong>
                            </div>
                            <p style="margin:4px 0 6px 0; font-size:14px; color:var(--text-color); line-height:1.4;">${comment.text}</p>
                            <div style="display:flex; gap:16px; font-size:12px; color:var(--text-secondary); align-items:center;">
                                <span class="reply-to-comment-uid-btn" data-comment-id="${comment.id}" data-username="${name}" style="cursor:pointer; font-weight:600;"><i class="bi bi-reply"></i> Відповісти</span>
                                <span class="like-comment-btn ${iLiked ? 'liked' : ''}" data-comment-id="${comment.id}" style="cursor:pointer; font-weight:600; color:${iLiked ? '#ff4444' : 'inherit'}">
                                    <i class="bi ${iLiked ? 'bi-heart-fill' : 'bi-heart'}"></i> ${likesCount > 0 ? likesCount : ''}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="comment-replies-branch" data-root-id="${comment.id}" style="margin-left: 48px; border-left: 2px solid var(--border-color); padding-left: 12px; display:flex; flex-direction:column; gap:12px; margin-top:4px;"></div>
                `;

                listContainer.appendChild(commentEl);
                const branchContainer = commentEl.querySelector('.comment-replies-branch');
                const replies = allComments.filter(c => c.parentId === comment.id);
                
                if (replies.length === 0) branchContainer.style.borderLeft = 'none';

                replies.forEach(reply => {
                    ensureUserListener(reply.authorId);
                    const repName = userCache[reply.authorId]?.name || "...";
                    const repAvatar = userCache[reply.authorId]?.avatar || DEFAULT_AVATAR;
                    const repLikesCount = (reply.likes || []).length;
                    const iLikedRep = auth.currentUser && (reply.likes || []).includes(auth.currentUser.uid);

                    branchContainer.innerHTML += `
                        <div style="display:flex; gap:10px; align-items:flex-start;">
                            <img class="sync-avatar" data-sync-uid="${reply.authorId}" src="${repAvatar}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
                            <div style="flex:1; min-width:0;">
                                <strong class="sync-name" data-sync-uid="${reply.authorId}" style="font-size:13px; color:var(--text-color);">${repName}</strong>
                                <p style="margin:2px 0 4px 0; font-size:13px; color:var(--text-color); line-height:1.4;">${reply.text}</p>
                                <div style="display:flex; gap:16px; font-size:11px; color:var(--text-secondary); align-items:center;">
                                    <span class="like-comment-btn ${iLikedRep ? 'liked' : ''}" data-comment-id="${reply.id}" style="cursor:pointer; font-weight:600; color:${iLikedRep ? '#ff4444' : 'inherit'}">
                                        <i class="bi ${iLikedRep ? 'bi-heart-fill' : 'bi-heart'}"></i> ${repLikesCount > 0 ? repLikesCount : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `;
                });
            });
        });
    }
});