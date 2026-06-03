import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authErrorMessage = document.getElementById('auth-error-message');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const closeAuthBtn = document.getElementById('close-auth-btn');

    let isLoginMode = true;

    // Закриття вікна (якщо потрібно)
    if (closeAuthBtn && authModal) {
        closeAuthBtn.addEventListener('click', () => authModal.classList.add('hidden'));
    }

    // Перемикання вкладок
    if (tabLogin && tabRegister) {
        tabLogin.addEventListener('click', () => {
            isLoginMode = true;
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            authSubmitBtn.textContent = 'Увійти';
            authErrorMessage.classList.add('hidden');
        });

        tabRegister.addEventListener('click', () => {
            isLoginMode = false;
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            authSubmitBtn.textContent = 'Зареєструватися';
            authErrorMessage.classList.add('hidden');
        });
    }

    // Показати/сховати пароль
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                togglePasswordBtn.classList.replace('bi-eye', 'bi-eye-slash');
            } else {
                passwordInput.type = 'password';
                togglePasswordBtn.classList.replace('bi-eye-slash', 'bi-eye');
            }
        });
    }

    // ГОЛОВНА ЛОГІКА РЕЄСТРАЦІЇ / ВХОДУ
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const login = usernameInput.value.trim();
            const password = passwordInput.value;
            
            // Оскільки Firebase вимагає email, ми генеруємо його з логіна
            const email = `${login}@sensuspace.com`; 

            authSubmitBtn.disabled = true;
            authSubmitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
            authErrorMessage.classList.add('hidden');

            try {
                if (isLoginMode) {
                    await signInWithEmailAndPassword(auth, email, password);
                } else {
                    // РЕЄСТРАЦІЯ
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    
                    // МАГІЯ: Одразу записуємо логін у базу даних (Firestore), щоб чат його бачив!
                    await setDoc(doc(db, "users", user.uid), {
                        nickname: login,   // Чат буде читати це поле
                        username: login,
                        email: email,
                        createdAt: new Date()
                    }, { merge: true });
                }
                
                authModal.classList.add('hidden');
                
            } catch (error) {
                console.error("Помилка авторизації:", error);
                authErrorMessage.textContent = isLoginMode ? "Невірний логін або пароль" : "Цей логін вже зайнятий або пароль надто короткий (мінімум 6 символів).";
                authErrorMessage.classList.remove('hidden');
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = isLoginMode ? 'Увійти' : 'Зареєструватися';
            }
        });
    }

    // Контроль модального вікна
    auth.onAuthStateChanged((user) => {
        if (user) {
            if (authModal) authModal.classList.add('hidden');
        } else {
            if (authModal) authModal.classList.remove('hidden');
        }
    });
});