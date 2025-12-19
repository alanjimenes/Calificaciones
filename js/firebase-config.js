// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    setPersistence,
    browserLocalPersistence,
    signInWithCustomToken, 
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    runTransaction, // <--- NUEVO: Importante para concurrencia
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURACIÓN DE FIREBASE ---
let firebaseConfig;

if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
} else {
    firebaseConfig = {
        apiKey: "AIzaSyA0j-lU3viEHsNjzUB1xhSFgUMaZPNt8Lk",
        authDomain: "notas-1ea5a.firebaseapp.com",
        projectId: "notas-1ea5a",
        storageBucket: "notas-1ea5a.firebasestorage.app",
        messagingSenderId: "144917311326",
        appId: "1:144917311326:web:dca2bd3cb62cb3dc6e29cf",
        measurementId: "G-0ZSDRNHSZP"
    };
}

if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "PON_TU_API_KEY_AQUI") {
    const msg = "⛔ ERROR DE CONFIGURACIÓN ⛔\n\nEstás ejecutando en Localhost pero no has configurado tus credenciales de Firebase.";
    console.error(msg);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

setPersistence(auth, browserLocalPersistence).catch((error) => console.error("Error Auth Persistence:", error));

enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Persistencia solo en una pestaña.');
    } else if (err.code == 'unimplemented') {
        console.log('Navegador no soporta persistencia offline.');
    }
});

const initAuth = async () => {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); } catch (e) { console.error(e); }
    }
};
initAuth();

export { 
    auth, 
    db, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    updateProfile,
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    runTransaction, // <--- EXPORTAR
    appId 
};