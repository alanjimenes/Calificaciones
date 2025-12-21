import { db, collection, getDocs, query, orderBy } from './firebase-config.js';

let allCourses = [];
let allStudentsFlat = [];
let currentPeriod = 'p1';

// Escuchar evento de usuario listo
window.addEventListener('userReady', (e) => {
    loadGlobalStudents();
});

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Listener del Filtro de Periodo
    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentPeriod = e.target.value;
            renderGlobalTable(); // Re-renderizar con el nuevo periodo
        });
    }

    // Listener del Buscador
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderGlobalTable(e.target.value);
        });
    }
});

// Función Principal: Cargar Todo
window.loadGlobalStudents = async () => {
    const loader = document.getElementById('loader');
    const tableBody = document.getElementById('global-students-body');
    const totalCount = document.getElementById('total-count');

    if (loader) loader.classList.remove('hidden');
    if (tableBody) tableBody.innerHTML = '';

    try {
        // 1. Obtener todos los cursos
        const q = query(collection(db, "cursos_globales"));
        const snapshot = await getDocs(q);

        allCourses = [];
        allStudentsFlat = [];

        snapshot.forEach(doc => {
            const course = { id: doc.id, ...doc.data() };
            allCourses.push(course);

            // Aplanar estudiantes: Crear una lista única combinando estudiante + info de su curso
            if (course.estudiantes && Array.isArray(course.estudiantes)) {
                course.estudiantes.forEach(student => {
                    allStudentsFlat.push({
                        ...student,
                        courseId: course.id,
                        courseName: course.nombre,
                        courseActivities: course.actividades || {}, // Necesario para calcular promedios
                        courseSubjects: course.materias || []
                    });
                });
            }
        });

        // 2. Renderizar
        if (totalCount) totalCount.innerText = `Total: ${allStudentsFlat.length} estudiantes`;
        renderGlobalTable();

    } catch (error) {
        console.error("Error cargando directorio global:", error);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-danger">Error: ${error.message}</td></tr>`;
    } finally {
        if (loader) loader.classList.add('hidden');
    }
};

// Función de Renderizado
function renderGlobalTable(searchTerm = "") {
    const tableBody = document.getElementById('global-students-body');
    const emptyState = document.getElementById('empty-state');

    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Filtro de búsqueda
    const term = searchTerm.toLowerCase();
    const filtered = allStudentsFlat.filter(s =>
        (s.nombre || "").toLowerCase().includes(term) ||
        (s.id || "").toLowerCase().includes(term) ||
        (s.courseName || "").toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    // Generar filas
    filtered.forEach((student, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors border-b border-surface-border/30";

        // Calcular Promedios por Materia
        const subjectsHTML = generateSubjectsPerformance(student);

        // Iniciales
        const initials = student.nombre ? student.nombre.substring(0, 2).toUpperCase() : "NA";

        row.innerHTML = `
            <td class="px-6 py-4 text-xs text-text-secondary font-mono">${index + 1}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-xs font-bold">
                        ${initials}
                    </div>
                    <div>
                        <p class="font-bold text-white text-sm">${student.nombre}</p>
                        <p class="text-[10px] text-text-secondary uppercase tracking-wider">${student.id}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded bg-surface-border/50 border border-surface-border text-xs text-white whitespace-nowrap">
                    ${student.courseName}
                </span>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap gap-2 max-w-md">
                    ${subjectsHTML}
                </div>
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="viewObservation('${student.id}')" class="p-2 rounded-lg bg-surface-border/30 hover:bg-warning/20 hover:text-warning text-text-secondary transition-colors" title="Ver Observaciones">
                    <span class="material-symbols-outlined text-[18px]">visibility</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Generar HTML de las pastillas de materias con promedios
function generateSubjectsPerformance(student) {
    if (!student.courseSubjects || student.courseSubjects.length === 0) {
        return '<span class="text-xs text-text-secondary italic">Sin materias asignadas</span>';
    }

    let html = '';

    student.courseSubjects.forEach(materia => {
        // Filtrar actividades de esta materia y del periodo actual
        const allActs = student.courseActivities[materia] || [];
        const periodActs = allActs.filter(a => (a.periodo || 'p1') === currentPeriod);

        if (periodActs.length > 0) {
            // Calcular promedio
            const promedio = calculateAverage(student.notas ? student.notas[materia] : {}, periodActs);

            // Color según nota
            let colorClass = "bg-surface-border text-text-secondary border-surface-border"; // Default
            if (promedio >= 90) colorClass = "bg-green-500/10 text-green-400 border-green-500/20";
            else if (promedio >= 80) colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
            else if (promedio >= 70) colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
            else colorClass = "bg-red-500/10 text-red-400 border-red-500/20";

            html += `
                <div class="flex items-center gap-2 px-2 py-1 rounded border ${colorClass} text-[10px] font-bold">
                    <span class="truncate max-w-[80px]" title="${materia}">${materia}</span>
                    <span class="w-px h-3 bg-current opacity-30"></span>
                    <span>${promedio}</span>
                </div>
            `;
        } else {
            // Materia sin actividades en este periodo
            html += `
                <div class="flex items-center gap-2 px-2 py-1 rounded border border-surface-border/30 bg-surface-border/10 text-text-secondary/50 text-[10px]">
                    <span class="truncate max-w-[80px]">${materia}</span>
                    <span>-</span>
                </div>
            `;
        }
    });

    return html || '<span class="text-xs text-text-secondary italic">Sin actividad en este periodo</span>';
}

// Calculadora de Promedio (Simplificada de gradebook.js)
function calculateAverage(notasObj, activitiesList) {
    if (!notasObj || activitiesList.length === 0) return 0;

    // Agrupar por competencia
    const comps = {
        c1: { sum: 0, weight: 0 }, c2: { sum: 0, weight: 0 },
        c3: { sum: 0, weight: 0 }, c4: { sum: 0, weight: 0 }
    };

    activitiesList.forEach(act => {
        const compId = act.competencia || 'c1';
        const weight = parseFloat(act.valor || 0);
        const grade = parseFloat(notasObj[act.nombre] || 0);

        if (weight > 0) {
            comps[compId].sum += (grade * weight) / 100;
            comps[compId].weight += weight;
        }
    });

    // Promediar las 4 competencias (Asumiendo peso 100 por comp o proporcional)
    let total = 0;
    ['c1', 'c2', 'c3', 'c4'].forEach(c => {
        total += Math.round(comps[c].sum);
    });

    return Math.round(total / 4);
}

// Ver Observación (Modal Read-Only)
window.viewObservation = (studentId) => {
    // Buscar estudiante en la lista plana
    const student = allStudentsFlat.find(s => s.id === studentId);
    if (!student) return;

    const modal = document.getElementById('modal-view-observation');
    if (modal) {
        document.getElementById('obs-modal-student').innerText = student.nombre;
        document.getElementById('obs-modal-course').innerText = student.courseName;
        document.getElementById('obs-modal-text').value = student.observacion || "Sin observaciones registradas.";

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};