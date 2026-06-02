import './auth.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, serverTimestamp, where, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // УНІВЕРСАЛЬНЕ КАСТОМНЕ ВІКНО (Заміна alert/prompt/confirm)
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

            if (type === 'confirm' || type === 'prompt') {
                cancelBtn.classList.remove('hidden');
            }
            if (type === 'prompt') {
                inputEl.classList.remove('hidden');
            }

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

    // 1. НАВІГАЦІЯ (НИЖНЯ ПАНЕЛЬ)
    const navButtons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.app-screen');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetScreenId = btn.dataset.screen;
            const targetScreen = document.getElementById(targetScreenId);

            if (targetScreen) {
                navButtons.forEach(b => b.classList.remove('active'));
                screens.forEach(s => s.classList.remove('active'));
                btn.classList.add('active');
                targetScreen.classList.add('active');
            }
        });
    });

    // 2. МОДАЛЬНІ ВІКНА
    const settingsModal = document.getElementById('settings-modal');
    const filterModal = document.getElementById('filter-modal');
    const createPostModal = document.getElementById('create-post-modal');
    
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const openFilterBtn = document.getElementById('open-filter-btn');
    const createPostTriggers = document.querySelectorAll('.create-post-trigger');
    const closeCreatePostBtn = document.getElementById('close-create-post-btn');

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    if (openFilterBtn) openFilterBtn.addEventListener('click', () => filterModal.classList.remove('hidden'));
    
    createPostTriggers.forEach(btn => {
        btn.addEventListener('click', () => createPostModal.classList.remove('hidden'));
    });

    if (closeCreatePostBtn) {
        closeCreatePostBtn.addEventListener('click', () => createPostModal.classList.add('hidden'));
    }

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
        if (e.target === filterModal) filterModal.classList.add('hidden');
        if (e.target === createPostModal) createPostModal.classList.add('hidden');
        if (e.target === document.getElementById('custom-modal')) {
            // Запобігаємо закриттю кастомного вікна по кліку на фон, щоб не губилися дані
        }
    });

    // 3. ЗМІНА ТЕМИ
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

    // 5. ЛОГІКА ПРИКРІПЛЕННЯ МЕДІА (ФОТО/ВІДЕО)
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
        } else if (type === 'video') {
            videoPreview.src = fileURL;
            videoPreview.classList.remove('hidden');
            imagePreview.classList.add('hidden');
            imagePreview.src = ""; 
        }
    }

    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files[0], 'image');
        });
    }

    if (videoInput) {
        videoInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files[0], 'video');
        });
    }

    if (removeMediaBtn) {
        removeMediaBtn.addEventListener('click', () => {
            currentSelectedFile = null;
            mediaPreviewContainer.classList.add('hidden');
            imagePreview.classList.add('hidden');
            videoPreview.classList.add('hidden');
            imagePreview.src = "";
            videoPreview.src = "";
            imageInput.value = "";
            videoInput.value = "";
        });
    }

    // 6. ПУБЛІКАЦІЯ ПОСТА В БАЗУ ДАНИХ
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

                    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`;

                    const response = await fetch(cloudinaryUrl, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();
                    
                    if (data.secure_url) {
                        mediaUrl = data.secure_url; 
                        mediaType = data.resource_type; 
                    } else {
                        throw new Error('Помилка завантаження файлу в хмару');
                    }
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
                await showCustomModal({ title: "Помилка", message: "Сталася помилка. Перевірте з'єднання з інтернетом." });
            } finally {
                submitPostBtn.textContent = originalBtnText;
                submitPostBtn.disabled = false;
            }
        });
    }

    // 7. ВИТЯГУЄМО ПОСТИ З БАЗИ (РЕАЛЬНИЙ ЧАС)
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
                if (post.createdAt) {
                    const date = post.createdAt.toDate();
                    timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                let mediaHTML = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'image') {
                        mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post image">`;
                    } else if (post.mediaType === 'video') {
                        mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
                    }
                }

                const isAuthor = user && post.authorId === user.uid;
                
                const likedBy = post.likedBy || []; 
                const likesCount = likedBy.length;
                const isLikedByMe = user ? likedBy.includes(user.uid) : false;

                const postElement = document.createElement('div');
                postElement.classList.add('post-card');
                
                postElement.innerHTML = `
                    <div class="post-header">
                        <div class="avatar-wrapper" style="width: 40px; height: 40px; overflow: hidden; border-radius: 50%;">
                            <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar">
                        </div>
                        <div class="post-user-info">
                            <span class="post-username">${post.authorName}</span>
                            <span class="post-time">${timeString}</span>
                        </div>
            
                        ${isAuthor 
                            ? `<button class="post-menu-btn delete-post-btn" title="Видалити"><i class="bi bi-trash" style="color: #ff4444;"></i></button>` 
                            : `<button class="post-menu-btn"><i class="bi bi-three-dots"></i></button>`
                        }
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
                        <button class="action-btn"><i class="bi bi-arrow-repeat"></i></button>
                        <button class="action-btn dm-btn" data-author-id="${post.authorId}" data-author-name="${post.authorName}"><i class="bi bi-send"></i></button>
                    </div>
                `;
                
                if (isAuthor) {
                    const deleteBtn = postElement.querySelector('.delete-post-btn');
                    deleteBtn.addEventListener('click', async () => {
                        const confirmed = await showCustomModal({ 
                            title: "Видалення", 
                            message: "Ви впевнені, що хочете назавжди видалити цей запис?", 
                            type: "confirm" 
                        });
                        
                        if (confirmed) {
                            try {
                                await deleteDoc(doc(db, "posts", postId));
                            } catch (error) {
                                console.error("Помилка видалення:", error);
                                await showCustomModal({ title: "Помилка", message: "Не вдалося видалити запис." });
                            }
                        }
                    });
                }

                feedContainer.appendChild(postElement);
            });
        });
    }

    // ==========================================
    // 8. СЛУХАЧ КЛІКІВ (ЛАЙКИ ТА ЧАТИ)
    // ==========================================
    document.addEventListener('click', async (e) => {
        
        // --- ОБРОБКА ЛАЙКІВ ---
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            const user = auth.currentUser;
            if (!user) {
                await showCustomModal({ title: "Увага", message: "Будь ласка, увійдіть, щоб залишати вподобайки." });
                return;
            }

            const postId = likeBtn.dataset.id;
            const postRef = doc(db, "posts", postId);
            const icon = likeBtn.querySelector('i');
            const countSpan = likeBtn.querySelector('.likes-count');
            let currentCount = parseInt(countSpan.textContent) || 0;
            const isCurrentlyLiked = icon.classList.contains('bi-heart-fill');

            try {
                if (isCurrentlyLiked) {
                    icon.classList.replace('bi-heart-fill', 'bi-heart');
                    icon.style.color = ''; 
                    countSpan.textContent = currentCount - 1;
                    await updateDoc(postRef, { likedBy: arrayRemove(user.uid) });
                } else {
                    icon.classList.replace('bi-heart', 'bi-heart-fill');
                    icon.style.color = '#ff4444'; 
                    countSpan.textContent = currentCount + 1;
                    await updateDoc(postRef, { likedBy: arrayUnion(user.uid) });
                }
            } catch (error) {
                console.error("Помилка обробки лайку:", error);
            }
            return; // Зупиняємо код тут, якщо це був лайк
        }

        // --- ОБРОБКА ЛІТАЧКА (ВІДКРИТТЯ ЧАТУ) ---
        const dmBtn = e.target.closest('.dm-btn');
        if (dmBtn) {
            const authorId = dmBtn.dataset.authorId;
            const authorName = dmBtn.dataset.authorName;
            
            // Запускаємо функцію чату, яку ми додали в кінці файлу
            if (window.openChatWithUser) {
                window.openChatWithUser(authorId, authorName, null);
            }
            return;
        }
    });

    // 9. ОСОБИСТИЙ ПРОФІЛЬ (ТІЛЬКИ ТВОЇ ПОСТИ)
    const profileGrid = document.querySelector('.profile-grid');

    if (profileGrid) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                const qProfile = query(
                    collection(db, "posts"), 
                    where("authorId", "==", user.uid), 
                    orderBy("createdAt", "desc")
                );

                onSnapshot(qProfile, (snapshot) => {
                    profileGrid.innerHTML = ''; 
                    
                    if (snapshot.empty) {
                        profileGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #888;">Тут поки порожньо...</p>';
                        return;
                    }

                    snapshot.forEach((postDoc) => {
                        const post = postDoc.data();
                        const tile = document.createElement('div');
                        tile.classList.add('profile-post-tile');
                        
                        if (post.mediaType === 'image' && post.mediaUrl) {
                            tile.innerHTML = `<img src="${post.mediaUrl}" alt="Post image">`;
                        } else if (post.mediaType === 'video' && post.mediaUrl) {
                            tile.innerHTML = `<video src="${post.mediaUrl}" muted></video>`;
                        } else if (post.text) {
                            tile.innerHTML = `
                                <div class="text-post-preview">
                                    <p>${post.text}</p>
                                </div>
                            `;
                        }
                        
                        profileGrid.appendChild(tile);
                    });
                });
            } else {
                profileGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #888;">Увійдіть, щоб бачити свої публікації.</p>';
            }
        });
    }

    // 10. РЕДАГУВАННЯ ПРОФІЛЮ (Аватар, Нікнейм, Біо)
    const profileAvatar = document.querySelector('.profile-main-avatar');
    const profileNickname = document.querySelector('.profile-nickname');
    const profileBio = document.querySelector('.profile-bio');
    const avatarWrapper = document.querySelector('.avatar-wrapper.cursor-pointer');

    if (profileAvatar && profileNickname && profileBio) {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data();
                    if (data.avatarUrl) profileAvatar.src = data.avatarUrl;
                    if (data.nickname) profileNickname.innerHTML = `${data.nickname} <i class="bi bi-pencil edit-icon"></i>`;
                    if (data.bio) profileBio.innerHTML = `${data.bio} <i class="bi bi-pencil edit-icon"></i>`;
                } else {
                    profileNickname.innerHTML = `${user.email.split('@')[0]} <i class="bi bi-pencil edit-icon"></i>`;
                }
            }
        });

        profileNickname.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            
            const newNickname = await showCustomModal({ 
                title: "Зміна імені", 
                message: "Введіть новий нікнейм:", 
                type: "prompt" 
            });
            
            if (newNickname && newNickname.trim() !== "") {
                const userRef = doc(db, "users", user.uid);
                await setDoc(userRef, { nickname: newNickname.trim() }, { merge: true });
                profileNickname.innerHTML = `${newNickname.trim()} <i class="bi bi-pencil edit-icon"></i>`;
            }
        });

        profileBio.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;

            const newBio = await showCustomModal({ 
                title: "Про себе", 
                message: "Напишіть кілька слів про себе (чим ви надихаєтесь, що шукаєте):", 
                type: "prompt" 
            });
            
            if (newBio && newBio.trim() !== "") {
                const userRef = doc(db, "users", user.uid);
                await setDoc(userRef, { bio: newBio.trim() }, { merge: true });
                profileBio.innerHTML = `${newBio.trim()} <i class="bi bi-pencil edit-icon"></i>`;
            }
        });

        const avatarInput = document.createElement('input');
        avatarInput.type = 'file';
        avatarInput.accept = 'image/*';

        avatarWrapper.addEventListener('click', () => {
            avatarInput.click();
        });

        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const user = auth.currentUser;
            if (!user) return;

            const originalSrc = profileAvatar.src;
            profileAvatar.style.opacity = "0.5";

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'sensuspace');

                const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.secure_url) {
                    const userRef = doc(db, "users", user.uid);
                    await setDoc(userRef, { avatarUrl: data.secure_url }, { merge: true });
                    profileAvatar.src = data.secure_url; 
                } else {
                    profileAvatar.src = originalSrc;
                    await showCustomModal({ title: "Помилка", message: "Не вдалося завантажити фотографію." });
                }
            } catch (error) {
                console.error("Помилка аватарки:", error);
                profileAvatar.src = originalSrc;
            } finally {
                profileAvatar.style.opacity = "1";
            }
        });
    }

    // ==========================================
    // 11. ОСОБИСТІ ПОВІДОМЛЕННЯ (ЛОГІКА ЧАТУ)
    // ==========================================
    const chatRoomModal = document.getElementById('chat-room-modal');
    const closeChatRoomBtn = document.getElementById('close-chat-room-btn');
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const chatMessageInput = document.getElementById('chat-message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const chatRoomName = document.getElementById('chat-room-name');
    const chatRoomAvatar = document.getElementById('chat-room-avatar');

    let currentChatUserId = null;
    let chatUnsubscribe = null; // Для зупинки прослуховування старих чатів

    // Закриття чату
    if (closeChatRoomBtn) {
        closeChatRoomBtn.addEventListener('click', () => {
            chatRoomModal.classList.add('hidden');
            if (chatUnsubscribe) chatUnsubscribe(); 
        });
    }

    // Секретна формула: створюємо один спільний ID кімнати для двох користувачів
    function getChatRoomId(uid1, uid2) {
        return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
    }

    // Функція відкриття чату
    window.openChatWithUser = async (targetUserId, targetUserName, targetUserAvatar) => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            await showCustomModal({ title: "Увага", message: "Увійдіть, щоб писати повідомлення." });
            return;
        }
        if (currentUser.uid === targetUserId) {
            await showCustomModal({ title: "Увага", message: "Ви не можете писати самому собі." });
            return;
        }

        currentChatUserId = targetUserId;
        chatRoomName.textContent = targetUserName || "Користувач";
        chatRoomAvatar.src = targetUserAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
        
        chatRoomModal.classList.remove('hidden');
        chatMessagesContainer.innerHTML = ''; // Очищаємо екран від старого чату

        const roomId = getChatRoomId(currentUser.uid, targetUserId);
        
        // Підключаємося до Firebase для читання повідомлень саме цієї кімнати
        const q = query(
            collection(db, "chats", roomId, "messages"),
            orderBy("timestamp", "asc")
        );

        if (chatUnsubscribe) chatUnsubscribe(); // Відключаємось від попереднього співрозмовника

        // Слухаємо нові повідомлення в реальному часі
        chatUnsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const msgData = change.doc.data();
                    const isMine = msgData.senderId === currentUser.uid;
                    
                    let timeString = '';
                    if (msgData.timestamp) {
                        const date = msgData.timestamp.toDate();
                        timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }

                    const msgDiv = document.createElement('div');
                    msgDiv.className = `chat-message ${isMine ? 'sent' : 'received'}`;
                    msgDiv.innerHTML = `${msgData.text} <span class="chat-message-time">${timeString}</span>`;
                    
                    chatMessagesContainer.appendChild(msgDiv);
                    // Автоматично прокручуємо вниз до останнього повідомлення
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                }
            });
        });
    };

    // Відправка повідомлення в базу
    async function sendMessage() {
        const text = chatMessageInput.value.trim();
        const currentUser = auth.currentUser;
        
        if (!text || !currentUser || !currentChatUserId) return;
        
        const roomId = getChatRoomId(currentUser.uid, currentChatUserId);
        chatMessageInput.value = ''; // Миттєво очищаємо поле вводу
        
        try {
            await addDoc(collection(db, "chats", roomId, "messages"), {
                text: text,
                senderId: currentUser.uid,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Помилка відправки:", error);
            await showCustomModal({ title: "Помилка", message: "Не вдалося відправити повідомлення." });
        }
    }

    if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);
    if (chatMessageInput) {
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // ==========================================
    // 12. СПИСОК КОРИСТУВАЧІВ (ВКЛАДКА ПОВІДОМЛЕНЬ)
    // ==========================================
    const dynamicChatList = document.getElementById('dynamic-chat-list');

    if (dynamicChatList) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Витягуємо всіх користувачів з бази
                const usersQuery = query(collection(db, "users"));
                
                onSnapshot(usersQuery, (snapshot) => {
                    dynamicChatList.innerHTML = ''; // Очищаємо список
                    
                    if (snapshot.empty) {
                        dynamicChatList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Тут поки порожньо. Знайдіть когось у стрічці!</p>';
                        return;
                    }

                    snapshot.forEach((docSnap) => {
                        const userData = docSnap.data();
                        const userId = docSnap.id;
                        
                        // Щоб не бачити самого себе в списку діалогів
                        if (userId === user.uid) return;

                        const userName = userData.nickname || "Користувач";
                        const userAvatar = userData.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                        const userBio = userData.bio || 'Натисніть, щоб почати діалог';

                        const chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.style.cursor = 'pointer'; // Додаємо курсор-руку
                        
                        chatItem.innerHTML = `
                            <img src="${userAvatar}" alt="User" class="chat-avatar">
                            <div class="chat-info">
                                <div class="chat-info-top">
                                    <span class="chat-name">${userName}</span>
                                </div>
                                <div class="chat-info-bottom">
                                    <p class="chat-last-message" style="color: var(--text-secondary); font-size: 13px;">${userBio}</p>
                                </div>
                            </div>
                        `;
                        
                        // Головна магія: клік по цій плашці відкриває наш чат!
                        chatItem.addEventListener('click', () => {
                            if (window.openChatWithUser) {
                                window.openChatWithUser(userId, userName, userAvatar);
                            }
                        });

                        dynamicChatList.appendChild(chatItem);
                    });
                });
            } else {
                dynamicChatList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 20px;">Увійдіть, щоб бачити повідомлення.</p>';
            }
        });
    }

    // ==========================================
    // 13. ПОШУК, ПІДПИСКИ ТА ПРОФІЛЬ ІНШИХ ЛЮДЕЙ
    // ==========================================
    const globalSearchInput = document.querySelector('.global-search-input');
    const globalContentArea = document.querySelector('.global-content-area');
    
    // Елементи чужого профілю
    const otherProfileModal = document.getElementById('other-user-profile-modal');
    const closeOtherProfileBtn = document.getElementById('close-other-profile-btn');
    const followBtn = document.getElementById('follow-user-btn');
    const messageUserBtn = document.getElementById('message-user-btn');
    
    let currentViewedUserId = null;
    let otherProfileUnsubscribe = null;

    // --- 1. АВТОМАТИЧНИЙ ПОШУК ---
    if (globalSearchInput && globalContentArea) {
        globalSearchInput.addEventListener('input', async (e) => {
            const queryText = e.target.value.toLowerCase().trim();
            
            if (!queryText) {
                globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Введіть ім\'я для пошуку...</p>';
                return;
            }

            const usersSnap = await getDocs(collection(db, "users"));
            globalContentArea.innerHTML = ''; // Очищаємо екран
            let found = false;

            usersSnap.forEach(docSnap => {
                const data = docSnap.data();
                const userId = docSnap.id;
                const nickname = (data.nickname || "").toLowerCase();
                
                // Шукаємо збіг (і не показуємо самого себе)
                if (nickname.includes(queryText) && userId !== auth.currentUser?.uid) {
                    found = true;
                    const avatar = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                    
                    const card = document.createElement('div');
                    card.className = 'search-user-card';
                    card.innerHTML = `
                        <img src="${avatar}" alt="user">
                        <div class="search-user-info">
                            <h4>${data.nickname}</h4>
                            <p>${data.bio ? data.bio.substring(0, 30) + '...' : 'Новий учасник платформи'}</p>
                        </div>
                    `;
                    // При кліку на картку - відкриваємо профіль!
                    card.addEventListener('click', () => window.openOtherProfile(userId));
                    globalContentArea.appendChild(card);
                }
            });

            if (!found) {
                globalContentArea.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Нікого не знайдено :(</p>';
            }
        });
    }

    // --- 2. ВІДКРИТТЯ ЧУЖОГО ПРОФІЛЮ ---
    if (closeOtherProfileBtn) {
        closeOtherProfileBtn.addEventListener('click', () => {
            otherProfileModal.classList.add('hidden');
            if(otherProfileUnsubscribe) otherProfileUnsubscribe();
        });
    }

    window.openOtherProfile = async (userId) => {
        currentViewedUserId = userId;
        otherProfileModal.classList.remove('hidden');
        document.getElementById('other-profile-grid').innerHTML = '<p style="text-align:center; grid-column:1/-1;">Завантаження...</p>';
        
        // Підписуємося на оновлення профілю цієї людини
        if (otherProfileUnsubscribe) otherProfileUnsubscribe();
        
        otherProfileUnsubscribe = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('other-profile-avatar').src = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                document.getElementById('other-profile-nickname').textContent = data.nickname || "Користувач";
                document.getElementById('other-profile-bio').textContent = data.bio || "";
                
                const followers = data.followers || [];
                const following = data.following || [];
                
                document.getElementById('other-followers-count').textContent = followers.length;
                document.getElementById('other-following-count').textContent = following.length;

                // Перевіряємо, чи ми вже підписані на цю людину
                const myUid = auth.currentUser?.uid;
                if (myUid && followers.includes(myUid)) {
                    followBtn.textContent = "Відписатися";
                    followBtn.style.background = "var(--bg-secondary)";
                    followBtn.style.color = "var(--text-primary)";
                } else {
                    followBtn.textContent = "Підписатися";
                    followBtn.style.background = "var(--accent-color)";
                    followBtn.style.color = "white";
                }
            }
        });

        // Завантажуємо пости цієї людини
        const qPosts = query(collection(db, "posts"), where("authorId", "==", userId), orderBy("createdAt", "desc"));
        const postsSnap = await getDocs(qPosts);
        const grid = document.getElementById('other-profile-grid');
        grid.innerHTML = '';
        
        if (postsSnap.empty) {
             grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#888;">Немає публікацій</p>';
        } else {
            postsSnap.forEach(pSnap => {
                 const post = pSnap.data();
                 const tile = document.createElement('div');
                 tile.className = 'profile-post-tile';
                 if (post.mediaType === 'image' && post.mediaUrl) {
                     tile.innerHTML = `<img src="${post.mediaUrl}" alt="Post image">`;
                 } else if (post.mediaType === 'video' && post.mediaUrl) {
                     tile.innerHTML = `<video src="${post.mediaUrl}" muted></video>`;
                 } else if (post.text) {
                     tile.innerHTML = `<div class="text-post-preview"><p>${post.text}</p></div>`;
                 }
                 grid.appendChild(tile);
            });
        }
    };

    // --- 3. КНОПКА "ПІДПИСАТИСЯ" ---
    if (followBtn) {
        followBtn.addEventListener('click', async () => {
            const myUid = auth.currentUser?.uid;
            if (!myUid || !currentViewedUserId) return;
            
            const myRef = doc(db, "users", myUid);
            const targetRef = doc(db, "users", currentViewedUserId);

            followBtn.disabled = true; // Блокуємо від подвійного кліку
            try {
                const targetSnap = await getDoc(targetRef);
                const isFollowing = targetSnap.exists() && (targetSnap.data().followers || []).includes(myUid);

                if (isFollowing) {
                    // Відписуємося
                    await setDoc(myRef, { following: arrayRemove(currentViewedUserId) }, { merge: true });
                    await setDoc(targetRef, { followers: arrayRemove(myUid) }, { merge: true });
                } else {
                    // Підписуємося
                    await setDoc(myRef, { following: arrayUnion(currentViewedUserId) }, { merge: true });
                    await setDoc(targetRef, { followers: arrayUnion(myUid) }, { merge: true });
                }
            } catch(e) {
                console.error("Помилка підписки:", e);
            }
            followBtn.disabled = false;
        });
    }

    // --- 4. КНОПКА "НАПИСАТИ" (ВІДКРИВАЄ ЧАТ) ---
    if (messageUserBtn) {
        messageUserBtn.addEventListener('click', () => {
            const nickname = document.getElementById('other-profile-nickname').textContent;
            const avatar = document.getElementById('other-profile-avatar').src;
            
            otherProfileModal.classList.add('hidden'); // Закриваємо профіль
            if (window.openChatWithUser) {
                window.openChatWithUser(currentViewedUserId, nickname, avatar);
            }
        });
    }

    // --- 5. ОНОВЛЕННЯ ЛІЧИЛЬНИКІВ У ТВЬОМУ ПРОФІЛІ ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const myFollowersCount = document.getElementById('my-followers-count');
                    const myFollowingCount = document.getElementById('my-following-count');
                    
                    if (myFollowersCount) myFollowersCount.textContent = (data.followers || []).length;
                    if (myFollowingCount) myFollowingCount.textContent = (data.following || []).length;
                }
            });
        }
    });


});