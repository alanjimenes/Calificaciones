import { db, collection, getDocs, query, orderBy, limit, startAfter, where, endBefore, limitToLast, deleteDoc, doc, updateDoc } from './firebase-config.js';

let lastVisible = null; 
let firstVisible = null; 
let pageStack = []; 
const PAGE_SIZE = 10;
let isSearching = false;

window.addEventListener('adminReady', () => {
    loadUsers();
    setupSearch();
    setupPagination();
    
    // Configurar listener para el formulario de edición
    const editForm = document.getElementById('form-edit-user');
    if(editForm) {
        editForm.addEventListener('submit', handleEditUserSubmit);
    }
});

// --- VERIFICACIÓN DE ASIGNACIONES ---
async function checkUserAssignments(email) {
    try {
        const cursosRef = collection(db, "cursos_globales");
        const snapshot = await getDocs(cursosRef);
        let activeAssignments = [];

        snapshot.forEach(doc => {
            const curso = doc.data();
            if (curso.titular_email === email) {
                activeAssignments.push(`Titular del curso: ${curso.nombre}`);
            }
            if (curso.profesores_materias) {
                for (const [materia, profEmail] of Object.entries(curso.profesores_materias)) {
                    if (profEmail === email) {
                        activeAssignments.push(`Profesor de ${materia} en ${curso.nombre}`);
                    }
                }
            }
        });
        return activeAssignments;
    } catch (error) {
        console.error("Error verificando asignaciones:", error);
        return []; 
    }
}

// --- ELIMINAR USUARIO ---
window.deleteUser = async (userId, userEmail) => {
    const btn = document.getElementById(`btn-delete-${userId}`);
    const originalContent = btn ? btn.innerHTML : '';
    
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span>';
    }

    const assignments = await checkUserAssignments(userEmail);

    if (assignments.length > 0) {
        alert(`⛔ NO SE PUEDE ELIMINAR ⛔\n\nEl usuario ${userEmail} tiene responsabilidades activas:\n- ${assignments.slice(0, 5).join('\n- ')}\n\nReasigna sus clases antes de borrar.`);
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
        return;
    }

    if (!confirm(`¿Eliminar definitivamente a ${userEmail}?`)) {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
        return;
    }

    try {
        await deleteDoc(doc(db, "usuarios", userId));
        if(window.showToast) window.showToast("Usuario eliminado", "success");
        
        if (isSearching) {
             const searchInput = document.getElementById('search-input');
             searchInput.dispatchEvent(new Event('input')); 
        } else {
            loadUsers('init'); 
        }
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Error: " + error.message);
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
};

// --- ABRIR MODAL EDICIÓN ---
window.editUser = (id, nombre, rol, nivelEstudios, email, telefono) => {
    const modal = document.getElementById('modal-edit-user');
    if(!modal) return;

    // Cargar datos en el formulario
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    
    setVal('edit-user-id', id);
    setVal('edit-user-email-display', email);
    setVal('edit-name', nombre);
    setVal('edit-role', rol || 'profesor');
    setVal('edit-nivel', nivelEstudios);
    setVal('edit-telefono', telefono);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

// --- GUARDAR CAMBIOS EDICIÓN ---
async function handleEditUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const btn = e.target.querySelector('button[type="submit"]');

    // Captura segura de valores
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    
    const nombre = getVal('edit-name');
    const rol = getVal('edit-role');
    const nivel = getVal('edit-nivel');
    const telefono = getVal('edit-telefono');

    btn.disabled = true;
    btn.innerHTML = 'Guardando...';

    try {
        await updateDoc(doc(db, "usuarios", id), {
            nombre: nombre,
            rol: rol,
            nivel_estudios: nivel,
            telefono: telefono // Se asegura de guardar el teléfono
        });

        if(window.showToast) window.showToast("Datos actualizados", "success");
        
        if(window.toggleModal) window.toggleModal('modal-edit-user');
        else document.getElementById('modal-edit-user').classList.add('hidden');
        
        if (isSearching) {
             const searchInput = document.getElementById('search-input');
             searchInput.dispatchEvent(new Event('input')); 
        } else {
            loadUsers('init'); 
        }

    } catch (error) {
        console.error(error);
        alert("Error al actualizar: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Guardar Cambios';
    }
}

// --- CARGAR LISTA ---
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
            q = pageStack.length === 0 ? query(usersRef, orderBy("email"), limit(PAGE_SIZE)) : query(usersRef, orderBy("email"), endBefore(firstVisible), limitToLast(PAGE_SIZE));
            if(pageStack.length > 0) pageStack.pop(); 
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
            if (direction === 'init') if(emptyState) emptyState.classList.remove('hidden');
            if(btnNext) btnNext.disabled = true;
        }

    } catch (error) {
        console.error("Error cargando usuarios:", error);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-danger">Error: ${error.message}</td></tr>`;
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let timeout = null;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            if (term.length === 0) { isSearching = false; loadUsers('init'); return; }
            isSearching = true;
            
            const loader = document.getElementById('loader');
            const tableBody = document.getElementById('users-table-body');
            if(loader) loader.style.display = 'flex';
            if(tableBody) tableBody.innerHTML = '';

            try {
                const q = query(collection(db, "usuarios"), orderBy("email"), where("email", ">=", term), where("email", "<=", term + '\uf8ff'), limit(20));
                const snapshot = await getDocs(q);
                renderTable(snapshot);
                if (snapshot.empty) document.getElementById('empty-state').classList.remove('hidden');
                else document.getElementById('empty-state').classList.add('hidden');
            } catch (error) { console.error("Error búsqueda:", error); } finally { if(loader) loader.style.display = 'none'; }
        }, 500); 
    });
}

function setupPagination() {
    document.getElementById('btn-next').addEventListener('click', () => { if(!isSearching) loadUsers('next'); });
    document.getElementById('btn-prev').addEventListener('click', () => { if(!isSearching) loadUsers('prev'); });
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

        // Preparación de datos seguros (escapar comillas)
        const sName = (user.nombre || "").replace(/'/g, "\\'");
        const sRole = (user.rol || "profesor");
        const sNivel = (user.nivel_estudios || "").replace(/'/g, "\\'");
        const sEmail = (user.email || "");
        const sPhone = (user.telefono || "").replace(/'/g, "\\'");

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-white font-bold text-sm border border-white/5">
                        ${getInitials(user.nombre || user.email || "?")}
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-medium text-white">${user.nombre || "Sin Nombre"}</div>
                        <div class="text-xs text-text-secondary">
                            ${user.nivel_estudios || 'N/A'} 
                            ${user.telefono ? `• ${user.telefono}` : ''}
                        </div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-[10px] leading-5 font-bold rounded-full border ${roleBadgeClass} uppercase">${user.rol || 'docente'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-green-400 bg-green-400/10 border border-green-400/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> Activo
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-text-secondary font-mono">${user.email}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end gap-2">
                    <button onclick="editUser('${userId}', '${sName}', '${sRole}', '${sNivel}', '${sEmail}', '${sPhone}')" class="text-text-secondary hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-border" title="Editar">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button id="btn-delete-${userId}" onclick="deleteUser('${userId}', '${sEmail}')" class="text-text-secondary hover:text-danger transition-colors p-2 rounded-lg hover:bg-danger/10" title="Eliminar">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function getInitials(name) {
    if(!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}