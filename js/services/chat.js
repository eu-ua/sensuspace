import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

// Звук нового повідомлення
const messageSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');

document.addEventListener('DOMContentLoaded', () => {

    const chatRoomModal = document.getElementById('chat-room-modal');
    const closeChatRoomBtn = document.getElementById('close-chat-room-btn');
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const chatMessageInput = document.getElementById('chat-message-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    
    const chatMediaInput = document.getElementById('chat-media-input');
    const chatAttachBtn = document.getElementById('chat-attach-btn');
    const chatMediaPreviewContainer = document.getElementById('chat-media-preview-container');
    const chatMediaName = document.getElementById('chat-media-name');
    const chatRemoveMediaBtn = document.getElementById('chat-remove-media-btn');
    
    const chatSearchBtn = document.getElementById('chat-search-btn');
    const chatSearchBar = document.getElementById('chat-search-bar');
    const chatInnerSearchInput = document.getElementById('chat-inner-search-input');

    const chatActionPreviewContainer = document.getElementById('chat-action-preview-container');
    const chatActionTitle = document.getElementById('chat-action-title');
    const chatActionText = document.getElementById('chat-action-text');
    const chatCancelActionBtn = document.getElementById('chat-cancel-action-btn');

    let currentChatUserId = null;
    let chatUnsubscribe = null; 
    let chatHeaderUnsubscribe = null; 
    let currentChatFile = null; 
    let editingMessageId = null; 
    let replyingToMessage = null; 

    // Функція оновлення бейджа на навігації
    function updateNavBadge(count) {
        const navBtn = document.querySelector('.nav-btn[data-screen="screen-messages"]');
        if (navBtn) {
            let badge = navBtn.querySelector('.notif-badge');
            if (count > 0) {
                if (!badge) {
                    navBtn.style.position = 'relative';
                    badge = document.createElement('div');
                    badge.className = 'notif-badge';
                    badge.style = 'position:absolute; top:2px; right:8px; background:#ff4444; color:#fff; font-size:10px; font-weight:bold; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; border: 2px solid var(--bg-color); pointer-events: none;';
                    navBtn.appendChild(badge);
                }
                badge.textContent = count > 9 ? '9+' : count;
            } else if (badge) {
                badge.remove();
            }
        }
    }

    if (closeChatRoomBtn) closeChatRoomBtn.addEventListener('click', () => {
        document.querySelector('.nav-btn.active')?.click(); 
        if (chatUnsubscribe) chatUnsubscribe(); 
        if (chatHeaderUnsubscribe) chatHeaderUnsubscribe();
        window.currentChatRoomId = null;
    });

    if (chatCancelActionBtn) {
        chatCancelActionBtn.addEventListener('click', () => {
            editingMessageId = null; replyingToMessage = null;
            chatActionPreviewContainer.classList.add('hidden');
            chatMessageInput.value = ''; sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
        });
    }

    if (chatSearchBtn) {
        chatSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chatSearchBar.classList.toggle('hidden');
            if (!chatSearchBar.classList.contains('hidden')) chatInnerSearchInput.focus();
            else { chatInnerSearchInput.value = ''; document.querySelectorAll('.chat-message').forEach(msg => msg.style.display = 'flex'); }
        });
    }

    if (chatInnerSearchInput) {
        chatInnerSearchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.chat-message').forEach(msg => {
                const textEl = msg.querySelector('.msg-text');
                const text = textEl ? textEl.textContent.toLowerCase() : '';
                msg.style.display = text.includes(q) ? 'flex' : 'none';
            });
        });
    }

    if (chatAttachBtn) chatAttachBtn.addEventListener('click', () => chatMediaInput.click());
    if (chatMediaInput) {
        chatMediaInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            currentChatFile = file;
            if (chatMediaName) chatMediaName.textContent = file.name;
            if (chatMediaPreviewContainer) chatMediaPreviewContainer.classList.remove('hidden');
        });
    }
    if (chatRemoveMediaBtn) {
        chatRemoveMediaBtn.addEventListener('click', () => {
            currentChatFile = null; chatMediaInput.value = '';
            if (chatMediaPreviewContainer) chatMediaPreviewContainer.classList.add('hidden');
        });
    }

    function getChatRoomId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

    function linkify(text) {
        return text.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" style="text-decoration: underline; font-weight: 500; color: inherit;">${url}</a>`);
    }

    window.openChatWithUser = async (targetUserId, targetUserName, targetUserAvatar) => {
        const currentUser = auth.currentUser;
        if (!currentUser) { await window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб писати." }); return; }
        if (currentUser.uid === targetUserId) { await window.showCustomModal({ title: "Увага", message: "Не можна писати собі." }); return; }

        currentChatUserId = targetUserId;
        const roomId = getChatRoomId(currentUser.uid, targetUserId);
        window.currentChatRoomId = roomId;
        
        const chatRoomNameEl = document.getElementById('chat-room-name');
        const chatRoomAvatarEl = document.getElementById('chat-room-avatar');
        
        chatRoomNameEl.textContent = targetUserName || "...";
        chatRoomNameEl.classList.add('user-profile-trigger');
        chatRoomNameEl.dataset.userId = targetUserId; chatRoomNameEl.style.cursor = 'pointer'; 

        chatRoomAvatarEl.src = targetUserAvatar || DEFAULT_AVATAR;
        chatRoomAvatarEl.classList.add('user-profile-trigger');
        chatRoomAvatarEl.dataset.userId = targetUserId; chatRoomAvatarEl.style.cursor = 'pointer'; 
        
        if (chatHeaderUnsubscribe) chatHeaderUnsubscribe();
        chatHeaderUnsubscribe = onSnapshot(doc(db, "users", targetUserId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                chatRoomNameEl.textContent = data.nickname || data.username || data.login || targetUserName || "...";
                chatRoomAvatarEl.src = data.avatarUrl || DEFAULT_AVATAR;
            }
        });

        // Позначаємо чат як ПРОЧИТАНИЙ при відкритті
        await updateDoc(doc(db, "chats", roomId), {
            [`readStatus.${currentUser.uid}`]: true
        }).catch(()=>{});

        if (chatSearchBar) chatSearchBar.classList.add('hidden');
        if (chatInnerSearchInput) chatInnerSearchInput.value = '';

        document.querySelectorAll('.app-screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
        chatRoomModal.classList.add('active'); chatRoomModal.classList.remove('hidden');
        
        chatMessagesContainer.innerHTML = ''; 

        if (chatUnsubscribe) chatUnsubscribe(); 
        chatUnsubscribe = onSnapshot(query(collection(db, "chats", roomId, "messages"), orderBy("timestamp", "asc")), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" || change.type === "modified") {
                    const msgData = change.doc.data();
                    const msgId = change.doc.id; 
                    const isMine = msgData.senderId === currentUser.uid;
                    
                    let msgDiv = document.querySelector(`.chat-message[data-message-id="${msgId}"]`);
                    let isNew = false;
                    if (!msgDiv) {
                        msgDiv = document.createElement('div');
                        msgDiv.className = `chat-message ${isMine ? 'sent' : 'received'}`;
                        msgDiv.dataset.messageId = msgId; isNew = true;
                    }

                    let timeString = msgData.timestamp ? msgData.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    let mediaHtml = '', isMediaOnly = false;

                    if (msgData.mediaUrl) {
                        if (!msgData.text) isMediaOnly = true; 
                        if (msgData.mediaType === 'image') mediaHtml = `<img src="${msgData.mediaUrl}" style="max-width: 100%; border-radius: ${isMediaOnly ? '20px' : '12px'}; cursor: pointer; display: block;" onclick="window.open('${msgData.mediaUrl}', '_blank')">`;
                        else if (msgData.mediaType === 'video') mediaHtml = `<video src="${msgData.mediaUrl}" controls style="max-width: 100%; border-radius: ${isMediaOnly ? '20px' : '12px'}; display: block;"></video>`;
                    }

                    let textHtml = msgData.text ? `<div class="msg-text">${linkify(msgData.text)}</div>` : '';
                    let editedHtml = msgData.editedAt ? `<span style="font-size: 10px; opacity: 0.5; margin-left: 5px;">(змінено)</span>` : '';

                    let replyHtml = msgData.replyTo ? `<div style="font-size: 12px; opacity: 0.8; margin-bottom: 6px; border-left: 2px solid currentColor; padding-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${msgData.replyTo.sender}</strong><br>${msgData.replyTo.text}</div>` : '';

                    let reactionDisplayHtml = msgData.reaction ? `<div style="position: absolute; bottom: -12px; ${isMine ? 'left: 10px;' : 'right: 10px;'} background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 2px 6px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 5;">${msgData.reaction}</div>` : '';

                    const senderNameStr = isMine ? 'Ви' : document.getElementById('chat-room-name').textContent;
                    const safeTextStr = (msgData.text || 'Фото').replace(/"/g, '&quot;');

                    let actionsHtml = `
                        <div class="msg-actions">
                            <button class="react-btn"><i class="bi bi-emoji-smile"></i></button>
                            <div class="reaction-picker hidden" style="position: absolute; bottom: 35px; ${isMine ? 'right: -30px;' : 'left: -30px;'} background: var(--bg-color); border-radius: 20px; padding: 8px 12px; display:flex; gap:12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 1px solid var(--border-color); z-index: 100;">
                                <span class="emoji-btn" data-emoji="❤️" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">❤️</span>
                                <span class="emoji-btn" data-emoji="👍" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">👍</span>
                                <span class="emoji-btn" data-emoji="🔥" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">🔥</span>
                                <span class="emoji-btn" data-emoji="😂" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">😂</span>
                            </div>
                        </div>
                    `;

                    let footerHtml = `<div style="display: flex; justify-content: ${isMine ? 'flex-end' : 'flex-start'}; align-items: center; gap: 8px; margin-top: ${isMediaOnly ? '6px' : '2px'}; padding: 0 4px;"><span class="chat-message-time" style="margin: 0; color: ${isMediaOnly ? 'var(--text-secondary)' : 'inherit'}; opacity: ${isMediaOnly ? '1' : '0.6'};">${timeString}${editedHtml}</span></div>`;

                    msgDiv.innerHTML = `${reactionDisplayHtml}${replyHtml}${mediaHtml}${textHtml}${footerHtml}${actionsHtml}`;
                    
                    if (isMediaOnly) {
                        msgDiv.style.setProperty('background-color', 'transparent', 'important');
                        msgDiv.style.setProperty('padding', '0', 'important');
                        msgDiv.style.setProperty('border', 'none', 'important');
                    } else {
                        msgDiv.style.removeProperty('background-color'); msgDiv.style.removeProperty('padding'); msgDiv.style.removeProperty('border');
                    }

                    msgDiv.addEventListener('contextmenu', (e) => {
                        e.preventDefault(); 
                        
                        const ctxMenu = document.getElementById('chat-context-menu');
                        if(!ctxMenu) return;
                        
                        ctxMenu.innerHTML = ''; 
                        
                        const now = Date.now();
                        const msgTime = msgData.timestamp ? msgData.timestamp.toMillis() : now;
                        const diffMinutes = (now - msgTime) / (1000 * 60);
                        const isEditable = isMine && msgData.text && diffMinutes <= 30;

                        const btnReply = document.createElement('button');
                        btnReply.innerHTML = '<i class="bi bi-reply"></i> Відповісти';
                        btnReply.onclick = () => {
                            editingMessageId = null;
                            replyingToMessage = { id: msgId, sender: senderNameStr, text: safeTextStr };
                            chatActionTitle.textContent = "Відповідь: " + senderNameStr;
                            chatActionText.textContent = safeTextStr;
                            chatActionPreviewContainer.classList.remove('hidden');
                            sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>'; chatMessageInput.focus();
                            ctxMenu.classList.add('hidden');
                        };
                        ctxMenu.appendChild(btnReply);

                        if (isEditable) {
                            const btnEdit = document.createElement('button');
                            btnEdit.innerHTML = '<i class="bi bi-pencil"></i> Редагувати';
                            btnEdit.onclick = () => {
                                replyingToMessage = null; editingMessageId = msgId;
                                chatActionTitle.textContent = "Редагування"; chatActionText.textContent = msgData.text;
                                chatActionPreviewContainer.classList.remove('hidden');
                                chatMessageInput.value = msgData.text || ''; sendMessageBtn.innerHTML = '<i class="bi bi-check-lg"></i>'; chatMessageInput.focus();
                                ctxMenu.classList.add('hidden');
                            };
                            ctxMenu.appendChild(btnEdit);
                        }

                        if (isMine) {
                            const btnDel = document.createElement('button');
                            btnDel.innerHTML = '<i class="bi bi-trash"></i> Видалити';
                            btnDel.style.color = '#ff4444';
                            btnDel.onclick = async () => {
                                ctxMenu.classList.add('hidden');
                                const confirmDelete = await window.showCustomModal({ title: "Видалення", message: "Видалити це повідомлення?", type: "confirm" });
                                if (confirmDelete) await deleteDoc(doc(db, "chats", roomId, "messages", msgId));
                            };
                            ctxMenu.appendChild(btnDel);
                        }

                        let x = e.clientX;
                        let y = e.clientY;
                        if (x + 160 > window.innerWidth) x -= 160;
                        if (y + 150 > window.innerHeight) y -= 150;
                        
                        ctxMenu.style.left = `${x}px`;
                        ctxMenu.style.top = `${y}px`;
                        ctxMenu.classList.remove('hidden');
                    });

                    const reactBtn = msgDiv.querySelector('.react-btn');
                    const reactionPicker = msgDiv.querySelector('.reaction-picker');
                    if (reactBtn && reactionPicker) {
                        reactBtn.addEventListener('click', (e) => {
                            e.stopPropagation(); 
                            document.querySelectorAll('.reaction-picker').forEach(p => { if (p !== reactionPicker) p.classList.add('hidden'); });
                            reactionPicker.classList.toggle('hidden');
                        });
                        msgDiv.querySelectorAll('.emoji-btn').forEach(btn => {
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                const newReaction = msgData.reaction === btn.dataset.emoji ? null : btn.dataset.emoji;
                                await updateDoc(doc(db, "chats", roomId, "messages", msgId), { reaction: newReaction });
                                reactionPicker.classList.add('hidden');
                            });
                        });
                    }

                    if (isNew) {
                        chatMessagesContainer.appendChild(msgDiv);
                        chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' });
                    }
                }
                
                if (change.type === "removed") {
                    const msgElement = document.querySelector(`.chat-message[data-message-id="${change.doc.id}"]`);
                    if (msgElement) msgElement.remove();
                }
            });

            // Якщо ми в чаті і приходить нове повідомлення - позначаємо прочитаним одразу
            if (!snapshot.empty) {
                const lastDoc = snapshot.docs[snapshot.docs.length - 1].data();
                if (lastDoc.senderId !== currentUser.uid) {
                    updateDoc(doc(db, "chats", window.currentChatRoomId), {
                        [`readStatus.${currentUser.uid}`]: true
                    }).catch(()=>{});
                }
            }
        });
    };

    const openChatListSearchBtn = document.getElementById('open-chat-search-btn');
    const chatSearchContainer = document.getElementById('chat-search-container');
    const followersSearchInput = document.getElementById('chat-followers-search');
    const followersResults = document.getElementById('chat-followers-results');

    if (openChatListSearchBtn) {
        openChatListSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            chatSearchContainer.classList.toggle('hidden');
            if (!chatSearchContainer.classList.contains('hidden')) {
                followersSearchInput.focus();
            } else {
                followersSearchInput.value = '';
                followersResults.classList.add('hidden');
                followersResults.innerHTML = '';
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.reaction-picker') && !e.target.closest('.react-btn')) {
            document.querySelectorAll('.reaction-picker').forEach(p => p.classList.add('hidden'));
        }

        const ctxMenu = document.getElementById('chat-context-menu');
        if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
            ctxMenu.classList.add('hidden');
        }

        if (chatSearchContainer && !chatSearchContainer.classList.contains('hidden')) {
            if (!chatSearchContainer.contains(e.target) && (!openChatListSearchBtn || !openChatListSearchBtn.contains(e.target)) && (!followersResults || !followersResults.contains(e.target))) {
                chatSearchContainer.classList.add('hidden');
                followersSearchInput.value = '';
                if (followersResults) {
                    followersResults.classList.add('hidden');
                    followersResults.innerHTML = '';
                }
            }
        }

        if (chatSearchBar && !chatSearchBar.classList.contains('hidden')) {
            if (!chatSearchBar.contains(e.target) && (!chatSearchBtn || !chatSearchBtn.contains(e.target))) {
                chatSearchBar.classList.add('hidden');
                if (chatInnerSearchInput) chatInnerSearchInput.value = '';
                document.querySelectorAll('.chat-message').forEach(msg => msg.style.display = 'flex');
            }
        }
    });

    async function sendMessage() {
        const text = chatMessageInput.value.trim();
        const currentUser = auth.currentUser;
        
        if ((!text && !currentChatFile) || !currentUser || !currentChatUserId) return;
        const roomId = getChatRoomId(currentUser.uid, currentChatUserId);
        
        if (editingMessageId) {
            if (!text) return; 
            const originalBtnHtml = sendMessageBtn.innerHTML;
            sendMessageBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
            try {
                await updateDoc(doc(db, "chats", roomId, "messages", editingMessageId), { text: text, editedAt: serverTimestamp() });
                
                await setDoc(doc(db, "chats", roomId), {
                    lastMessage: text,
                    timestamp: serverTimestamp(),
                    participants: [currentUser.uid, currentChatUserId]
                }, { merge: true });

                editingMessageId = null; chatActionPreviewContainer.classList.add('hidden'); chatMessageInput.value = ''; sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
            } catch (error) { console.error("Помилка редагування:", error); }
            return;
        }
        
        const originalBtnHtml = sendMessageBtn.innerHTML;
        sendMessageBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
        sendMessageBtn.disabled = true; chatMessageInput.disabled = true;
        if (currentChatFile) { chatAttachBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>'; chatAttachBtn.disabled = true; }
        
        try {
            let mediaUrl = null, mediaType = null;
            if (currentChatFile) {
                const formData = new FormData(); formData.append('file', currentChatFile); formData.append('upload_preset', 'sensuspace'); 
                const response = await fetch(`https://api.cloudinary.com/v1_1/dabzs7jkc/auto/upload`, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.secure_url) { mediaUrl = data.secure_url; mediaType = data.resource_type; } else throw new Error('Хмара');
            }

            let msgPayload = { text: text, mediaUrl: mediaUrl, mediaType: mediaType, senderId: currentUser.uid, timestamp: serverTimestamp() };
            if (replyingToMessage) msgPayload.replyTo = replyingToMessage;

            await addDoc(collection(db, "chats", roomId, "messages"), msgPayload);

            // Оновлюємо статус: Я прочитав, Співрозмовник - ні
            await setDoc(doc(db, "chats", roomId), {
                participants: [currentUser.uid, currentChatUserId],
                lastMessage: text || (mediaType === 'image' ? "📷 Фото" : "🎥 Відео"),
                lastMessageSenderId: currentUser.uid,
                [`readStatus.${currentChatUserId}`]: false,
                [`readStatus.${currentUser.uid}`]: true,
                timestamp: serverTimestamp()
            }, { merge: true });

            currentChatFile = null;
            if (chatMediaInput) chatMediaInput.value = '';
            if (chatMediaPreviewContainer) chatMediaPreviewContainer.classList.add('hidden');
            chatMessageInput.value = ''; replyingToMessage = null; chatActionPreviewContainer.classList.add('hidden');
            
            if (chatInnerSearchInput && chatInnerSearchInput.value) {
                chatInnerSearchInput.value = ''; document.querySelectorAll('.chat-message').forEach(m => m.style.display = 'flex');
            }
        } catch (error) {
            console.error(error); await window.showCustomModal({ title: "Помилка", message: "Не вдалося відправити повідомлення або файл." });
        } finally {
            sendMessageBtn.innerHTML = originalBtnHtml; sendMessageBtn.disabled = false;
            chatAttachBtn.innerHTML = '<i class="bi bi-paperclip"></i>'; chatAttachBtn.disabled = false;
            chatMessageInput.disabled = false; chatMessageInput.focus();
        }
    }

    if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);
    if (chatMessageInput) chatMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    if (followersSearchInput && followersResults) {
        followersSearchInput.addEventListener('input', async (e) => {
            const qText = e.target.value.toLowerCase().trim();
            followersResults.innerHTML = '';
            
            if (!qText) {
                followersResults.classList.add('hidden');
                return;
            }
            
            followersResults.classList.remove('hidden');
            
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) return;
                
                const myDoc = await getDoc(doc(db, "users", currentUser.uid));
                const following = myDoc.data()?.following || [];
                
                if (following.length === 0) {
                    followersResults.innerHTML = '<p style="text-align:center; color: var(--text-secondary); font-size: 13px;">Ви ще ні на кого не підписані</p>';
                    return;
                }

                const usersSnap = await getDocs(collection(db, "users"));
                let found = false;
                
                usersSnap.forEach(snap => {
                    const u = snap.data();
                    const uId = snap.id;
                    
                    if (following.includes(uId)) {
                        const name = (u.nickname || u.username || u.login || "Користувач").toLowerCase();
                        if (name.includes(qText)) {
                            found = true;
                            const avatar = u.avatarUrl || DEFAULT_AVATAR;
                            const displayName = u.nickname || u.username || u.login || "Користувач";
                            
                            const div = document.createElement('div');
                            div.className = 'chat-item';
                            div.style.border = '1px dashed var(--accent-color)';
                            div.innerHTML = `
                                <img src="${avatar}" class="chat-avatar" alt="Avatar">
                                <div class="chat-info">
                                    <h4 class="chat-name">${displayName}</h4>
                                    <p class="chat-last-message" style="color: var(--accent-color); font-weight: 500;">Почати діалог</p>
                                </div>
                            `;
                            div.addEventListener('click', () => {
                                followersSearchInput.value = '';
                                followersResults.classList.add('hidden');
                                if (chatSearchContainer) chatSearchContainer.classList.add('hidden'); 
                                window.openChatWithUser(uId, displayName, avatar);
                            });
                            followersResults.appendChild(div);
                        }
                    }
                });
                
                if (!found) followersResults.innerHTML = '<p style="text-align:center; color: var(--text-secondary); font-size: 13px;">Нікого не знайдено</p>';
                
            } catch(error) { console.error(error); }
        });
    }

    const dynamicChatList = document.getElementById('dynamic-chat-list');
    const localUserCache = {}; 
    let initialChatLoad = true;

    if (dynamicChatList) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                const qChats = query(collection(db, "chats"), where("participants", "array-contains", user.uid));
                
                onSnapshot(qChats, async (snapshot) => {
                    dynamicChatList.innerHTML = ''; 
                    let unreadTotalCount = 0;
                    let playSound = false;
                    
                    if (snapshot.empty) { 
                        dynamicChatList.innerHTML = '<div style="text-align:center; padding: 40px 20px;"><i class="bi bi-chat-dots" style="font-size: 40px; color: var(--text-secondary); opacity: 0.5;"></i><p style="color: var(--text-secondary); margin-top: 15px; font-size: 15px;">Тут з\'являться ваші діалоги.<br>Натисніть на лупу, щоб знайти друзів.</p></div>'; 
                        updateNavBadge(0);
                        return; 
                    }
                    
                    let chatsArray = [];
                    snapshot.forEach(docSnap => chatsArray.push({ id: docSnap.id, ...docSnap.data() }));
                    chatsArray.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

                    // Перевіряємо, чи потрібно програвати звук нового повідомлення
                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'modified' || change.type === 'added') {
                            const d = change.doc.data();
                            if (d.readStatus && d.readStatus[user.uid] === false && d.lastMessageSenderId !== user.uid) {
                                // Якщо повідомлення нове (не старіше 10 сек) і це не перше завантаження
                                if (!initialChatLoad && d.timestamp && (Date.now() - d.timestamp.toMillis() < 10000)) {
                                    playSound = true;
                                }
                            }
                        }
                    });
                    
                    for (const chatData of chatsArray) {
                        if (!chatData.participants) continue;
                        const otherUserId = chatData.participants.find(id => id !== user.uid);
                        if (!otherUserId) continue;

                        const isUnread = chatData.readStatus && chatData.readStatus[user.uid] === false && chatData.lastMessageSenderId !== user.uid;
                        if (isUnread) unreadTotalCount++;

                        if (!localUserCache[otherUserId]) {
                            const otherUserSnap = await getDoc(doc(db, "users", otherUserId));
                            localUserCache[otherUserId] = otherUserSnap.exists() ? otherUserSnap.data() : { nickname: "Видалений акаунт" };
                        }
                        
                        const uData = localUserCache[otherUserId];
                        const avatar = uData.avatarUrl || DEFAULT_AVATAR;
                        const name = uData.nickname || uData.username || uData.login || "Користувач";
                        const lastMsg = chatData.lastMessage || '...';
                        
                        // Червона крапка непрочитаного повідомлення (маркер)
                        const unreadDot = isUnread ? `<div style="position: absolute; left: 40px; top: 0px; width: 12px; height: 12px; background: #ff4444; border: 2px solid var(--bg-color); border-radius: 50%; z-index: 5;"></div>` : '';

                        const chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.style.position = 'relative'; 
                        
                        chatItem.innerHTML = `
                            <div style="position:relative; width: 50px; height: 50px; flex-shrink: 0;">
                                <img src="${avatar}" class="chat-avatar" alt="Avatar" style="width: 100%; height: 100%; margin:0;">
                                ${unreadDot}
                            </div>
                            <div class="chat-info" style="flex: 1; min-width: 0; padding-right: 30px;">
                                <h4 class="chat-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isUnread ? '800' : '600'}; color: var(--text-color);">${name}</h4>
                                <p class="chat-last-message" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isUnread ? 'var(--text-color)' : 'var(--text-secondary)'}; font-weight: ${isUnread ? '600' : '400'};">${lastMsg}</p>
                            </div>
                            <button class="delete-chat-btn" style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #ff4444; font-size: 18px; cursor: pointer; opacity: 0.7; padding: 10px; z-index: 10;"><i class="bi bi-trash"></i></button>
                        `;
                        
                        chatItem.addEventListener('click', async (e) => {
                            if (e.target.closest('.delete-chat-btn')) {
                                const confirmDelete = await window.showCustomModal({ title: "Видалення", message: "Ви впевнені, що хочете видалити цей чат зі списку?", type: "confirm" });
                                if (confirmDelete) await deleteDoc(doc(db, "chats", chatData.id));
                                return;
                            }
                            window.openChatWithUser(otherUserId, name, avatar);
                        });
                        
                        dynamicChatList.appendChild(chatItem);
                    }

                    if (playSound) messageSound.play().catch(e => console.log(e));
                    initialChatLoad = false;
                    
                    updateNavBadge(unreadTotalCount);
                });
            }
        });
    }
});