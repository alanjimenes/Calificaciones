import { db, collection, getDocs, query, orderBy } from './firebase-config.js';

let allStudentsCache = [];
let currentPeriod = 'p1';

// Escuchar cuando el usuario esté listo
window.addEventListener('userReady', () => {
    loadGlobalStudents();
});

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterAndRender(e.target.value);
        });
    }

    const periodSelect = document.getElementById('period-filter');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentPeriod = e.target.value;
            loadGlobalStudents(false);
        });
    }
});

window.loadGlobalStudents = async (forceFetch = true) => {
    const loader = document.getElementById('loader');
    const tbody = document.getElementById('global-students-body');
    const totalCount = document.getElementById('total-count');

    if (loader) loader.classList.remove('hidden');

    try {
        const q = query(collection(db, "cursos_globales"), orderBy("nombre"));
        const snapshot = await getDocs(q);

        allStudentsCache = [];

        snapshot.forEach(doc => {
            const courseData = doc.data();
            const students = courseData.estudiantes || [];
            const actividades = courseData.actividades || {};
            const materias = courseData.materias || [];

            students.forEach(student => {
                // Calcular promedios usando la nueva lógica de competencias
                const averages = calculateSubjectAverages(student, materias, actividades, currentPeriod);

                allStudentsCache.push({
                    id: student.id,
                    nombre: student.nombre,
                    numero_orden: student.numero_orden || '-',
                    cursoNombre: courseData.nombre,
                    cursoId: doc.id,
                    promedios: averages,
                    observacion: student.observacion || ""
                });
            });
        });

        allStudentsCache.sort((a, b) => a.nombre.localeCompare(b.nombre));
        filterAndRender("");
        if (totalCount) totalCount.innerText = `Total: ${allStudentsCache.length} estudiantes registrados.`;

    } catch (error) {
        console.error("Error cargando estudiantes globales:", error);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
};

// --- CÁLCULO DE PROMEDIOS ACTUALIZADO (Lógica de 4 competencias) ---
function calculateSubjectAverages(student, materias, actividadesConfig, periodo) {
    const results = [];
    const notasAlumno = student.notas || {};

    materias.forEach(materia => {
        // Obtenemos actividades del periodo actual
        const rawActivities = (actividadesConfig[materia] || [])
            .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1' } : act)
            .filter(act => (act.periodo || 'p1') === periodo);

        const notasMateria = notasAlumno[materia] || {};

        // Inicializar acumuladores por competencia
        const comps = {
            c1: { sum: 0, count: 0 },
            c2: { sum: 0, count: 0 },
            c3: { sum: 0, count: 0 },
            c4: { sum: 0, count: 0 }
        };

        // Procesar notas
        rawActivities.forEach(act => {
            const compId = act.competencia || 'c1';
            const grade = parseFloat(notasMateria[act.nombre] || 0);
            const weight = parseFloat(act.valor || 0);

            if (weight > 0) {
                // Suma ponderada
                comps[compId].sum += (grade * weight) / 100;
                comps[compId].count = 1; // Marcamos que existe data ponderada
            } else {
                // Promedio simple (fallback)
                if (notasMateria[act.nombre] !== undefined && notasMateria[act.nombre] !== "") {
                    // Nota: Esta lógica simplificada asume ponderado si existe valor
                    comps[compId].sum += grade;
                    comps[compId].count++;
                }
            }
        });

        // Calcular puntajes finales por competencia
        let compScores = [];
        ['c1', 'c2', 'c3', 'c4'].forEach(k => {
            // Nota simplificada: Si usamos pesos, la suma ya es el total (sobre 100).
            // Si usamos conteo simple, dividimos.
            // Para mantener consistencia con gradebook.js:
            let score = Math.round(comps[k].sum);
            // (Si usáramos promedio simple real necesitaríamos lógica extra, pero el sistema favorece porcentajes)
            compScores.push(score);
        });

        // Promedio del periodo = Promedio de las 4 competencias
        const finalAverage = Math.round(compScores.reduce((a, b) => a + b, 0) / 4);

        results.push({
            materia: materia,
            nota: finalAverage,
            hasData: rawActivities.length > 0
        });
    });

    return results;
}

function filterAndRender(searchTerm) {
    const tbody = document.getElementById('global-students-body');
    const emptyState = document.getElementById('empty-state');
    const term = searchTerm.toLowerCase();

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

    filtered.forEach(student => {
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors group border-b border-surface-border/30 last:border-0";

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

        const hasObservation = student.observacion && student.observacion.trim().length > 0;
        const obsButtonClass = hasObservation
            ? "text-warning bg-warning/10 border-warning/20 hover:bg-warning hover:text-white"
            : "text-text-secondary/30 bg-surface-border/5 border-transparent hover:bg-surface-border hover:text-text-secondary";

        const obsTooltip = hasObservation ? "Ver Observación" : "Sin observaciones";
        const obsIcon = hasObservation ? "rate_review" : "chat_bubble_outline";

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-text-secondary/50 font-mono text-xs">${student.numero_orden}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-sm font-bold text-white border border-white/10 shrink-0">
                        ${getInitials(student.nombre)}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <p class="font-bold text-white text-sm">${student.nombre}</p>
                            ${hasObservation ? '<span class="w-2 h-2 rounded-full bg-warning animate-pulse" title="Tiene observación"></span>' : ''}
                        </div>
                        <p class="text-[10px] text-text-secondary uppercase tracking-wider font-mono bg-surface-border/30 px-1 rounded w-fit">${student.id}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
                    ${student.cursoNombre}
                </span>
            </td>
            <td class="px-6 py-4">${subjectsHTML}</td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="viewObservation('${student.id}')" class="p-2 rounded-lg border transition-colors inline-flex items-center justify-center ${obsButtonClass}" title="${obsTooltip}">
                        <span class="material-symbols-outlined text-lg">${obsIcon}</span>
                    </button>
                    <a href="calificaciones.html?curso=${student.cursoId}" class="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-surface-border transition-colors inline-flex items-center justify-center bg-surface-border/10 border border-surface-border/20" title="Ver Planilla Completa">
                        <span class="material-symbols-outlined text-lg">visibility</span>
                    </a>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.viewObservation = (studentId) => {
    const student = allStudentsCache.find(s => s.id === studentId);
    if (!student) return;
    const modalTitle = document.getElementById('obs-modal-student');
    const modalText = document.getElementById('obs-modal-text');
    const modalCourse = document.getElementById('obs-modal-course');
    if (modalTitle) modalTitle.innerText = student.nombre;
    if (modalCourse) modalCourse.innerText = student.cursoNombre;
    if (modalText) modalText.value = (student.observacion && student.observacion.trim().length > 0) ? student.observacion : "No hay observaciones.";
    if (window.toggleModal) window.toggleModal('modal-view-observation');
};

function getGradeColor(nota) {
    if (nota >= 90) return "text-green-400 bg-green-400/10";
    if (nota >= 80) return "text-blue-400 bg-blue-400/10";
    if (nota >= 70) return "text-yellow-400 bg-yellow-400/10";
    return "text-red-400 bg-red-400/10";
}

function getInitials(name) {
    return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
}