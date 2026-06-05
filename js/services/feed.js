import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

const userCache = {}; 

document.addEventListener('DOMContentLoaded', () => {

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

    if (submitPostBtn) {
        submitPostBtn.addEventListener('click', async () => {
            const text = postTextInput.value.trim();
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
                    else throw new Error('Хмара');
                }

                await addDoc(collection(db, "posts"), {
                    text: text, 
                    mediaUrl: mediaUrl, 
                    mediaType: mediaType,
                    authorId: user.uid,
                    createdAt: serverTimestamp(), 
                    reactions: {},
                    sharesCount: 0 
                });

                postTextInput.value = '';
                if (removeMediaBtn) removeMediaBtn.click(); 
                document.getElementById('create-post-modal').classList.add('hidden'); 
            } catch (error) {
                console.error(error); await window.showCustomModal({ title: "Помилка", message: "Сталася помилка." });
            } finally {
                submitPostBtn.textContent = originalBtnText; submitPostBtn.disabled = false;
            }
        });
    }

    const feedContainer = document.querySelector('.feed-container');

    if (feedContainer) {
        onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
            feedContainer.innerHTML = ''; 
            const user = auth.currentUser; 

            snapshot.forEach((postDoc) => {
                const post = postDoc.data();
                const postId = postDoc.id; 
                
                let timeString = 'Щойно';
                if (post.createdAt) timeString = post.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                let mediaHTML = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post">`;
                    else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
                }

                const isAuthor = user && post.authorId === user.uid;
                const currentName = userCache[post.authorId]?.name || "...";
                const currentAvatar = userCache[post.authorId]?.avatar || DEFAULT_AVATAR;

                // 1. Формуємо бульбашки реакцій
                let reactionsPillsHtml = '';
                if (post.reactions) {
                    const currentUserUid = user ? user.uid : null;
                    
                    for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                        if (usersArray && usersArray.length > 0) {
                            const isMe = currentUserUid && usersArray.includes(currentUserUid);
                            const activeClass = isMe ? 'reacted-by-me' : '';
                            
                            reactionsPillsHtml += `
                                <span class="reaction-pill ${activeClass}" data-emoji="${emoji}" data-post-id="${postId}">
                                    ${emoji} ${usersArray.length}
                                </span>
                            `;
                        }
                    }
                }

                // 2. Створюємо картку посту
                const postElement = document.createElement('div');
                postElement.classList.add('post-card');
                
                postElement.innerHTML = `
                    <div class="post-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                        
                        <!-- Аватарка з відступом справа (margin-right: 14px) -->
                        <div class="avatar-wrapper user-profile-trigger" data-user-id="${post.authorId}" data-user-name="${currentName}" data-user-avatar="${currentAvatar}" style="width: 42px; height: 42px; overflow: hidden; border-radius: 50%; cursor: pointer; flex-shrink: 0; margin-right: 14px;">
                            <img id="feed-avatar-${postId}" src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar">
                        </div>
                        
                        <!-- Блок з іменем та часом (flex: 1 відштовхує кнопку меню вправо) -->
                        <div class="post-user-info" style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                            <span id="feed-name-${postId}" class="post-username user-profile-trigger" data-user-id="${post.authorId}" data-user-name="${currentName}" data-user-avatar="${currentAvatar}" style="cursor: pointer; font-size: 15px; font-weight: 600; color: var(--text-color); line-height: 1.2;">${currentName}</span>
                            <span class="post-time" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${timeString}</span>
                        </div>
                        
                        <!-- Кнопка меню / видалення -->
                        ${isAuthor ? `<button class="post-menu-btn delete-post-btn" style="background: none; border: none; cursor: pointer; padding: 4px;"><i class="bi bi-trash" style="color: #ff4444; font-size: 18px;"></i></button>` : `<button class="post-menu-btn" style="background: none; border: none; cursor: pointer; padding: 4px; color: var(--text-secondary);"><i class="bi bi-three-dots" style="font-size: 18px;"></i></button>`}
                        
                    </div>
                    
                    <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                    
                    <div class="post-bottom-actions">
                        <div class="reaction-picker-container">
                            <button class="add-reaction-btn" data-post-id="${postId}"><i class="bi bi-emoji-smile"></i></button>
                            
                            <div class="post-reaction-picker hidden" id="picker-${postId}">
                                <span class="emoji-btn" data-emoji="❤️" data-post-id="${postId}">❤️</span>
                                <span class="emoji-btn" data-emoji="🔥" data-post-id="${postId}">🔥</span>
                                <span class="emoji-btn" data-emoji="👏" data-post-id="${postId}">👏</span>
                                <span class="emoji-btn" data-emoji="💡" data-post-id="${postId}">💡</span>
                                <span class="emoji-btn" data-emoji="😂" data-post-id="${postId}">😂</span>
                            </div>
                        </div>

                        <div class="post-reactions-list" id="reactions-list-${postId}">
                            ${reactionsPillsHtml}
                        </div>

                        <button class="action-btn dm-btn" data-post-id="${postId}" data-author-name="${currentName}" data-post-text="${post.text ? post.text.replace(/"/g, '&quot;') : ''}" data-post-media="${post.mediaUrl || ''}" data-post-mediatype="${post.mediaType || ''}" style="margin-left: auto; border: none; background: transparent; color: var(--text-color); cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="bi bi-send" style="font-size: 18px;"></i>
                            <span style="font-size: 14px; font-weight: 600;">${post.sharesCount || 0}</span>
                        </button>
                    </div>
                `;

                if (isAuthor) {
                    postElement.querySelector('.delete-post-btn').addEventListener('click', async () => {
                        const confirmed = await window.showCustomModal({ title: "Видалення", message: "Ви впевнені?", type: "confirm" });
                        if (confirmed) await deleteDoc(doc(db, "posts", postId));
                    });
                }
                
                feedContainer.appendChild(postElement);

                if (!userCache[post.authorId]) {
                    userCache[post.authorId] = { name: "...", avatar: DEFAULT_AVATAR, isListening: true };
                    
                    onSnapshot(doc(db, "users", post.authorId), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            const displayName = data.nickname || data.username || data.login || (data.email ? data.email.split('@')[0] : "Користувач");
                            const avatar = data.avatarUrl || DEFAULT_AVATAR;
                            
                            userCache[post.authorId] = { name: displayName, avatar: avatar, isListening: true };
                            
                            document.querySelectorAll(`.user-profile-trigger[data-user-id="${post.authorId}"] img`).forEach(img => {
                                if (img.id && img.id.startsWith('feed-avatar-')) {
                                    img.src = avatar;
                                    img.parentElement.dataset.userAvatar = avatar;
                                    img.parentElement.dataset.userName = displayName;
                                }
                            });
                            
                            document.querySelectorAll(`.post-username[data-user-id="${post.authorId}"]`).forEach(span => {
                                span.textContent = displayName;
                                span.dataset.userName = displayName;
                                span.dataset.userAvatar = avatar;
                            });
                        }
                    });
                }
            });
        });
    }

    // =================================================================
    // ГЛОБАЛЬНИЙ ОБРОБНИК КЛІКІВ (РЕАКЦІЇ + ПОШИРЕННЯ)
    // =================================================================
    document.addEventListener('click', async (e) => {
        
        // 1. Відкриття/закриття меню смайликів
        if (e.target.closest('.add-reaction-btn')) {
            const btn = e.target.closest('.add-reaction-btn');
            const postId = btn.dataset.postId;
            const picker = document.getElementById(`picker-${postId}`);
            
            document.querySelectorAll('.post-reaction-picker').forEach(p => {
                if (p !== picker) p.classList.add('hidden');
            });
            
            picker.classList.toggle('hidden');
            return;
        }

        // 2. Сховати меню реакцій
        if (!e.target.closest('.reaction-picker-container')) {
            document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));
        }

        // 3. Клік по самому емодзі
        if (e.target.classList.contains('emoji-btn') || e.target.closest('.reaction-pill')) {
            const currentUser = auth.currentUser;
            if (!currentUser) return alert("Потрібно увійти, щоб залишати реакції!");

            let target = e.target.classList.contains('emoji-btn') ? e.target : e.target.closest('.reaction-pill');
            const emoji = target.dataset.emoji;
            const postId = target.dataset.postId;

            document.querySelectorAll('.post-reaction-picker').forEach(p => p.classList.add('hidden'));

            try {
                const postRef = doc(db, "posts", postId);
                const postSnap = await getDoc(postRef);
                if (!postSnap.exists()) return;

                const postData = postSnap.data();
                const reactions = postData.reactions || {};
                const usersWhoReactedWithThisEmoji = reactions[emoji] || [];
                const hasReacted = usersWhoReactedWithThisEmoji.includes(currentUser.uid);
                
                await updateDoc(postRef, {
                    [`reactions.${emoji}`]: hasReacted ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
                });
            } catch (error) { console.error("Помилка реакції:", error); }
        }

        // 4. КЛІК ПО КНОПЦІ "ПОДІЛИТИСЯ" (Відкриває модальне вікно)
        if (e.target.closest('.dm-btn')) {
            const btn = e.target.closest('.dm-btn');
            const currentUser = auth.currentUser;
            if (!currentUser) { alert("Увійдіть, щоб ділитися публікаціями."); return; }

            // Зберігаємо дані поста глобально для вікна поширення
            window.currentSharePostData = {
                id: btn.dataset.postId,
                authorName: btn.dataset.authorName,
                text: btn.dataset.postText,
                mediaUrl: btn.dataset.postMedia,
                mediaType: btn.dataset.postMediatype
            };

            const shareModal = document.getElementById('share-post-modal');
            const friendsContainer = document.getElementById('share-friends-container');
            friendsContainer.innerHTML = '<p style="text-align:center; font-size: 13px; color: #888;">Завантаження...</p>';
            shareModal.classList.remove('hidden');

            try {
                const myDoc = await getDoc(doc(db, "users", currentUser.uid));
                const following = myDoc.data()?.following || [];
                
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
                            friendCard.style.display = 'flex';
                            friendCard.style.alignItems = 'center';
                            friendCard.style.padding = '12px 0';
                            friendCard.style.borderBottom = '1px solid var(--border-color)';
                            
                            friendCard.innerHTML = `
                                <img src="${avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color);">
                                <div style="flex: 1; margin-left: 14px;">
                                    <h4 style="font-size: 16px; font-weight: 600; color: var(--text-color); margin: 0;">${name}</h4>
                                </div>
                                <button class="send-share-btn" data-target-uid="${uSnap.id}" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: var(--text-color); cursor: pointer; transition: 0.2s;">Надіслати</button>
                            `;
                            friendsContainer.appendChild(friendCard);
                        }
                    });
                }
            } catch (err) { console.error(err); }
            return;
        }

        // 5. КЛІК ПО "НАДІСЛАТИ" у вікні (Тільки друзям)
        if (e.target.closest('.send-share-btn')) {
            const currentUser = auth.currentUser;
            if (!currentUser || !window.currentSharePostData) return;

            const btn = e.target.closest('button');
            const targetUid = btn.dataset.targetUid;
            
            const roomId = currentUser.uid < targetUid ? `${currentUser.uid}_${targetUid}` : `${targetUid}_${currentUser.uid}`;
            const postData = window.currentSharePostData;

            // Змінюємо вигляд кнопки для ефекту "успіху"
            btn.textContent = "Надіслано!";
            btn.style.background = "var(--text-color)";
            btn.style.color = "var(--bg-color)";
            btn.disabled = true;

            try {
                let msgText = `📌 Публікація від ${postData.authorName}`;
                if (postData.text) {
                    const snippet = postData.text.length > 80 ? postData.text.substring(0, 80) + '...' : postData.text;
                    msgText += `:\n"${snippet}"`;
                }

                // 1. Надсилаємо як повідомлення у відповідний чат
                await addDoc(collection(db, "chats", roomId, "messages"), {
                    senderId: currentUser.uid,
                    text: msgText,
                    mediaUrl: postData.mediaUrl || null,
                    mediaType: postData.mediaType || null,
                    timestamp: serverTimestamp()
                });

                // 2. Оновлюємо статус самого чату в списку чатів
                await setDoc(doc(db, "chats", roomId), {
                    participants: [currentUser.uid, targetUid],
                    lastMessage: "📌 Поширена публікація",
                    timestamp: serverTimestamp()
                }, { merge: true });

                // 3. ЗБІЛЬШУЄМО ЛІЧИЛЬНИК ПОШИРЕНЬ У ПОСТІ НА +1
                await updateDoc(doc(db, "posts", postData.id), {
                    sharesCount: increment(1)
                });

                setTimeout(() => {
                    document.getElementById('share-post-modal').classList.add('hidden');
                    btn.textContent = "Надіслати";
                    btn.style.background = "";
                    btn.style.color = "";
                    btn.disabled = false;
                }, 800);

            } catch (err) {
                console.error(err);
                btn.textContent = "Помилка";
            }
        }

        // 6. Закриття вікна поширення
        if (e.target.closest('#close-share-modal-btn') || e.target.id === 'share-post-modal') {
            document.getElementById('share-post-modal').classList.add('hidden');
        }
    });
});