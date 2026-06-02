const fs = require('fs');

if (!process.env.API_KEY) {
    console.log("Локальне середовище: скрипт збірки пропущено.");
    process.exit(0);
}

const configContent = `
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "${process.env.API_KEY}",
    authDomain: "${process.env.AUTH_DOMAIN}",
    projectId: "${process.env.PROJECT_ID}",
    storageBucket: "${process.env.STORAGE_BUCKET}",
    messagingSenderId: "${process.env.MESSAGING_SENDER_ID}",
    appId: "${process.env.APP_ID}"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
`;

fs.mkdirSync('./js', { recursive: true });
fs.writeFileSync('./js/firebase-config.js', configContent.trim());
console.log("Конфігурація Firebase успішно згенерована на сервері!");

// примусовий пуш