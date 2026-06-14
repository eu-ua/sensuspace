import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, getDoc, setDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='12' fill='%23e0e0e0'/><path d='M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' fill='%23999999'/></svg>";

const messageSound = new Audio('../../sounds/message.mp3'); 

let audioUnlocked = false;
document.body.addEventListener('click', () => {
    if (!audioUnlocked) {
        messageSound.play().then(() => {
            messageSound.pause();
            messageSound.currentTime = 0;
        }).catch(()=>{});
        audioUnlocked = true;
    }
}, { once: true });

document.addEventListener('DOMContentLoaded', () => {

    // --- МАГІЯ 1: СТВОРЕННЯ КОНТЕКСТНОГО МЕНЮ ---
    if (!document.getElementById('chat-context-menu')) {
        const ctxHTML = `
            <div id="chat-context-menu" class="hidden" style="position: fixed; background: var(--bg-color, #1e1e1e); border: 1px solid var(--border-color, #2d2d2d); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 10000; display: flex; flex-direction: column; padding: 6px; min-width: 160px;"></div>
        `;
        document.body.insertAdjacentHTML('beforeend', ctxHTML);
    }

    // --- МАГІЯ 2: ВИРІВНЮВАННЯ ВІКНА ВВОДУ ТА ДОДАВАННЯ ПАНЕЛЕЙ ---
    let chatActionPreviewContainer = document.getElementById('chat-action-preview-container');
    let chatMediaPreviewContainer = document.getElementById('chat-media-preview-container');
    const inputArea = document.querySelector('.chat-room-input-area');
    const chatMessageInput = document.getElementById('chat-message-input');

    if (inputArea) {
        inputArea.style.width = '100%';
        inputArea.style.boxSizing = 'border-box';
        inputArea.style.flexShrink = '0';
        
        if (chatMessageInput) {
            chatMessageInput.style.flex = '1';
            chatMessageInput.style.width = '100%';
            chatMessageInput.style.backgroundColor = 'var(--bg-secondary, transparent)'; // Щоб не був чорним
        }

        if (!chatActionPreviewContainer) {
            const previewHTML = `
                <div id="chat-action-preview-container" class="hidden" style="width: 100%; box-sizing: border-box; padding: 10px 15px; background: var(--bg-secondary, #1e1e1e); border-top: 1px solid var(--border-color, #2d2d2d); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div style="flex: 1; overflow: hidden; border-left: 3px solid var(--accent-color); padding-left: 10px;">
                        <div id="chat-action-title" style="font-size: 13px; font-weight: 700; color: var(--accent-color, #fff); margin-bottom: 2px;">Редагування</div>
                        <div id="chat-action-text" style="font-size: 14px; color: var(--text-secondary, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Текст...</div>
                    </div>
                    <button id="chat-cancel-action-btn" class="icon-btn" style="color: var(--text-secondary, #888); background: none; border: none; font-size: 20px; cursor: pointer; padding: 5px;"><i class="bi bi-x-lg"></i></button>
                </div>
                <div id="chat-media-preview-container" class="hidden" style="width: 100%; box-sizing: border-box; padding: 10px 15px; background: var(--bg-secondary, #1e1e1e); border-top: 1px solid var(--border-color, #2d2d2d); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                        <i class="bi bi-image" style="color: var(--accent-color, #fff); font-size: 20px;"></i>
                        <span id="chat-media-name" style="font-size: 14px; color: var(--text-secondary, #888); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Файл</span>
                    </div>
                    <button id="chat-remove-media-btn" class="icon-btn" style="color: #ff4444; background: none; border: none; font-size: 20px; cursor: pointer; padding: 5px;"><i class="bi bi-trash"></i></button>
                </div>
            `;
            inputArea.insertAdjacentHTML('beforebegin', previewHTML);
        }
    }

    chatActionPreviewContainer = document.getElementById('chat-action-preview-container');
    const chatActionTitle = document.getElementById('chat-action-title');
    const chatActionText = document.getElementById('chat-action-text');
    const chatCancelActionBtn = document.getElementById('chat-cancel-action-btn');
    chatMediaPreviewContainer = document.getElementById('chat-media-preview-container');
    const chatMediaName = document.getElementById('chat-media-name');
    const chatRemoveMediaBtn = document.getElementById('chat-remove-media-btn');

    const chatRoomModal = document.getElementById('chat-room-modal');
    const closeChatRoomBtn = document.getElementById('close-chat-room-btn');
    const chatMessagesContainer = document.getElementById('chat-messages-container');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const chatMediaInput = document.getElementById('chat-media-input');
    const chatAttachBtn = document.getElementById('chat-attach-btn');
    const chatSearchBtn = document.getElementById('chat-search-btn');
    const chatSearchBar = document.getElementById('chat-search-bar');
    const chatInnerSearchInput = document.getElementById('chat-inner-search-input');

    let currentChatUserId = null;
    let chatUnsubscribe = null; 
    let chatHeaderUnsubscribe = null; 
    let currentChatFile = null; 
    let editingMessageId = null; 
    let replyingToMessage = null; 

    // --- ФУНКЦІЯ РЕНДЕРУ РЕПОСТУ В ЧАТІ ---
    async function resolveAndRenderSharedPost(postId, containerId) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            const snap = await getDoc(doc(db, "posts", postId));
            const contentEl = container.querySelector('.shared-post-content');
            if (!snap.exists()) {
                contentEl.innerHTML = "Публікація недоступна або видалена";
                return;
            }
            const data = snap.data();
            
            const authorSnap = await getDoc(doc(db, "users", data.authorId));
            const authorName = authorSnap.exists() ? (authorSnap.data().nickname || authorSnap.data().username || "Користувач") : "Користувач";
            const authorAvatar = authorSnap.exists() ? (authorSnap.data().avatarUrl || DEFAULT_AVATAR) : DEFAULT_AVATAR;

            let mediaHtml = '';
            if (data.mediaUrl) {
                if (data.mediaType === 'image') mediaHtml = `<img src="${data.mediaUrl}" style="width: 100%; border-radius: 8px; margin-top: 8px;">`;
                else if (data.mediaType === 'video') mediaHtml = `<video src="${data.mediaUrl}" style="width: 100%; border-radius: 8px; margin-top: 8px;" controls></video>`;
            }

            contentEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${authorAvatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                    <span style="font-weight: 600; color: var(--text-color); font-size: 13px;">${authorName}</span>
                </div>
                <p style="margin: 0; color: var(--text-color); line-height: 1.3; font-size: 14px;">${data.text || ''}</p>
                ${mediaHtml}
            `;
        } catch (e) {
            console.error(e);
        }
    }

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
            if (chatActionPreviewContainer) chatActionPreviewContainer.classList.add('hidden');
            if (chatMessageInput) chatMessageInput.value = ''; 
            if (sendMessageBtn) sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
        });
    }

    if (chatSearchBtn) {
        chatSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (chatSearchBar) chatSearchBar.classList.toggle('hidden');
            if (chatSearchBar && !chatSearchBar.classList.contains('hidden')) {
                if (chatInnerSearchInput) chatInnerSearchInput.focus();
            } else { 
                if (chatInnerSearchInput) chatInnerSearchInput.value = ''; 
                document.querySelectorAll('.chat-message').forEach(msg => msg.style.display = 'flex'); 
            }
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
    function linkify(text) { return text.replace(/(https?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank" style="text-decoration: underline; font-weight: 500; color: inherit;">${url}</a>`); }

    window.openChatWithUser = async (targetUserId, targetUserName, targetUserAvatar) => {
        const currentUser = auth.currentUser;
        if (!currentUser) { await window.showCustomModal({ title: "Увага", message: "Увійдіть, щоб писати." }); return; }
        if (currentUser.uid === targetUserId) { await window.showCustomModal({ title: "Увага", message: "Не можна писати собі." }); return; }

        currentChatUserId = targetUserId;
        const roomId = getChatRoomId(currentUser.uid, targetUserId);
        window.currentChatRoomId = roomId;
        
        const chatRoomNameEl = document.getElementById('chat-room-name');
        const chatRoomAvatarEl = document.getElementById('chat-room-avatar');
        
        if (chatRoomNameEl) {
            chatRoomNameEl.textContent = targetUserName || "...";
            chatRoomNameEl.classList.add('user-profile-trigger');
            chatRoomNameEl.dataset.userId = targetUserId; chatRoomNameEl.style.cursor = 'pointer'; 
        }

        if (chatRoomAvatarEl) {
            chatRoomAvatarEl.src = targetUserAvatar || DEFAULT_AVATAR;
            chatRoomAvatarEl.classList.add('user-profile-trigger');
            chatRoomAvatarEl.dataset.userId = targetUserId; chatRoomAvatarEl.style.cursor = 'pointer'; 
        }
        
        if (chatHeaderUnsubscribe) chatHeaderUnsubscribe();
        chatHeaderUnsubscribe = onSnapshot(doc(db, "users", targetUserId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (chatRoomNameEl) chatRoomNameEl.textContent = data.nickname || data.username || data.login || targetUserName || "...";
                if (chatRoomAvatarEl) chatRoomAvatarEl.src = data.avatarUrl || DEFAULT_AVATAR;
            }
        });

        await updateDoc(doc(db, "chats", roomId), { [`readStatus.${currentUser.uid}`]: true }).catch(()=>{});

        if (chatSearchBar) chatSearchBar.classList.add('hidden');
        if (chatInnerSearchInput) chatInnerSearchInput.value = '';

        document.querySelectorAll('.app-screen').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
        if (chatRoomModal) { chatRoomModal.classList.add('active'); chatRoomModal.classList.remove('hidden'); }
        
        if (chatMessagesContainer) {
            chatMessagesContainer.innerHTML = ''; 
            chatMessagesContainer.style.flex = '1';
            chatMessagesContainer.style.width = '100%';
        }

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
                        // ВАЖЛИВО: overflow: visible щоб реакції виходили за межі
                        msgDiv.style.overflow = 'visible';
                        msgDiv.style.position = 'relative';
                        msgDiv.dataset.messageId = msgId; isNew = true;
                    }

                    let timeString = msgData.timestamp ? msgData.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    let mediaHtml = '', isMediaOnly = false;

                    if (msgData.mediaUrl) {
                        if (!msgData.text || msgData.text.includes('Стрічка контенту')) isMediaOnly = true; 
                        if (msgData.mediaType === 'image') mediaHtml = `<img src="${msgData.mediaUrl}" style="max-width: 100%; border-radius: ${isMediaOnly ? '20px' : '12px'}; cursor: pointer; display: block;" onclick="window.open('${msgData.mediaUrl}', '_blank')">`;
                        else if (msgData.mediaType === 'video') mediaHtml = `<video src="${msgData.mediaUrl}" controls style="max-width: 100%; border-radius: ${isMediaOnly ? '20px' : '12px'}; display: block;"></video>`;
                    }

                    // --- РЕПОСТИ ---
                    const postMatch = msgData.text ? msgData.text.match(/Стрічка контенту: Посилання на пост ID #([a-zA-Z0-9_-]+)/) : null;
                    let textHtml = '';
                    let sharedPostHtml = '';

                    if (postMatch) {
                        isMediaOnly = false; // Репост має фон
                        const sharedPostId = postMatch[1];
                        const randomTargetId = `chat-shared-post-${sharedPostId}-${Math.floor(Math.random() * 100000)}`;
                        sharedPostHtml = `
                            <div id="${randomTargetId}" style="margin-top: 5px; margin-bottom: 5px; width: 100%; min-width: 220px; background: rgba(128,128,128,0.15); border-radius: 12px; padding: 10px; border: 1px solid var(--border-color);">
                                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;"><i class="bi bi-box-arrow-up-right"></i> Поділився(лась) публікацією</div>
                                <div class="shared-post-content" style="font-size:13px; color: var(--text-color);">Завантаження публікації...</div>
                            </div>
                        `;
                        setTimeout(() => resolveAndRenderSharedPost(sharedPostId, randomTargetId), 50);
                    } else {
                        textHtml = msgData.text ? `<div class="msg-text">${linkify(msgData.text)}</div>` : '';
                    }

                    let editedHtml = msgData.editedAt ? `<span style="font-size: 10px; opacity: 0.5; margin-left: 5px;">(змінено)</span>` : '';
                    let replyHtml = msgData.replyTo ? `<div style="font-size: 12px; opacity: 0.8; margin-bottom: 6px; border-left: 3px solid ${isMine ? 'var(--bg-color)' : 'var(--accent-color)'}; padding-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${msgData.replyTo.sender}</strong><br>${msgData.replyTo.text}</div>` : '';
                    
                    let reactionDisplayHtml = msgData.reaction ? `<div style="position: absolute; bottom: -10px; ${isMine ? 'left: 10px;' : 'right: 10px;'} background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 2px 6px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 5;">${msgData.reaction}</div>` : '';

                    const senderNameStr = isMine ? 'Ви' : (document.getElementById('chat-room-name') ? document.getElementById('chat-room-name').textContent : "...");
                    const safeTextStr = (msgData.text || 'Фото').replace(/"/g, '&quot;');

                    // --- КНОПКИ РЕАКЦІЙ (Винесені за межі бульбашки) ---
                    let actionsHtml = `
                        <button class="react-btn" style="position: absolute; top: 50%; transform: translateY(-50%); ${isMine ? 'left: -35px;' : 'right: -35px;'} background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 18px; opacity: 0.5; padding: 5px;"><i class="bi bi-emoji-smile"></i></button>
                        <div class="reaction-picker hidden" style="position: absolute; top: 50%; transform: translateY(-50%); ${isMine ? 'right: 100%; margin-right: 40px;' : 'left: 100%; margin-left: 40px;'} background: var(--bg-color); border-radius: 20px; padding: 6px 10px; display:flex; gap:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); border: 1px solid var(--border-color); z-index: 100;">
                            <span class="emoji-btn" data-emoji="❤️" style="cursor:pointer; font-size: 18px;">❤️</span>
                            <span class="emoji-btn" data-emoji="👍" style="cursor:pointer; font-size: 18px;">👍</span>
                            <span class="emoji-btn" data-emoji="🔥" style="cursor:pointer; font-size: 18px;">🔥</span>
                            <span class="emoji-btn" data-emoji="😂" style="cursor:pointer; font-size: 18px;">😂</span>
                        </div>
                    `;

                    let footerHtml = `<div style="display: flex; justify-content: ${isMine ? 'flex-end' : 'flex-start'}; align-items: center; gap: 8px; margin-top: ${isMediaOnly ? '6px' : '2px'}; padding: 0 4px;"><span class="chat-message-time" style="margin: 0; color: ${isMediaOnly ? 'var(--text-secondary)' : 'inherit'}; opacity: ${isMediaOnly ? '1' : '0.6'};">${timeString}${editedHtml}</span></div>`;

                    msgDiv.innerHTML = `${reactionDisplayHtml}${replyHtml}${sharedPostHtml}${mediaHtml}${textHtml}${footerHtml}${actionsHtml}`;
                    
                    if (isMediaOnly) {
                        msgDiv.style.setProperty('background-color', 'transparent', 'important');
                        msgDiv.style.setProperty('padding', '0', 'important');
                        msgDiv.style.setProperty('border', 'none', 'important');
                    } else {
                        msgDiv.style.removeProperty('background-color'); msgDiv.style.removeProperty('padding'); msgDiv.style.removeProperty('border');
                    }

                    // --- КОНТЕКСТНЕ МЕНЮ (ПКМ) ---
                    msgDiv.addEventListener('contextmenu', (e) => {
                        e.preventDefault(); 
                        const ctxMenu = document.getElementById('chat-context-menu');
                        if(!ctxMenu) return;
                        
                        ctxMenu.innerHTML = ''; 
                        const now = Date.now();
                        const msgTime = msgData.timestamp ? msgData.timestamp.toMillis() : now;
                        const diffMinutes = (now - msgTime) / (1000 * 60);
                        const isEditable = isMine && msgData.text && diffMinutes <= 15; // 15 ХВИЛИН НА РЕДАГУВАННЯ

                        const btnStyle = "background: none; border: none; padding: 10px 15px; text-align: left; color: var(--text-color, #fff); font-size: 14px; cursor: pointer; border-radius: 8px; width: 100%; display: flex; gap: 10px; align-items: center;";

                        const btnReply = document.createElement('button');
                        btnReply.style.cssText = btnStyle;
                        btnReply.innerHTML = '<i class="bi bi-reply"></i> Відповісти';
                        btnReply.onclick = () => {
                            editingMessageId = null;
                            replyingToMessage = { id: msgId, sender: senderNameStr, text: safeTextStr };
                            if (chatActionTitle) chatActionTitle.textContent = "Відповідь: " + senderNameStr;
                            if (chatActionText) chatActionText.textContent = safeTextStr;
                            if (chatActionPreviewContainer) chatActionPreviewContainer.classList.remove('hidden');
                            if (sendMessageBtn) sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>'; 
                            if (chatMessageInput) chatMessageInput.focus();
                            ctxMenu.classList.add('hidden');
                        };
                        ctxMenu.appendChild(btnReply);

                        if (isEditable) {
                            const btnEdit = document.createElement('button');
                            btnEdit.style.cssText = btnStyle;
                            btnEdit.innerHTML = '<i class="bi bi-pencil"></i> Редагувати';
                            btnEdit.onclick = () => {
                                replyingToMessage = null; editingMessageId = msgId;
                                if (chatActionTitle) chatActionTitle.textContent = "Редагування"; 
                                if (chatActionText) chatActionText.textContent = msgData.text;
                                if (chatActionPreviewContainer) chatActionPreviewContainer.classList.remove('hidden');
                                if (chatMessageInput) { chatMessageInput.value = msgData.text || ''; chatMessageInput.focus(); }
                                if (sendMessageBtn) sendMessageBtn.innerHTML = '<i class="bi bi-check-lg"></i>'; 
                                ctxMenu.classList.add('hidden');
                            };
                            ctxMenu.appendChild(btnEdit);
                        }

                        if (isMine) {
                            const btnDel = document.createElement('button');
                            btnDel.style.cssText = btnStyle;
                            btnDel.innerHTML = '<i class="bi bi-trash" style="color: #ff4444;"></i> <span style="color: #ff4444;">Видалити</span>';
                            btnDel.onclick = async () => {
                                ctxMenu.classList.add('hidden');
                                const confirmDelete = await window.showCustomModal({ title: "Видалення", message: "Видалити це повідомлення?", type: "confirm" });
                                if (confirmDelete) await deleteDoc(doc(db, "chats", roomId, "messages", msgId));
                            };
                            ctxMenu.appendChild(btnDel);
                        }

                        let x = e.clientX; let y = e.clientY;
                        if (x + 160 > window.innerWidth) x -= 160;
                        if (y + 150 > window.innerHeight) y -= 150;
                        ctxMenu.style.left = `${x}px`; ctxMenu.style.top = `${y}px`;
                        ctxMenu.classList.remove('hidden');
                    });

                    // Реакції
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

                    if (isNew && chatMessagesContainer) {
                        chatMessagesContainer.appendChild(msgDiv);
                        chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' });
                    }
                }
                
                if (change.type === "removed") {
                    const msgElement = document.querySelector(`.chat-message[data-message-id="${change.doc.id}"]`);
                    if (msgElement) msgElement.remove();
                }
            });

            if (!snapshot.empty) {
                const lastDoc = snapshot.docs[snapshot.docs.length - 1].data();
                if (lastDoc.senderId !== currentUser.uid) {
                    updateDoc(doc(db, "chats", window.currentChatRoomId), { [`readStatus.${currentUser.uid}`]: true }).catch(()=>{});
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
            if (chatSearchContainer) chatSearchContainer.classList.toggle('hidden');
            if (chatSearchContainer && !chatSearchContainer.classList.contains('hidden')) {
                if(followersSearchInput) followersSearchInput.focus();
            } else {
                if(followersSearchInput) followersSearchInput.value = '';
                if(followersResults) { followersResults.classList.add('hidden'); followersResults.innerHTML = ''; }
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.reaction-picker') && !e.target.closest('.react-btn')) {
            document.querySelectorAll('.reaction-picker').forEach(p => p.classList.add('hidden'));
        }
        const ctxMenu = document.getElementById('chat-context-menu');
        if (ctxMenu && !ctxMenu.classList.contains('hidden')) ctxMenu.classList.add('hidden');

        if (chatSearchContainer && !chatSearchContainer.classList.contains('hidden')) {
            if (!chatSearchContainer.contains(e.target) && (!openChatListSearchBtn || !openChatListSearchBtn.contains(e.target)) && (!followersResults || !followersResults.contains(e.target))) {
                chatSearchContainer.classList.add('hidden');
                if(followersSearchInput) followersSearchInput.value = '';
                if (followersResults) { followersResults.classList.add('hidden'); followersResults.innerHTML = ''; }
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
        const text = chatMessageInput ? chatMessageInput.value.trim() : '';
        const currentUser = auth.currentUser;
        
        if ((!text && !currentChatFile) || !currentUser || !currentChatUserId) return;
        const roomId = getChatRoomId(currentUser.uid, currentChatUserId);
        
        const originalBtnHtml = sendMessageBtn ? sendMessageBtn.innerHTML : '';
        if (sendMessageBtn) {
            sendMessageBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
            sendMessageBtn.disabled = true;
        }
        if (chatMessageInput) chatMessageInput.disabled = true;
        if (currentChatFile && chatAttachBtn) { chatAttachBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>'; chatAttachBtn.disabled = true; }

        try {
            if (editingMessageId) {
                await updateDoc(doc(db, "chats", roomId, "messages", editingMessageId), { text: text, editedAt: serverTimestamp() });
                await setDoc(doc(db, "chats", roomId), {
                    lastMessage: text, timestamp: serverTimestamp(), participants: [currentUser.uid, currentChatUserId]
                }, { merge: true });
            } else {
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

                await setDoc(doc(db, "chats", roomId), {
                    participants: [currentUser.uid, currentChatUserId],
                    lastMessage: text || (mediaType === 'image' ? "📷 Фото" : "🎥 Відео"),
                    lastMessageSenderId: currentUser.uid,
                    [`readStatus.${currentChatUserId}`]: false,
                    [`readStatus.${currentUser.uid}`]: true,
                    timestamp: serverTimestamp()
                }, { merge: true });
            }
        } catch (error) {
            console.error("Помилка відправки в БД:", error);
            await window.showCustomModal({ title: "Помилка", message: "Не вдалося відправити повідомлення або файл." });
        } finally {
            try {
                editingMessageId = null;
                currentChatFile = null;
                replyingToMessage = null; 
                
                if (chatMediaInput) chatMediaInput.value = '';
                if (chatMessageInput) chatMessageInput.value = '';
                if (chatActionPreviewContainer) chatActionPreviewContainer.classList.add('hidden');
                if (chatMediaPreviewContainer) chatMediaPreviewContainer.classList.add('hidden');
                if (chatInnerSearchInput && chatInnerSearchInput.value) {
                    chatInnerSearchInput.value = ''; 
                    document.querySelectorAll('.chat-message').forEach(m => m.style.display = 'flex');
                }
            } catch (uiError) {
                console.error(uiError);
            }
            
            if (sendMessageBtn) { sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>'; sendMessageBtn.disabled = false; }
            if (chatAttachBtn) { chatAttachBtn.innerHTML = '<i class="bi bi-paperclip"></i>'; chatAttachBtn.disabled = false; }
            if (chatMessageInput) { chatMessageInput.disabled = false; chatMessageInput.focus(); }
            if (chatMessagesContainer) { chatMessagesContainer.scrollTo({ top: chatMessagesContainer.scrollHeight, behavior: 'smooth' }); }
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
                            div.style.padding = '10px'; div.style.borderRadius = '16px'; div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '10px'; div.style.cursor = 'pointer';
                            div.innerHTML = `
                                <img src="${avatar}" class="chat-avatar" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                                <div class="chat-info">
                                    <h4 class="chat-name" style="margin: 0; font-size: 15px; color: var(--text-color);">${displayName}</h4>
                                    <p class="chat-last-message" style="margin: 0; color: var(--accent-color); font-size: 13px; font-weight: 600;">Почати діалог</p>
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

                    snapshot.docChanges().forEach(change => {
                        if (change.type === 'modified' || change.type === 'added') {
                            const d = change.doc.data();
                            if (d.readStatus && d.readStatus[user.uid] === false && d.lastMessageSenderId !== user.uid) {
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
                        
                        const unreadDot = isUnread ? `<div style="position: absolute; left: 40px; top: 0px; width: 12px; height: 12px; background: #ff4444; border: 2px solid var(--bg-color); border-radius: 50%; z-index: 5;"></div>` : '';

                        const chatItem = document.createElement('div');
                        chatItem.className = 'chat-item';
                        chatItem.style.position = 'relative'; 
                        
                        chatItem.innerHTML = `
                            <div style="position:relative; width: 50px; height: 50px; flex-shrink: 0;">
                                <img src="${avatar}" class="chat-avatar" alt="Avatar" style="width: 100%; height: 100%; margin:0; border-radius: 50%; object-fit: cover;">
                                ${unreadDot}
                            </div>
                            <div class="chat-info" style="flex: 1; min-width: 0; padding-left: 15px; padding-right: 30px;">
                                <h4 class="chat-name" style="margin: 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${isUnread ? '800' : '600'}; color: var(--text-color);">${name}</h4>
                                <p class="chat-last-message" style="margin: 4px 0 0 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isUnread ? 'var(--text-color)' : 'var(--text-secondary)'}; font-weight: ${isUnread ? '600' : '400'};">${lastMsg}</p>
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

                    if (playSound && audioUnlocked) messageSound.play().catch(e => console.log(e));
                    initialChatLoad = false;
                    
                    updateNavBadge(unreadTotalCount);
                });
            }
        });
    }
});