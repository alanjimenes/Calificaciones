import { auth, signOut, onAuthStateChanged } from './firebase-config.js';

/**
 * Inyecta el Sidebar y maneja la lógica de navegación común.
 * Debe ser importado en todas las páginas principales.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Renderizar la barra lateral
    renderSidebar();
    
    // Inicializar la lógica de toggle (ocultar/mostrar) con un pequeño retraso
    // para asegurar que el DOM (incluido el sidebar inyectado) esté listo.
    setTimeout(setupSidebarToggle, 100);
});

// Escuchar evento de usuario listo (disparado por main.js) para actualizar foto y rol
window.addEventListener('userReady', (e) => {
    const { role, user } = e.detail;
    updateSidebarInfo(user, role);
});

function renderSidebar() {
    const currentPath = window.location.pathname;
    
    // Definición de enlaces PRINCIPALES (Visibles para DOCENTES y TODOS)
    // Se eliminó "Boletines" de aquí
    const links = [
        { href: 'index.html', icon: 'dashboard', text: 'Inicio' },
        { href: 'cursos.html', icon: 'auto_stories', text: 'Cursos' }
    ];

    // Definición de enlaces de GESTIÓN (Visible para ADMIN y SECRETARIA)
    const managementLinks = [
        { href: 'boletin.html', icon: 'description', text: 'Boletines' }
    ];

    // Definición de enlaces de Administrador
    // AQUÍ AGREGAMOS "ASIGNATURAS" PARA QUE SALGA EN LA BARRA IZQUIERDA
    const adminLinks = [
        { href: 'usuarios.html', icon: 'group', text: 'Gestión Usuarios' },
        { href: 'asignaturas.html', icon: 'category', text: 'Asignaturas' }
    ];

    // Construcción del HTML
    const sidebarHTML = `
    <aside id="main-sidebar" class="hidden lg:flex w-72 flex-col border-r border-surface-border bg-background-dark p-6 z-40 shrink-0 h-full fixed lg:static top-0 left-0 transition-all duration-300 print:hidden shadow-2xl lg:shadow-none">
        
        <div class="mb-10 flex items-center gap-4">
            <div id="layout-user-img" class="size-12 rounded-full bg-cover bg-center ring-2 ring-primary/20 bg-surface-border animate-pulse" 
                 style='background-image: url("");'></div>
            <div class="flex flex-col">
                <h1 class="text-xl font-bold text-white leading-tight">EduSys</h1>
                <span id="layout-user-role" class="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-border text-text-secondary w-fit mt-1">CARGANDO...</span>
            </div>
        </div>

        <nav class="flex flex-1 flex-col gap-2">
            ${links.map(link => createLinkHTML(link, currentPath)).join('')}

            <!-- SECCIÓN GESTIÓN (Visible para Admin y Secretaria) -->
            <div id="layout-management-section" class="hidden mt-4 animate-fade-in">
                <div class="my-2 h-px bg-surface-border/50 mx-4"></div>
                <p class="px-4 text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Gestión</p>
                ${managementLinks.map(link => createLinkHTML(link, currentPath)).join('')}
            </div>

            <!-- SECCIÓN ADMIN (Solo Admin) -->
            <div id="layout-admin-section" class="hidden mt-4 animate-fade-in">
                <div class="my-2 h-px bg-surface-border/50 mx-4"></div>
                <p class="px-4 text-[10px] font-bold text-admin uppercase tracking-wider mb-2">Panel Admin</p>
                ${adminLinks.map(link => createLinkHTML(link, currentPath, true)).join('')}
                
                ${currentPath.includes('cursos.html') ? `
                <button onclick="toggleModal('modal-create-course')" class="w-full group flex items-center gap-4 rounded-xl px-4 py-3.5 text-text-secondary hover:bg-admin/10 hover:text-admin transition-all text-left">
                    <span class="material-symbols-outlined icon group-hover:text-admin transition-colors">library_add</span>
                    <span class="font-medium">Crear Curso</span>
                </button>` : ''}
            </div>
        </nav>

        <div class="mt-auto relative">
            <!-- MENÚ CONFIGURACIÓN (Desplegable) -->
            <div id="layout-settings-menu" class="hidden flex-col gap-1 mb-2 bg-surface-dark/90 backdrop-blur-sm rounded-xl p-2 border border-surface-border shadow-xl animate-fade-in origin-bottom">
                 <button id="layout-logout-btn" class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors">
                    <span class="material-symbols-outlined text-lg">logout</span>
                    <span class="font-medium">Cerrar Sesión</span>
               </button>
            </div>

            <!-- BOTÓN PRINCIPAL -->
            <button id="layout-settings-btn" class="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-text-secondary hover:text-white hover:bg-white/5 transition-colors group">
                <span class="material-symbols-outlined group-hover:rotate-90 transition-transform duration-500">settings</span>
                <span class="font-medium">Configuración</span>
                <span id="settings-chevron" class="material-symbols-outlined ml-auto text-lg transition-transform duration-300">expand_less</span>
            </button>
        </div>
    </aside>
    `;

    const body = document.getElementById('main-body');
    if (body) {
        const existingAside = body.querySelector('aside');
        if (existingAside && existingAside.parentNode === body) {
            existingAside.remove();
        }
        body.insertAdjacentHTML('afterbegin', sidebarHTML);
        
        // --- Lógica del Menú Configuración ---
        const settingsBtn = document.getElementById('layout-settings-btn');
        const settingsMenu = document.getElementById('layout-settings-menu');
        const chevron = document.getElementById('settings-chevron');

        if (settingsBtn && settingsMenu) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = settingsMenu.classList.contains('hidden');
                
                if (isHidden) {
                    settingsMenu.classList.remove('hidden');
                    settingsMenu.classList.add('flex');
                    if(chevron) chevron.style.transform = 'rotate(180deg)';
                } else {
                    settingsMenu.classList.add('hidden');
                    settingsMenu.classList.remove('flex');
                    if(chevron) chevron.style.transform = 'rotate(0deg)';
                }
            });

            // Cerrar menú al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target) && !settingsMenu.classList.contains('hidden')) {
                    settingsMenu.classList.add('hidden');
                    settingsMenu.classList.remove('flex');
                    if(chevron) chevron.style.transform = 'rotate(0deg)';
                }
            });
        }

        // Asignar evento logout al botón dentro del menú
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

/**
 * LÓGICA DE TOGGLE CENTRALIZADA Y ROBUSTA
 */
function setupSidebarToggle() {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return; 

    // 1. Identificar Botón Móvil
    let mobileBtn = document.getElementById('mobile-menu-btn');
    if (!mobileBtn) {
        const possibleBtn = document.querySelector('.lg\\:hidden button span.material-symbols-outlined');
        if (possibleBtn && possibleBtn.innerText.trim() === 'menu') {
            mobileBtn = possibleBtn.parentElement;
        }
    }

    // 2. Identificar Botón Escritorio
    let desktopBtn = document.getElementById('desktop-sidebar-toggle');
    
    if (!desktopBtn) {
        desktopBtn = document.createElement('button');
        desktopBtn.id = 'desktop-sidebar-toggle';
        desktopBtn.className = 'fixed bottom-6 left-6 z-50 p-4 rounded-full bg-primary text-white shadow-xl hover:bg-primary-dark transition-all transform hover:scale-110 hidden lg:flex print:hidden items-center justify-center';
        desktopBtn.innerHTML = '<span class="material-symbols-outlined text-2xl">menu_open</span>';
        desktopBtn.title = "Alternar Menú";
        document.body.appendChild(desktopBtn);
    }

    const toggleSidebar = (isDesktop) => {
        if (isDesktop) {
            if (sidebar.classList.contains('lg:flex')) {
                sidebar.classList.remove('lg:flex');
                sidebar.classList.add('lg:hidden');
                updateDesktopIcon('menu'); 
            } else {
                sidebar.classList.remove('lg:hidden');
                sidebar.classList.add('lg:flex');
                updateDesktopIcon('menu_open'); 
            }
        } else {
            if (sidebar.classList.contains('hidden')) {
                sidebar.classList.remove('hidden');
                sidebar.classList.add('flex');
            } else {
                sidebar.classList.add('hidden');
                sidebar.classList.remove('flex');
            }
        }
    };

    const updateDesktopIcon = (iconName) => {
        if (desktopBtn) {
            const icon = desktopBtn.querySelector('.material-symbols-outlined');
            if (icon) icon.innerText = iconName;
        }
    };

    if (desktopBtn) {
        desktopBtn.onclick = (e) => {
            e.stopPropagation();
            toggleSidebar(true);
        };
        const isHidden = sidebar.classList.contains('lg:hidden');
        updateDesktopIcon(isHidden ? 'menu' : 'menu_open');
    }

    if (mobileBtn) {
        mobileBtn.onclick = (e) => {
            e.stopPropagation();
            toggleSidebar(false);
        };
    }

    document.addEventListener('click', (e) => {
        const isMobile = window.innerWidth < 1024;
        const isHidden = sidebar.classList.contains('hidden');
        
        if (isMobile && !isHidden) {
            const clickedInside = sidebar.contains(e.target);
            const clickedBtn = mobileBtn && mobileBtn.contains(e.target);
            
            if (!clickedInside && !clickedBtn) {
                toggleSidebar(false);
            }
        }
    });
}

function createLinkHTML(link, currentPath, isAdmin = false) {
    let isActive = false;
    const pageName = currentPath.split('/').pop() || 'index.html';
    const cleanPageName = pageName.split('?')[0];

    if ((link.href === 'index.html' && (cleanPageName === '' || cleanPageName === 'index.html')) || cleanPageName === link.href) {
        isActive = true;
    }
    
    let classes = "flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all ";
    
    if (isActive) {
        if (isAdmin) classes += "bg-admin/10 text-admin border-l-4 border-admin";
        else classes += "bg-primary/10 text-primary border-l-4 border-primary"; 
    } else {
        classes += "text-text-secondary hover:text-white hover:bg-white/5";
    }

    const iconColorClass = isActive && isAdmin ? "text-admin" : (isActive ? "text-primary" : "material-symbols-outlined");

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
    const managementSection = document.getElementById('layout-management-section');

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

    // Lógica de Visibilidad de Secciones
    if (adminSection) {
        if (role === 'admin') adminSection.classList.remove('hidden');
        else adminSection.classList.add('hidden');
    }

    // La sección de Gestión (Boletines) se muestra si es Admin O Secretaria
    if (managementSection) {
        if (role === 'admin' || role === 'secretaria') managementSection.classList.remove('hidden');
        else managementSection.classList.add('hidden');
    }
}