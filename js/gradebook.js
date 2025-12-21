import { auth, db, doc, getDoc, updateDoc, runTransaction, collection, getDocs, setDoc, deleteDoc } from './firebase-config.js';

let currentStudents = [];
let courseConfig = null;
let selectedSubject = "";
let isTitular = false;
let isAdmin = false;
let COURSE_ID = '';
let currentUserEmail = '';
let currentTab = 'grades';
let attendanceDate = new Date().toISOString().split('T')[0];
let currentPeriod = 'p1';
let currentTaskToGrade = null;
let studentSearchTerm = "";

const periodNames = { 'p1': 'Periodo 1', 'p2': 'Periodo 2', 'p3': 'Periodo 3', 'p4': 'Periodo 4', 'recovery': 'Recuperación / Final' };

const COMPETENCIAS = {
    c1: { id: 'c1', nombre: 'Comunicativa', short: 'C1' },
    c2: { id: 'c2', nombre: 'Pensamiento Lógico', short: 'C2' },
    c3: { id: 'c3', nombre: 'Científica y Tecnológica', short: 'C3' },
    c4: { id: 'c4', nombre: 'Ética y Ciudadana', short: 'C4' }
};

const urlParams = new URLSearchParams(window.location.search);
COURSE_ID = urlParams.get('curso');

window.addEventListener('userReady', (e) => {
    const { uid, user, role } = e.detail;
    isAdmin = (role === 'admin');
    currentUserEmail = user.email;

    if (COURSE_ID) initializeGradebook(uid, user.email);
    else { alert("No se especificó un curso."); window.location.href = 'cursos.html'; }
});

document.addEventListener('DOMContentLoaded', () => {
    const periodSelect = document.getElementById('period-selector');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentPeriod = e.target.value;
            renderTable();
        });
    }
});

async function initializeGradebook(userId, userEmail) {
    const loader = document.getElementById('loader');
    try {
        const courseDoc = await getDoc(doc(db, "cursos_globales", COURSE_ID));
        if (!courseDoc.exists()) { alert("Curso no encontrado."); window.location.href = 'cursos.html'; return; }
        courseConfig = courseDoc.data();

        const studentsSnap = await getDocs(collection(db, "cursos_globales", COURSE_ID, "estudiantes"));
        let studentsFromSub = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        let studentsFromArray = courseConfig.estudiantes || [];

        if (studentsFromSub.length > 0) {
            currentStudents = studentsFromSub;
        } else {
            currentStudents = studentsFromArray;
        }

        const titleEl = document.getElementById('course-title-display');
        if (titleEl) titleEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">school</span> ${courseConfig.nombre}`;

        if (document.getElementById('dash-total-subjects')) document.getElementById('dash-total-subjects').innerText = (courseConfig.materias || []).length;
        if (document.getElementById('dash-total-students')) document.getElementById('dash-total-students').innerText = currentStudents.length;

        isTitular = (userEmail === courseConfig.titular_email);
        const btnAddStudent = document.getElementById('btn-add-student');
        if (btnAddStudent && (isAdmin || isTitular)) btnAddStudent.classList.remove('hidden');

        setupTabs();
        setupSearchListeners();
        setupStudentForm();
        renderSubjectsDashboard();
        showDashboardView();

    } catch (error) { console.error("Error inicializando:", error); }
    finally { if (loader) loader.style.display = 'none'; }
}

function setupSearchListeners() {
    const studentSearchInput = document.getElementById('student-search-input');
    if (studentSearchInput) {
        studentSearchInput.addEventListener('input', (e) => {
            studentSearchTerm = e.target.value.trim().toLowerCase();
            renderTable();
            renderAttendance();
            renderTasksView();
        });
    }

    const subjectSearchInput = document.getElementById('dash-subject-search');
    if (subjectSearchInput) {
        subjectSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.trim();
            renderSubjectsDashboard(term);
        });
    }
}

function setupStudentForm() {
    const form = document.getElementById('form-add-student');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const originalId = document.getElementById('edit-student-original-id').value;
        const btn = document.getElementById('btn-submit-student');
        const originalBtnText = btn.innerHTML;

        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };

        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...';

        try {
            const studentData = {
                id: getVal('student-id'),
                nombre: getVal('student-name'),
                numero_orden: getVal('student-num-orden'),
                rne: getVal('student-rne').toUpperCase(),
                sexo: getVal('student-sexo'),
                fecha_nacimiento: getVal('student-nacimiento'),
                condicion_academica: getVal('student-condicion'),
                padre: getVal('student-padre'),
                telefono_padre: getVal('student-telefono-padre'),
                madre: getVal('student-madre'),
                telefono_madre: getVal('student-telefono-madre'),
                tutor: getVal('student-tutor'),
                telefono: getVal('student-telefono'),
                direccion: getVal('student-direccion'),
                nacionalidad: getVal('student-nacionalidad'),
                emergencia_nombre: getVal('student-emergencia-nombre'),
                emergencia_telefono: getVal('student-emergencia-telefono'),
                tipo_sangre: getVal('student-sangre'),
                alergias_medicas: getVal('student-medica'),
                notas: {},
                asistencia: {},
                observacion: ""
            };

            if (originalId) {
                const existingStudent = currentStudents.find(s => s.id === originalId);
                if (existingStudent) {
                    studentData.notas = existingStudent.notas || {};
                    studentData.asistencia = existingStudent.asistencia || {};
                    studentData.observacion = existingStudent.observacion || "";
                }
                currentStudents = currentStudents.map(s => s.id === originalId ? studentData : s);
            } else {
                if (currentStudents.some(s => s.id === studentData.id)) {
                    throw new Error("Ya existe un estudiante con ese ID SIGERD.");
                }
                currentStudents.push(studentData);
            }

            await updateDoc(doc(db, "cursos_globales", COURSE_ID), {
                estudiantes: currentStudents
            });

            if (window.showToast) window.showToast("Estudiante guardado correctamente", "success");
            if (window.toggleModal) window.toggleModal('modal-add-student');

            if (currentTab === 'grades') renderTable();
            else if (currentTab === 'attendance') renderAttendance();
            else if (currentTab === 'tasks') renderTasksView();

            if (document.getElementById('dash-total-students')) document.getElementById('dash-total-students').innerText = currentStudents.length;

        } catch (error) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    });
}

function renderSubjectsDashboard(filterTerm = "") {
    const tbody = document.getElementById('subjects-dashboard-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const materias = courseConfig.materias || [];
    const profesores = courseConfig.profesores_materias || {};

    const filtered = materias.filter(m => m.toLowerCase().includes(filterTerm.toLowerCase()));

    if (filtered.length === 0) {
        const msg = filterTerm ? `No se encontraron materias con "${filterTerm}".` : "No hay materias asignadas.";
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-text-secondary">${msg}</td></tr>`;
        return;
    }

    filtered.forEach(materia => {
        const profesorEmail = profesores[materia];
        const colors = ['text-orange-400 bg-orange-900/30', 'text-blue-400 bg-blue-900/30', 'text-purple-400 bg-purple-900/30', 'text-teal-400 bg-teal-900/30', 'text-red-400 bg-red-900/30'];
        const colorClass = colors[materia.length % colors.length];

        const tr = document.createElement('tr');
        tr.className = "group hover:bg-surface-border/10 transition-colors cursor-pointer";
        tr.onclick = () => selectSubjectFromDashboard(materia);

        tr.innerHTML = `
            <td class="py-4 px-6">
                <div class="flex items-center gap-3">
                    <div class="flex items-center justify-center size-10 rounded-lg ${colorClass}">
                        <span class="material-symbols-outlined">menu_book</span>
                    </div>
                    <div>
                        <p class="text-white font-medium text-sm">${materia}</p>
                        <p class="text-text-secondary text-xs">Materia Curricular</p>
                    </div>
                </div>
            </td>
            <td class="py-4 px-6">
                <div class="flex items-center gap-3">
                     <div class="size-8 rounded-full bg-surface-border flex items-center justify-center text-xs font-bold text-white border border-white/10">
                        ${getInitials(profesorEmail || "S A")}
                    </div>
                    <p class="text-white text-sm truncate max-w-[150px]">${profesorEmail || "Sin asignar"}</p>
                </div>
            </td>
            <td class="py-4 px-6">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                    <span class="size-1.5 rounded-full bg-green-500"></span>
                    Activo
                </span>
            </td>
            <td class="py-4 px-6 text-right">
                <button class="bg-primary hover:bg-[#0be050] text-background-dark font-bold text-xs px-3 py-1.5 rounded-lg transition-colors shadow-lg shadow-primary/10">
                    Entrar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showDashboardView() {
    document.getElementById('view-subjects-dashboard').classList.remove('hidden');
    document.getElementById('view-grades').classList.add('hidden');
    document.getElementById('view-tasks').classList.add('hidden');
    document.getElementById('view-attendance').classList.add('hidden');
    document.getElementById('controls-gradebook').classList.add('hidden');
    document.getElementById('subject-status').classList.add('hidden');
    document.getElementById('btn-back-to-subjects').classList.add('hidden');
    selectedSubject = null;

    const searchInput = document.getElementById('dash-subject-search');
    if (searchInput) {
        searchInput.value = '';
        renderSubjectsDashboard();
    }
}

window.selectSubjectFromDashboard = (materiaName) => {
    selectedSubject = materiaName;
    document.getElementById('current-subject-label').innerText = selectedSubject;
    document.getElementById('view-subjects-dashboard').classList.add('hidden');
    document.getElementById('controls-gradebook').classList.remove('hidden');
    document.getElementById('subject-status').classList.remove('hidden');
    document.getElementById('btn-back-to-subjects').classList.remove('hidden');
    checkSubjectPermissions();
    switchTab('grades');
}

window.returnToSubjects = () => { showDashboardView(); }

function setupTabs() {
    const tabGrades = document.getElementById('tab-grades');
    const tabAttendance = document.getElementById('tab-attendance');
    const tabTasks = document.getElementById('tab-tasks');

    window.switchTab = (tab) => {
        currentTab = tab;
        const viewGrades = document.getElementById('view-grades');
        const viewAttendance = document.getElementById('view-attendance');
        const viewTasks = document.getElementById('view-tasks');
        const periodSelectorContainer = document.getElementById('period-selector-container');

        [tabGrades, tabAttendance, tabTasks].forEach(t => {
            if (t) {
                t.classList.remove('bg-primary', 'text-background-dark', 'shadow-lg');
                t.classList.add('text-text-secondary', 'hover:text-white', 'hover:bg-white/5');
            }
        });
        [viewGrades, viewAttendance, viewTasks].forEach(v => { if (v) v.classList.add('hidden'); });

        if (tab === 'grades' && tabGrades) {
            tabGrades.classList.add('bg-primary', 'text-background-dark', 'shadow-lg');
            tabGrades.classList.remove('text-text-secondary', 'hover:text-white', 'hover:bg-white/5');
            if (viewGrades) viewGrades.classList.remove('hidden');
            if (periodSelectorContainer) periodSelectorContainer.classList.remove('hidden');
        } else if (tab === 'attendance' && tabAttendance) {
            tabAttendance.classList.add('bg-primary', 'text-background-dark', 'shadow-lg');
            tabAttendance.classList.remove('text-text-secondary', 'hover:text-white', 'hover:bg-white/5');
            if (viewAttendance) viewAttendance.classList.remove('hidden');
            if (periodSelectorContainer) periodSelectorContainer.classList.add('hidden');
        } else if (tab === 'tasks' && tabTasks) {
            tabTasks.classList.add('bg-primary', 'text-background-dark', 'shadow-lg');
            tabTasks.classList.remove('text-text-secondary', 'hover:text-white', 'hover:bg-white/5');
            if (viewTasks) viewTasks.classList.remove('hidden');
            if (periodSelectorContainer) periodSelectorContainer.classList.add('hidden');
            closeTaskGrading();
        }
        refreshCurrentView();
    };

    if (tabGrades) tabGrades.addEventListener('click', () => switchTab('grades'));
    if (tabAttendance) tabAttendance.addEventListener('click', () => switchTab('attendance'));
    if (tabTasks) tabTasks.addEventListener('click', () => switchTab('tasks'));
}

function refreshCurrentView() {
    if (!selectedSubject) return;
    if (currentTab === 'grades') renderTable();
    else if (currentTab === 'attendance') renderAttendance();
    else if (currentTab === 'tasks') renderTasksView();
}

function checkSubjectPermissions() {
    const btnAddMain = document.getElementById('btn-add-activity-main');
    const btnAddTasks = document.getElementById('btn-add-activity-tasks');
    const btnAdd = document.getElementById('btn-add-activity');
    const statusText = document.getElementById('subject-status');
    const assignedTeacher = (courseConfig.profesores_materias || {})[selectedSubject];
    const canEdit = isAdmin || (currentUserEmail === assignedTeacher);

    [btnAddMain, btnAddTasks, btnAdd].forEach(btn => { if (btn) canEdit ? btn.classList.remove('hidden') : btn.classList.add('hidden'); });

    if (statusText) {
        if (canEdit) {
            statusText.innerHTML = `Permisos: <span class='text-primary font-bold'>Edición Habilitada</span> (${assignedTeacher || 'Admin'})`;
            statusText.classList.remove('text-danger'); statusText.classList.add('text-text-secondary');
        } else {
            statusText.innerHTML = `<span class="material-symbols-outlined text-sm align-bottom">lock</span> Solo lectura. Profesor: ${assignedTeacher || 'Sin asignar'}`;
            statusText.classList.add('text-danger'); statusText.classList.remove('text-text-secondary');
        }
    }
    return canEdit;
}

// ==========================================
// RENDERIZADO TABLA PRINCIPAL
// ==========================================
function renderTable() {
    const tableBody = document.getElementById('students-table-body');
    const tableHeadRow = document.getElementById('table-headers');
    const emptyState = document.getElementById('empty-state');

    let filteredStudents = currentStudents;
    if (studentSearchTerm) {
        filteredStudents = currentStudents.filter(s =>
            (s.nombre || "").toLowerCase().includes(studentSearchTerm) ||
            (s.id || "").toLowerCase().includes(studentSearchTerm) ||
            (s.rne || "").toLowerCase().includes(studentSearchTerm)
        );
    }

    if (filteredStudents.length === 0) {
        if (emptyState && !studentSearchTerm) {
            emptyState.classList.remove('hidden');
            emptyState.querySelector('p').innerText = "No hay estudiantes registrados en este curso.";
        } else if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="100%" class="p-6 text-center text-text-secondary">No se encontraron estudiantes con "${studentSearchTerm}"</td></tr>`;
            if (emptyState) emptyState.classList.add('hidden');
        }
        if (tableBody && !studentSearchTerm) tableBody.innerHTML = '';
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    const canEdit = checkSubjectPermissions();
    const canManageStudents = isAdmin || isTitular;

    if (currentPeriod === 'recovery') {
        renderRecoveryTable(filteredStudents, tableHeadRow, tableBody, canEdit, canManageStudents);
    } else {
        renderRegularPeriodTable(filteredStudents, tableHeadRow, tableBody, canEdit, canManageStudents);
    }
}

function renderRecoveryTable(filteredStudents, tableHeadRow, tableBody, canEdit, canManageStudents) {
    // 1. Cabecera Específica para Recuperación
    tableHeadRow.innerHTML = `
        <th class="p-4 border-b border-surface-border text-center w-12 font-bold">#</th>
        <th class="p-4 border-b border-surface-border border-r border-surface-border/50 sticky left-0 bg-[#0f2115] z-20 min-w-[240px] font-bold text-white">Estudiante</th>
        <th class="p-4 border-b border-surface-border text-center w-20 font-bold text-text-secondary bg-surface-dark/50">C.F.<br><span class="text-[9px]">Prom. P1-P4</span></th>
        
        <th class="p-4 border-b border-surface-border text-center w-24 bg-orange-900/10 text-orange-400">Examen<br>Completivo</th>
        <th class="p-4 border-b border-surface-border text-center w-20 font-bold bg-orange-900/20 text-orange-200">Nota Final<br>C.C.</th>
        
        <th class="p-4 border-b border-surface-border text-center w-24 bg-red-900/10 text-red-400">Examen<br>Extraord.</th>
        <th class="p-4 border-b border-surface-border text-center w-20 font-bold bg-red-900/20 text-red-200">Nota Final<br>C.EX.</th>
        
        <th class="p-4 border-b border-surface-border text-center w-24 bg-purple-900/10 text-purple-400">Evaluación<br>Especial</th>
        <th class="p-4 border-b border-surface-border text-center w-32 font-bold text-white">Estado<br>Final</th>
        <th class="p-4 border-b border-surface-border w-20 text-center text-xs text-text-secondary">Acciones</th>
    `;

    tableBody.innerHTML = '';
    const sortedStudents = sortStudents(filteredStudents);

    // Obtener actividades especiales creadas
    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];
    // Simplificación: Tomamos la ÚLTIMA actividad creada de cada tipo para usarla como columna de input
    // En un sistema más complejo, se promediarían si hay varias, aquí asumimos una por tipo.
    const actCompletiva = rawActividades.filter(a => a.tipo === 'completiva').pop() || { nombre: 'Examen Completivo', tipo: 'completiva' };
    const actExtra = rawActividades.filter(a => a.tipo === 'extraordinaria').pop() || { nombre: 'Examen Extraordinario', tipo: 'extraordinaria' };
    const actEspecial = rawActividades.filter(a => a.tipo === 'especial').pop() || { nombre: 'Evaluación Especial', tipo: 'especial' };

    sortedStudents.forEach((student, index) => {
        const row = document.createElement('tr');
        row.className = "group hover:bg-surface-border/10 transition-colors";

        const notas = (student.notas && student.notas[selectedSubject]) ? student.notas[selectedSubject] : {};

        // Calcular CF (Promedio P1-P4)
        let sumP = 0;
        let countP = 0;
        ['p1', 'p2', 'p3', 'p4'].forEach(p => {
            // Simulamos activitiesList filtrando por periodo
            const actsP = rawActividades.filter(a => (!a.tipo || a.tipo === 'regular') && (a.periodo || 'p1') === p);
            if (actsP.length > 0) {
                const promP = calculateCompetenceAverage(notas, actsP);
                sumP += promP;
                countP++;
            }
        });
        const CF = countP > 0 ? Math.round(sumP / countP) : 0;

        // Notas Exámenes
        const notaCCExam = parseFloat(notas[actCompletiva.nombre] || 0);
        const notaCEXExam = parseFloat(notas[actExtra.nombre] || 0);
        const notaEspecial = parseFloat(notas[actEspecial.nombre] || 0);

        // Fórmulas Dominicanas
        // 1. Completiva: 50% CF + 50% Examen
        const finalCC = Math.round((CF * 0.5) + (notaCCExam * 0.5));

        // 2. Extraordinaria: 30% CF + 70% Examen
        const finalCEX = Math.round((CF * 0.3) + (notaCEXExam * 0.7));

        // Estado
        let estado = "Reprobado";
        let estadoClass = "bg-red-500/20 text-red-400";

        if (CF >= 70) {
            estado = "Aprobado";
            estadoClass = "bg-green-500/20 text-green-400";
        } else if (finalCC >= 70) {
            estado = "Aprobado (C.C.)";
            estadoClass = "bg-blue-500/20 text-blue-400";
        } else if (finalCEX >= 70) {
            estado = "Aprobado (C.EX.)";
            estadoClass = "bg-yellow-500/20 text-yellow-400";
        } else if (notaEspecial >= 70) {
            estado = "Aprobado (E.E.)";
            estadoClass = "bg-purple-500/20 text-purple-400";
        }

        const disabledAttr = canEdit ? '' : 'disabled';
        const cursorClass = canEdit ? 'bg-surface-dark/50 hover:bg-surface-border/50 focus:bg-surface-dark' : 'cursor-not-allowed opacity-50 bg-transparent';
        const inputBaseClass = `grade-input w-full h-8 text-center text-sm font-medium text-white border border-transparent rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all ${cursorClass}`;

        row.innerHTML = `
            <td class="p-0 text-center text-text-secondary/50 font-mono text-xs">${student.numero_orden || (index + 1)}</td>
            <td class="p-3 sticky left-0 bg-surface-dark border-r border-surface-border/50 z-10">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 rounded-full bg-surface-border flex items-center justify-center text-xs font-bold text-white border border-white/10">${getInitials(student.nombre)}</div>
                    <div><p class="font-medium text-white">${student.nombre}</p><p class="text-[10px] text-text-secondary uppercase tracking-wider">${student.id}</p></div>
                </div>
            </td>
            <td class="p-0 text-center text-text-secondary font-bold">${CF}</td>
            
            <!-- C.C. -->
            <td class="p-1 h-12 relative border-r border-surface-border/10 grade-cell-wrapper transition-colors">
                <input data-student-id="${student.id}" data-act="${actCompletiva.nombre}" class="${inputBaseClass}" type="number" value="${notas[actCompletiva.nombre] || ''}" min="0" max="100" ${disabledAttr}>
            </td>
            <td class="p-0 text-center font-bold ${finalCC >= 70 ? 'text-blue-400' : 'text-text-secondary'}">${CF < 70 ? finalCC : '-'}</td>

            <!-- C.EX. -->
            <td class="p-1 h-12 relative border-r border-surface-border/10 grade-cell-wrapper transition-colors">
                <input data-student-id="${student.id}" data-act="${actExtra.nombre}" class="${inputBaseClass}" type="number" value="${notas[actExtra.nombre] || ''}" min="0" max="100" ${disabledAttr}>
            </td>
            <td class="p-0 text-center font-bold ${finalCEX >= 70 ? 'text-yellow-400' : 'text-text-secondary'}">${CF < 70 && finalCC < 70 ? finalCEX : '-'}</td>

             <!-- E.E. -->
            <td class="p-1 h-12 relative border-r border-surface-border/10 grade-cell-wrapper transition-colors">
                <input data-student-id="${student.id}" data-act="${actEspecial.nombre}" class="${inputBaseClass}" type="number" value="${notas[actEspecial.nombre] || ''}" min="0" max="100" ${disabledAttr}>
            </td>

            <td class="p-0 text-center">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${estadoClass} uppercase">${estado}</span>
            </td>
            ${renderActionsCell(student.id, canManageStudents)}
        `;
        tableBody.appendChild(row);
    });

    if (canEdit) attachInputListeners();
}

function renderRegularPeriodTable(filteredStudents, tableHeadRow, tableBody, canEdit, canManageStudents) {
    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];

    // Filtrar actividades regulares del periodo actual
    const actividadesFiltradas = rawActividades
        .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1', tipo: 'regular' } : act)
        .filter(act => (act.periodo || 'p1') === currentPeriod && (!act.tipo || act.tipo === 'regular'));

    actividadesFiltradas.sort((a, b) => (a.competencia || 'c1').localeCompare(b.competencia || 'c1'));

    let headerHTML = `
        <th class="p-4 border-b border-surface-border text-center w-12 font-bold">#</th>
        <th class="p-4 border-b border-surface-border border-r border-surface-border/50 sticky left-0 bg-[#0f2115] z-20 min-w-[240px] font-bold text-white">Estudiante</th>
        <th class="p-4 border-b border-surface-border text-center w-24 font-bold text-white bg-surface-dark/50 leading-tight">
            Nota Final<br><span class="text-[9px] text-text-secondary">${periodNames[currentPeriod]}</span>
            <br><span class="text-[8px] text-primary">(Promedio 4 Comp.)</span>
        </th>
    `;

    actividadesFiltradas.forEach(act => {
        const comp = COMPETENCIAS[act.competencia] || COMPETENCIAS['c1'];
        headerHTML += `
            <th class="p-4 border-b border-surface-border text-center w-32 min-w-[120px] text-xs uppercase tracking-wider text-text-secondary relative group">
                ${act.nombre}
                <span class="block text-[9px] text-primary/80 font-bold">${act.valor > 0 ? `(${act.valor}%)` : ''}</span>
                <span class="absolute top-1 right-1 text-[8px] px-1 rounded bg-surface-border text-white opacity-60 group-hover:opacity-100" title="${comp.nombre}">${comp.short}</span>
            </th>`;
    });
    headerHTML += `<th class="p-4 border-b border-surface-border w-20 text-center text-xs text-text-secondary">Acciones</th>`;
    tableHeadRow.innerHTML = headerHTML;

    tableBody.innerHTML = '';
    const sortedStudents = sortStudents(filteredStudents);

    sortedStudents.forEach((student, index) => {
        const row = document.createElement('tr');
        row.className = "group hover:bg-surface-border/10 transition-colors";
        const notasMateria = (student.notas && student.notas[selectedSubject]) ? student.notas[selectedSubject] : {};
        const promedioPeriodo = calculateCompetenceAverage(notasMateria, actividadesFiltradas);
        const promedioClass = getPromedioColor(promedioPeriodo);
        const numeroOrden = student.numero_orden ? student.numero_orden : (index + 1);

        let rowHTML = `
            <td class="p-0 text-center text-text-secondary/50 font-mono text-xs">${numeroOrden}</td>
            <td class="p-3 sticky left-0 bg-surface-dark border-r border-surface-border/50 z-10">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 rounded-full bg-surface-border flex items-center justify-center text-xs font-bold text-white border border-white/10">${getInitials(student.nombre)}</div>
                    <div><p class="font-medium text-white">${student.nombre}</p><p class="text-[10px] text-text-secondary uppercase tracking-wider">${student.id}</p></div>
                </div>
            </td>
            <td class="p-0 text-center bg-surface-dark/30"><span id="avg-${student.id}" class="inline-block px-2 py-0.5 rounded text-xs font-bold ${promedioClass}">${promedioPeriodo}</span></td>
        `;

        if (actividadesFiltradas.length === 0) rowHTML += `<td class="p-4 text-center text-text-secondary/20">-</td>`;
        else {
            actividadesFiltradas.forEach(act => {
                const val = notasMateria[act.nombre] || "";
                const disabledAttr = canEdit ? '' : 'disabled';
                const cursorClass = canEdit ? 'bg-surface-dark/50 hover:bg-surface-border/50 focus:bg-surface-dark' : 'cursor-not-allowed opacity-50 bg-transparent';
                rowHTML += `
                    <td class="p-1 h-12 relative border-r border-surface-border/10 grade-cell-wrapper transition-colors">
                        <input data-student-id="${student.id}" data-act="${act.nombre}" class="grade-input w-full h-8 text-center text-sm font-medium text-white border border-transparent rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all ${cursorClass}" type="number" value="${val}" min="0" max="100" ${disabledAttr} oninput="if(this.value>100)this.value=100;if(this.value<0)this.value=0;">
                    </td>`;
            });
        }
        rowHTML += renderActionsCell(student.id, canManageStudents);
        row.innerHTML = rowHTML;
        tableBody.appendChild(row);
    });

    if (canEdit) attachInputListeners();
}

function sortStudents(students) {
    return [...students].sort((a, b) => {
        const ordenA = parseInt(a.numero_orden) || 9999;
        const ordenB = parseInt(b.numero_orden) || 9999;
        return ordenA - ordenB;
    });
}

function renderActionsCell(studentId, canManage) {
    if (canManage) {
        return `
            <td class="p-0 text-center">
                <div class="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="openObservations('${studentId}')" class="p-1.5 rounded text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors" title="Observaciones">
                        <span class="material-symbols-outlined text-[18px]">rate_review</span>
                    </button>
                    <button onclick="editStudent('${studentId}')" class="p-1.5 rounded text-text-secondary hover:text-white hover:bg-surface-border transition-colors" title="Editar Info">
                        <span class="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button onclick="deleteStudent('${studentId}')" class="p-1.5 rounded text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors" title="Eliminar">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            </td>`;
    } else {
        return `<td class="p-0 text-center text-text-secondary/20"><span class="material-symbols-outlined text-[16px]">lock</span></td>`;
    }
}

function attachInputListeners() {
    document.querySelectorAll('.grade-input').forEach(input => {
        input.addEventListener('change', (e) => updateGradeSecure(e.target.dataset.studentId, e.target.dataset.act, e.target.value, e.target));
    });
}

window.editStudent = (studentId) => {
    const student = currentStudents.find(s => s.id === studentId);
    if (!student) return;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

    setVal('edit-student-original-id', student.id);
    setVal('student-num-orden', student.numero_orden);
    setVal('student-name', student.nombre);
    setVal('student-id', student.id);
    setVal('student-rne', student.rne);
    setVal('student-sexo', student.sexo);
    setVal('student-nacimiento', student.fecha_nacimiento);
    setVal('student-condicion', student.condicion_academica);
    setVal('student-padre', student.padre);
    setVal('student-telefono-padre', student.telefono_padre);
    setVal('student-madre', student.madre);
    setVal('student-telefono-madre', student.telefono_madre);
    setVal('student-tutor', student.tutor);
    setVal('student-telefono', student.telefono);
    setVal('student-direccion', student.direccion);
    setVal('student-nacionalidad', student.nacionalidad);
    setVal('student-emergencia-nombre', student.emergencia_nombre);
    setVal('student-emergencia-telefono', student.emergencia_telefono);
    setVal('student-sangre', student.tipo_sangre);
    setVal('student-medica', student.alergias_medicas);

    document.getElementById('modal-student-title').innerText = "Editar Estudiante";
    const btn = document.getElementById('btn-submit-student');
    if (btn) btn.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar Cambios';

    if (window.toggleModal) window.toggleModal('modal-add-student');
};

window.openObservations = (studentId) => {
    const student = currentStudents.find(s => s.id === studentId);
    if (!student) return;
    document.getElementById('obs-student-name').innerText = `Estudiante: ${student.nombre}`;
    document.getElementById('obs-student-id').value = student.id;
    document.getElementById('observation-text').value = student.observacion || '';
    if (window.toggleModal) window.toggleModal('modal-observations');
};

window.deleteStudent = async (studentId) => {
    if (!confirm("¿Estás seguro de eliminar a este estudiante?\n\nSe perderán sus notas y asistencia.")) return;

    currentStudents = currentStudents.filter(s => s.id !== studentId);
    try {
        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { estudiantes: currentStudents });
        if (window.showToast) window.showToast("Estudiante eliminado", "info");

        if (currentTab === 'grades') renderTable();
        else if (currentTab === 'attendance') renderAttendance();
        else if (currentTab === 'tasks') renderTasksView();

        if (document.getElementById('dash-total-students')) document.getElementById('dash-total-students').innerText = currentStudents.length;
    } catch (e) { alert("Error: " + e.message); }
};

window.renderTasksView = function () {
    const tasksListContainer = document.getElementById('tasks-list-container');
    const singleTaskContainer = document.getElementById('single-task-container');
    const emptyState = document.getElementById('empty-state');

    if (!selectedSubject) return;
    if (currentTaskToGrade) {
        if (tasksListContainer) tasksListContainer.classList.add('hidden');
        if (singleTaskContainer) singleTaskContainer.classList.remove('hidden');
        renderSingleTaskGrading();
    } else {
        if (tasksListContainer) tasksListContainer.classList.remove('hidden');
        if (singleTaskContainer) singleTaskContainer.classList.add('hidden');
        renderTasksList();
    }
}

function renderTasksList() {
    const tasksGrid = document.getElementById('tasks-grid');
    if (!tasksGrid) return;
    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];
    const actividades = rawActividades.map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1', tipo: 'regular' } : act);

    tasksGrid.innerHTML = '';
    if (actividades.length === 0) {
        tasksGrid.innerHTML = `<div class="col-span-full text-center text-text-secondary py-10">No hay tareas creadas para esta materia.</div>`;
        return;
    }

    actividades.forEach(act => {
        const card = document.createElement('div');
        const pName = periodNames[act.periodo || 'p1'];
        const compName = act.competencia ? (COMPETENCIAS[act.competencia].short) : '-';
        const typeBadge = act.tipo && act.tipo !== 'regular'
            ? `<span class="text-[10px] font-bold text-admin bg-admin/10 px-2 py-0.5 rounded uppercase ml-2 border border-admin/20">${act.tipo}</span>`
            : '';

        card.className = "bg-surface-dark border border-surface-border hover:border-primary/50 rounded-xl p-5 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg group";
        card.onclick = () => openTaskGrading(act);
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <span class="text-[10px] font-bold text-text-secondary bg-surface-border/50 px-2 py-0.5 rounded uppercase tracking-wide">${pName} • ${compName}</span>
                <div class="flex items-center">
                    <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">${act.valor}%</span>
                    ${typeBadge}
                </div>
            </div>
            <h4 class="text-lg font-bold text-white mb-1 group-hover:text-primary transition-colors">${act.nombre}</h4>
            <div class="flex items-center gap-2 mt-4 text-xs text-text-secondary">
                <span class="material-symbols-outlined text-sm">edit_note</span>
                <span>Clic para calificar</span>
            </div>`;
        tasksGrid.appendChild(card);
    });
}

function renderSingleTaskGrading() {
    document.getElementById('grading-task-name').innerText = currentTaskToGrade.nombre;
    document.getElementById('grading-task-value').innerText = currentTaskToGrade.valor + "%";
    document.getElementById('grading-task-period').innerText = periodNames[currentTaskToGrade.periodo || 'p1'];

    const tbody = document.getElementById('single-task-body');
    tbody.innerHTML = '';

    const canEdit = checkSubjectPermissions();
    let listToRender = currentStudents;
    if (studentSearchTerm) {
        listToRender = currentStudents.filter(s => (s.nombre || "").toLowerCase().includes(studentSearchTerm) || (s.id || "").toLowerCase().includes(studentSearchTerm) || (s.rne || "").toLowerCase().includes(studentSearchTerm));
    }

    listToRender.forEach((student, index) => {
        const val = (student.notas && student.notas[selectedSubject] && student.notas[selectedSubject][currentTaskToGrade.nombre]) || "";
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/5 transition-colors";
        const disabledAttr = canEdit ? '' : 'disabled';
        const cursorClass = canEdit ? 'bg-surface-dark border-surface-border focus:border-primary focus:ring-1 focus:ring-primary' : 'cursor-not-allowed opacity-50 bg-transparent border-transparent';

        row.innerHTML = `
            <td class="p-4 text-center text-text-secondary/50 font-mono text-xs">${student.numero_orden || (index + 1)}</td>
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-surface-border flex items-center justify-center text-sm font-bold text-white border border-white/10">${getInitials(student.nombre)}</div>
                    <div><p class="font-bold text-white text-base">${student.nombre}</p><p class="text-xs text-text-secondary uppercase tracking-wider">${student.id}</p></div>
                </div>
            </td>
            <td class="p-4 text-center">
                <div class="grade-cell-wrapper relative w-24 mx-auto">
                    <input data-student-id="${student.id}" data-act="${currentTaskToGrade.nombre}" class="w-full h-12 text-center text-lg font-bold text-white border rounded-xl outline-none transition-all ${cursorClass}" type="number" value="${val}" min="0" max="100" ${disabledAttr} oninput="if(this.value>100)this.value=100;if(this.value<0)this.value=0;">
                </div>
            </td>`;
        tbody.appendChild(row);
    });

    if (canEdit) {
        tbody.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('change', (e) => updateGradeSecure(e.target.dataset.studentId, e.target.dataset.act, e.target.value, e.target));
        });
    }
}

window.openTaskGrading = (task) => { currentTaskToGrade = task; renderTasksView(); }
window.closeTaskGrading = () => { currentTaskToGrade = null; renderTasksView(); }

window.renderAttendance = function () {
    const tableBody = document.getElementById('attendance-table-body');
    if (!selectedSubject || !tableBody) return;
    const canEdit = checkSubjectPermissions();
    tableBody.innerHTML = '';

    let listToRender = currentStudents;
    if (studentSearchTerm) {
        listToRender = currentStudents.filter(s => (s.nombre || "").toLowerCase().includes(studentSearchTerm) || (s.id || "").toLowerCase().includes(studentSearchTerm) || (s.rne || "").toLowerCase().includes(studentSearchTerm));
    }

    let countP = 0, countA = 0;
    listToRender.forEach((student, index) => {
        const originalIndex = currentStudents.findIndex(s => s.id === student.id);

        const asistenciasMateria = (student.asistencia && student.asistencia[selectedSubject]) ? student.asistencia[selectedSubject] : {};
        const status = asistenciasMateria[attendanceDate] || null;
        if (status === 'P') countP++;
        if (status === 'A') countA++;
        const row = document.createElement('tr');
        row.className = "hover:bg-surface-border/10 transition-colors";

        const btnP = getAttendanceBtn(originalIndex, 'P', status, 'bg-primary border-primary text-background-dark', 'hover:border-primary text-text-secondary', 'check');
        const btnA = getAttendanceBtn(originalIndex, 'A', status, 'bg-danger border-danger text-white', 'hover:border-danger text-text-secondary', 'close');

        row.innerHTML = `<td class="p-4 text-center text-text-secondary/50 font-mono text-xs">${index + 1}</td><td class="p-4 text-white">${student.nombre}</td><td class="p-4"><div class="flex justify-center gap-2 ${canEdit ? '' : 'pointer-events-none opacity-50'}">${btnP} ${btnA}</div></td><td class="p-4 text-center text-xs text-text-secondary">--</td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('stat-present').innerText = `P: ${countP}`;
    document.getElementById('stat-absent').innerText = `A: ${countA}`;
}

function getAttendanceBtn(idx, type, currentStatus, activeClass, inactiveClass, icon) {
    const isActive = (type === currentStatus);
    const classes = isActive ? `${activeClass} active` : `${inactiveClass}`;
    return `<button onclick="window.markAttendance(${idx}, '${type}')" class="attendance-btn ${classes}"><span class="material-symbols-outlined text-[16px]">${icon}</span></button>`;
}

window.markAttendance = async (index, status) => {
    if (!currentStudents[index].asistencia) currentStudents[index].asistencia = {};
    if (!currentStudents[index].asistencia[selectedSubject]) currentStudents[index].asistencia[selectedSubject] = {};
    const current = currentStudents[index].asistencia[selectedSubject][attendanceDate];
    if (current === status) delete currentStudents[index].asistencia[selectedSubject][attendanceDate];
    else currentStudents[index].asistencia[selectedSubject][attendanceDate] = status;
    renderAttendance();
    await updateDoc(doc(db, "cursos_globales", COURSE_ID), { estudiantes: currentStudents });
}

async function updateGradeSecure(studentID, activityName, value, inputElement) {
    if (!selectedSubject) return;
    let val = parseFloat(value);
    if (isNaN(val)) val = 0;
    if (inputElement) inputElement.classList.add('is-saved');
    const savingIndicator = document.getElementById('saving-indicator');
    if (savingIndicator) savingIndicator.classList.remove('hidden');

    try {
        const courseRef = doc(db, "cursos_globales", COURSE_ID);
        await runTransaction(db, async (transaction) => {
            const freshDoc = await transaction.get(courseRef);
            if (!freshDoc.exists()) throw "Error: Documento no existe";
            const data = freshDoc.data();
            const estudiantes = data.estudiantes || [];
            const studentIndex = estudiantes.findIndex(s => s.id === studentID);
            if (studentIndex === -1) throw "Estudiante no encontrado";

            if (!estudiantes[studentIndex].notas) estudiantes[studentIndex].notas = {};
            if (!estudiantes[studentIndex].notas[selectedSubject]) estudiantes[studentIndex].notas[selectedSubject] = {};
            estudiantes[studentIndex].notas[selectedSubject][activityName] = val;

            transaction.update(courseRef, { estudiantes: estudiantes });
            return estudiantes;
        }).then((updatedStudents) => {
            currentStudents = updatedStudents;
            recalcLocalAverage(studentID);
            setTimeout(() => {
                if (savingIndicator) savingIndicator.classList.add('hidden');
                if (inputElement) inputElement.classList.remove('is-saved');
            }, 500);
        });
    } catch (e) { console.error("Transaction failed: ", e); }
}

function recalcLocalAverage(studentID) {
    const index = currentStudents.findIndex(s => s.id === studentID);
    if (index === -1) return;

    if (currentPeriod === 'recovery') {
        renderTable();
        return;
    }

    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];
    const actividadesFiltradas = rawActividades
        .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1', tipo: 'regular' } : act)
        .filter(act => (act.periodo || 'p1') === currentPeriod && (!act.tipo || act.tipo === 'regular'));

    const newAvg = calculateCompetenceAverage(currentStudents[index].notas[selectedSubject], actividadesFiltradas);
    const avgBadge = document.getElementById(`avg-${studentID}`);
    if (avgBadge) {
        avgBadge.innerText = newAvg;
        avgBadge.className = `inline-block px-2 py-0.5 rounded text-xs font-bold ${getPromedioColor(newAvg)}`;
    }
}

function calculateCompetenceAverage(notasObj, activitiesList) {
    if (!notasObj || activitiesList.length === 0) return 0;
    const comps = {
        c1: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },
        c2: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },
        c3: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },
        c4: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 }
    };

    activitiesList.forEach(act => {
        const compId = act.competencia || 'c1';
        const weight = parseFloat(act.valor || 0);
        const grade = parseFloat(notasObj[act.nombre] || 0);
        if (weight > 0) {
            comps[compId].sum += (grade * weight) / 100;
            comps[compId].totalWeight += weight;
        } else {
            if (notasObj[act.nombre] !== undefined && notasObj[act.nombre] !== "") {
                comps[compId].simpleSum += grade;
                comps[compId].simpleCount++;
            }
        }
    });

    let scores = [];
    ['c1', 'c2', 'c3', 'c4'].forEach(key => {
        let compScore = 0;
        if (comps[key].totalWeight > 0) {
            compScore = Math.round(comps[key].sum);
        } else if (comps[key].simpleCount > 0) {
            compScore = Math.round(comps[key].simpleSum / comps[key].simpleCount);
        }
        scores.push(compScore);
    });

    const totalPeriodo = scores.reduce((a, b) => a + b, 0);
    return Math.round(totalPeriodo / 4);
}

function getPromedioColor(prom) {
    if (prom >= 90) return "bg-primary/20 text-primary";
    if (prom >= 70) return "bg-white/10 text-white";
    return "bg-danger/20 text-danger";
}

function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'; }

const formActivity = document.getElementById('form-add-activity');
if (formActivity) {
    formActivity.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('activity-name').value.trim();
        const valueInput = document.getElementById('activity-value');
        const value = parseFloat(valueInput.value);
        const period = document.getElementById('activity-period').value;
        const competencia = document.getElementById('activity-competencia').value;
        const tipo = document.getElementById('activity-type').value;

        if (!name || isNaN(value) || !selectedSubject) return;
        if (value > 100) { alert("Error: El valor de la actividad no puede ser mayor al 100%."); return; }

        if (!courseConfig.actividades) courseConfig.actividades = {};
        if (!courseConfig.actividades[selectedSubject]) courseConfig.actividades[selectedSubject] = [];

        if (tipo === 'regular') {
            const actividadesCompetencia = courseConfig.actividades[selectedSubject].filter(act =>
                (act.periodo || 'p1') === period && (act.competencia || 'c1') === competencia && (!act.tipo || act.tipo === 'regular')
            );

            let sumaActual = 0;
            actividadesCompetencia.forEach(act => { sumaActual += (parseFloat(act.valor) || 0); });
            const sumaTotal = sumaActual + value;
            if (sumaTotal > 100) {
                alert(`Error: La suma de actividades para la ${COMPETENCIAS[competencia].nombre} excedería el 100%.\n\n• Acumulado actual (${competencia}): ${sumaActual}%\n• Nueva actividad: ${value}%\n• Total: ${sumaTotal}%`);
                return;
            }
        }

        courseConfig.actividades[selectedSubject].push({
            nombre: name,
            valor: value,
            periodo: period,
            competencia: competencia,
            tipo: tipo
        });

        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { actividades: courseConfig.actividades });
        if (window.toggleModal) window.toggleModal('modal-add-activity');
        refreshCurrentView();
        document.getElementById('activity-name').value = '';
        valueInput.value = '';
    });
}