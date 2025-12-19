import { db, collection, getDocs, query, orderBy, limit, startAfter, where, endBefore, limitToLast } from './firebase-config.js';

let lastVisible = null; // Último documento de la página actual (para "Siguiente")
let firstVisible = null; // Primer documento de la página actual (para referencias)
let pageStack = []; // Pila para guardar el historial de navegación (para "Anterior")
const PAGE_SIZE = 10;
let isSearching = false;

window.addEventListener('adminReady', () => {
    loadUsers();
    setupSearch();
    setupPagination();
});

// --- CARGA INICIAL Y PAGINACIÓN ---
async function loadUsers(direction = 'init') {
    const tableBody = document.getElementById('users-table-body');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');
    const btnNext = document.getElementById('btn-next');
    const btnPrev = document.getElementById('btn-prev');

    if(loader) loader.style.display = 'flex';
    if(tableBody) tableBody.innerHTML = '';
    
    try {
        let q;
        const usersRef = collection(db, "usuarios");

        // Construir Query según dirección
        if (direction === 'init') {
            q = query(usersRef, orderBy("email"), limit(PAGE_SIZE));
            pageStack = []; // Resetear pila
        } else if (direction === 'next' && lastVisible) {
            pageStack.push(firstVisible); // Guardar dónde empezó esta página
            q = query(usersRef, orderBy("email"), startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (direction === 'prev' && pageStack.length > 0) {
            const prevStart = pageStack.pop(); // Recuperar el inicio de la página anterior
            // Usamos startAt o re-consultamos desde ese punto
            // La forma más estable en retroceso simple es consultar desde ese punto hacia adelante de nuevo
            q = query(usersRef, orderBy("email"), startAfter(prevStart ? prevStart : ''), limit(PAGE_SIZE)); 
            
            // CORRECCIÓN PARA 'PREV':
            // Si vamos al principio absoluto (init), la lógica de arriba podría fallar si prevStart es null.
            // Una estrategia más robusta para "prev" sin cursores complejos es usar endBefore del actual firstVisible.
            // Pero el stack approach funciona bien si guardamos el snapshot del último doc de la página ANTERIOR a la actual.
            
            // Simplificación para estabilidad:
            // Si stack está vacío, es la primera página.
            if (pageStack.length === 0) {
                 q = query(usersRef, orderBy("email"), limit(PAGE_SIZE));
            } else {
                 const prevLastVisible = pageStack[pageStack.length - 1]; // Mirar el último de la pila anterior (conceptualmente)
                 // Nota: Pagination bidireccional perfecta en Firestore requiere lógica compleja.
                 // Vamos a usar una estrategia simple: Recargar 'init' si volvemos al principio, 
                 // o usar endBefore(firstVisible) limitToLast(PAGE_SIZE).
                 q = query(usersRef, orderBy("email"), endBefore(firstVisible), limitToLast(PAGE_SIZE));
            }
        }

        const querySnapshot = await getDocs(q);
        
        // Actualizar cursores
        if (!querySnapshot.empty) {
            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            firstVisible = querySnapshot.docs[0];
            renderTable(querySnapshot);
            
            // Manejo de botones
            if(btnNext) btnNext.disabled = querySnapshot.docs.length < PAGE_SIZE;
            if(btnPrev) btnPrev.disabled = (direction === 'init' || (direction === 'prev' && pageStack.length === 0));
            // Hack para habilitar Prev si acabamos de avanzar
            if(direction === 'next' && btnPrev) btnPrev.disabled = false;

        } else {
            // Si no hay datos (página vacía o colección vacía)
            if (direction === 'init') {
                if(emptyState) emptyState.classList.remove('hidden');
                if(btnNext) btnNext.disabled = true;
                if(btnPrev) btnPrev.disabled = true;
            } else {
                // Llegamos al final real
                if(btnNext) btnNext.disabled = true;
            }
        }

    } catch (error) {
        console.error("Error cargando usuarios:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-danger">Error: ${error.message}</td></tr>`;
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// --- BUSCADOR (Server-side) ---
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let timeout = null;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        
        clearTimeout(timeout);
        
        // Debounce para no saturar la API
        timeout = setTimeout(async () => {
            if (term.length === 0) {
                isSearching = false;
                loadUsers('init'); // Volver a paginación normal
                return;
            }

            isSearching = true;
            // Deshabilitar paginación durante búsqueda
            document.getElementById('btn-next').disabled = true;
            document.getElementById('btn-prev').disabled = true;

            const loader = document.getElementById('loader');
            const tableBody = document.getElementById('users-table-body');
            if(loader) loader.style.display = 'flex';
            if(tableBody) tableBody.innerHTML = '';

            try {
                // Búsqueda por prefijo en 'email'
                // Nota: Firestore requiere index compuesto si mezclas campos, pero esto es simple.
                // '\uf8ff' es un caracter Unicode muy alto para simular "cualquier cosa después".
                const q = query(
                    collection(db, "usuarios"), 
                    orderBy("email"), 
                    where("email", ">=", term),
                    where("email", "<=", term + '\uf8ff'),
                    limit(20) // Límite de seguridad para búsqueda
                );

                const snapshot = await getDocs(q);
                renderTable(snapshot);

                if (snapshot.empty) {
                    document.getElementById('empty-state').classList.remove('hidden');
                }

            } catch (error) {
                console.error("Error búsqueda:", error);
            } finally {
                if(loader) loader.style.display = 'none';
            }

        }, 500); // 500ms delay
    });
}

function setupPagination() {
    document.getElementById('btn-next').addEventListener('click', () => {
        if(!isSearching) loadUsers('next');
    });
    
    document.getElementById('btn-prev').addEventListener('click', () => {
        if(!isSearching) loadUsers('prev');
    });
}

function renderTable(snapshot) {
    const tableBody = document.getElementById('users-table-body');
    const emptyState = document.getElementById('empty-state');
    const pageCount = document.getElementById('page-count');
    
    if(emptyState) emptyState.classList.add('hidden');
    if(pageCount) pageCount.innerText = snapshot.docs.length;

    tableBody.innerHTML = ''; // Limpiar previo

    snapshot.forEach((doc) => {
        const user = doc.data();
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors group";

        let roleBadgeClass = "bg-primary/10 text-primary border-primary/20";
        if (user.rol === 'admin') roleBadgeClass = "bg-admin/10 text-admin border-admin/20";
        if (user.rol === 'titular') roleBadgeClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-white font-bold text-sm">
                        ${getInitials(user.nombre || user.email || "?")}
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-white">${user.nombre || "Sin Nombre"}</div>
                        <div class="text-xs text-text-secondary">Creado: ${formatDate(user.fecha_creacion)}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-[10px] leading-5 font-bold rounded-full border ${roleBadgeClass} uppercase">
                    ${user.rol || 'docente'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-green-400 bg-green-400/10 border border-green-400/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Activo
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono">
                ${user.email}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-text-secondary hover:text-white transition-colors p-2 rounded-full hover:bg-surface-border">
                    <span class="material-symbols-outlined text-lg">more_vert</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function getInitials(name) {
    if(!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatDate(timestamp) {
    if(!timestamp) return "N/A";
    if(timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString();
    return "N/A";
}