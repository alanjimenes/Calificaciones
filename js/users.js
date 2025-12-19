import { db, collection, getDocs, query, orderBy, limit, startAfter, where, endBefore, limitToLast, deleteDoc, doc } from './firebase-config.js';

let lastVisible = null; 
let firstVisible = null; 
let pageStack = []; 
const PAGE_SIZE = 10;
let isSearching = false;

window.addEventListener('adminReady', () => {
    loadUsers();
    setupSearch();
    setupPagination();
});

// --- FUNCIÓN DE ELIMINACIÓN ---
window.deleteUser = async (userId, userEmail) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario ${userEmail}?\n\nEsta acción borrará sus datos de perfil y rol en la base de datos.`)) {
        return;
    }

    // Feedback visual inmediato en el botón
    const btn = document.getElementById(`btn-delete-${userId}`);
    const originalContent = btn ? btn.innerHTML : '';
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">refresh</span>';
    }

    try {
        // Eliminar documento de la colección 'usuarios'
        await deleteDoc(doc(db, "usuarios", userId));
        
        if(window.showToast) window.showToast("Usuario eliminado correctamente", "success");
        else alert("Usuario eliminado.");
        
        // Recargar la vista actual para reflejar cambios
        // Si estábamos buscando, recargamos búsqueda, si no, init o refresh actual
        if (isSearching) {
             const searchInput = document.getElementById('search-input');
             searchInput.dispatchEvent(new Event('input')); // Re-trigger search
        } else {
            loadUsers('init'); // Simplificado: volver al inicio para evitar huecos en paginación
        }

    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Error al eliminar: " + error.message);
        // Restaurar botón si falló
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
};

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

        if (direction === 'init') {
            q = query(usersRef, orderBy("email"), limit(PAGE_SIZE));
            pageStack = []; 
        } else if (direction === 'next' && lastVisible) {
            pageStack.push(firstVisible); 
            q = query(usersRef, orderBy("email"), startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (direction === 'prev' && pageStack.length > 0) {
            if (pageStack.length === 0) {
                 q = query(usersRef, orderBy("email"), limit(PAGE_SIZE));
            } else {
                 q = query(usersRef, orderBy("email"), endBefore(firstVisible), limitToLast(PAGE_SIZE));
                 pageStack.pop(); 
            }
        } else {
             q = query(usersRef, orderBy("email"), limit(PAGE_SIZE));
        }

        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            firstVisible = querySnapshot.docs[0];
            renderTable(querySnapshot);
            
            if(btnNext) btnNext.disabled = querySnapshot.docs.length < PAGE_SIZE;
            if(btnPrev) btnPrev.disabled = (direction === 'init' || pageStack.length === 0 && direction !== 'next');
            if(direction === 'next' && btnPrev) btnPrev.disabled = false;

        } else {
            if (direction === 'init') {
                if(emptyState) emptyState.classList.remove('hidden');
                if(btnNext) btnNext.disabled = true;
                if(btnPrev) btnPrev.disabled = true;
            } else {
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

// --- BUSCADOR ---
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let timeout = null;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        
        clearTimeout(timeout);
        
        timeout = setTimeout(async () => {
            if (term.length === 0) {
                isSearching = false;
                loadUsers('init'); 
                return;
            }

            isSearching = true;
            document.getElementById('btn-next').disabled = true;
            document.getElementById('btn-prev').disabled = true;

            const loader = document.getElementById('loader');
            const tableBody = document.getElementById('users-table-body');
            if(loader) loader.style.display = 'flex';
            if(tableBody) tableBody.innerHTML = '';

            try {
                const q = query(
                    collection(db, "usuarios"), 
                    orderBy("email"), 
                    where("email", ">=", term),
                    where("email", "<=", term + '\uf8ff'),
                    limit(20) 
                );

                const snapshot = await getDocs(q);
                renderTable(snapshot);

                if (snapshot.empty) {
                    document.getElementById('empty-state').classList.remove('hidden');
                } else {
                    document.getElementById('empty-state').classList.add('hidden');
                }

            } catch (error) {
                console.error("Error búsqueda:", error);
            } finally {
                if(loader) loader.style.display = 'none';
            }

        }, 500); 
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

    tableBody.innerHTML = ''; 

    snapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const userId = docSnap.id; 
        
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors group";

        let roleBadgeClass = "bg-primary/10 text-primary border-primary/20";
        if (user.rol === 'admin') roleBadgeClass = "bg-admin/10 text-admin border-admin/20";
        if (user.rol === 'titular') roleBadgeClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-white font-bold text-sm border border-white/5">
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
                <button id="btn-delete-${userId}" onclick="deleteUser('${userId}', '${user.email}')" class="text-text-secondary hover:text-danger transition-colors p-2 rounded-lg hover:bg-danger/10 group-hover:visible" title="Eliminar Usuario">
                    <span class="material-symbols-outlined text-lg">delete</span>
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