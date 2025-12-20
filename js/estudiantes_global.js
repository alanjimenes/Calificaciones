import { db, collection, getDocs, query, orderBy } from './firebase-config.js';

let allStudentsCache = []; // Almacena todos los estudiantes procesados
let currentPeriod = 'p1';

// Escuchar cuando el usuario (Admin/Secretaria) esté listo
window.addEventListener('userReady', () => {
    loadGlobalStudents();
});

document.addEventListener('DOMContentLoaded', () => {
    // Listener del Buscador
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterAndRender(e.target.value);
        });
    }

    // Listener del Periodo
    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentPeriod = e.target.value;
            // Recalcular y renderizar (porque los promedios cambian por periodo)
            loadGlobalStudents(false); // false = no fetch again, just recalculate (implementación simplificada: reload all por ahora para asegurar datos frescos)
        });
    }
});

// --- FUNCIÓN PRINCIPAL DE CARGA ---
window.loadGlobalStudents = async (forceFetch = true) => {
    const loader = document.getElementById('loader');
    const tbody = document.getElementById('global-students-body');
    const totalCount = document.getElementById('total-count');

    if (loader) loader.classList.remove('hidden');

    try {
        // 1. Obtener todos los cursos
        // Nota: Traemos todos los cursos porque los estudiantes están anidados dentro.
        const q = query(collection(db, "cursos_globales"), orderBy("nombre"));
        const snapshot = await getDocs(q);

        allStudentsCache = [];

        snapshot.forEach(doc => {
            const courseData = doc.data();
            const students = courseData.estudiantes || [];
            const actividades = courseData.actividades || {};
            const materias = courseData.materias || [];

            // 2. Procesar cada estudiante dentro del curso
            students.forEach(student => {
                // Calcular promedios de todas las materias para este estudiante
                const averages = calculateSubjectAverages(student, materias, actividades, currentPeriod);

                // Aplanar objeto para la tabla
                allStudentsCache.push({
                    id: student.id,
                    nombre: student.nombre,
                    numero_orden: student.numero_orden || '-',
                    cursoNombre: courseData.nombre,
                    cursoId: doc.id,
                    promedios: averages // Objeto { materia: nota, ... }
                });
            });
        });

        // Ordenar globalmente por nombre
        allStudentsCache.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Renderizar inicial
        filterAndRender("");

        if (totalCount) totalCount.innerText = `Total: ${allStudentsCache.length} estudiantes registrados.`;

    } catch (error) {
        console.error("Error cargando estudiantes globales:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-danger">Error al cargar datos: ${error.message}</td></tr>`;
    } finally {
        if (loader) loader.classList.add('hidden');
    }
};

// --- CÁLCULO DE PROMEDIOS (Lógica reutilizada de gradebook) ---
function calculateSubjectAverages(student, materias, actividadesConfig, periodo) {
    const results = [];
    const notasAlumno = student.notas || {};

    materias.forEach(materia => {
        // Obtener actividades configuradas para esta materia y periodo
        const actsMateria = (actividadesConfig[materia] || [])
            .filter(act => (act.periodo || 'p1') === periodo);

        // Obtener notas del alumno en esta materia
        const notasMateria = notasAlumno[materia] || {};

        let promedio = 0;

        if (actsMateria.length > 0) {
            // Verificar si hay pesos
            const hasWeights = actsMateria.some(a => a.valor > 0);

            if (hasWeights) {
                // Promedio Ponderado
                let sum = 0;
                actsMateria.forEach(act => {
                    const grade = parseFloat(notasMateria[act.nombre] || 0);
                    const weight = parseFloat(act.valor || 0);
                    sum += (grade * weight) / 100;
                });
                promedio = Math.round(sum);
            } else {
                // Promedio Simple
                let sum = 0;
                let count = 0;
                actsMateria.forEach(act => {
                    const grade = notasMateria[act.nombre];
                    if (grade !== undefined && grade !== "") {
                        sum += parseFloat(grade);
                        count++;
                    }
                });
                promedio = count > 0 ? Math.round(sum / count) : 0;
            }
        } else {
            // Sin actividades configuradas
            promedio = 0;
        }

        results.push({
            materia: materia,
            nota: promedio,
            hasData: actsMateria.length > 0 // Para saber si mostrar 0 o N/A
        });
    });

    return results;
}

// --- RENDERIZADO Y FILTRO ---
function filterAndRender(searchTerm) {
    const tbody = document.getElementById('global-students-body');
    const emptyState = document.getElementById('empty-state');
    const term = searchTerm.toLowerCase();

    // Filtrar
    const filtered = allStudentsCache.filter(s =>
        s.nombre.toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term) ||
        s.cursoNombre.toLowerCase().includes(term)
    );

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    // Renderizar
    filtered.forEach(student => {
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors group border-b border-surface-border/30 last:border-0";

        // Generar badges de materias
        let subjectsHTML = `<div class="flex flex-wrap gap-2">`;
        student.promedios.forEach(p => {
            const colorClass = getGradeColor(p.nota);
            const displayNota = p.hasData ? `${p.nota}` : '-';

            subjectsHTML += `
                <div class="flex items-center rounded-md overflow-hidden border border-surface-border/50 bg-background-dark/50 text-xs shadow-sm">
                    <span class="px-2 py-1 text-text-secondary bg-surface-border/20 truncate max-w-[100px]" title="${p.materia}">${p.materia}</span>
                    <span class="px-2 py-1 font-bold ${colorClass} w-9 text-center">${displayNota}</span>
                </div>
            `;
        });
        subjectsHTML += `</div>`;

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-text-secondary/50 font-mono text-xs">
                ${student.numero_orden}
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-sm font-bold text-white border border-white/10 shrink-0">
                        ${getInitials(student.nombre)}
                    </div>
                    <div>
                        <p class="font-bold text-white text-sm">${student.nombre}</p>
                        <p class="text-[10px] text-text-secondary uppercase tracking-wider font-mono bg-surface-border/30 px-1 rounded w-fit">${student.id}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
                    ${student.cursoNombre}
                </span>
            </td>
            <td class="px-6 py-4">
                ${subjectsHTML}
            </td>
            <td class="px-6 py-4 text-right">
                <a href="calificaciones.html?curso=${student.cursoId}" class="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-surface-border transition-colors inline-flex items-center justify-center bg-surface-border/10" title="Ver Planilla Completa">
                    <span class="material-symbols-outlined text-lg">visibility</span>
                </a>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function getGradeColor(nota) {
    if (nota >= 90) return "text-green-400 bg-green-400/10";
    if (nota >= 80) return "text-blue-400 bg-blue-400/10";
    if (nota >= 70) return "text-yellow-400 bg-yellow-400/10";
    return "text-red-400 bg-red-400/10";
}

function getInitials(name) {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
}