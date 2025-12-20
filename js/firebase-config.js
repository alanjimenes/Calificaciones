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
    collectionGroup, // <--- 1. Incorporado en la importación
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    query, 
    where, 
    orderBy, 
    limit,
    limitToLast,
    startAfter,
    endBefore,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    runTransaction, 
    onSnapshot,
    deleteField, 
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURACIÓN DE FIREBASE ---
// La exportamos para usarla en register.js
export const firebaseConfig = {
    apiKey: "AIzaSyA0j-lU3viEHsNjzUB1xhSFgUMaZPNt8Lk",
    authDomain: "notas-1ea5a.firebaseapp.com",
    projectId: "notas-1ea5a",
    storageBucket: "notas-1ea5a.firebasestorage.app",
    messagingSenderId: "144917311326",
    appId: "1:144917311326:web:dca2bd3cb62cb3dc6e29cf",
    measurementId: "G-0ZSDRNHSZP"
};

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
    collectionGroup, // <--- 2. Incorporado en la exportación
    addDoc, 
    getDocs, 
    getDoc, 
    doc,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    limitToLast,
    startAfter,
    endBefore,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    runTransaction,
    onSnapshot, 
    deleteField, 
    appId 
};