import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from './firebase-config.js';

// --- SISTEMA DE CACHÉ DE USUARIO ---
const CACHE_KEY = 'edusys_user_data';

// --- LISTA DE SUPER ADMINISTRADORES ---
const SUPER_ADMINS = [
    'admin@mail.com',
    'director@edusys.com'
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
                    const dbRole = (data.rol || 'docente').toLowerCase();
                    finalUserData.role = dbRole;
                    finalUserData.nombre = data.nombre || finalUserData.nombre;
                }

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

    // --- SISTEMA DE NOTIFICACIONES (TOAST) MEJORADO ---
    window.showToast = (message, type = 'info') => {
        let container = document.getElementById('toast-container');
        
        // Crear contenedor si no existe
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        // Forzar estilos del contenedor (Top Center)
        // pointer-events-none permite hacer clic "a través" del área vacía
        container.className = "fixed top-6 left-1/2 transform -translate-x-1/2 z-[9999] flex flex-col items-center gap-3 w-full max-w-md pointer-events-none";

        const toast = document.createElement('div');
        
        // Colores y estilos
        const styles = type === 'success' ? 'bg-primary text-white border-primary/20 shadow-primary/30' : 
                       type === 'error' ? 'bg-danger text-white border-danger/20 shadow-danger/30' : 
                       type === 'warning' ? 'bg-admin text-white border-admin/20 shadow-admin/30' :
                       'bg-surface-dark text-white border-surface-border shadow-xl';
        
        const iconName = type === 'success' ? 'check_circle' : 
                         type === 'error' ? 'error' : 
                         type === 'warning' ? 'warning' : 'info';

        // Estructura del Toast
        // pointer-events-auto reactiva los clics en la notificación misma
        toast.className = `pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border ${styles} transform transition-all duration-300 -translate-y-10 opacity-0 min-w-[300px] backdrop-blur-md font-medium text-sm`;
        
        toast.innerHTML = `
            <span class="material-symbols-outlined text-xl">${iconName}</span>
            <span>${message}</span>
        `;
        
        // Añadir al contenedor
        container.appendChild(toast);
        
        // Animación de entrada
        requestAnimationFrame(() => {
            toast.classList.remove('-translate-y-10', 'opacity-0');
        });

        // Animación de salida y eliminación
        setTimeout(() => {
            toast.classList.add('opacity-0', '-translate-y-10'); // Salir hacia arriba
            setTimeout(() => toast.remove(), 300);
        }, 3500); // Duración un poco más larga para leer cómodamente
    };
});