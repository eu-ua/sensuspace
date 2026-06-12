import { db, auth } from './firebase-config.js';
import { collection, doc, updateDoc, query, orderBy, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

document.addEventListener('DOMContentLoaded', () => {
    let myProfileName = "Завантаження...";
    let myProfileAvatar = DEFAULT_AVATAR;
    let savedPostsIds = [];
    let currentActiveTab = 'all'; 
    let currentTabPreference = 'Збережене'; 
    let globalPostsSnapshot = [];
    let profileUserCache = {}; 

    const editProfileBtn = document.getElementById('open-edit-profile-btn');
    const editProfileModal = document.getElementById('edit-my-profile-modal');
    const closeEditProfileBtn = document.getElementById('close-edit-my-profile-btn');
    const submitEditProfileBtn = document.getElementById('save-my-profile-btn');
    const editAvatarInput = document.getElementById('edit-avatar-input');
    let newAvatarFile = null;

    if (editProfileBtn && editProfileModal) {
        editProfileBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                document.getElementById('edit-firstname').value = data.firstName || '';
                document.getElementById('edit-lastname').value = data.lastName || '';
                document.getElementById('edit-bio').value = data.bio || '';
                document.getElementById('edit-tab-name').value = data.tabPreference || 'Збережене';
                document.getElementById('edit-profile-avatar-preview').src = data.avatarUrl || DEFAULT_AVATAR;
            }
            editProfileModal.classList.remove('hidden');
        });
    }

    if (closeEditProfileBtn) closeEditProfileBtn.addEventListener('click', () => {
        editProfileModal.classList.add('hidden');
        newAvatarFile = null;
    });

    if (editAvatarInput) {
        editAvatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                newAvatarFile = file;
                document.getElementById('edit-profile-avatar-preview').src = URL.createObjectURL(file);
            }
        });
    }

    if (submitEditProfileBtn) {
        submitEditProfileBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            
            const fName = document.getElementById('edit-firstname').value.trim();
            const lName = document.getElementById('edit-lastname').value.trim();
            const bio = document.getElementById('edit-bio').value.trim();
            const tabPref = document.getElementById('edit-tab-name').value;
            
            submitEditProfileBtn.textContent = "Зберігаємо...";
            submitEditProfileBtn.disabled = true;

            try {
                let newAvatarUrl = null;
                if (newAvatarFile) {
                    const formData = new FormData();
                    formData.append('file', newAvatarFile);
                    formData.append('upload_preset', 'sensuspace'); 
                    const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.secure_url) newAvatarUrl = data.secure_url;
                }

                const updateData = { firstName: fName, lastName: lName, bio: bio, tabPreference: tabPref };
                if (newAvatarUrl) updateData.avatarUrl = newAvatarUrl;
                
                await updateDoc(doc(db, "users", user.uid), updateData);
                editProfileModal.classList.add('hidden');
            } catch (err) { console.error(err); } 
            finally { submitEditProfileBtn.textContent = "Зберегти зміни"; submitEditProfileBtn.disabled = false; }
        });
    }

    const tabAllBtn = document.getElementById('profile-tab-all');
    const tabButtons = document.querySelectorAll('.profile-tabs-container > .profile-tab-btn');
    const tabProjectsBtn = tabButtons[0]; 
    const tabRepliesBtn = tabButtons[1];  
    const tab3Btn = document.getElementById('profile-tab-3');

    function clearActiveTabClasses() {
        if(tabAllBtn) tabAllBtn.classList.remove('active');
        if(tabProjectsBtn) tabProjectsBtn.classList.remove('active');
        if(tabRepliesBtn) tabRepliesBtn.classList.remove('active');
        if(tab3Btn) tab3Btn.classList.remove('active');
    }

    if (tabAllBtn) tabAllBtn.addEventListener('click', () => { currentActiveTab = 'all'; clearActiveTabClasses(); tabAllBtn.classList.add('active'); filterAndRenderProfileFeed(); });
    if (tabProjectsBtn) tabProjectsBtn.addEventListener('click', () => { currentActiveTab = 'projects'; clearActiveTabClasses(); tabProjectsBtn.classList.add('active'); filterAndRenderProfileFeed(); });
    if (tabRepliesBtn) tabRepliesBtn.addEventListener('click', () => { currentActiveTab = 'replies'; clearActiveTabClasses(); tabRepliesBtn.classList.add('active'); filterAndRenderProfileFeed(); });
    if (tab3Btn) tab3Btn.addEventListener('click', () => { currentActiveTab = 'tab3'; clearActiveTabClasses(); tab3Btn.classList.add('active'); filterAndRenderProfileFeed(); });

    async function ensureProfileUserCache(uid) {
        if (!profileUserCache[uid]) {
            profileUserCache[uid] = { name: "...", avatar: DEFAULT_AVATAR };
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const data = snap.data();
                let dName = data.login || data.username || 'Користувач';
                if (data.firstName || data.lastName) dName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                profileUserCache[uid] = { name: dName, avatar: data.avatarUrl || DEFAULT_AVATAR };
                filterAndRenderProfileFeed(); 
            }
        }
    }

    async function resolveProfileRepost(originalPostId, elementId) {
        try {
            const target = document.getElementById(elementId);
            if (!target) return;
            const snap = await getDoc(doc(db, "posts", originalPostId));
            if (!snap.exists()) { target.innerHTML = `<div style="border:1px solid var(--border-color); padding:10px; border-radius:12px; font-size:13px; color:var(--text-secondary);">Оригінал видалено</div>`; return; }
            
            const data = snap.data();
            await ensureProfileUserCache(data.authorId);
            const authorName = profileUserCache[data.authorId]?.name || 'Користувач';
            const authorAvatar = profileUserCache[data.authorId]?.avatar || DEFAULT_AVATAR;

            let mediaHTML = '';
            if (data.mediaUrl) {
                if (data.mediaType === 'image') mediaHTML = `<img src="${data.mediaUrl}" class="post-media" style="width:100%; border-radius:12px; margin-top:8px;">`;
                else mediaHTML = `<video src="${data.mediaUrl}" class="post-media" controls style="width:100%; border-radius:12px; margin-top:8px;"></video>`;
            }

            target.innerHTML = `
                <div style="border:1px solid var(--border-color); padding:12px; border-radius:12px; margin-top:6px; background:rgba(255,255,255,0.01);">
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                        <img class="user-profile-trigger" data-user-id="${data.authorId}" src="${authorAvatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; flex-shrink: 0; cursor:pointer;">
                        <span class="user-profile-trigger" data-user-id="${data.authorId}" style="font-size:13px; font-weight:600; color:var(--text-color); cursor:pointer;">${authorName}</span>
                    </div>
                    <p style="margin:0; font-size:14px;">${data.text || ''}</p>
                    ${mediaHTML}
                </div>
            `;
        } catch(e){}
    }

    function filterAndRenderProfileFeed() {
        const feedContainer = document.getElementById('my-profile-feed');
        if (!feedContainer || !auth.currentUser) return;
        feedContainer.innerHTML = '';
        let count = 0;
        const currentUserUid = auth.currentUser.uid;

        globalPostsSnapshot.forEach(pDoc => {
            const post = pDoc.data();
            const postId = pDoc.id;
            let shouldRender = false;

            if (currentActiveTab === 'all') {
                if (post.authorId === currentUserUid && post.type !== 'repost') shouldRender = true;
            } else if (currentActiveTab === 'projects') {
                if (post.authorId === currentUserUid && (post.category === 'В процесі' || post.category === 'Критика')) shouldRender = true;
            } else if (currentActiveTab === 'replies') {
                shouldRender = false; 
            } else if (currentActiveTab === 'tab3') {
                if (currentTabPreference === 'Збережене') {
                    if (savedPostsIds.includes(postId)) shouldRender = true;
                } else {
                    if (post.authorId === currentUserUid && post.type === 'repost') shouldRender = true;
                }
            }

            if (!shouldRender) return;
            count++;

            if (!profileUserCache[post.authorId] && post.authorId !== currentUserUid) ensureProfileUserCache(post.authorId);
            
            const isAuthor = post.authorId === currentUserUid;
            const currentName = isAuthor ? myProfileName : (profileUserCache[post.authorId]?.name || "...");
            const currentAvatar = isAuthor ? myProfileAvatar : (profileUserCache[post.authorId]?.avatar || DEFAULT_AVATAR);

            let timeString = 'Щойно';
            if (post.createdAt) timeString = post.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            let badgeHtml = '';
            if (post.category === 'В процесі') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">В процесі 🛠️</span>`;
            else if (post.category === 'Критика') badgeHtml = `<span style="font-size: 10px; background: var(--bg-color); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 700; color: var(--text-color);">Критика 💬</span>`;

            let myReaction = null;
            let anyReaction = null; 
            let totalReactions = 0;
            if (post.reactions) {
                for (const [emoji, usersArray] of Object.entries(post.reactions)) {
                    if (usersArray && usersArray.length > 0) {
                        totalReactions += usersArray.length;
                        anyReaction = emoji; 
                        if (usersArray.includes(currentUserUid)) myReaction = emoji;
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

            const iCommented = post.commentedBy && post.commentedBy.includes(currentUserUid);
            const commentFontWeight = iCommented ? '800' : '500';
            const commentTextColor = iCommented ? 'var(--text-color)' : 'var(--text-secondary)';
            const commentsCount = post.commentsCount || 0;

            const totalReposts = globalPostsSnapshot.filter(p => p.data().originalPostId === postId && p.data().type === "repost").length;
            const iReposted = globalPostsSnapshot.some(p => p.data().originalPostId === postId && p.data().authorId === currentUserUid && p.data().type === "repost");
            const repostFontWeight = iReposted ? '800' : '500';
            const repostTextColor = iReposted ? 'var(--text-color)' : 'var(--text-secondary)';

            const iShared = post.sharedBy && post.sharedBy.includes(currentUserUid);
            const shareFontWeight = iShared ? '800' : '500';
            const shareTextColor = iShared ? 'var(--text-color)' : 'var(--text-secondary)';
            const sharesCount = post.sharesCount || 0;

            let menuItems = `<button class="save-post-btn" data-post-id="${postId}" style="width:100%; text-align:left; padding:10px; background:none; border:none; color:var(--text-color); font-weight:600; font-size:14px; cursor:pointer; border-radius:8px;"><i class="bi bi-bookmark" style="margin-right:8px;"></i>Зберегти</button>`;
            if (isAuthor) {
                menuItems += `<button class="edit-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: var(--text-color); font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-pencil" style="margin-right: 8px;"></i>Редагувати</button>`;
                menuItems += `<button class="delete-post-btn" data-post-id="${postId}" style="width: 100%; text-align: left; padding: 10px; background: none; border: none; color: #ff4444; font-weight: 600; font-size: 14px; cursor: pointer; border-radius: 8px;"><i class="bi bi-trash" style="margin-right: 8px;"></i>Видалити</button>`;
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

            let bodyHTML = '';
            if (post.type === "repost") {
                const randId = `profile-repost-${postId}-${Math.floor(Math.random()*10000)}`;
                bodyHTML = `
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="bi bi-arrow-repeat" style="color:var(--accent-color);"></i> <span>репостнув(ла)</span>
                    </div>
                    <div id="${randId}"><div style="font-size:13px; color:var(--text-secondary); padding:10px;">Завантаження оригіналу...</div></div>
                `;
                setTimeout(() => resolveProfileRepost(post.originalPostId, randId), 50);
            } else {
                let mediaHTML = '';
                if (post.mediaUrl) {
                    if (post.mediaType === 'image') mediaHTML = `<img src="${post.mediaUrl}" class="post-media" style="width:100%; border-radius:12px; margin-top:8px;">`;
                    else mediaHTML = `<video src="${post.mediaUrl}" class="post-media" controls style="width:100%; border-radius:12px; margin-top:8px;"></video>`;
                }
                bodyHTML = `${post.text ? `<p class="post-text" style="margin: 0; font-size:15px; line-height:1.4;">${post.text}</p>` : ''}${mediaHTML}`;
            }

            postElement.innerHTML = `
                <div style="display: flex; gap: 12px; align-items: flex-start; width: 100%;">
                    <div class="avatar-wrapper user-profile-trigger" data-user-id="${post.authorId}" style="width: 40px; height: 40px; overflow: hidden; border-radius: 50%; cursor: pointer; flex-shrink: 0;">
                        <img src="${currentAvatar}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div class="post-body" style="flex: 1; min-width: 0;">
                        <div class="post-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="post-username user-profile-trigger" data-user-id="${post.authorId}" style="cursor: pointer; font-size: 15px; font-weight: 600; color: var(--text-color);">${currentName}</span>
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

        if (count === 0) feedContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 40px;">Тут поки порожньо</p>';
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    savedPostsIds = data.savedPosts || [];
                    currentTabPreference = data.tabPreference || 'Збережене';
                    
                    const nameEl = document.getElementById('my-profile-fullname');
                    if (data.firstName || data.lastName) {
                        myProfileName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                    } else {
                        myProfileName = data.login || data.username || 'Творець';
                    }
                    if (nameEl) nameEl.textContent = myProfileName;

                    const loginEl = document.getElementById('my-profile-login');
                    if (loginEl) {
                        loginEl.textContent = `@${data.login || data.username || 'user'}`;
                        loginEl.style.display = 'block';
                    }

                    myProfileAvatar = data.avatarUrl || DEFAULT_AVATAR;
                    const avatarEl = document.getElementById('my-profile-avatar');
                    if (avatarEl) avatarEl.src = myProfileAvatar;

                    const bioEl = document.getElementById('my-profile-bio');
                    if (bioEl) bioEl.textContent = data.bio || '';

                    if (tab3Btn) tab3Btn.textContent = currentTabPreference;
                    const editTab = document.getElementById('edit-tab-name');
                    if (editTab) editTab.value = currentTabPreference;

                    const followersEl = document.getElementById('my-followers-count');
                    if (followersEl) followersEl.textContent = (data.followers || []).length;
                    const followingEl = document.getElementById('my-following-count');
                    if (followingEl) followingEl.textContent = (data.following || []).length;

                    filterAndRenderProfileFeed();
                }
            });

            onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
                globalPostsSnapshot = snapshot.docs;
                filterAndRenderProfileFeed();
            });
        }
    });

    // Видалено глобальні обробники публікацій, оскільки їх вже обслуговує feed.js!
    document.addEventListener('click', async (e) => {
        if (e.target.closest('#profile-tab-all')) {
            const dp = document.getElementById('profile-all-dropdown');
            if(dp) dp.classList.toggle('hidden');
            return;
        }
        if (e.target.closest('.dropdown-item')) {
            const btn = e.target.closest('.dropdown-item');
            const textEl = document.getElementById('profile-tab-all-text');
            if(textEl) textEl.innerHTML = `Усе <span style="color: var(--text-secondary); font-size: 13px; font-weight: 600;">• ${btn.textContent}</span>`;
            document.getElementById('profile-all-dropdown').classList.add('hidden');
            return;
        }
        if (!e.target.closest('#profile-all-dropdown') && !e.target.closest('#profile-tab-all')) {
            const dropdown = document.getElementById('profile-all-dropdown');
            if(dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
        }
    });
});