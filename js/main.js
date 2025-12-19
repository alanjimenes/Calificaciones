import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from './firebase-config.js';

// --- SISTEMA DE CACHÉ DE USUARIO ---
const CACHE_KEY = 'edusys_user_data';

// --- LISTA DE SUPER ADMINISTRADORES ---
// Agrega aquí los correos que deben ser administradores obligatoriamente.
// Esto es útil si no puedes editar la base de datos directamente.
const SUPER_ADMINS = [
    'admin@mail.com',
    'director@edusys.com' // <--- AGREGA TUS CORREOS AQUÍ, separados por comas
];

function loadUserFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
}

function saveUserToCache(userData) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(userData));
}

function clearUserCache() {
    localStorage.removeItem(CACHE_KEY);
}

// --- ACTUALIZACIÓN DE INTERFAZ RÁPIDA ---
function updateUI(userData) {
    const userRoleBadges = document.querySelectorAll('.user-role-badge');
    const userImgDisplays = document.querySelectorAll('.user-img-display');
    const adminOnlyElements = document.querySelectorAll('.admin-only');

    // 1. Mostrar Rol
    userRoleBadges.forEach(el => {
        el.innerText = userData.role === 'admin' ? 'ADMINISTRADOR' : 'DOCENTE';
        el.className = `user-role-badge text-[10px] font-bold px-2 py-0.5 rounded w-fit mt-1 ${userData.role === 'admin' ? 'bg-admin/20 text-admin' : 'bg-primary/20 text-primary'}`;
    });

    // 2. Mostrar Foto
    if (userData.photoURL) {
        userImgDisplays.forEach(el => {
            el.style.backgroundImage = `url('${userData.photoURL}')`;
        });
    }

    // 3. Mostrar elementos Admin
    if (userData.role === 'admin') {
        adminOnlyElements.forEach(el => el.classList.remove('hidden'));
    } else {
        adminOnlyElements.forEach(el => el.classList.add('hidden'));
    }

    // 4. Mostrar el Body
    const body = document.getElementById('main-body');
    if (body && body.classList.contains('opacity-0')) {
        body.classList.remove('opacity-0');
    }
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    const body = document.getElementById('main-body');
    
    // 1. Carga desde Caché
    const cachedUser = loadUserFromCache();
    
    if (cachedUser) {
        console.log("⚡ Cargando desde caché...");
        updateUI(cachedUser);
        window.dispatchEvent(new CustomEvent('userReady', { 
            detail: { uid: cachedUser.uid, email: cachedUser.email, role: cachedUser.role, user: cachedUser, source: 'cache' } 
        }));
        if(body) body.classList.remove('opacity-0');
    } else {
        if(body) setTimeout(() => body.classList.remove('opacity-0'), 100);
    }

    // 2. Verificación de Firestore
    onAuthStateChanged(auth, async (user) => {
        const isLoginPage = window.location.pathname.includes('login.html');

        if (user) {
            if (isLoginPage) {
                window.location.href = 'index.html';
                return;
            }

            try {
                // Obtener datos frescos de Firestore
                const userDoc = await getDoc(doc(db, "usuarios", user.email));
                
                let finalUserData = {
                    uid: user.uid,
                    email: user.email,
                    photoURL: user.photoURL,
                    role: 'docente', // Default inicial
                    nombre: user.displayName || user.email
                };

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    // Normalizamos a minúsculas para evitar errores "Admin" vs "admin"
                    const dbRole = (data.rol || 'docente').toLowerCase();
                    finalUserData.role = dbRole;
                    finalUserData.nombre = data.nombre || finalUserData.nombre;
                }

                // --- LÓGICA DE SUPER ADMINS ---
                // Si el correo está en la lista SUPER_ADMINS, forzamos el rol 'admin'
                // independientemente de lo que diga la base de datos.
                if (SUPER_ADMINS.includes(user.email)) {
                    finalUserData.role = 'admin';
                }

                saveUserToCache(finalUserData);
                updateUI(finalUserData);

                window.dispatchEvent(new CustomEvent('userReady', { 
                    detail: { uid: user.uid, email: user.email, role: finalUserData.role, user: user, source: 'live' } 
                }));

            } catch (error) {
                console.error("Error obteniendo datos de usuario:", error);
            }

        } else {
            clearUserCache();
            if (!isLoginPage) {
                window.location.href = 'login.html';
            }
        }
    });

    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                clearUserCache();
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
            }
        });
    });

    window.showToast = (message, type = 'info') => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        const colors = type === 'success' ? 'bg-primary text-background-dark border-primary' : 
                       type === 'error' ? 'bg-danger text-white border-danger' : 
                       'bg-surface-dark text-white border-surface-border';
        
        toast.className = `flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border ${colors} transform transition-all duration-300 translate-y-10 opacity-0 mb-3 min-w-[300px] z-50 font-bold text-sm`;
        
        let icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';

        toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icon}</span><span>${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
});