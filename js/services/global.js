import { db, auth } from '../firebase-config.js';
import { collection, doc, setDoc, getDoc, addDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

window.currentViewedUserId = null;
let otherProfileUnsub = null;
let otherPostsUnsub = null;

let otherProfileName = "Завантаження...";
let otherProfileAvatar = DEFAULT_AVATAR;

window.renderUsersListInModal = async (userId, type) => {
    const container = document.getElementById('users-list-container');
    if(!container) return;
    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">Завантаження...</p>';
    
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) throw new Error("Користувач не знайдений");
        const data = userDoc.data();
        
        const fEl = document.getElementById('modal-count-followers');
        if(fEl) fEl.textContent = (data.followers || []).length;
        const flEl = document.getElementById('modal-count-following');
        if(flEl) flEl.textContent = (data.following || []).length;

        const list = type === 'followers' ? (data.followers || []) : (data.following || []);
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
    } catch (err) { container.innerHTML = '<p style="text-align:center; color: #ff4444;">Помилка</p>'; }
};

window.openOtherProfile = async (userId, initialData = {}) => {
    if (document.getElementById('chat-room-modal') && !document.getElementById('chat-room-modal').classList.contains('hidden')) {
        window.previousScreenForProfile = 'chat-room-modal';
    } else {
        window.previousScreenForProfile = 'main';
    }

    window.currentViewedUserId = userId;
    
    document.getElementById('users-list-modal')?.classList.add('hidden');
    document.querySelectorAll('.app-screen').forEach(s => s.classList.add('hidden'));
    
    const modal = document.getElementById('other-user-profile-modal');
    if(!modal) return;
    modal.classList.remove('hidden'); 
    modal.style.display = 'block';

    otherProfileName = initialData.nickname || "Завантаження...";
    otherProfileAvatar = initialData.avatarUrl || DEFAULT_AVATAR;

    if(otherProfileUnsub) otherProfileUnsub();
    otherProfileUnsub = onSnapshot(doc(db, "users", userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.firstName || data.lastName) {
                otherProfileName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            } else {
                otherProfileName = data.login || data.username || 'Творець';
            }
            otherProfileAvatar = data.avatarUrl || DEFAULT_AVATAR;

            const nameEl = document.getElementById('other-profile-fullname');
            if(nameEl) nameEl.textContent = otherProfileName;

            const loginEl = document.getElementById('other-profile-login');
            if(loginEl) { 
                if (data.firstName || data.lastName) {
                    loginEl.textContent = `@${data.login || data.username || 'user'}`; 
                    loginEl.style.display = 'block'; 
                } else {
                    loginEl.style.display = 'none';
                }
            }
            
            const avatarEl = document.getElementById('other-profile-avatar');
            if(avatarEl) avatarEl.src = otherProfileAvatar;
            
            const bioEl = document.getElementById('other-profile-bio');
            if(bioEl) { bioEl.textContent = data.bio || ''; bioEl.style.display = data.bio ? 'block' : 'none'; }
            
            const followersCount = document.getElementById('other-followers-count');
            if(followersCount) followersCount.textContent = (data.followers || []).length;
            const followingCount = document.getElementById('other-following-count');
            if(followingCount) followingCount.textContent = (data.following || []).length;
            
            const btnFollowers = document.getElementById('other-followers-btn');
            if(btnFollowers) btnFollowers.dataset.userId = userId;
            const btnFollowing = document.getElementById('other-following-btn');
            if(btnFollowing) btnFollowing.dataset.userId = userId;
            const btnMessage = document.getElementById('message-user-btn');
            if(btnMessage) btnMessage.dataset.userId = userId; 
            
            const followBtn = document.getElementById('follow-user-btn');
            if(followBtn) {
                const myUid = auth.currentUser?.uid;
                if (myUid && (data.followers || []).includes(myUid)) {
                    followBtn.textContent = "Відписатися"; followBtn.style.background = "transparent"; followBtn.style.color = "var(--text-color)"; followBtn.style.border = "1px solid var(--border-color)";
                } else {
                    followBtn.textContent = "Підписатися"; followBtn.style.background = "var(--text-color)"; followBtn.style.color = "var(--bg-color)"; followBtn.style.border = "none";
                }
            }

            document.querySelectorAll('#other-profile-grid .post-username').forEach(el => el.textContent = otherProfileName);
            document.querySelectorAll('#other-profile-grid .avatar-wrapper img').forEach(el => el.src = otherProfileAvatar);
        }
    });

    if(window.otherCollabUnsub) window.otherCollabUnsub();
    window.otherCollabUnsub = onSnapshot(query(collection(db, "collaborations"), where("authorId", "==", userId)), (snapshot) => {
        const badge = document.getElementById('other-profile-collab-badge');
        if(!badge) return;
        let activeCollab = null;
        snapshot.forEach(doc => { activeCollab = doc.data(); });
        if (activeCollab) {
            badge.textContent = `${activeCollab.type === "Шукаю" ? "Шукаю:" : "Відкритий:"} ${activeCollab.title}`;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });

    const feed = document.getElementById('other-profile-grid');
    if (feed) {
        feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; width: 100%;">Завантаження...</p>';
        if(otherPostsUnsub) otherPostsUnsub();
        otherPostsUnsub = onSnapshot(query(collection(db, "posts"), where("authorId", "==", userId), orderBy("createdAt", "desc")), (snapshot) => {
            feed.innerHTML = '';
            if(snapshot.empty) { feed.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px; width: 100%;">Немає публікацій</p>'; return; }
            
            snapshot.forEach(pDoc => {
                const post = pDoc.data();
                const postId = pDoc.id;
                let mediaHTML = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" alt="Post">`;
                    else if (post.mediaType === 'video') mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls></video>`;
                }
                
                let timeString = 'Щойно';
                if (post.createdAt) {
                    timeString = post.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                let reactionsPillsHtml = '';
                let iReactedToPost = false;
                const currentUserUid = auth.currentUser?.uid;
                if (post.reactions) {
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

                const currentAvatar = otherProfileAvatar;
                const currentName = otherProfileName;
                
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
            });
        });
    }
};

document.addEventListener('click', async (e) => {
    if (e.target.closest('#other-profile-tab-all')) {
        const dp = document.getElementById('other-profile-all-dropdown');
        if(dp) dp.classList.toggle('hidden');
        return;
    }
    if (e.target.closest('#other-profile-all-dropdown .dropdown-item')) {
        const btn = e.target.closest('.dropdown-item');
        const textEl = document.getElementById('other-profile-tab-all-text');
        if(textEl) textEl.innerHTML = `Усе <span style="color: var(--text-secondary); font-size: 13px; font-weight: 600;">• ${btn.textContent}</span>`;
        document.getElementById('other-profile-all-dropdown').classList.add('hidden');
        return;
    }
    if (!e.target.closest('#other-profile-all-dropdown') && !e.target.closest('#other-profile-tab-all')) {
        const dropdown = document.getElementById('other-profile-all-dropdown');
        if(dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
    }

    if (e.target.closest('#my-followers-btn') || e.target.closest('#my-following-btn') || e.target.closest('#other-followers-btn') || e.target.closest('#other-following-btn')) {
        const btn = e.target.closest('div[id$="-btn"]');
        const isFollowers = btn.id.includes('followers');
        window.currentViewedUserId = btn.id.startsWith('my-') ? auth.currentUser?.uid : btn.dataset.userId;

        if (!window.currentViewedUserId) return;
        const modal = document.getElementById('users-list-modal');
        if(modal) modal.classList.remove('hidden');
        
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(isFollowers ? 'modal-tab-followers' : 'modal-tab-following')?.classList.add('active');
        window.renderUsersListInModal(window.currentViewedUserId, isFollowers ? 'followers' : 'following');
    }

    if (e.target.closest('#modal-tab-followers')) {
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
        window.renderUsersListInModal(window.currentViewedUserId, 'followers');
    }
    if (e.target.closest('#modal-tab-following')) {
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
        window.renderUsersListInModal(window.currentViewedUserId, 'following');
    }

    if (e.target.closest('#close-users-list-btn')) {
        const modal = document.getElementById('users-list-modal');
        if (modal) modal.classList.add('hidden');
    }

    if (e.target.closest('.user-profile-trigger')) {
        e.preventDefault();
        const trigger = e.target.closest('.user-profile-trigger');
        const targetUserId = trigger.getAttribute('data-user-id') || trigger.dataset.userId;
        if (!targetUserId) return;

        if (auth.currentUser && targetUserId === auth.currentUser.uid) {
            const listModal = document.getElementById('users-list-modal');
            if (listModal) listModal.classList.add('hidden');
            const profileModal = document.getElementById('other-user-profile-modal');
            if (profileModal) profileModal.classList.add('hidden');
            
            document.querySelectorAll('.app-screen').forEach(s => s.classList.add('hidden'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            
            const profileScreen = document.getElementById('screen-profile');
            if (profileScreen) profileScreen.classList.remove('hidden');
            
            const navBtn = document.querySelector('.nav-btn[data-screen="screen-profile"]');
            if (navBtn) navBtn.classList.add('active');
        } else {
            window.openOtherProfile(targetUserId);
        }
    }

    if (e.target.closest('#close-other-profile-btn')) {
        const modal = document.getElementById('other-user-profile-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        
        if (window.previousScreenForProfile === 'chat-room-modal') {
            const chatModal = document.getElementById('chat-room-modal');
            if (chatModal) {
                chatModal.classList.remove('hidden');
                chatModal.classList.add('active');
            }
        } else {
            document.querySelector('.nav-btn.active')?.click();
        }
        window.previousScreenForProfile = null;
    }

    if (e.target.closest('#follow-user-btn')) {
        const followBtn = e.target.closest('#follow-user-btn');
        const myUid = auth.currentUser?.uid;
        if (!myUid || !window.currentViewedUserId) return window.showCustomModal({ title: "Увага", message: "Увійдіть в акаунт!" });
        
        followBtn.disabled = true; 
        try {
            const targetRef = doc(db, "users", window.currentViewedUserId);
            const myRef = doc(db, "users", myUid);
            const targetSnap = await getDoc(targetRef);
            const isFollowing = targetSnap.exists() && (targetSnap.data().followers || []).includes(myUid);
            
            if (isFollowing) {
                await setDoc(myRef, { following: arrayRemove(window.currentViewedUserId) }, { merge: true });
                await setDoc(targetRef, { followers: arrayRemove(myUid) }, { merge: true });
            } else {
                await setDoc(myRef, { following: arrayUnion(window.currentViewedUserId) }, { merge: true });
                await setDoc(targetRef, { followers: arrayUnion(myUid) }, { merge: true });
                
                await addDoc(collection(db, `users/${window.currentViewedUserId}/notifications`), {
                    type: 'follow', fromUserId: myUid, createdAt: serverTimestamp(), read: false
                });
            }
        } catch(e) { console.error(e); }
        followBtn.disabled = false;
    }

    if (e.target.closest('#message-user-btn')) {
        const currentUser = auth.currentUser;
        const targetUserId = e.target.closest('#message-user-btn').dataset.userId;
        
        if (!currentUser || !targetUserId) return;
        const roomId = currentUser.uid < targetUserId ? `${currentUser.uid}_${targetUserId}` : `${targetUserId}_${currentUser.uid}`;

        await setDoc(doc(db, "chats", roomId), {
            participants: [currentUser.uid, targetUserId],
            timestamp: serverTimestamp()
        }, { merge: true });

        const modal = document.getElementById('other-user-profile-modal');
        if(modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        
        document.querySelectorAll('.app-screen').forEach(s => s.classList.add('hidden'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const msgScreen = document.getElementById('screen-messages');
        if(msgScreen) msgScreen.classList.remove('hidden');
        const navBtn = document.querySelector('.nav-btn[data-screen="screen-messages"]');
        if(navBtn) navBtn.classList.add('active');
    }
});

// ============================================================================
// --- ЛОГІКА ІНТЕРАКТИВНОГО ЛОГОТИПА (ПОНЧИКА) ТА СПОВІЩЕНЬ ---
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const logo = document.getElementById('main-app-logo');
    if (!logo) return;

    let pressTimer;
    let isLongPress = false;

    // Спеціальна функція для відкриття сповіщень
    const openNotifications = () => {
        if (navigator.vibrate) navigator.vibrate(40);
        const notifModal = document.getElementById('notifications-modal');
        if (notifModal) notifModal.classList.remove('hidden');
        
        // Відправляємо подію, щоб feed.js позначив сповіщення як прочитані (якщо потрібно)
        window.dispatchEvent(new Event('notificationsOpened'));
    };

    // 1. КЛІК (ЛКМ) -> ПОВЕРНЕННЯ НА ПОЧАТОК СТРІЧКИ
    logo.addEventListener('click', (e) => {
        if (!isLongPress) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // 2. ПРАВИЙ КЛІК (ПКМ) -> ВІДКРИТТЯ СПОВІЩЕНЬ
    logo.addEventListener('contextmenu', (e) => {
        e.preventDefault();  // Блокуємо стандартне системне меню браузера
        e.stopPropagation(); 
        openNotifications();
    });

    // 3. ДОВГЕ ЗАТИСКАННЯ (МОБІЛЬНІ ПРИСТРОЇ) -> ВІДКРИТТЯ СПОВІЩЕНЬ
    logo.addEventListener('touchstart', (e) => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
            isLongPress = true;
            openNotifications();
        }, 500); // Пів секунди на затискання
    }, { passive: true });

    logo.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        if (isLongPress) e.preventDefault(); // Скасовуємо звичайний клік, якщо це був довгий тап
    });

    logo.addEventListener('touchmove', () => {
        clearTimeout(pressTimer); // Якщо палець посунувся, скасовуємо довгий тап
    }, { passive: true });

    // 4. PULL-TO-REFRESH (ПОТЯГНУТИ ВНИЗ ДЛЯ ОНОВЛЕННЯ З ОБЕРТАННЯМ)
    let startY = 0;
    let isPulling = false;

    document.addEventListener('touchstart', (e) => {
        // Запускаємо логіку тільки якщо користувач знаходиться на самому верху сторінки
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
            logo.style.transition = 'none'; // Вимикаємо плавність, щоб пончик миттєво реагував
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isPulling || window.scrollY > 0) return;
        
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0 && diff < 250) { 
            // Крутимо пончик. Множник 2.5 робить обертання динамічнішим
            logo.style.transform = `rotate(${diff * 2.5}deg)`;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isPulling) return;
        isPulling = false;

        const endY = e.changedTouches[0].clientY;
        const diff = endY - startY;

        // Якщо потягнули достатньо сильно
        if (diff > 80) { 
            if (navigator.vibrate) navigator.vibrate(30);
            
            // Анімація швидкого обертання
            logo.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            logo.style.transform = `rotate(360deg)`;
            
            // Симулюємо оновлення стрічки
            const activeFilter = document.querySelector('.space-filter-btn.active') || document.querySelector('.space-filter-btn');
            if (activeFilter) activeFilter.click();

            // Повертаємо логотип у початковий стан
            setTimeout(() => {
                logo.style.transition = 'none';
                logo.style.transform = 'rotate(0deg)';
            }, 550);
            
        } else {
            // Якщо потягнули слабо - просто плавно повертаємо
            logo.style.transition = 'transform 0.3s ease-out';
            logo.style.transform = 'rotate(0deg)';
        }
    });

    async function checkWeather() {
        try {
            // Звертаємось до нашого власного безпечного маршруту
            const response = await fetch('/api/weather');
            const data = await response.json();
            
            const weatherId = data.weather[0].id;
            console.log("Поточний ID погоди (безпечно):", weatherId);

            // Якщо йде дощ (група 500-531)
            if (weatherId >= 500 && weatherId < 600) {
                window.startRain();
            }

            // Якщо гроза (група 200-232)
            if (weatherId >= 200 && weatherId < 300) {
                window.startRain();
                setInterval(() => {
                    if (Math.random() < 0.5) {
                        window.triggerLightning();
                    }
                }, 4000);
            }
        } catch (e) { 
            console.error("Помилка підключення до погоди:", e); 
        }
    }

    checkWeather();

    // --- ЛОГІКА ДЛЯ ВКАДКИ "ПРОСТІР" (ВСТАВЛЕННЯ ВІДКРИТТЯ) ---
    const arrangeProstirFeed = () => {
        const feedContainer = document.querySelector('.feed-container');
        if (!feedContainer) return;

        // Слухаємо зміни в стрічці (бо пости завантажуються з бази)
        const observer = new MutationObserver(() => {
            // Шукаємо підвантажені пости за класом .post-card
            const posts = feedContainer.querySelectorAll('.post-card');
            const discoveryBlock = document.getElementById('discovery-block');
            
            if (discoveryBlock && posts.length > 0) {
                // Показуємо блок
                discoveryBlock.style.display = 'block'; 
                
                // Якщо є мінімум 2 пости, ставимо після другого, інакше - після першого
                if (posts.length >= 2) {
                    posts[1].insertAdjacentElement('afterend', discoveryBlock);
                } else {
                    posts[0].insertAdjacentElement('afterend', discoveryBlock);
                }
                
                // Зупиняємо спостереження, коли успішно перемістили
                observer.disconnect(); 
            }
        });

        // Запускаємо відстеження додавання постів
        observer.observe(feedContainer, { childList: true });
    };

    arrangeProstirFeed();

});