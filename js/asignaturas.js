import { db, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, appId } from './firebase-config.js';

let allSubjects = [];

document.addEventListener('DOMContentLoaded', () => {
    loadSubjects();

    // Buscador en tiempo real
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allSubjects.filter(sub => 
                (sub.nombre || '').toLowerCase().includes(term) ||
                (sub.codigo || '').toLowerCase().includes(term)
            );
            renderSubjects(filtered);
        });
    }

    // Formulario Submit
    const form = document.getElementById('form-subject');
    if (form) form.addEventListener('submit', handleSaveSubject);
});

// --- CARGAR DATOS ---
async function loadSubjects() {
    const grid = document.getElementById('subjects-grid');
    const emptyState = document.getElementById('empty-state');
    const totalCount = document.getElementById('total-subjects');

    try {
        // Usamos la ruta artifacts para consistencia y permisos
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'asignaturas');
        const snapshot = await getDocs(colRef);
        
        allSubjects = [];
        snapshot.forEach(doc => {
            allSubjects.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar alfabéticamente
        allSubjects.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

        if (allSubjects.length === 0) {
            grid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            emptyState.classList.add('flex');
        } else {
            emptyState.classList.add('hidden');
            emptyState.classList.remove('flex');
            grid.classList.remove('hidden');
            renderSubjects(allSubjects);
        }

        if (totalCount) totalCount.innerText = allSubjects.length;

    } catch (error) {
        console.error("Error cargando asignaturas:", error);
        grid.innerHTML = '<p class="text-danger col-span-full text-center">Error al cargar datos.</p>';
    }
}

// --- RENDERIZADO ---
function renderSubjects(subjects) {
    const grid = document.getElementById('subjects-grid');
    grid.innerHTML = '';

    subjects.forEach(sub => {
        // Configuración visual según área
        const styles = getAreaStyles(sub.area);
        
        // Formato de Horario
        const horario = (sub.horario_inicio && sub.horario_fin) 
            ? `<span class="flex items-center gap-1 text-[11px] text-text-secondary"><span class="material-symbols-outlined text-[14px]">schedule</span> ${sub.horario_inicio} - ${sub.horario_fin}</span>`
            : `<span class="text-[11px] text-text-secondary/50 italic">Sin horario definido</span>`;

        // Formato de Días
        let diasDisplay = '';
        if (sub.dias && sub.dias.length > 0) {
            diasDisplay = `<div class="flex gap-1 mt-1 flex-wrap">`;
            sub.dias.forEach(d => {
                diasDisplay += `<span class="px-1.5 py-0.5 rounded text-[10px] bg-surface-border text-text-secondary font-medium">${d}</span>`;
            });
            diasDisplay += `</div>`;
        } else {
            diasDisplay = `<div class="mt-1 text-[10px] text-text-secondary/30 italic">Sin días asignados</div>`;
        }

        const card = document.createElement('div');
        card.className = "group bg-surface-dark border border-surface-border hover:border-primary/50 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl relative overflow-hidden";
        
        card.innerHTML = `
            <!-- Fondo decorativo -->
            <div class="absolute -right-4 -top-4 w-24 h-24 rounded-full ${styles.bg} opacity-20 blur-2xl transition-opacity group-hover:opacity-30"></div>
            
            <div class="flex justify-between items-start mb-4 relative z-10">
                <div class="p-3 rounded-xl ${styles.bg} ${styles.text} border ${styles.border}">
                    <span class="material-symbols-outlined text-2xl">${styles.icon}</span>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editSubject('${sub.id}')" class="p-2 rounded-lg hover:bg-white/10 text-text-secondary hover:text-white transition-colors" title="Editar">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onclick="deleteSubject('${sub.id}')" class="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors" title="Eliminar">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </div>
            
            <div class="relative z-10">
                <h3 class="text-lg font-bold text-white mb-1 leading-tight">${sub.nombre}</h3>
                <div class="flex flex-wrap items-center gap-2 mb-3">
                    <span class="text-[10px] font-mono bg-surface-border/50 px-2 py-0.5 rounded text-text-secondary border border-surface-border">${sub.codigo || 'S/C'}</span>
                    <span class="text-[10px] font-bold ${styles.text} uppercase tracking-wider">${styles.label}</span>
                </div>
                <div class="mb-3 border-t border-surface-border/50 pt-2">
                    ${horario}
                    ${diasDisplay}
                </div>
                <p class="text-xs text-text-secondary line-clamp-2">${sub.descripcion || 'Sin descripción.'}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- ESTILOS POR ÁREA ---
function getAreaStyles(area) {
    const map = {
        'matematicas': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: 'functions', label: 'Matemáticas' },
        'lengua': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: 'auto_stories', label: 'Lengua Española' },
        'ciencias': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', icon: 'science', label: 'Ciencias' },
        'sociales': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', icon: 'public', label: 'Sociales' },
        'idiomas': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', icon: 'translate', label: 'Idiomas' },
        'arte': { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20', icon: 'palette', label: 'Arte' },
        'tecnica': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', icon: 'computer', label: 'Técnica' },
        'general': { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: 'school', label: 'General' }
    };
    return map[area] || map['general'];
}

// --- CREAR / EDITAR ---
window.openCreateModal = () => {
    document.getElementById('form-subject').reset();
    document.getElementById('subject-id').value = '';
    document.getElementById('modal-title').innerText = 'Nueva Asignatura';
    document.getElementById('btn-text').innerText = 'Guardar Asignatura';
    
    // Resetear horario
    document.getElementById('subject-start').value = '';
    document.getElementById('subject-end').value = '';

    // Resetear días (desmarcar todos)
    document.querySelectorAll('input[name="subject-days"]').forEach(cb => cb.checked = false);

    window.toggleModal('modal-subject');
};

window.editSubject = (id) => {
    const sub = allSubjects.find(s => s.id === id);
    if (!sub) return;

    document.getElementById('subject-id').value = sub.id;
    document.getElementById('subject-name').value = sub.nombre;
    document.getElementById('subject-code').value = sub.codigo || '';
    document.getElementById('subject-area').value = sub.area || 'general';
    document.getElementById('subject-desc').value = sub.descripcion || '';
    
    // Cargar horario
    document.getElementById('subject-start').value = sub.horario_inicio || '';
    document.getElementById('subject-end').value = sub.horario_fin || '';

    // Cargar días
    const diasSeleccionados = sub.dias || [];
    document.querySelectorAll('input[name="subject-days"]').forEach(cb => {
        cb.checked = diasSeleccionados.includes(cb.value);
    });

    document.getElementById('modal-title').innerText = 'Editar Asignatura';
    document.getElementById('btn-text').innerText = 'Actualizar Cambios';
    window.toggleModal('modal-subject');
};

async function handleSaveSubject(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Procesando...';

    const id = document.getElementById('subject-id').value;
    
    // Capturar días seleccionados
    const checkboxes = document.querySelectorAll('input[name="subject-days"]:checked');
    const dias = Array.from(checkboxes).map(cb => cb.value);

    const data = {
        nombre: document.getElementById('subject-name').value.trim(),
        codigo: document.getElementById('subject-code').value.trim().toUpperCase(),
        area: document.getElementById('subject-area').value,
        descripcion: document.getElementById('subject-desc').value.trim(),
        horario_inicio: document.getElementById('subject-start').value,
        horario_fin: document.getElementById('subject-end').value,
        dias: dias // Guardar array de días
    };

    try {
        const colPath = ['artifacts', appId, 'public', 'data', 'asignaturas'];
        
        if (id) {
            await updateDoc(doc(db, ...colPath, id), data);
            if (window.showToast) window.showToast("Asignatura actualizada", "success");
        } else {
            await addDoc(collection(db, ...colPath), data);
            if (window.showToast) window.showToast("Asignatura creada", "success");
        }

        window.toggleModal('modal-subject');
        loadSubjects();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- ELIMINAR ---
window.deleteSubject = async (id) => {
    if (!confirm("¿Eliminar esta asignatura? Esto no afectará las calificaciones ya registradas, pero desaparecerá del catálogo.")) return;

    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'asignaturas', id));
        if (window.showToast) window.showToast("Asignatura eliminada", "info");
        loadSubjects();
    } catch (error) {
        console.error(error);
        alert("Error al eliminar: " + error.message);
    }
};

window.toggleModal = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden');
        el.classList.toggle('flex');
    }
};