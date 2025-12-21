import { db, collection, getDocs, doc, setDoc, deleteDoc, updateDoc, query, orderBy, onSnapshot } from './firebase-config.js';

let allSubjects = [];
let teachersCache = [];

window.addEventListener('adminReady', async () => {
    await loadTeachers();
    setupRealtimeListener();
});

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterSubjects(e.target.value));
    }
    const form = document.getElementById('form-subject');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

// --- CARGAR PROFESORES ---
window.loadTeachers = async function () {
    const select = document.getElementById('subject-teacher');
    try {
        const usersRef = collection(db, "usuarios");
        const snapshot = await getDocs(usersRef);
        teachersCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.email !== 'admin@mail.com') {
                teachersCache.push({ email: data.email, nombre: data.nombre || data.email });
            }
        });
        if (select) {
            let html = '<option value="" selected>Sin asignar</option>';
            if (teachersCache.length === 0) html += '<option value="" disabled>No hay profesores</option>';
            else teachersCache.forEach(t => html += `<option value="${t.email}">${t.nombre}</option>`);
            select.innerHTML = html;
        }
    } catch (error) { console.error(error); }
}

// --- LISTENER ---
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
        console.error(error);
        if (loader) loader.style.display = 'none';
    });
}

// --- SYNC ---
window.syncCatalog = async () => {
    if (!confirm("Se escanearán los cursos para añadir materias faltantes.\n\n¿Continuar?")) return;
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        const coursesSnap = await getDocs(collection(db, "cursos_globales"));
        const usedSubjects = new Set();
        coursesSnap.forEach(doc => {
            const data = doc.data();
            if (data.materias && Array.isArray(data.materias)) {
                data.materias.forEach(materiaName => { if (materiaName) usedSubjects.add(materiaName.trim()); });
            }
        });

        const existingNamesUpper = new Set(allSubjects.map(s => s.nombre.toUpperCase()));
        let addedCount = 0;

        for (const subject of usedSubjects) {
            if (!existingNamesUpper.has(subject.toUpperCase())) {
                const slug = subject.toLowerCase().replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                await setDoc(doc(db, "asignaturas_catalogo", slug), {
                    nombre: subject,
                    profesor_email: "",
                    nivel: "ambos" // Default al sincronizar
                });
                addedCount++;
            }
        }
        if (window.showToast) window.showToast(`Sincronización completa: +${addedCount}`, "success");
    } catch (error) { alert("Error: " + error.message); }
    finally { if (loader) loader.style.display = 'none'; }
}

// --- RENDER ---
function renderSubjects(subjects) {
    const grid = document.getElementById('subjects-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;
    grid.innerHTML = '';

    if (subjects.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = "bg-surface-dark border border-surface-border p-4 rounded-xl flex flex-col justify-between group hover:border-admin/50 transition-all shadow-sm hover:shadow-md min-h-[140px]";

        const initial = sub.nombre.charAt(0).toUpperCase();

        let teacherName = "Sin profesor";
        let teacherClass = "text-text-secondary/50 italic";
        if (sub.profesor_email) {
            const teacher = teachersCache.find(t => t.email === sub.profesor_email);
            teacherName = teacher ? teacher.nombre : sub.profesor_email;
            teacherClass = "text-primary font-medium";
        }

        // BADGE DE NIVEL - LÓGICA ACTUALIZADA PARA COINCIDIR CON LAS OPCIONES SOLICITADAS
        let levelBadge = '';
        const nivel = (sub.nivel || 'ambos').toLowerCase(); // Normalizar a minúsculas para comparar

        if (nivel === 'primario') {
            levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 uppercase">Nivel Primario</span>`;
        } else if (nivel === 'secundario') {
            levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase">Nivel Secundario</span>`;
        } else {
            levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20 uppercase">Ambos</span>`;
        }

        card.innerHTML = `
            <div>
                <div class="flex items-start gap-4 mb-3">
                    <div class="w-10 h-10 rounded-lg bg-surface-border/50 flex items-center justify-center text-white font-bold text-lg group-hover:bg-admin group-hover:text-background-dark transition-colors shrink-0">
                        ${initial}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-white font-bold text-sm leading-tight truncate mb-1" title="${sub.nombre}">${sub.nombre}</h3>
                        ${levelBadge}
                    </div>
                </div>
                <div class="flex items-center gap-1.5 pl-0.5">
                    <span class="material-symbols-outlined text-[14px] text-text-secondary">person</span>
                    <span class="text-xs truncate ${teacherClass}">${teacherName}</span>
                </div>
            </div>
            
            <div class="flex justify-end gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity pt-2 border-t border-surface-border/30">
                <button onclick="editSubject('${sub.id}')" class="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-surface-border transition-colors flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-surface-border/30">
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

function filterSubjects(term) {
    const lowerTerm = term.toLowerCase();
    const filtered = allSubjects.filter(s => s.nombre.toLowerCase().includes(lowerTerm));
    renderSubjects(filtered);
}

// --- FORM SUBMIT ---
async function handleFormSubmit(e) {
    e.preventDefault();

    const nameInput = document.getElementById('subject-name');
    const teacherSelect = document.getElementById('subject-teacher');
    const levelSelect = document.getElementById('subject-level');
    const editIdInput = document.getElementById('edit-id');
    const btn = e.target.querySelector('button[type="submit"]');

    const name = nameInput.value.trim();
    const teacherEmail = teacherSelect ? teacherSelect.value : "";
    const nivel = levelSelect ? levelSelect.value : "ambos";
    const editId = editIdInput.value;

    if (!name) return;

    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Guardando...';

    try {
        const dataToSave = {
            nombre: name,
            profesor_email: teacherEmail,
            nivel: nivel
        };

        if (editId) {
            await updateDoc(doc(db, "asignaturas_catalogo", editId), dataToSave);
            if (window.showToast) window.showToast("Actualizado correctamente", "success");
        } else {
            const slug = name.toLowerCase().replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            await setDoc(doc(db, "asignaturas_catalogo", slug), dataToSave);
            if (window.showToast) window.showToast("Asignatura creada", "success");
        }

        if (window.toggleModal) window.toggleModal('modal-manage-subject');
        e.target.reset();
    } catch (error) {
        alert("Error al guardar: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// --- FUNCIONES GLOBALES ---
window.editSubject = (id) => {
    // Buscar la asignatura completa en el array local
    const subject = allSubjects.find(s => s.id === id);
    if (!subject) return;

    document.getElementById('edit-id').value = subject.id;
    document.getElementById('subject-name').value = subject.nombre;
    document.getElementById('subject-level').value = subject.nivel || 'ambos';

    const teacherSelect = document.getElementById('subject-teacher');

    const fillTeacher = () => {
        if (teacherSelect) teacherSelect.value = subject.profesor_email || "";
    };

    if (teacherSelect && teacherSelect.options.length <= 2) {
        window.loadTeachers().then(fillTeacher);
    } else {
        fillTeacher();
    }

    document.getElementById('modal-title').innerText = 'Editar Asignatura';
    if (window.toggleModal) window.toggleModal('modal-manage-subject');
};

window.deleteSubject = async (id) => {
    if (!confirm("¿Eliminar asignatura del catálogo?")) return;
    try {
        await deleteDoc(doc(db, "asignaturas_catalogo", id));
        if (window.showToast) window.showToast("Eliminado", "info");
    } catch (error) { alert("Error: " + error.message); }
};