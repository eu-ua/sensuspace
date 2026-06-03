import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- ЛОГІКА ПРИКРІПЛЕННЯ МЕДІА ДО ПОСТА ---
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

    // --- СТВОРЕННЯ ПОСТА ---
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
                    text: text, mediaUrl: mediaUrl, mediaType: mediaType,
                    authorId: user.uid, authorName: user.email.split('@')[0], 
                    createdAt: serverTimestamp(), likedBy: [] 
                });

                postTextInput.value = '';
                if (removeMediaBtn) removeMediaBtn.click(); 
                document.getElementById('create-post-modal').classList.add('hidden'); 
                await window.showCustomModal({ title: "Успіх", message: "Публікацію створено!" });
            } catch (error) {
                console.error(error); await window.showCustomModal({ title: "Помилка", message: "Сталася помилка." });
            } finally {
                submitPostBtn.textContent = originalBtnText; submitPostBtn.disabled = false;
            }
        });
    }

    // --- ЗАВАНТАЖЕННЯ СТРІЧКИ ---
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
                const likedBy = post.likedBy || []; 
                const likesCount = likedBy.length;
                const isLikedByMe = user ? likedBy.includes(user.uid) : false;

                const postElement = document.createElement('div');
                postElement.classList.add('post-card');
                
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
                    <div class="post-content">${post.text ? `<p class="post-text">${post.text}</p>` : ''}${mediaHTML}</div>
                    <div class="post-actions">
                        <button class="action-btn like-btn" data-id="${postId}">
                            <i class="bi ${isLikedByMe ? 'bi-heart-fill' : 'bi-heart'}" style="${isLikedByMe ? 'color: #ff4444;' : ''}"></i> 
                            <span class="likes-count">${likesCount}</span>
                        </button>
                        <button class="action-btn dm-btn" data-author-id="${post.authorId}" data-author-name="${post.authorName}"><i class="bi bi-send"></i></button>
                    </div>
                `;
                
                if (isAuthor) {
                    postElement.querySelector('.delete-post-btn').addEventListener('click', async () => {
                        const confirmed = await window.showCustomModal({ title: "Видалення", message: "Ви впевнені?", type: "confirm" });
                        if (confirmed) await deleteDoc(doc(db, "posts", postId));
                    });
                }
                feedContainer.appendChild(postElement);
            });
        });
    }

    // --- ОБРОБКА ГЛОБАЛЬНИХ КЛІКІВ У СТРІЧЦІ ---
    document.addEventListener('click', async (e) => {
        const profileTrigger = e.target.closest('.user-profile-trigger');
        if (profileTrigger) {
            e.stopPropagation();
            const userId = profileTrigger.dataset.userId;
            if (!userId) return;

            if (auth.currentUser && userId === auth.currentUser.uid) {
                document.querySelector('.nav-btn[data-screen="screen-profile"]')?.click();
            } else {
                if (window.openOtherProfile) window.openOtherProfile(userId, { nickname: profileTrigger.dataset.userName, avatarUrl: profileTrigger.dataset.userAvatar });
            }
            return;
        }

        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            const user = auth.currentUser;
            if (!user) { await window.showCustomModal({ title: "Увага", message: "Увійдіть для вподобань." }); return; }
            const postRef = doc(db, "posts", likeBtn.dataset.id);
            const icon = likeBtn.querySelector('i');
            const countSpan = likeBtn.querySelector('.likes-count');
            let currentCount = parseInt(countSpan.textContent) || 0;
            if (icon.classList.contains('bi-heart-fill')) {
                icon.classList.replace('bi-heart-fill', 'bi-heart'); icon.style.color = ''; countSpan.textContent = currentCount - 1;
                await updateDoc(postRef, { likedBy: arrayRemove(user.uid) });
            } else {
                icon.classList.replace('bi-heart', 'bi-heart-fill'); icon.style.color = '#ff4444'; countSpan.textContent = currentCount + 1;
                await updateDoc(postRef, { likedBy: arrayUnion(user.uid) });
            }
            return;
        }

        const dmBtn = e.target.closest('.dm-btn');
        if (dmBtn && window.openChatWithUser) window.openChatWithUser(dmBtn.dataset.authorId, dmBtn.dataset.authorName, null);
    });

});