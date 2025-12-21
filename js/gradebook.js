 // js/gradebook.js

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


const periodNames = { 'p1': 'Periodo 1', 'p2': 'Periodo 2', 'p3': 'Periodo 3', 'p4': 'Periodo 4' };


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


async function initializeGradebook(userId, userEmail) {

    const loader = document.getElementById('loader');

    try {

        // 1. Cargar Configuración del Curso (Materias, Actividades, Titular)

        const courseDoc = await getDoc(doc(db, "cursos_globales", COURSE_ID));

        if (!courseDoc.exists()) { alert("Curso no encontrado."); window.location.href = 'cursos.html'; return; }

        courseConfig = courseDoc.data();


        // 2. NUEVO: Cargar Estudiantes desde la SUBCOLECCIÓN

        const studentsSnap = await getDocs(collection(db, "cursos_globales", COURSE_ID, "estudiantes"));

        currentStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));


        // Renderizar header

        const titleEl = document.getElementById('course-title-display');

        if (titleEl) titleEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">school</span> ${courseConfig.nombre}`;


        // Stats

        if (document.getElementById('dash-total-subjects')) document.getElementById('dash-total-subjects').innerText = (courseConfig.materias || []).length;

        if (document.getElementById('dash-total-students')) document.getElementById('dash-total-students').innerText = currentStudents.length;


        isTitular = (userEmail === courseConfig.titular_email);

        const btnAddStudent = document.getElementById('btn-add-student');

        if (btnAddStudent && (isAdmin || isTitular)) btnAddStudent.classList.remove('hidden');


        setupTabs();

        renderSubjectsDashboard();

        showDashboardView();


    } catch (error) { console.error("Error inicializando:", error); }

    finally { if (loader) loader.style.display = 'none'; }

}


// --- RENDERIZADO DEL DASHBOARD DE MATERIAS ---

function renderSubjectsDashboard(filterTerm = "") {

    const tbody = document.getElementById('subjects-dashboard-body');

    if (!tbody) return;

    tbody.innerHTML = '';


    const materias = courseConfig.materias || [];

    const profesores = courseConfig.profesores_materias || {};


    const filtered = materias.filter(m => m.toLowerCase().includes(filterTerm.toLowerCase()));


    if (filtered.length === 0) {

        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-text-secondary">No se encontraron materias.</td></tr>`;

        return;

    }


    filtered.forEach(materia => {

        const profesorEmail = profesores[materia];

        const initial = materia.charAt(0).toUpperCase();

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


// --- LOGICA DE NAVEGACIÓN ---


function showDashboardView() {

    document.getElementById('view-subjects-dashboard').classList.remove('hidden');

    document.getElementById('view-grades').classList.add('hidden');

    document.getElementById('view-tasks').classList.add('hidden');

    document.getElementById('view-attendance').classList.add('hidden');

    document.getElementById('controls-gradebook').classList.add('hidden');

    document.getElementById('subject-status').classList.add('hidden');

    document.getElementById('btn-back-to-subjects').classList.add('hidden');

    selectedSubject = null;

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


    if (currentStudents.length === 0) {

        if (emptyState) {

            emptyState.classList.remove('hidden');

            emptyState.querySelector('p').innerText = "No hay estudiantes registrados en este curso.";

        }

        if (tableBody) tableBody.innerHTML = '';

        return;

    }

    if (emptyState) emptyState.classList.add('hidden');


    const canEdit = checkSubjectPermissions();

    const canManageStudents = isAdmin || isTitular;


    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];

    // Normalizar actividades

    const actividadesFiltradas = rawActividades

        .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1' } : act)

        .filter(act => (act.periodo || 'p1') === currentPeriod);


    // Ordenar actividades por competencia para visualización

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

    if (tableHeadRow) tableHeadRow.innerHTML = headerHTML;


    if (tableBody) {

        tableBody.innerHTML = '';

        const sortedStudents = [...currentStudents].sort((a, b) => {

            const ordenA = parseInt(a.numero_orden) || 9999;

            const ordenB = parseInt(b.numero_orden) || 9999;

            return ordenA - ordenB;

        });


        sortedStudents.forEach((student, index) => {

            const row = document.createElement('tr');

            row.className = "group hover:bg-surface-border/10 transition-colors";


            const notasMateria = (student.notas && student.notas[selectedSubject]) ? student.notas[selectedSubject] : {};


            // NUEVO CÁLCULO DE PROMEDIO BASADO EN 4 COMPETENCIAS

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

                <td class="p-0 text-center bg-surface-dark/30"><span id="avg-${index}" class="inline-block px-2 py-0.5 rounded text-xs font-bold ${promedioClass}">${promedioPeriodo}</span></td>

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


            // Columna de Acciones

            if (canManageStudents) {

                rowHTML += `

                    <td class="p-0 text-center">

                        <div class="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                            <button onclick="openObservations('${student.id}')" class="p-1.5 rounded text-text-secondary hover:text-warning hover:bg-warning/10 transition-colors" title="Observaciones / Bitácora">

                                <span class="material-symbols-outlined text-[18px]">rate_review</span>

                            </button>

                            <button onclick="editStudent('${student.id}')" class="p-1.5 rounded text-text-secondary hover:text-white hover:bg-surface-border transition-colors" title="Editar Info">

                                <span class="material-symbols-outlined text-[16px]">edit</span>

                            </button>

                            <button onclick="deleteStudent('${student.id}')" class="p-1.5 rounded text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors" title="Eliminar">

                                <span class="material-symbols-outlined text-lg">delete</span>

                            </button>

                        </div>

                    </td>`;

            } else {

                rowHTML += `<td class="p-0 text-center text-text-secondary/20"><span class="material-symbols-outlined text-[16px]">lock</span></td>`;

            }


            row.innerHTML = rowHTML;

            tableBody.appendChild(row);

        });


        if (canEdit) {

            document.querySelectorAll('.grade-input').forEach(input => {

                input.addEventListener('change', (e) => updateGradeSecure(e.target.dataset.studentId, e.target.dataset.act, e.target.value, e.target));

            });

        }

    }

}


// ----------------------------------------------------

// FUNCIONES EDITAR Y ELIMINAR ESTUDIANTES

// ----------------------------------------------------

// (Se mantienen igual que el original, omitido por brevedad pero incluido en archivo final)

window.editStudent = (studentId) => {

    const student = currentStudents.find(s => s.id === studentId);

    if (!student) return;

    document.getElementById('student-num-orden').value = student.numero_orden || '';

    document.getElementById('student-name').value = student.nombre || '';

    document.getElementById('student-id').value = student.id || '';

    document.getElementById('edit-student-original-id').value = student.id;

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

    if (!confirm("¿Estás seguro de eliminar a este estudiante?")) return;

    currentStudents = currentStudents.filter(s => s.id !== studentId);

    try {

        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { estudiantes: currentStudents });

        refreshCurrentView();

    } catch (e) { alert("Error: " + e.message); }

};

// Fin funciones auxiliares estudiantes


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

    const actividades = rawActividades.map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1' } : act);


    tasksGrid.innerHTML = '';

    if (actividades.length === 0) {

        tasksGrid.innerHTML = `<div class="col-span-full text-center text-text-secondary py-10">No hay tareas creadas para esta materia.</div>`;

        return;

    }


    actividades.forEach(act => {

        const card = document.createElement('div');

        const pName = periodNames[act.periodo || 'p1'];

        const compName = COMPETENCIAS[act.competencia || 'c1'].short;


        card.className = "bg-surface-dark border border-surface-border hover:border-primary/50 rounded-xl p-5 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg group";

        card.onclick = () => openTaskGrading(act);

        card.innerHTML = `

            <div class="flex justify-between items-start mb-3">

                <span class="text-[10px] font-bold text-text-secondary bg-surface-border/50 px-2 py-0.5 rounded uppercase tracking-wide">${pName} • ${compName}</span>

                <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">${act.valor}%</span>

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

    currentStudents.forEach((student, index) => {

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


// ... (Funciones de Asistencia igual que antes) ...

window.renderAttendance = function () {

    const tableBody = document.getElementById('attendance-table-body');

    if (!selectedSubject || !tableBody) return;

    const canEdit = checkSubjectPermissions();

    tableBody.innerHTML = '';

    let countP = 0, countA = 0;

    currentStudents.forEach((student, index) => {

        const asistenciasMateria = (student.asistencia && student.asistencia[selectedSubject]) ? student.asistencia[selectedSubject] : {};

        const status = asistenciasMateria[attendanceDate] || null;

        if (status === 'P') countP++;

        if (status === 'A') countA++;

        const row = document.createElement('tr');

        row.className = "hover:bg-surface-border/10 transition-colors";

        const btnP = getAttendanceBtn(index, 'P', status, 'bg-primary border-primary text-background-dark', 'hover:border-primary text-text-secondary', 'check');

        const btnA = getAttendanceBtn(index, 'A', status, 'bg-danger border-danger text-white', 'hover:border-danger text-text-secondary', 'close');

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


// ==========================================

// CÁLCULO DE PROMEDIOS (LÓGICA ACTUALIZADA)

// ==========================================

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

    } catch (e) {

        console.error("Transaction failed: ", e);

    }

}


function recalcLocalAverage(studentID) {

    const index = currentStudents.findIndex(s => s.id === studentID);

    if (index === -1) return;


    // Obtenemos todas las actividades de este periodo con su competencia asignada

    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];

    const actividadesFiltradas = rawActividades

        .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1', competencia: 'c1' } : act)

        .filter(act => (act.periodo || 'p1') === currentPeriod);


    const newAvg = calculateCompetenceAverage(currentStudents[index].notas[selectedSubject], actividadesFiltradas);


    const avgBadge = document.getElementById(`avg-${index}`);

    if (avgBadge) {

        avgBadge.innerText = newAvg;

        avgBadge.className = `inline-block px-2 py-0.5 rounded text-xs font-bold ${getPromedioColor(newAvg)}`;

    }

}


/**

 * Calcula el promedio final del periodo basado en las 4 competencias.

 * Fórmula: (Promedio C1 + Promedio C2 + Promedio C3 + Promedio C4) / 4

 */

function calculateCompetenceAverage(notasObj, activitiesList) {

    if (!notasObj || activitiesList.length === 0) return 0;


    // Inicializar acumuladores por competencia

    const comps = {

        c1: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },

        c2: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },

        c3: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 },

        c4: { sum: 0, totalWeight: 0, simpleCount: 0, simpleSum: 0 }

    };


    // Recorrer actividades y agruparlas

    activitiesList.forEach(act => {

        const compId = act.competencia || 'c1';

        const weight = parseFloat(act.valor || 0);

        const grade = parseFloat(notasObj[act.nombre] || 0);


        if (weight > 0) {

            comps[compId].sum += (grade * weight) / 100;

            comps[compId].totalWeight += weight;

        } else {

            // Si no tiene peso, usaremos promedio simple temporalmente

            if (notasObj[act.nombre] !== undefined && notasObj[act.nombre] !== "") {

                comps[compId].simpleSum += grade;

                comps[compId].simpleCount++;

            }

        }

    });


    // Calcular nota final de cada competencia

    let scores = [];

    ['c1', 'c2', 'c3', 'c4'].forEach(key => {

        let compScore = 0;

        // Si usamos pesos (sistema porcentual dentro de la competencia)

        if (comps[key].totalWeight > 0) {

            // Nota: Aquí asumimos que el usuario configura para que sumen 100 por competencia

            // O sumamos lo acumulado directo.

            // Si el totalWeight es < 100, la nota será proporcional a lo evaluado.

            // Para simplicidad, devolvemos la suma ponderada.

            compScore = Math.round(comps[key].sum);

        } else if (comps[key].simpleCount > 0) {

            compScore = Math.round(comps[key].simpleSum / comps[key].simpleCount);

        }


        // Si no hubo actividades en esta competencia, asumimos 0 (o podríamos ignorarla, pero la regla dice /4)

        scores.push(compScore);

    });


    // Promedio final del periodo = Suma de las 4 competencias / 4

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

        const competencia = document.getElementById('activity-competencia').value; // NUEVO CAMPO


        if (!name || isNaN(value) || !selectedSubject) return;


        if (value > 100) {

            alert("Error: El valor de la actividad no puede ser mayor al 100%.");

            return;

        }


        if (!courseConfig.actividades) courseConfig.actividades = {};

        if (!courseConfig.actividades[selectedSubject]) courseConfig.actividades[selectedSubject] = [];


        // Filtrar actividades DE ESTE PERIODO Y ESTA COMPETENCIA

        const actividadesCompetencia = courseConfig.actividades[selectedSubject].filter(act =>

            (act.periodo || 'p1') === period &&

            (act.competencia || 'c1') === competencia

        );


        let sumaActual = 0;

        actividadesCompetencia.forEach(act => {

            sumaActual += (parseFloat(act.valor) || 0);

        });


        const sumaTotal = sumaActual + value;


        if (sumaTotal > 100) {

            alert(`Error: La suma de actividades para la ${COMPETENCIAS[competencia].nombre} excedería el 100%.\n\n• Acumulado actual (${competencia}): ${sumaActual}%\n• Nueva actividad: ${value}%\n• Total: ${sumaTotal}%`);

            return;

        }


        courseConfig.actividades[selectedSubject].push({

            nombre: name,

            valor: value,

            periodo: period,

            competencia: competencia // Guardamos la competencia

        });


        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { actividades: courseConfig.actividades });

        if (window.toggleModal) window.toggleModal('modal-add-activity');

        refreshCurrentView();


        document.getElementById('activity-name').value = '';

        valueInput.value = '';

    });

} 