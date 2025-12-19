import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

/**
 * Inyecta el Sidebar y maneja la lógica de navegación común.
 * Debe ser importado en todas las páginas principales.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que main.js determine el usuario para pintar info específica si es necesario,
    // pero pintamos la estructura básica inmediatamente para evitar "saltos" visuales.
    renderSidebar();
});

// Escuchar evento de usuario listo (disparado por main.js) para actualizar foto y rol
window.addEventListener('userReady', (e) => {
    const { role, user } = e.detail;
    updateSidebarInfo(user, role);
});

function renderSidebar() {
    const currentPath = window.location.pathname;
    
    // Definición de enlaces principales (Visibles para todos)
    const links = [
        { href: 'index.html', icon: 'dashboard', text: 'Inicio' },
        { href: 'calificaciones.html', icon: 'edit_note', text: 'Registro Notas' },
        { href: 'boletin.html', icon: 'description', text: 'Boletines' }, 
        { href: 'cursos.html', icon: 'library_books', text: 'Cursos' }
    ];

    // Definición de enlaces de Administrador
    // AQUÍ AGREGAMOS "ASIGNATURAS" PARA QUE SALGA EN LA BARRA IZQUIERDA
    const adminLinks = [
        { href: 'usuarios.html', icon: 'group', text: 'Gestión Usuarios' },
        { href: 'asignaturas.html', icon: 'category', text: 'Asignaturas' }, // <--- Nuevo apartado en el menú
        { href: 'registro_usuario.html', icon: 'person_add', text: 'Registrar Usuario' }
    ];

    // Construcción del HTML
    const sidebarHTML = `
    <aside class="hidden lg:flex w-72 flex-col border-r border-surface-border bg-background-dark p-6 z-30 shrink-0 h-full fixed lg:static top-0 left-0 print:hidden">
        <div class="mb-10 flex items-center gap-4">
            <div id="layout-user-img" class="size-12 rounded-full bg-cover bg-center ring-2 ring-primary/20 bg-surface-border animate-pulse" 
                 style='background-image: url("");'></div>
            <div class="flex flex-col">
                <h1 class="text-xl font-bold text-white leading-tight">EduSys</h1>
                <span id="layout-user-role" class="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-800 text-gray-400 w-fit mt-1">CARGANDO...</span>
            </div>
        </div>

        <nav class="flex flex-1 flex-col gap-2">
            ${links.map(link => createLinkHTML(link, currentPath)).join('')}

            <!-- SECCIÓN ADMIN (Oculta por defecto, se muestra si es admin) -->
            <div id="layout-admin-section" class="hidden mt-4 animate-fade-in">
                <div class="my-2 h-px bg-admin/20 mx-4"></div>
                <p class="px-4 text-[10px] font-bold text-admin uppercase tracking-wider mb-2">Panel Admin</p>
                ${adminLinks.map(link => createLinkHTML(link, currentPath, true)).join('')}
                
                <!-- Botón especial Crear Curso solo si estamos en cursos.html y es admin -->
                ${currentPath.includes('cursos.html') ? `
                <button onclick="toggleModal('modal-create-course')" class="w-full group flex items-center gap-4 rounded-xl px-4 py-3.5 text-text-secondary hover:bg-admin/10 hover:text-admin transition-all text-left">
                    <span class="material-symbols-outlined icon group-hover:text-admin transition-colors">library_add</span>
                    <span class="font-medium">Crear Curso</span>
                </button>` : ''}
            </div>
        </nav>

        <div class="mt-auto">
            <button id="layout-logout-btn" class="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-text-secondary hover:bg-danger/10 hover:text-danger transition-colors">
                <span class="material-symbols-outlined">logout</span>
                <span class="font-medium">Cerrar Sesión</span>
            </button>
        </div>
    </aside>
    `;

    // Inyectar al principio del body
    const body = document.getElementById('main-body');
    if (body) {
        // Buscar si ya existe un aside para no duplicar (en caso de recargas raras)
        const existingAside = body.querySelector('aside');
        if (existingAside && existingAside.parentNode === body) {
            existingAside.remove();
        }
        
        body.insertAdjacentHTML('afterbegin', sidebarHTML);
        
        // Asignar evento logout
        const logoutBtn = document.getElementById('layout-logout-btn');
        if(logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await signOut(auth);
                    localStorage.removeItem('edusys_user_data');
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Error logout:", error);
                }
            });
        }
    }
}

function createLinkHTML(link, currentPath, isAdmin = false) {
    // Lógica mejorada de detección de ruta activa
    let isActive = false;
    const pageName = currentPath.split('/').pop() || 'index.html';
    
    // Ajuste para query params si es necesario, aunque split lo maneja básico
    const cleanPageName = pageName.split('?')[0];

    if (link.href === 'index.html' && (cleanPageName === '' || cleanPageName === 'index.html')) {
        isActive = true;
    } else if (cleanPageName === link.href) {
        isActive = true;
    }
    
    let classes = "flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all ";
    
    if (isActive) {
        if (isAdmin) classes += "bg-admin/10 text-admin border-l-4 border-admin";
        else classes += "bg-primary/10 text-primary border-l-4 border-primary"; 
    } else {
        classes += "text-text-secondary hover:text-white hover:bg-white/5";
    }

    const iconColorClass = isActive && isAdmin ? "text-admin" : (isActive ? "text-primary" : "icon");

    return `
        <a href="${link.href}" class="${classes}">
            <span class="material-symbols-outlined ${iconColorClass}">${link.icon}</span>
            <span class="font-medium">${link.text}</span>
        </a>
    `;
}

function updateSidebarInfo(user, role) {
    const imgEl = document.getElementById('layout-user-img');
    const roleEl = document.getElementById('layout-user-role');
    const adminSection = document.getElementById('layout-admin-section');

    if (imgEl && user.photoURL) {
        imgEl.style.backgroundImage = `url('${user.photoURL}')`;
        imgEl.classList.remove('animate-pulse');
    } else if (imgEl && user.email) {
         imgEl.classList.remove('animate-pulse');
         imgEl.innerText = user.email.charAt(0).toUpperCase();
         imgEl.classList.add('flex', 'items-center', 'justify-center', 'text-xl', 'font-bold', 'text-white');
    }

    if (roleEl) {
        let roleName = 'DOCENTE';
        let roleClass = 'bg-primary/20 text-primary';
        
        if (role === 'admin') { 
            roleName = 'ADMINISTRADOR'; 
            roleClass = 'bg-admin/20 text-admin'; 
        } else if (role === 'secretaria') { 
            roleName = 'SECRETARIA'; 
            roleClass = 'bg-purple-500/20 text-purple-400 border border-purple-500/20'; 
        }

        roleEl.innerText = roleName;
        roleEl.className = `text-[10px] font-bold px-2 py-0.5 rounded w-fit mt-1 ${roleClass}`;
    }

    if (adminSection) {
        if (role === 'admin') adminSection.classList.remove('hidden');
        else adminSection.classList.add('hidden');
    }
}