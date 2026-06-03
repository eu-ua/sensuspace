import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// УВАГА: Якщо ці шляхи не збігаються з твоїми папками, кнопки працювати не будуть!
import './auth.js';
import './profile.js';
import './services/feed.js';
import './services/chat.js';
import './services/global.js';

// Глобальна функція для виклику вікон (щоб інші файли могли її використовувати)
window.showCustomModal = function({ title, message, type = 'alert' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        if(!modal) { alert(message); resolve(true); return; } 
        
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

        confirmBtn.onclick = () => { cleanup(); resolve(type === 'prompt' ? inputEl.value : true); };
        cancelBtn.onclick = () => { cleanup(); resolve(type === 'prompt' ? null : false); };
    });
};

document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('.app-screen').forEach(s => {
        if (!s.classList.contains('active')) s.classList.add('hidden');
    });

    // Навігація
    const navButtons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.app-screen');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetScreen = document.getElementById(btn.dataset.screen);
            if (targetScreen) {
                navButtons.forEach(b => b.classList.remove('active'));
                screens.forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
                btn.classList.add('active');
                targetScreen.classList.add('active');
                targetScreen.classList.remove('hidden');
            }
        });
    });

    // --- МОДАЛЬНІ ВІКНА ТА НАЛАШТУВАННЯ ---
    const settingsModal = document.getElementById('settings-modal');
    const createPostModal = document.getElementById('create-post-modal');
    
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    
    if (openSettingsBtn && settingsModal) {
        openSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    }
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    }
    
    document.querySelectorAll('.create-post-trigger').forEach(btn => {
        btn.addEventListener('click', () => createPostModal.classList.remove('hidden'));
    });

    if (document.getElementById('close-create-post-btn')) {
        document.getElementById('close-create-post-btn').addEventListener('click', () => createPostModal.classList.add('hidden'));
    }

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
        if (e.target === createPostModal) createPostModal.classList.add('hidden');
    });

    // --- ЛОГІКА ВИХОДУ З АКАУНТА ---
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmed = await window.showCustomModal({ title: "Вихід", message: "Ви впевнені, що хочете вийти?", type: "confirm" });
            if (confirmed) {
                await signOut(auth);
                window.location.reload(); // Перезавантажує сторінку і відкриває вікно входу
            }
        });
    }

    // --- ТЕМА ---
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
});