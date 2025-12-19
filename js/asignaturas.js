import { db, collection, getDocs, doc, setDoc, deleteDoc, updateDoc, query, orderBy, onSnapshot } from './firebase-config.js';

let allSubjects = [];
let teachersCache = []; // Para guardar la lista de profesores

// ESCUCHAR EVENTO GLOBALMENTE PARA EVITAR PÉRDIDAS
window.addEventListener('adminReady', async () => {
    console.log("Evento adminReady recibido en asignaturas.js");
    await loadTeachers(); // Cargar profesores primero
    setupRealtimeListener(); // Luego escuchar asignaturas
});

document.addEventListener('DOMContentLoaded', () => {
    // Configurar buscador
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSubjects(e.target.value);
        });
    }

    // Configurar Formulario
    const form = document.getElementById('form-subject');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

// --- CARGAR PROFESORES (Exportada a window para uso de emergencia) ---
window.loadTeachers = async function() {
    console.log("Cargando lista de profesores...");
    const select = document.getElementById('subject-teacher');
    try {
        const usersRef = collection(db, "usuarios");
        const snapshot = await getDocs(usersRef);
        
        teachersCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Mostrar a todos excepto el super admin si se desea
            if (data.email !== 'admin@mail.com') {
                teachersCache.push({
                    email: data.email,
                    nombre: data.nombre || data.email
                });
            }
        });

        console.log(`Encontrados ${teachersCache.length} profesores.`);

        // Llenar el select
        if (select) {
            let html = '<option value="" selected>Sin asignar</option>';
            if(teachersCache.length === 0) {
                 html += '<option value="" disabled>No hay profesores registrados</option>';
            } else {
                teachersCache.forEach(t => {
                    html += `<option value="${t.email}">${t.nombre}</option>`;
                });
            }
            select.innerHTML = html;
        }

    } catch (error) {
        console.error("Error cargando profesores:", error);
        if(select) select.innerHTML = '<option value="" disabled>Error al cargar</option>';
    }
}

// --- LISTENER EN TIEMPO REAL ---
function setupRealtimeListener() {
    const loader = document.getElementById('loader');
    const q = query(collection(db, "asignaturas_catalogo"), orderBy("nombre"));

    onSnapshot(q, (snapshot) => {
        allSubjects = [];
        snapshot.forEach(doc => {
            allSubjects.push({ id: doc.id, ...doc.data() });
        });

        renderSubjects(allSubjects);
        if (loader) loader.style.display = 'none';
    }, (error) => {
        console.error("Error escuchando asignaturas:", error);
        if (loader) loader.style.display = 'none';
    });
}

// --- RENDERIZADO ---
function renderSubjects(subjects) {
    const grid = document.getElementById('subjects-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (!grid) return;
    grid.innerHTML = '';

    if (subjects.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if(emptyState) emptyState.classList.add('hidden');

    subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = "bg-surface-dark border border-surface-border p-4 rounded-xl flex flex-col justify-between group hover:border-admin/50 transition-all shadow-sm hover:shadow-md h-32";
        
        const initial = sub.nombre.charAt(0).toUpperCase();
        
        // Buscar nombre del profesor si existe
        let teacherName = "Sin profesor asignado";
        let teacherClass = "text-text-secondary/50 italic";
        
        if (sub.profesor_email) {
            // Buscamos en caché, si no está (quizás cargó después), mostramos el email
            const teacher = teachersCache.find(t => t.email === sub.profesor_email);
            teacherName = teacher ? teacher.nombre : sub.profesor_email;
            teacherClass = "text-primary font-medium";
        }

        card.innerHTML = `
            <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-lg bg-surface-border/50 flex items-center justify-center text-white font-bold text-lg group-hover:bg-admin group-hover:text-background-dark transition-colors shrink-0">
                    ${initial}
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-bold text-sm leading-tight truncate" title="${sub.nombre}">${sub.nombre}</h3>
                    <div class="flex items-center gap-1.5 mt-1.5">
                        <span class="material-symbols-outlined text-[14px] text-text-secondary">person</span>
                        <span class="text-xs truncate ${teacherClass}">${teacherName}</span>
                    </div>
                </div>
            </div>
            
            <div class="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="editSubject('${sub.id}', '${sub.nombre.replace(/'/g, "\\'")}', '${sub.profesor_email || ''}')" class="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-surface-border transition-colors flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-surface-border/30">
                    <span class="material-symbols-outlined text-[14px]">edit</span> Editar
                </button>
                <button onclick="deleteSubject('${sub.id}')" class="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors flex items-center justify-center bg-surface-border/30">
                    <span class="material-symbols-outlined text-[14px]">delete</span>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- FILTRADO ---
function filterSubjects(term) {
    const lowerTerm = term.toLowerCase();
    const filtered = allSubjects.filter(s => s.nombre.toLowerCase().includes(lowerTerm));
    renderSubjects(filtered);
}

// --- CRUD ---
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('subject-name');
    const teacherSelect = document.getElementById('subject-teacher'); 
    const editIdInput = document.getElementById('edit-id');
    const btn = e.target.querySelector('button[type="submit"]');
    
    const name = nameInput.value.trim();
    const teacherEmail = teacherSelect ? teacherSelect.value : "";
    const editId = editIdInput.value;

    if (!name) return;

    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...';

    try {
        const dataToSave = {
            nombre: name,
            profesor_email: teacherEmail // Guardamos el email del profesor
        };

        if (editId) {
            // MODO EDICIÓN
            await updateDoc(doc(db, "asignaturas_catalogo", editId), dataToSave);
            if(window.showToast) window.showToast("Asignatura actualizada", "success");

        } else {
            // MODO CREACIÓN
            const slug = name.toLowerCase().replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
            await setDoc(doc(db, "asignaturas_catalogo", slug), dataToSave);
            if(window.showToast) window.showToast("Asignatura creada", "success");
        }

        if(window.toggleModal) window.toggleModal('modal-manage-subject');
        e.target.reset();

    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// Funciones globales
window.editSubject = (id, currentName, currentTeacherEmail) => {
    const editIdInput = document.getElementById('edit-id');
    const nameInput = document.getElementById('subject-name');
    const teacherSelect = document.getElementById('subject-teacher');
    const title = document.getElementById('modal-title');
    const icon = document.getElementById('modal-icon');

    editIdInput.value = id;
    nameInput.value = currentName;
    
    // Si la lista de profesores aún no cargó, intentamos cargarla ahora
    if (teacherSelect && teacherSelect.options.length <= 2) {
         window.loadTeachers().then(() => {
             if (teacherSelect) teacherSelect.value = currentTeacherEmail;
         });
    } else {
         if (teacherSelect) teacherSelect.value = currentTeacherEmail;
    }

    title.innerText = 'Editar Asignatura';
    icon.innerText = 'edit';
    
    if(window.toggleModal) window.toggleModal('modal-manage-subject');
};

window.deleteSubject = async (id) => {
    if (!confirm("¿Estás seguro de eliminar esta asignatura?\n\nEsta acción es irreversible.")) return;

    try {
        await deleteDoc(doc(db, "asignaturas_catalogo", id));
        if(window.showToast) window.showToast("Asignatura eliminada", "info");
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Error: " + error.message);
    }
};