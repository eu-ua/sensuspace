import { db, auth } from '../firebase-config.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
    let currentChatFile = null; 
    let editingMessageId = null; 
    let replyingToMessage = null; 

    if (closeChatRoomBtn) closeChatRoomBtn.addEventListener('click', () => {
        document.querySelector('.nav-btn.active')?.click(); 
        if (chatUnsubscribe) chatUnsubscribe(); 
    });

    if (chatCancelActionBtn) {
        chatCancelActionBtn.addEventListener('click', () => {
            editingMessageId = null; replyingToMessage = null;
            chatActionPreviewContainer.classList.add('hidden');
            chatMessageInput.value = ''; sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
        });
    }

    if (chatSearchBtn) {
        chatSearchBtn.addEventListener('click', () => {
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
        
        const chatRoomNameEl = document.getElementById('chat-room-name');
        const chatRoomAvatarEl = document.getElementById('chat-room-avatar');
        
        chatRoomNameEl.textContent = targetUserName || "Користувач";
        chatRoomNameEl.classList.add('user-profile-trigger');
        chatRoomNameEl.dataset.userId = targetUserId; chatRoomNameEl.style.cursor = 'pointer'; 

        chatRoomAvatarEl.src = targetUserAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
        chatRoomAvatarEl.classList.add('user-profile-trigger');
        chatRoomAvatarEl.dataset.userId = targetUserId; chatRoomAvatarEl.style.cursor = 'pointer'; 
        
        getDoc(doc(db, "users", targetUserId)).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                chatRoomNameEl.textContent = data.nickname || data.username || data.login || targetUserName || "Користувач";
                if (data.avatarUrl) chatRoomAvatarEl.src = data.avatarUrl;
            }
        }).catch(e => console.error(e));

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
                        <div class="msg-actions" style="display: flex; gap: 14px; margin-top: 6px; font-size: 15px; opacity: 0.7; align-items: center; position: relative;">
                            <div class="reaction-picker hidden" style="position: absolute; bottom: 30px; ${isMine ? 'right: 0;' : 'left: 0;'} background: var(--bg-color); border-radius: 20px; padding: 8px 12px; display:flex; gap:12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); border: 1px solid var(--border-color); z-index: 100;">
                                <span class="emoji-btn" data-emoji="❤️" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">❤️</span>
                                <span class="emoji-btn" data-emoji="👍" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">👍</span>
                                <span class="emoji-btn" data-emoji="🔥" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">🔥</span>
                                <span class="emoji-btn" data-emoji="😂" style="cursor:pointer; font-size: 20px; transition: transform 0.1s;">😂</span>
                            </div>
                            <button class="react-btn" style="background: none; border: none; color: inherit; cursor: pointer; padding:0;" title="Реакція"><i class="bi bi-emoji-smile"></i></button>
                            <button class="reply-btn" data-sender="${senderNameStr}" data-text="${safeTextStr}" style="background: none; border: none; color: inherit; cursor: pointer; padding:0;" title="Відповісти"><i class="bi bi-reply"></i></button>
                            ${isMine && msgData.text ? `<button class="edit-btn" data-text="${safeTextStr}" style="background: none; border: none; color: inherit; cursor: pointer; padding:0;" title="Редагувати"><i class="bi bi-pencil"></i></button>` : ''}
                            ${isMine ? `<button class="delete-msg-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; padding:0;" title="Видалити"><i class="bi bi-trash"></i></button>` : ''}
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

                    const replyBtn = msgDiv.querySelector('.reply-btn');
                    if (replyBtn) {
                        replyBtn.addEventListener('click', () => {
                            editingMessageId = null;
                            replyingToMessage = { id: msgId, sender: replyBtn.dataset.sender, text: replyBtn.dataset.text };
                            chatActionTitle.textContent = "Відповідь: " + replyBtn.dataset.sender;
                            chatActionText.textContent = replyBtn.dataset.text;
                            chatActionPreviewContainer.classList.remove('hidden');
                            sendMessageBtn.innerHTML = '<i class="bi bi-send-fill"></i>'; chatMessageInput.focus();
                        });
                    }

                    const editBtn = msgDiv.querySelector('.edit-btn');
                    if (editBtn) {
                        editBtn.addEventListener('click', () => {
                            replyingToMessage = null; editingMessageId = msgId;
                            chatActionTitle.textContent = "Редагування"; chatActionText.textContent = editBtn.dataset.text;
                            chatActionPreviewContainer.classList.remove('hidden');
                            chatMessageInput.value = msgData.text || ''; sendMessageBtn.innerHTML = '<i class="bi bi-check-lg"></i>'; chatMessageInput.focus();
                        });
                    }

                    const delBtn = msgDiv.querySelector('.delete-msg-btn');
                    if (delBtn) {
                        delBtn.addEventListener('click', async () => {
                            const confirmDelete = await window.showCustomModal({ title: "Видалення", message: "Видалити це повідомлення?", type: "confirm" });
                            if (confirmDelete) await deleteDoc(doc(db, "chats", roomId, "messages", msgId));
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
        });
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.reaction-picker') && !e.target.closest('.react-btn')) document.querySelectorAll('.reaction-picker').forEach(p => p.classList.add('hidden'));
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

    // СПИСОК ЧАТІВ
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
                        const avatar = data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop';
                        const name = data.nickname || data.username || data.login || (data.email ? data.email.split('@')[0] : null) || "Користувач";
                        chatItem.innerHTML = `<img src="${avatar}" class="chat-avatar" alt="Avatar"><div class="chat-info"><h4 class="chat-name">${name}</h4><p class="chat-last-message">Натисніть, щоб написати...</p></div>`;
                        chatItem.addEventListener('click', () => { window.openChatWithUser(docSnap.id, name, avatar); });
                        dynamicChatList.appendChild(chatItem);
                    });
                });
            }
        });
    }
});