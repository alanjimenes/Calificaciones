import { auth, db, doc, getDoc, updateDoc, runTransaction } from './firebase-config.js';

let currentStudents = [];
let courseConfig = null;
let selectedSubject = "";
let isTitular = false;
let isAdmin = false;
let isSecretaria = false; // Nueva bandera
let COURSE_ID = '';
let currentUserEmail = '';
let currentTab = 'grades';
let attendanceDate = new Date().toISOString().split('T')[0];
let currentPeriod = 'p1';
let currentTaskToGrade = null;

const periodNames = { 'p1': 'Periodo 1', 'p2': 'Periodo 2', 'p3': 'Periodo 3', 'p4': 'Periodo 4', 'final': 'Final' };

const urlParams = new URLSearchParams(window.location.search);
COURSE_ID = urlParams.get('curso');

window.addEventListener('userReady', (e) => {
    const { uid, user, role } = e.detail;
    isAdmin = (role === 'admin');
    isSecretaria = (role === 'secretaria'); // Detectar secretaria
    currentUserEmail = user.email;
    if (COURSE_ID) initializeGradebook(uid, user.email);
    else { alert("No se especificó un curso."); window.location.href = 'cursos.html'; }
});

async function initializeGradebook(userId, userEmail) {
    const loader = document.getElementById('loader');
    try {
        const courseDoc = await getDoc(doc(db, "cursos_globales", COURSE_ID));
        if (!courseDoc.exists()) { alert("Curso no encontrado."); window.location.href = 'cursos.html'; return; }

        courseConfig = courseDoc.data();
        currentStudents = courseConfig.estudiantes || [];
        const titleEl = document.getElementById('course-title-display');
        if (titleEl) titleEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">school</span> ${courseConfig.nombre} <span class="ml-2 text-xs bg-surface-border px-2 py-0.5 rounded text-white font-mono">${courseConfig.id}</span>`;

        isTitular = (userEmail === courseConfig.titular_email);

        // Habilitar botón de agregar estudiante para Admin, Titular y Secretaria
        const btnAddStudent = document.getElementById('btn-add-student');
        if (btnAddStudent && (isAdmin || isTitular || isSecretaria)) {
            btnAddStudent.classList.remove('hidden');
        }

        setupSubjectSelector(courseConfig.materias || []);
        setupTabs();

        const periodSelect = document.getElementById('period-selector');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                currentPeriod = e.target.value;
                document.getElementById('current-period-display').innerText = periodNames[currentPeriod];
                if (currentTab === 'grades') renderTable();
            });
        }

        const datePicker = document.getElementById('attendance-date');
        if (datePicker) {
            datePicker.value = attendanceDate;
            datePicker.addEventListener('change', (e) => {
                attendanceDate = e.target.value;
                if (currentTab === 'attendance') renderAttendance();
            });
        }

    } catch (error) { console.error("Error inicializando:", error); }
    finally { if (loader) loader.style.display = 'none'; }
}

function setupSubjectSelector(materias) {
    const subjectSelect = document.getElementById('subject-selector');
    if (!subjectSelect) return;
    subjectSelect.innerHTML = '<option value="" disabled selected>Selecciona una materia...</option>';
    materias.forEach(materia => {
        const option = document.createElement('option');
        option.value = materia;
        option.textContent = materia;
        subjectSelect.appendChild(option);
    });
    subjectSelect.addEventListener('change', (e) => {
        selectedSubject = e.target.value;
        const modalSubjectLabel = document.getElementById('modal-current-subject');
        if (modalSubjectLabel) modalSubjectLabel.innerText = selectedSubject;
        currentTaskToGrade = null;
        checkSubjectPermissions();
        refreshCurrentView();
    });
    if (materias.length > 0) {
        selectedSubject = materias[0];
        subjectSelect.value = selectedSubject;
        const modalSubjectLabel = document.getElementById('modal-current-subject');
        if (modalSubjectLabel) modalSubjectLabel.innerText = selectedSubject;
        checkSubjectPermissions();
        refreshCurrentView();
    }
}

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

    // Las secretarias NO pueden editar actividades ni notas, solo ver.
    // canEdit se mantiene false para secretaria.

    [btnAddMain, btnAddTasks, btnAdd].forEach(btn => { if (btn) canEdit ? btn.classList.remove('hidden') : btn.classList.add('hidden'); });

    if (statusText) {
        if (canEdit) {
            statusText.innerHTML = `Permisos: <span class='text-primary font-bold'>Edición Habilitada</span> (${assignedTeacher || 'Admin'})`;
            statusText.classList.remove('text-danger'); statusText.classList.add('text-text-secondary');
        } else {
            const roleLabel = isSecretaria ? 'Secretaria (Solo Lectura)' : 'Solo Lectura';
            statusText.innerHTML = `<span class="material-symbols-outlined text-sm align-bottom">lock</span> ${roleLabel}. Profesor: ${assignedTeacher || 'Sin asignar'}`;
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

    if (!selectedSubject) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tableBody) tableBody.innerHTML = '';
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    const canEdit = checkSubjectPermissions();
    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];
    const actividadesFiltradas = rawActividades
        .map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1' } : act)
        .filter(act => (act.periodo || 'p1') === currentPeriod);

    let headerHTML = `
        <th class="p-4 border-b border-surface-border text-center w-12 font-bold">#</th>
        <th class="p-4 border-b border-surface-border border-r border-surface-border/50 sticky left-0 bg-[#0f2115] z-20 min-w-[240px] font-bold text-white">Estudiante</th>
        <th class="p-4 border-b border-surface-border text-center w-24 font-bold text-white bg-surface-dark/50">Prom.<br><span class="text-[9px] text-text-secondary">${periodNames[currentPeriod]}</span></th>
    `;
    actividadesFiltradas.forEach(act => {
        headerHTML += `<th class="p-4 border-b border-surface-border text-center w-32 min-w-[120px] text-xs uppercase tracking-wider text-text-secondary">${act.nombre} <span class="block text-[9px] text-primary/80 font-bold">${act.valor > 0 ? `(${act.valor}%)` : ''}</span></th>`;
    });
    headerHTML += `<th class="p-4 border-b border-surface-border w-12"></th>`;
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
            const promedio = calculateAverage(notasMateria, actividadesFiltradas);
            const promedioClass = getPromedioColor(promedio);
            const numeroOrden = student.numero_orden ? student.numero_orden : (index + 1);

            let rowHTML = `
                <td class="p-0 text-center text-text-secondary/50 font-mono text-xs">${numeroOrden}</td>
                <td class="p-3 sticky left-0 bg-surface-dark border-r border-surface-border/50 z-10">
                    <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-surface-border flex items-center justify-center text-xs font-bold text-white border border-white/10">${getInitials(student.nombre)}</div>
                        <div><p class="font-medium text-white">${student.nombre}</p><p class="text-[10px] text-text-secondary uppercase tracking-wider">${student.id}</p></div>
                    </div>
                </td>
                <td class="p-0 text-center bg-surface-dark/30"><span id="avg-${index}" class="inline-block px-2 py-0.5 rounded text-xs font-bold ${promedioClass}">${promedio}%</span></td>
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
            rowHTML += `<td class="p-0 text-center"><button class="text-text-secondary hover:text-white material-symbols-outlined text-[16px]">more_vert</button></td>`;
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

// ... Resto de funciones (renderTasksView, renderAttendance, etc.) idénticas pero usando 'canEdit' que ya considera a la secretaria ...

window.renderTasksView = function () {
    const tasksListContainer = document.getElementById('tasks-list-container');
    const singleTaskContainer = document.getElementById('single-task-container');
    const emptyState = document.getElementById('empty-state');

    if (!selectedSubject) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (tasksListContainer) tasksListContainer.classList.add('hidden');
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

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
    const actividades = rawActividades.map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1' } : act);

    tasksGrid.innerHTML = '';
    if (actividades.length === 0) {
        tasksGrid.innerHTML = `<div class="col-span-full text-center text-text-secondary py-10">No hay tareas creadas para esta materia.</div>`;
        return;
    }

    actividades.forEach(act => {
        const card = document.createElement('div');
        const pName = periodNames[act.periodo || 'p1'];
        card.className = "bg-surface-dark border border-surface-border hover:border-primary/50 rounded-xl p-5 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-lg group";
        card.onclick = () => openTaskGrading(act);
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <span class="text-[10px] font-bold text-text-secondary bg-surface-border/50 px-2 py-0.5 rounded uppercase tracking-wide">${pName}</span>
                <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">${act.valor}%</span>
            </div>
            <h4 class="text-lg font-bold text-white mb-1 group-hover:text-primary transition-colors">${act.nombre}</h4>
            <div class="flex items-center gap-2 mt-4 text-xs text-text-secondary">
                <span class="material-symbols-outlined text-sm">edit_note</span>
                <span>Clic para ver/calificar</span>
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

window.renderAttendance = function () {
    const tableBody = document.getElementById('attendance-table-body');
    const emptyState = document.getElementById('empty-state');
    if (!selectedSubject) { if (emptyState) emptyState.classList.remove('hidden'); return; }
    if (emptyState) emptyState.classList.add('hidden');

    const canEdit = checkSubjectPermissions();
    if (tableBody) tableBody.innerHTML = '';

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
        const btnT = getAttendanceBtn(index, 'T', status, 'bg-warning border-warning text-background-dark', 'hover:border-warning text-text-secondary', 'schedule');
        const btnE = getAttendanceBtn(index, 'E', status, 'bg-info border-info text-white', 'hover:border-info text-text-secondary', 'medical_services');

        row.innerHTML = `
            <td class="p-4 text-center text-text-secondary/50 font-mono text-xs">${student.numero_orden || (index + 1)}</td>
            <td class="p-4 font-medium text-white"><div class="flex flex-col"><span>${student.nombre}</span><span class="text-[10px] text-text-secondary">${student.id}</span></div></td>
            <td class="p-4"><div class="flex justify-center gap-2 ${canEdit ? '' : 'opacity-50 pointer-events-none'}">${btnP} ${btnT} ${btnA} ${btnE}</div></td>
            <td class="p-4 text-center text-xs text-text-secondary">${getAttendanceSummary(asistenciasMateria)}</td>`;
        if (tableBody) tableBody.appendChild(row);
    });

    const statP = document.getElementById('stat-present');
    const statA = document.getElementById('stat-absent');
    if (statP) statP.innerText = `P: ${countP}`;
    if (statA) statA.innerText = `A: ${countA}`;
}

function getAttendanceBtn(idx, type, currentStatus, activeClass, inactiveClass, icon) {
    const isActive = (type === currentStatus);
    const classes = isActive ? `${activeClass} active` : `${inactiveClass}`;
    return `<button onclick="window.markAttendance(${idx}, '${type}')" class="attendance-btn ${classes}" title="${type}"><span class="material-symbols-outlined text-[16px]">${icon}</span></button>`;
}

function getAttendanceSummary(asistencias) {
    let p = 0, a = 0;
    Object.values(asistencias).forEach(val => { if (val === 'P') p++; if (val === 'A') a++; });
    return `${p} Asist. / ${a} Faltas`;
}

window.markAttendance = async (index, status) => {
    const today = new Date().toISOString().split('T')[0];
    if (attendanceDate > today) { alert("No puedes marcar asistencia en el futuro."); return; }

    if (!currentStudents[index].asistencia) currentStudents[index].asistencia = {};
    if (!currentStudents[index].asistencia[selectedSubject]) currentStudents[index].asistencia[selectedSubject] = {};

    const current = currentStudents[index].asistencia[selectedSubject][attendanceDate];
    if (current === status) delete currentStudents[index].asistencia[selectedSubject][attendanceDate];
    else currentStudents[index].asistencia[selectedSubject][attendanceDate] = status;

    renderAttendance();

    const savingIndicator = document.getElementById('saving-indicator');
    if (savingIndicator) savingIndicator.classList.remove('hidden');
    try {
        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { estudiantes: currentStudents });
        setTimeout(() => { if (savingIndicator) savingIndicator.classList.add('hidden'); }, 500);
    } catch (e) { console.error(e); }
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
    } catch (e) {
        console.error("Transaction failed: ", e);
        if (savingIndicator) { savingIndicator.innerText = "ERROR AL GUARDAR"; savingIndicator.classList.add('text-danger'); }
    }
}

function recalcLocalAverage(studentID) {
    const index = currentStudents.findIndex(s => s.id === studentID);
    if (index === -1) return;
    const rawActividades = (courseConfig.actividades || {})[selectedSubject] || [];
    const actividadesFiltradas = rawActividades.map(act => (typeof act === 'string') ? { nombre: act, valor: 0, periodo: 'p1' } : act).filter(act => (act.periodo || 'p1') === currentPeriod);
    const newAvg = calculateAverage(currentStudents[index].notas[selectedSubject], actividadesFiltradas);
    const avgBadge = document.getElementById(`avg-${index}`);
    if (avgBadge) {
        avgBadge.innerText = newAvg + "%";
        avgBadge.className = `inline-block px-2 py-0.5 rounded text-xs font-bold ${getPromedioColor(newAvg)}`;
    }
}

function calculateAverage(notasObj, activitiesList) {
    if (!notasObj || activitiesList.length === 0) return 0;
    const hasWeights = activitiesList.some(a => a.valor > 0);
    if (hasWeights) {
        let totalScore = 0;
        activitiesList.forEach(act => {
            const weight = parseFloat(act.valor || 0);
            const grade = parseFloat(notasObj[act.nombre]);
            if (!isNaN(grade) && weight > 0) totalScore += (grade * weight) / 100;
        });
        return Math.round(totalScore);
    } else {
        let sum = 0, count = 0;
        activitiesList.forEach(act => {
            const val = notasObj[act.nombre];
            if (val !== undefined && val !== "") { sum += parseFloat(val); count++; }
        });
        return count === 0 ? 0 : Math.round(sum / count);
    }
}
function getPromedioColor(prom) {
    if (prom >= 90) return "bg-primary/20 text-primary";
    if (prom >= 70) return "bg-white/10 text-white";
    return "bg-danger/20 text-danger";
}
function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2) : '??'; }

// Manejo de Modales (Add Activity / Student)
const formActivity = document.getElementById('form-add-activity');
if (formActivity) {
    formActivity.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('activity-name').value.trim();
        const value = document.getElementById('activity-value').value;
        const period = document.getElementById('activity-period').value;
        if (!name || !value || !selectedSubject) return;

        if (!courseConfig.actividades) courseConfig.actividades = {};
        if (!courseConfig.actividades[selectedSubject]) courseConfig.actividades[selectedSubject] = [];
        courseConfig.actividades[selectedSubject].push({ nombre: name, valor: parseFloat(value), periodo: period });

        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { actividades: courseConfig.actividades });
        if (window.toggleModal) window.toggleModal('modal-add-activity');
        refreshCurrentView();
    });
}

// ----------------------------------------------------
// NUEVO MANEJO DE REGISTRO ESTUDIANTIL COMPLETO
// ----------------------------------------------------
const formStudent = document.getElementById('form-add-student');
if (formStudent) {
    formStudent.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Obtener datos del nuevo formulario ampliado
        const numOrden = document.getElementById('student-num-orden').value.trim();
        const name = document.getElementById('student-name').value.trim();
        const id = document.getElementById('student-id').value.trim().toUpperCase(); // SIGERD
        const rne = document.getElementById('student-rne').value.trim().toUpperCase();
        const sexo = document.getElementById('student-sexo').value;
        const nacimiento = document.getElementById('student-nacimiento').value;
        const condicion = document.getElementById('student-condicion').value;

        if (!name || !id) return;

        // Validar duplicados por ID (SIGERD)
        if (currentStudents.some(s => s.id === id)) {
            alert("Error: Ya existe un estudiante con ese ID SIGERD.");
            return;
        }

        // Crear objeto estudiante completo
        const newStudent = {
            id: id,                  // SIGERD
            numero_orden: numOrden,  // Nuevo
            nombre: name,
            rne: rne,                // Nuevo
            sexo: sexo,              // Nuevo
            fecha_nacimiento: nacimiento, // Nuevo
            condicion_academica: condicion, // Nuevo
            notas: {},
            asistencia: {}
        };

        currentStudents.push(newStudent);

        // Ordenar por número de lista si es posible antes de guardar
        currentStudents.sort((a, b) => (parseInt(a.numero_orden) || 999) - (parseInt(b.numero_orden) || 999));

        await updateDoc(doc(db, "cursos_globales", COURSE_ID), { estudiantes: currentStudents });

        // Limpiar formulario
        formStudent.reset();

        if (window.toggleModal) window.toggleModal('modal-add-student');
        refreshCurrentView();
    });
}