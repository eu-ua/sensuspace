import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Зберігаємо статус користувача глобально
let currentUser = null; 

document.addEventListener('DOMContentLoaded', () => {
    
    const authModal = document.getElementById('auth-modal');
    const closeAuthBtn = document.getElementById('close-auth-btn');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const authForm = document.getElementById('auth-form');
    const authUsername = document.getElementById('auth-username');
    const authPassword = document.getElementById('auth-password');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authErrorMsg = document.getElementById('auth-error-message');

    if (!authModal) return;

    // --- ФУНКЦІЯ: Показати/Приховати пароль ---
    togglePasswordBtn.addEventListener('click', () => {
        const currentType = authPassword.getAttribute('type');
        if (currentType === 'password') {
            authPassword.setAttribute('type', 'text');
            togglePasswordBtn.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            authPassword.setAttribute('type', 'password');
            togglePasswordBtn.classList.replace('bi-eye-slash', 'bi-eye');
        }
    });

    // --- ФУНКЦІЯ: Закрити вікно авторизації (Режим гостя) ---
    closeAuthBtn.addEventListener('click', () => {
        authModal.classList.add('hidden');
    });

    // --- ПЕРЕХОПЛЕННЯ КЛІКІВ (Захист дій від гостей) ---
    // Якщо користувач не увійшов, ми блокуємо лайки, коментарі, чати та профіль
    document.body.addEventListener('click', (e) => {
        // Шукаємо, чи клікнули по захищеній кнопці
        const isProtectedAction = e.target.closest(
            '.action-btn, ' + // Лайки, коментарі
            '.nav-btn[data-screen="screen-messages"], ' + // Вкладка повідомлень
            '.nav-btn[data-screen="screen-profile"], ' + // Вкладка профілю
            '.join-btn, .create-group-btn' // Гуртки
        );

        if (isProtectedAction && !currentUser) {
            e.preventDefault(); // Зупиняємо дію
            e.stopPropagation(); // Зупиняємо перехід по вкладках
            authModal.classList.remove('hidden'); // Показуємо вікно входу
        }
    }, true); // true означає, що ми перехоплюємо клік до того, як він спрацює

    // --- ЛОГІКА АВТОРИЗАЦІЇ ---
    let isLoginMode = true;

    tabLogin.addEventListener('click', () => {
        isLoginMode = true;
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authSubmitBtn.textContent = 'Увійти';
        authErrorMsg.classList.add('hidden');
    });

    tabRegister.addEventListener('click', () => {
        isLoginMode = false;
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.textContent = 'Зареєструватися';
        authErrorMsg.classList.add('hidden');
    });

    authForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        
        const username = authUsername.value.trim();
        const password = authPassword.value.trim();
        const email = `${username}@sensu.local`; 

        if (password.length < 6) {
            showError("Пароль має містити мінімум 6 символів");
            return;
        }

        if (isLoginMode) {
            signInWithEmailAndPassword(auth, email, password)
                .catch(error => showError("Невірний логін або пароль"));
        } else {
            createUserWithEmailAndPassword(auth, email, password)
                .catch(error => {
                    if (error.code === 'auth/email-already-in-use') {
                        showError("Цей логін вже зайнятий");
                    } else {
                        showError("Помилка. Перевірте дані та спробуйте ще раз.");
                    }
                });
        }
    });

    function showError(msg) {
        authErrorMsg.textContent = msg;
        authErrorMsg.classList.remove('hidden');
    }
});

// --- СТАТУС FIREBASE ---
onAuthStateChanged(auth, (user) => {
    currentUser = user; // Оновлюємо глобальну змінну
    const authModal = document.getElementById('auth-modal');

    if (user) {
        // Якщо увійшов - завжди ховаємо вікно
        if (authModal) authModal.classList.add('hidden'); 
    } 
    // Якщо не увійшов (гість) - ми нічого не робимо, 
    // користувач спокійно гортає стрічку, поки не натисне кнопку лайку
});