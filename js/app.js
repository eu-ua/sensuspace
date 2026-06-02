import './auth.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    
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

    // 2. МОДАЛЬНІ ВІКНА (Налаштування, Фільтри, Створення посту)
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

    // Закриття будь-якого вікна при кліку на темний фон
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
        if (e.target === filterModal) filterModal.classList.add('hidden');
        if (e.target === createPostModal) createPostModal.classList.add('hidden');
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

    // ==========================================
    // 5. ЛОГІКА ПРИКРІПЛЕННЯ МЕДІА (ФОТО/ВІДЕО)
    // ==========================================
    const attachImageBtn = document.getElementById('attach-image-btn');
    const attachVideoBtn = document.getElementById('attach-video-btn');
    const imageInput = document.getElementById('image-input');
    const videoInput = document.getElementById('video-input');
    
    const mediaPreviewContainer = document.getElementById('media-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const videoPreview = document.getElementById('video-preview');
    const removeMediaBtn = document.getElementById('remove-media-btn');

    let currentSelectedFile = null; // Тут ми будемо зберігати файл для відправки в базу

    // Клікаємо на наші красиві іконки -> вони клікають на приховані системні інпути
    if (attachImageBtn) attachImageBtn.addEventListener('click', () => imageInput.click());
    if (attachVideoBtn) attachVideoBtn.addEventListener('click', () => videoInput.click());

    // Функція показу файлу на екрані
    function handleFileSelection(file, type) {
        if (!file) return;
        currentSelectedFile = file;
        mediaPreviewContainer.classList.remove('hidden');

        // Створюємо тимчасове посилання на файл для прев'ю
        const fileURL = URL.createObjectURL(file);

        if (type === 'image') {
            imagePreview.src = fileURL;
            imagePreview.classList.remove('hidden');
            videoPreview.classList.add('hidden');
            videoPreview.src = ""; // Очищаємо відео, якщо вибрали фото
        } else if (type === 'video') {
            videoPreview.src = fileURL;
            videoPreview.classList.remove('hidden');
            imagePreview.classList.add('hidden');
            imagePreview.src = ""; // Очищаємо фото, якщо вибрали відео
        }
    }

    // Слухаємо вибір фотографії
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files[0], 'image');
        });
    }

    // Слухаємо вибір відео
    if (videoInput) {
        videoInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files[0], 'video');
        });
    }

    // Логіка видалення вибраного медіа (хрестик на фото)
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
            const user = auth.currentUser; // Перевіряємо, хто зараз увійшов

            // Захист: якщо гість якимось дивом відкрив вікно
            if (!user) {
                alert("Будь ласка, увійдіть, щоб створити публікацію.");
                return;
            }

            // Перевірка, чи не порожній пост
            if (!text && !currentSelectedFile) {
                alert("Додайте текст або виберіть медіафайл!");
                return;
            }

            // Змінюємо кнопку, щоб користувач бачив процес
            const originalBtnText = submitPostBtn.textContent;
            submitPostBtn.textContent = 'Публікуємо...';
            submitPostBtn.disabled = true; // Блокуємо від подвійного кліку

            try {
                let mediaUrl = null;
                let mediaType = null;

                // 1. ЯКЩО Є ФАЙЛ: Відправляємо в Cloudinary
                if (currentSelectedFile) {
                    const formData = new FormData();
                    formData.append('file', currentSelectedFile);
                    
                    formData.append('upload_preset', 'sensuspace'); 

                    // Твоє посилання Cloudinary (я вже вставив твій cloud_name: dabzs7jkc)
                    // /auto/ означає, що хмара сама зрозуміє, фото це чи відео
                    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`;

                    const response = await fetch(cloudinaryUrl, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();
                    
                    if (data.secure_url) {
                        mediaUrl = data.secure_url; // Отримуємо готове посилання
                        mediaType = data.resource_type; // Отримуємо тип ('image' або 'video')
                    } else {
                        throw new Error('Помилка завантаження файлу в хмару');
                    }
                }

                // 2. ЗБЕРІГАЄМО ВСЕ У FIREBASE
                // Створюємо нову "папку" (колекцію) posts у базі даних
                await addDoc(collection(db, "posts"), {
                    text: text,
                    mediaUrl: mediaUrl,
                    mediaType: mediaType,
                    authorId: user.uid,
                    // Поки нікнеймів немає, беремо першу частину логіна (пошти)
                    authorName: user.email.split('@')[0], 
                    createdAt: serverTimestamp() // Точний час серверів Google
                });

                // 3. ОЧИЩАЄМО ВІКНО ПІСЛЯ УСПІХУ
                postTextInput.value = '';
                if (removeMediaBtn) removeMediaBtn.click(); // Емулюємо натискання на хрестик медіа
                createPostModal.classList.add('hidden'); // Ховаємо вікно
                
                alert("Успішно опубліковано!");

            } catch (error) {
                console.error("Помилка публікації:", error);
                alert("Сталася помилка. Перевірте з'єднання з інтернетом.");
            } finally {
                // Повертаємо кнопку в нормальний стан
                submitPostBtn.textContent = originalBtnText;
                submitPostBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 7. ВИТЯГУЄМО ПОСТИ З БАЗИ (РЕАЛЬНИЙ ЧАС)
    // ==========================================
    const feedContainer = document.querySelector('.feed-container');

    if (feedContainer) {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

        onSnapshot(q, (snapshot) => {
            feedContainer.innerHTML = ''; 
            const user = auth.currentUser; // Дізнаємося, хто зараз авторизований

            // Використовуємо назву postDoc, щоб не було конфлікту з інструментом doc()
            snapshot.forEach((postDoc) => {
                const post = postDoc.data();
                const postId = postDoc.id; // Унікальний ідентифікатор цього запису
                
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

                // ПЕРЕВІРКА: чи поточний користувач є автором цього поста?
                const isAuthor = user && post.authorId === user.uid;

                const postElement = document.createElement('div');
                postElement.classList.add('post-card');
                
                // 1. Рахуємо лайки та перевіряємо, чи є серед них лайк поточного юзера
                const likedBy = post.likedBy || []; // Беремо список лайків або створюємо порожній
                const likesCount = likedBy.length;
                // Перевіряємо, чи юзер авторизований і чи є його ID у списку лайків
                const isLikedByMe = auth.currentUser ? likedBy.includes(auth.currentUser.uid) : false;
                
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
        <!-- ОНОВЛЕНА КНОПКА ЛАЙКУ -->
        <button class="action-btn like-btn" data-id="${post.id}">
            <i class="bi ${isLikedByMe ? 'bi-heart-fill' : 'bi-heart'}" style="${isLikedByMe ? 'color: #ff4444;' : ''}"></i> 
            <span class="likes-count">${likesCount}</span>
        </button>
        <!-- КІНЕЦЬ ОНОВЛЕНОЇ КНОПКИ -->
        
        <button class="action-btn"><i class="bi bi-chat"></i> <span>0</span></button>
        <button class="action-btn"><i class="bi bi-arrow-repeat"></i></button>
        <button class="action-btn"><i class="bi bi-send"></i></button>
    </div>
`;

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
                        <button class="action-btn"><i class="bi bi-heart"></i> <span>0</span></button>
                        <button class="action-btn"><i class="bi bi-chat"></i> <span>0</span></button>
                        <button class="action-btn"><i class="bi bi-arrow-repeat"></i></button>
                        <button class="action-btn"><i class="bi bi-send"></i></button>
                    </div>
                `;
                
                // Якщо це пост автора, додаємо логіку видалення
                if (isAuthor) {
                    const deleteBtn = postElement.querySelector('.delete-post-btn');
                    deleteBtn.addEventListener('click', async () => {
                        const confirmed = confirm('Ви впевнені, що хочете назавжди видалити цей запис?');
                        if (confirmed) {
                            try {
                                // Видаляємо запис із бази даних
                                await deleteDoc(doc(db, "posts", postId));
                                
                                // Зверни увагу: нам не треба вручну видаляти HTML-блок!
                                // onSnapshot миттєво побачить, що в базі стало на 1 запис менше,
                                // і сам автоматично перемалює стрічку.
                            } catch (error) {
                                console.error("Помилка видалення:", error);
                                alert("Не вдалося видалити запис. Перевірте з'єднання.");
                            }
                        }
                    });
                }

                feedContainer.appendChild(postElement);
            });
        });
    }

// Слухаємо всі кліки на сторінці
document.addEventListener('click', async (e) => {
    // Шукаємо, чи клік був саме по кнопці з класом .like-btn (або по іконці всередині неї)
    const likeBtn = e.target.closest('.like-btn');
    if (!likeBtn) return; // Якщо клік по іншому місцю — нічого не робимо

    const user = auth.currentUser;
    if (!user) {
        alert("Будь ласка, увійдіть, щоб залишати вподобайки.");
        return;
    }

    const postId = likeBtn.dataset.id;
    const postRef = doc(db, "posts", postId);
    
    // Знаходимо іконку та лічильник всередині конкретно цієї кнопки
    const icon = likeBtn.querySelector('i');
    const countSpan = likeBtn.querySelector('.likes-count');
    let currentCount = parseInt(countSpan.textContent);
    
    // Перевіряємо поточний стан (чи стоїть вже лайк)
    const isCurrentlyLiked = icon.classList.contains('bi-heart-fill');

    try {
        if (isCurrentlyLiked) {
            // ВІДМІНА ЛАЙКУ
            // 1. Миттєво міняємо візуал (Optimistic UI)
            icon.classList.replace('bi-heart-fill', 'bi-heart');
            icon.style.color = ''; // прибираємо червоний колір
            countSpan.textContent = currentCount - 1;

            // 2. Відправляємо на сервер команду видалити ID зі списку
            await updateDoc(postRef, {
                likedBy: arrayRemove(user.uid)
            });
        } else {
            // СТАВИМО ЛАЙК
            // 1. Миттєво міняємо візуал
            icon.classList.replace('bi-heart', 'bi-heart-fill');
            icon.style.color = '#ff4444'; // червоний колір
            countSpan.textContent = currentCount + 1;

            // 2. Відправляємо на сервер команду додати ID в список
            await updateDoc(postRef, {
                likedBy: arrayUnion(user.uid)
            });
        }
    } catch (error) {
        console.error("Помилка обробки лайку:", error);
    }
});

});