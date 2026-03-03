import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC_zaBEvCGfN7NI9qhO-eg_yxs2C98M8cg",
    authDomain: "appalerta-d748b.firebaseapp.com",
    projectId: "appalerta-d748b",
    storageBucket: "appalerta-d748b.firebasestorage.app",
    messagingSenderId: "941582274984",
    appId: "1:941582274984:web:a6829c1672eb008a0f8d9d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
