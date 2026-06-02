import './auth.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, serverTimestamp, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {

    // БРОНЕБІЙНЕ ОЧИЩЕННЯ НА СТАРТІ
    document.querySelectorAll('.app-screen').forEach(s => {
        if (!s.classList.contains('active')) {
            s.classList.add('hidden');
        }
    });
    
    // ==========================================
    // УНІВЕРСАЛЬНЕ КАСТОМНЕ ВІКНО
    // ==========================================
    function showCustomModal({ title, message, type = 'alert' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-modal');
            const titleEl = document.getElementById('custom-modal-title');
            const messageEl = document.getElementById('custom-modal-message');
            const inputEl = document.getElementById('custom-modal-input');
            const confirmBtn = document.getElementById('custom-modal-confirm');
            const cancelBtn = document.getElementById('custom-modal-cancel');

            titleEl.textContent = title;
            messageEl.textContent = message;
            inputEl.value = '';
            inputEl.classList.add('hidden');
            cancelBtn.classList.add('hidden');

            if (type === 'confirm' || type === 'prompt') cancelBtn.classList.remove('hidden');
            if (type === 'prompt') inputEl.classList.remove('hidden');

            modal.classList.remove('hidden');
            if (type === 'prompt') inputEl.focus();

            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
            };

            confirmBtn.onclick = () => {
                cleanup();
                if (type === 'prompt') resolve(inputEl.value);
                else resolve(true);
            };

            cancelBtn.onclick = () => {
                cleanup();
                if (type === 'prompt') resolve(null);
                else resolve(false);
            };
        });
    }

    // ==========================================
    // 1. НАВІГАЦІЯ 
    // ==========================================
    const navButtons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.app-screen');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetScreen = document.getElementById(btn.dataset.screen);
            if (targetScreen) {
                navButtons.forEach(b => b.classList.remove('active'));
                
                screens.forEach(s => {
                    s.classList.remove('active');
                    s.classList.add('hidden'); 
                });
                
                btn.classList.add('active');
                targetScreen.classList.add('active');
                targetScreen.classList.remove('hidden');
            }
        });
    });

    const settingsModal = document.getElementById('settings-modal');
    const createPostModal = document.getElementById('create-post-modal');
    
    if (document.getElementById('open-settings-btn')) document.getElementById('open-settings-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
    
    document.querySelectorAll('.create-post-trigger').forEach(btn => {
        btn.addEventListener('click', () => createPostModal.classList.remove('hidden'));
    });

    if (document.getElementById('close-create-post-btn')) document.getElementById('close-create-post-btn').addEventListener('click', () => createPostModal.classList.add('hidden'));

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
        if (e.target === createPostModal) createPostModal.classList.add('hidden');
    });

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeSwitch = document.getElementById('theme-switch');
    const savedTheme = localStorage.getItem('sensu-theme') || 'dark';
    
    document.body.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'light' && themeSwitch) themeSwitch.classList.remove('active');

    if (themeToggleBtn && themeSwitch) {
        themeToggleBtn.addEventListener('click', () => {
            themeSwitch.classList.toggle('active');
            const newTheme = themeSwitch.classList.contains('active') ? 'dark' : 'light';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('sensu-theme', newTheme);
        });
    }

    // ==========================================
    // 5. ЛОГІКА ПРИКРІПЛЕННЯ МЕДІА
    // ==========================================
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
            imagePreview.src = fileURL;
            imagePreview.classList.remove('hidden');
            videoPreview.classList.add('hidden');
            videoPreview.src = ""; 
        } else {
            videoPreview.src = fileURL;
            videoPreview.classList.remove('hidden');
            imagePreview.classList.add('hidden');
            imagePreview.src = ""; 
        }
    }

    if (imageInput) imageInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'image'));
    if (videoInput) videoInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0], 'video'));

    if (removeMediaBtn) {
        removeMediaBtn.addEventListener('click', () => {
            currentSelectedFile = null;
            mediaPreviewContainer.classList.add('hidden');
            imagePreview.classList.add('hidden');
            videoPreview.classList.add('hidden');
            imageInput.value = "";
            videoInput.value = "";
        });
    }

    // ==========================================
    // 6. ПУБЛІКАЦІЯ ПОСТА
    // ==========================================
    const submitPostBtn = document.getElementById('submit-post-btn');
    const postTextInput = document.getElementById('post-text-input');

    if (submitPostBtn) {
        submitPostBtn.addEventListener('click', async () => {
            const text = postTextInput.value.trim();
            const user = auth.currentUser; 

            if (!user) {
                await showCustomModal({ title: "Увага", message: "Будь ласка, увійдіть, щоб створити публікацію." });
                return;
            }

            if (!text && !currentSelectedFile) {
                await showCustomModal({ title: "Порожньо", message: "Додайте текст або виберіть медіафайл!" });
                return;
            }

            const originalBtnText = submitPostBtn.textContent;
            submitPostBtn.textContent = 'Публікуємо...';
            submitPostBtn.disabled = true; 

            try {
                let mediaUrl = null;
                let mediaType = null;

                if (currentSelectedFile) {
                    const formData = new FormData();
                    formData.append('file', currentSelectedFile);
                    formData.append('upload_preset', 'sensuspace'); 

                    const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    
                    if (data.secure_url) {
                        mediaUrl = data.secure_url; 
                        mediaType = data.resource_type; 
                    } else throw new Error('Хмара');
                }

                await addDoc(collection(db, "posts"), {
                    text: text,
                    mediaUrl: mediaUrl,
                    mediaType: mediaType,
                    authorId: user.uid,
                    authorName: user.email.split('@')[0], 
                    createdAt: serverTimestamp(),
                    likedBy: [] 
                });

                postTextInput.value = '';
                if (removeMediaBtn) removeMediaBtn.click(); 
                createPostModal.classList.add('hidden'); 
                await showCustomModal({ title: "Успіх", message: "Публікацію успішно створено!" });

            } catch (error) {
                console.error("Помилка публікації:", error);
                await showCustomModal({ title: "Помилка", message: "Сталася помилка." });
            } finally {
                submitPostBtn.textContent = originalBtnText;
                submitPostBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 7. СТРІЧКА
    // ==========================================
    const feedContainer = document.querySelector('.feed-container');

    if (feedContainer) {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
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
                const likedBy = post.likedBy || []; 
                const likesCount = likedBy.length;
                const isLikedByMe = user ? likedBy.includes(user.uid) : false;

                const postElement = document.createElement('div');
                postElement.classList.add('post-card');
                
                // ТУТ МАГІЯ: Додано класи user-profile-trigger для аватарки та імені
                postElement.innerHTML = `
                    <div class="post-header">
                        <div class="avatar-wrapper user-profile-trigger" data-user-id="${post.authorId}" data-user-name="${post.authorName}" style="width: 40px; height: 40px; overflow: hidden; border-radius: 50%; cursor: pointer;">
                            <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar">
                        </div>
                        <div class="post-user-info">
                            <span class="post-username user-profile-trigger" data-user-id="${post.authorId}" data-user-name="${post.authorName}" style="cursor: pointer;">${post.authorName}</span>
                            <span class="post-time">${timeString}</span>
                        </div>
                        ${isAuthor ? `<button class="post-menu-btn delete-post-btn"><i class="bi bi-trash" style="color: #ff4444;"></i></button>` : `<button class="post-menu-btn"><i class="bi bi-three-dots"></i></button>`}
                    </div>
                    <div class="post-content">
                        ${post.text ? `<p class="post-text">${post.text}</p>` : ''}
                        ${mediaHTML}
                    </div>
                    <div class="post-actions">
                        <button class="action-btn like-btn" data-id="${postId}">
                            <i class="bi ${isLikedByMe ? 'bi-heart-fill' : 'bi-heart'}" style="${isLikedByMe ? 'color: #ff4444;' : ''}"></i> 
                            <span class="likes-count">${likesCount}</span>
                        </button>
                        <button class="action-btn"><i class="bi bi-chat"></i> <span>0</span></button>
                        <button class="action-btn dm-btn" data-author-id="${post.authorId}" data-author-name="${post.authorName}"><i class="bi bi-send"></i></button>
                    </div>
                `;
                
                if (isAuthor) {
                    postElement.querySelector('.delete-post-btn').addEventListener('click', async () => {
                        const confirmed = await showCustomModal({ title: "Видалення", message: "Ви впевнені?", type: "confirm" });
                        if (confirmed) await deleteDoc(doc(db, "posts", postId));
                    });
                }
                feedContainer.appendChild(postElement);
            });
        });
    }

    // ==========================================
    // 8. ГЛОБАЛЬНІ КЛІКИ (Профілі, Лайки, Чати)
    // ==========================================
    document.addEventListener('click', async (e) => {
        
        // --- МАГІЯ ВІДКРИТТЯ ПРОФІЛЮ ---
        const profileTrigger = e.target.closest('.user-profile-trigger');
        if (profileTrigger) {
            e.stopPropagation(); // Зупиняємо інші кліки
            const userId = profileTrigger.dataset.userId;
            if (!userId) return;

            const currentUser = auth.currentUser;
            if (currentUser && userId === currentUser.uid) {
                // Якщо клікнули на себе - йдемо в свій профіль!
                document.querySelector('.nav-btn[data-screen="screen-profile"]')?.click();
            } else {
                // Відкриваємо чужий профіль з попереднім завантаженням імені
                const initialData = {
                    nickname: profileTrigger.dataset.userName,
                    avatarUrl: profileTrigger.dataset.userAvatar
                };
                if (window.openOtherProfile) window.openOtherProfile(userId, initialData);
            }
            return;
        }

        // --- ОБРОБКА ЛАЙКІВ ---
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            const user = auth.currentUser;
            if (!user) { await showCustomModal({ title: "Увага", message: "Увійдіть для вподобань." }); return; }
            const postRef = doc(db, "posts", likeBtn.dataset.id);
            const icon = likeBtn.querySelector('i');
            const countSpan = likeBtn.querySelector('.likes-count');
            let currentCount = parseInt(countSpan.textContent) || 0;
            if (icon.classList.contains('bi-heart-fill')) {
                icon.classList.replace('bi-heart-fill', 'bi-heart');
                icon.style.color = ''; countSpan.textContent = currentCount - 1;
                await updateDoc(postRef, { likedBy: arrayRemove(user.uid) });
            } else {
                icon.classList.replace('bi-heart', 'bi-heart-fill');
                icon.style.color = '#ff4444'; countSpan.textContent = currentCount + 1;
                await updateDoc(postRef, { likedBy: arrayUnion(user.uid) });
            }
            return;
        }

        // --- ОБРОБКА ЛІТАЧКА ---
        const dmBtn = e.target.closest('.dm-btn');
        if (dmBtn && window.openChatWithUser) {
            window.openChatWithUser(dmBtn.dataset.authorId, dmBtn.dataset.authorName, null);
        }
    });

    // ==========================================
    // 9. МІЙ ПРОФІЛЬ (РЕДАГУВАННЯ ТА ПОСТИ)
    // ==========================================
    const profileGrid = document.querySelector('.profile-grid');
    const profileAvatar = document.querySelector('.profile-main-avatar');
    const profileNickname = document.querySelector('.profile-nickname');
    const profileBio = document.querySelector('.profile-bio');
    const avatarWrapper = document.querySelector('.avatar-wrapper.cursor-pointer');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (profileGrid) {
                onSnapshot(query(collection(db, "posts"), where("authorId", "==", user.uid), orderBy("createdAt", "desc")), (snapshot) => {
                    profileGrid.innerHTML = ''; 
                    if (snapshot.empty) { profileGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Тут поки порожньо...</p>'; return; }
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
                onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        profileAvatar.src = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop';
                        profileNickname.innerHTML = `${data.nickname || user.email.split('@')[0]} <i class="bi bi-pencil edit-icon"></i>`;
                        if(profileBio) profileBio.innerHTML = `${data.bio || "Додати опис"} <i class="bi bi-pencil edit-icon"></i>`;
                        if(document.getElementById('my-followers-count')) document.getElementById('my-followers-count').textContent = (data.followers || []).length;
                        if(document.getElementById('my-following-count')) document.getElementById('my-following-count').textContent = (data.following || []).length;
                    }
                });
            }
        }
    });

    if (profileNickname) {
        profileNickname.addEventListener('click', async () => {
            if (!auth.currentUser) return;
            const newName = await showCustomModal({ title: "Ім'я", message: "Новий нікнейм:", type: "prompt" });
            if (newName && newName.trim()) await setDoc(doc(db, "users", auth.currentUser.uid), { nickname: newName.trim() }, { merge: true });
        });
    }

    if (profileBio) {
        profileBio.addEventListener('click', async () => {
            if (!auth.currentUser) return;
            const newBio = await showCustomModal({ title: "Про себе", message: "Короткий опис:", type: "prompt" });
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
                await showCustomModal({ title: "Помилка", message: "Не вдалося завантажити фото." });
            } finally { profileAvatar.style.opacity = "1"; }
        });
    }

    // ==========================================
    // 10. ПРИВАТНІ ЧАТИ
    // ==========================================
    const chatRoomModal = document.getElementById('chat-room-modal');
    const closeChatRoomBtn = document.getElementById('close-chat-room-btn');
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const chatMessageInput = document.getElementById('chat-message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');

    let currentChatUserId = null;
    let chatUnsubscribe = null; 

    if (closeChatRoomBtn) closeChatRoomBtn.addEventListener('click', () => {
        document.querySelector('.nav-btn.active')?.click(); 
        if (chatUnsubscribe) chatUnsubscribe(); 
    });

    function getChatRoomId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

    window.openChatWithUser = async (targetUserId, targetUserName, targetUserAvatar) => {
        const currentUser = auth.currentUser;
        if (!currentUser) { await showCustomModal({ title: "Увага", message: "Увійдіть, щоб писати." }); return; }
        if (currentUser.uid === targetUserId) { await showCustomModal({ title: "Увага", message: "Не можна писати собі." }); return; }

        currentChatUserId = targetUserId;
        
        // Робимо шапку чату активною для кліку
        const chatRoomNameEl = document.getElementById('chat-room-name');
        const chatRoomAvatarEl = document.getElementById('chat-room-avatar');
        
        chatRoomNameEl.textContent = targetUserName || "Користувач";
        chatRoomNameEl.classList.add('user-profile-trigger');
        chatRoomNameEl.style.cursor = 'pointer';
        chatRoomNameEl.dataset.userId = targetUserId;
        chatRoomNameEl.dataset.userName = targetUserName;
        chatRoomNameEl.dataset.userAvatar = targetUserAvatar;

        chatRoomAvatarEl.src = targetUserAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
        chatRoomAvatarEl.classList.add('user-profile-trigger');
        chatRoomAvatarEl.style.cursor = 'pointer';
        chatRoomAvatarEl.dataset.userId = targetUserId;
        chatRoomAvatarEl.dataset.userName = targetUserName;
        chatRoomAvatarEl.dataset.userAvatar = targetUserAvatar;
        
        document.querySelectorAll('.app-screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        chatRoomModal.classList.add('active');
        chatRoomModal.classList.remove('hidden');
        
        chatMessagesContainer.innerHTML = ''; 

        if (chatUnsubscribe) chatUnsubscribe(); 
        chatUnsubscribe = onSnapshot(query(collection(db, "chats", getChatRoomId(currentUser.uid, targetUserId), "messages"), orderBy("timestamp", "asc")), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msgData = change.doc.data();
                    const isMine = msgData.senderId === currentUser.uid;
                    let timeString = '';
                    if (msgData.timestamp) timeString = msgData.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const msgDiv = document.createElement('div');
                    msgDiv.className = `chat-message ${isMine ? 'sent' : 'received'}`;
                    msgDiv.innerHTML = `${msgData.text} <span class="chat-message-time">${timeString}</span>`;
                    chatMessagesContainer.appendChild(msgDiv);
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                }
            });
        });
    };

    async function sendMessage() {
        const text = chatMessageInput.value.trim();
        const currentUser = auth.currentUser;
        if (!text || !currentUser || !currentChatUserId) return;
        chatMessageInput.value = ''; 
        try {
            await addDoc(collection(db, "chats", getChatRoomId(currentUser.uid, currentChatUserId), "messages"), { text: text, senderId: currentUser.uid, timestamp: serverTimestamp() });
        } catch (error) {
            console.error(error);
        }
    }

    if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);
    if (chatMessageInput) chatMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    const dynamicChatList = document.getElementById('dynamic-chat-list');
    if (dynamicChatList) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                onSnapshot(query(collection(db, "users")), (snapshot) => {
                    dynamicChatList.innerHTML = ''; 
                    if (snapshot.empty) { dynamicChatList.innerHTML = '<p style="text-align:center; padding: 20px;">Порожньо</p>'; return; }
                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (docSnap.id === user.uid) return;
                        const chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.style.cursor = 'pointer';
                        const avatar = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                        const name = data.nickname || "Користувач";
                        
                        // Додано клас user-profile-trigger до аватарки та імені
                        chatItem.innerHTML = `
                            <img src="${avatar}" class="chat-avatar user-profile-trigger" data-user-id="${docSnap.id}" data-user-name="${name}" data-user-avatar="${avatar}" style="cursor:pointer;">
                            <div class="chat-info">
                                <span class="chat-name user-profile-trigger" data-user-id="${docSnap.id}" data-user-name="${name}" data-user-avatar="${avatar}" style="cursor:pointer;">${name}</span>
                                <p class="chat-last-message" style="font-size:12px; color:#888;">Написати повідомлення...</p>
                            </div>
                        `;
                        
                        chatItem.addEventListener('click', (e) => {
                            // Якщо клікнули на аватарку чи ім'я - спрацює перехід в профіль, тому чат не відкриваємо
                            if (e.target.closest('.user-profile-trigger')) return; 
                            window.openChatWithUser(docSnap.id, name, avatar);
                        });
                        dynamicChatList.appendChild(chatItem);
                    });
                });
            }
        });
    }

    // ==========================================
    // 11. ПОШУК ТА ЧУЖИЙ ПРОФІЛЬ
    // ==========================================
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
            if (!queryText) { globalContentArea.innerHTML = '<p style="text-align:center; margin-top:20px;">Введіть ім\'я...</p>'; return; }

            const usersSnap = await getDocs(collection(db, "users"));
            globalContentArea.innerHTML = ''; 
            let found = false;

            usersSnap.forEach(docSnap => {
                const data = docSnap.data();
                if ((data.nickname || "").toLowerCase().includes(queryText) && docSnap.id !== auth.currentUser?.uid) {
                    found = true;
                    const card = document.createElement('div');
                    card.className = 'search-user-card';
                    card.innerHTML = `<img src="${data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop'}"><div class="search-user-info"><h4>${data.nickname || 'Користувач'}</h4><p>${data.bio ? data.bio.substring(0,30) : 'На платформі'}</p></div>`;
                    
                    card.addEventListener('click', () => window.openOtherProfile(docSnap.id, data));
                    globalContentArea.appendChild(card);
                }
            });
            if (!found) globalContentArea.innerHTML = '<p style="text-align:center; margin-top:20px;">Нікого не знайдено</p>';
        });
    }

    if (closeOtherProfileBtn) closeOtherProfileBtn.addEventListener('click', () => {
        document.querySelector('.nav-btn.active')?.click(); 
        if(otherProfileUnsubscribe) otherProfileUnsubscribe();
    });

    window.openOtherProfile = async (userId, initialData = {}) => {
        currentViewedUserId = userId;
        
        document.querySelectorAll('.app-screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        otherProfileModal.classList.add('active');
        otherProfileModal.classList.remove('hidden');
        
        const fallbackAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
        document.getElementById('other-profile-avatar').src = initialData.avatarUrl || fallbackAvatar;
        document.getElementById('other-profile-nickname').textContent = initialData.nickname || "Користувач";
        document.getElementById('other-profile-bio').textContent = initialData.bio || "";
        document.getElementById('other-followers-count').textContent = (initialData.followers || []).length;
        document.getElementById('other-following-count').textContent = (initialData.following || []).length;
        
        const grid = document.getElementById('other-profile-grid');
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; margin-top:20px;">Завантаження...</p>';
        
        if (otherProfileUnsubscribe) otherProfileUnsubscribe();
        otherProfileUnsubscribe = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('other-profile-avatar').src = data.avatarUrl || fallbackAvatar;
                document.getElementById('other-profile-nickname').textContent = data.nickname || "Користувач";
                document.getElementById('other-profile-bio').textContent = data.bio || "";
                
                const followers = data.followers || [];
                document.getElementById('other-followers-count').textContent = followers.length;
                document.getElementById('other-following-count').textContent = (data.following || []).length;

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
                     if (post.mediaType === 'image') tile.innerHTML = `<img src="${post.mediaUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                     else if (post.mediaType === 'video') tile.innerHTML = `<video src="${post.mediaUrl}" style="width:100%; height:100%; object-fit:cover;" muted></video>`;
                     else tile.innerHTML = `<div class="text-post-preview" style="padding:10px;"><p style="font-size:12px; margin:0;">${post.text}</p></div>`;
                     grid.appendChild(tile);
                });
            }
        } catch (error) {
            console.error(error);
            grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#ff4444; padding:20px;">Натисніть F12 (Console) та перейдіть за синім посиланням, щоб створити індекс Firebase.</p>';
        }
    };

    if (followBtn) followBtn.addEventListener('click', async () => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !currentViewedUserId) return;
        followBtn.disabled = true; 
        try {
            const targetSnap = await getDoc(doc(db, "users", currentViewedUserId));
            const isFollowing = targetSnap.exists() && (targetSnap.data().followers || []).includes(myUid);
            if (isFollowing) {
                await setDoc(doc(db, "users", myUid), { following: arrayRemove(currentViewedUserId) }, { merge: true });
                await setDoc(doc(db, "users", currentViewedUserId), { followers: arrayRemove(myUid) }, { merge: true });
            } else {
                await setDoc(doc(db, "users", myUid), { following: arrayUnion(currentViewedUserId) }, { merge: true });
                await setDoc(doc(db, "users", currentViewedUserId), { followers: arrayUnion(myUid) }, { merge: true });
            }
        } catch(e) { console.error(e); }
        followBtn.disabled = false;
    });

    if (messageUserBtn) messageUserBtn.addEventListener('click', () => {
        if (window.openChatWithUser) window.openChatWithUser(currentViewedUserId, document.getElementById('other-profile-nickname').textContent, document.getElementById('other-profile-avatar').src);
    });

});