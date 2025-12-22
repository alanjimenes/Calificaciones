import { db, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, where, orderBy, appId, auth, runTransaction } from './firebase-config.js';

let allTasks = [];
let availableCourses = [];

document.addEventListener('DOMContentLoaded', () => {
    // Configuración inicial
    setupEventListeners();
});

window.addEventListener('userReady', async (e) => {
    await loadCoursesForSelect();
    loadTasks();
});

function setupEventListeners() {
    // Buscador
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', filterTasks);

    // Filtros
    const statusFilter = document.getElementById('filter-status');
    const priorityFilter = document.getElementById('filter-priority');
    if (statusFilter) statusFilter.addEventListener('change', filterTasks);
    if (priorityFilter) priorityFilter.addEventListener('change', filterTasks);

    // Formulario Submit
    const form = document.getElementById('form-task');
    if (form) form.addEventListener('submit', handleSaveTask);

    // Cambio de curso en formulario (cargar asignaturas)
    const courseSelect = document.getElementById('task-course');
    if (courseSelect) {
        courseSelect.addEventListener('change', (e) => {
            const courseId = e.target.value;
            loadSubjectsForCourse(courseId);
        });
    }
}

// --- CARGAR CURSOS ---
async function loadCoursesForSelect() {
    const select = document.getElementById('task-course');
    if(!select) return;

    try {
        // En una app real, filtraríamos solo los cursos del profesor si no es admin
        const snapshot = await getDocs(collection(db, 'cursos_globales'));
        availableCourses = [];
        
        let options = '<option value="">Seleccionar Curso</option>';
        snapshot.forEach(doc => {
            const data = doc.data();
            // Filtrar solo cursos relevantes si es profesor (opcional)
            availableCourses.push({ id: doc.id, ...data });
            options += `<option value="${doc.id}">${data.nombre}</option>`;
        });
        select.innerHTML = options;
    } catch (error) {
        console.error("Error cargando cursos:", error);
    }
}

// --- CARGAR ASIGNATURAS SEGÚN CURSO ---
function loadSubjectsForCourse(courseId) {
    const select = document.getElementById('task-subject');
    if(!select) return;

    if (!courseId) {
        select.innerHTML = '<option value="">Selecciona curso primero</option>';
        return;
    }

    const course = availableCourses.find(c => c.id === courseId);
    if (course && course.materias) {
        let options = '<option value="">Seleccionar Asignatura</option>';
        course.materias.forEach(mat => {
            options += `<option value="${mat}">${mat}</option>`;
        });
        select.innerHTML = options;
    } else {
        select.innerHTML = '<option value="">Sin asignaturas registradas</option>';
    }
}

// --- CARGAR TAREAS ---
async function loadTasks() {
    const grid = document.getElementById('tasks-grid');
    const emptyState = document.getElementById('empty-state');
    
    try {
        grid.innerHTML = '<div class="col-span-full flex justify-center py-10"><span class="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span></div>';

        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'tareas');
        const q = query(colRef, orderBy("fecha_creacion", "desc"));
        
        const snapshot = await getDocs(q);
        
        allTasks = [];
        snapshot.forEach(doc => {
            allTasks.push({ id: doc.id, ...doc.data() });
        });

        filterTasks(); 

    } catch (error) {
        console.error("Error cargando tareas:", error);
        grid.innerHTML = '<p class="text-danger col-span-full text-center">Error al cargar datos.</p>';
    }
}

// --- FILTRADO Y RENDERIZADO ---
function filterTasks() {
    const term = document.getElementById('search-input')?.value.toLowerCase() || '';
    const status = document.getElementById('filter-status')?.value || 'all';
    const priority = document.getElementById('filter-priority')?.value || 'all';

    const now = new Date();

    const filtered = allTasks.filter(task => {
        const matchesTerm = (task.titulo || '').toLowerCase().includes(term) ||
                            (task.curso_nombre || '').toLowerCase().includes(term) ||
                            (task.asignatura || '').toLowerCase().includes(term);
        
        let matchesStatus = true;
        const taskDate = new Date(task.fecha_entrega);
        if (status === 'active') matchesStatus = taskDate >= now;
        if (status === 'expired') matchesStatus = taskDate < now;

        let matchesPriority = true;
        if (priority !== 'all') matchesPriority = task.prioridad === priority;

        return matchesTerm && matchesStatus && matchesPriority;
    });

    renderTasks(filtered);
}

function renderTasks(tasks) {
    const grid = document.getElementById('tasks-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (tasks.length === 0) {
        grid.classList.add('hidden');
        if(emptyState) emptyState.classList.remove('hidden');
        if(emptyState) emptyState.classList.add('flex');
        return;
    }

    if(emptyState) emptyState.classList.add('hidden');
    if(emptyState) emptyState.classList.remove('flex');
    grid.classList.remove('hidden');
    grid.innerHTML = '';

    tasks.forEach(task => {
        const dateObj = new Date(task.fecha_entrega);
        const isExpired = dateObj < new Date();
        
        // Formato fecha amigable
        const options = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' };
        const dateStr = dateObj.toLocaleDateString('es-ES', options);

        // Estilos según prioridad
        const priorityColors = {
            'Alta': 'bg-danger/10 text-danger border-danger/20',
            'Media': 'bg-warning/10 text-warning border-warning/20',
            'Baja': 'bg-success/10 text-success border-success/20'
        };
        const pColor = priorityColors[task.prioridad] || priorityColors['Media'];

        const card = document.createElement('div');
        card.className = "group bg-surface-dark border border-surface-border hover:border-primary/50 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl relative flex flex-col h-full";
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div class="flex gap-2">
                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${pColor}">${task.prioridad}</span>
                    ${isExpired ? '<span class="px-2 py-1 rounded text-[10px] font-bold bg-surface-border text-text-secondary border border-white/5">Vencida</span>' : ''}
                    <span class="px-2 py-1 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">${task.valor || 0}% / ${task.periodo || 'P1'}</span>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="deleteTask('${task.id}')" class="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors" title="Eliminar">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </div>

            <h3 class="text-lg font-bold text-white mb-2 leading-tight">${task.titulo}</h3>
            
            <p class="text-xs text-text-secondary line-clamp-3 mb-4 flex-grow">${task.descripcion}</p>

            <div class="mt-auto space-y-3 pt-4 border-t border-surface-border/50">
                <div class="flex items-center gap-2 text-xs text-text-secondary">
                    <span class="material-symbols-outlined text-sm">event</span>
                    <span class="${isExpired ? 'text-danger font-medium' : ''}">${dateStr}</span>
                </div>
                <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-primary"></span>
                        <span class="font-medium text-white">${task.curso_nombre || 'Curso'}</span>
                    </div>
                    <span class="bg-surface-border/50 px-2 py-0.5 rounded text-[10px] font-mono border border-surface-border">${task.asignatura || 'Materia'}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- CREAR / EDITAR ---
window.openCreateTaskModal = () => {
    document.getElementById('form-task').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('modal-title').innerText = 'Nueva Tarea';
    document.getElementById('btn-text-task').innerText = 'Publicar Tarea';
    
    // Resetear selects
    const subSelect = document.getElementById('task-subject');
    if(subSelect) subSelect.innerHTML = '<option value="">Selecciona curso primero</option>';

    window.toggleModal('modal-task');
};

async function handleSaveTask(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-task');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Procesando...';

    const id = document.getElementById('task-id').value;
    const courseSelect = document.getElementById('task-course');
    const subject = document.getElementById('task-subject').value;
    const courseId = courseSelect.value;
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const fechaEntrega = document.getElementById('task-date').value;
    const prioridad = document.querySelector('input[name="task-priority"]:checked').value;
    
    // Nuevos campos
    const period = document.getElementById('task-period').value;
    const value = parseFloat(document.getElementById('task-value').value);
    const competence = document.getElementById('task-competence').value;

    const data = {
        titulo: title,
        descripcion: desc,
        fecha_entrega: fechaEntrega,
        prioridad: prioridad,
        curso_id: courseId,
        curso_nombre: courseSelect.options[courseSelect.selectedIndex].text,
        asignatura: subject,
        periodo: period,
        valor: value,
        competencia: competence,
        fecha_creacion: new Date().toISOString(),
        profesor_email: auth.currentUser ? auth.currentUser.email : 'anon'
    };

    try {
        // 1. Guardar en colección 'tareas' (Vista de Tablero)
        const colPath = ['artifacts', appId, 'public', 'data', 'tareas'];
        
        if (id) {
            delete data.fecha_creacion; 
            await updateDoc(doc(db, ...colPath, id), data);
        } else {
            await addDoc(collection(db, ...colPath), data);
        }

        // 2. SINCRONIZAR CON EL CURSO (Para que aparezca en calificaciones)
        if (courseId && subject) {
            const courseRef = doc(db, "cursos_globales", courseId);
            
            await runTransaction(db, async (transaction) => {
                const courseDoc = await transaction.get(courseRef);
                if (!courseDoc.exists()) throw "El curso no existe";

                const courseData = courseDoc.data();
                let actividades = courseData.actividades || {};
                
                if (!actividades[subject]) actividades[subject] = [];

                // Evitar duplicados por nombre exacto si es posible, o simplemente agregar
                // Nota: gradebook.js usa el nombre de la actividad como ID.
                const existingIndex = actividades[subject].findIndex(a => a.nombre === title);
                
                const activityData = {
                    nombre: title,
                    valor: value,
                    periodo: period,
                    competencia: competence,
                    tipo: 'regular',
                    descripcion: desc,
                    fecha_entrega: fechaEntrega
                };

                if (existingIndex >= 0) {
                    actividades[subject][existingIndex] = activityData; // Actualizar
                } else {
                    actividades[subject].push(activityData); // Crear
                }

                transaction.update(courseRef, { actividades: actividades });
            });
        }

        if (window.showToast) window.showToast("Tarea guardada y asignada al curso", "success");
        window.toggleModal('modal-task');
        loadTasks();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- ELIMINAR ---
window.deleteTask = async (id) => {
    if (!confirm("¿Estás seguro de eliminar esta tarea del tablero? \nNota: Si ya se calificó en el curso, deberá eliminarse manualmente de la planilla.")) return;

    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tareas', id));
        if (window.showToast) window.showToast("Tarea eliminada del tablero", "info");
        loadTasks();
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