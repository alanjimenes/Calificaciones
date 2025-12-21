import { auth, db, setDoc, doc, getDoc, getDocs, collection, query, updateDoc, where, runTransaction, appId } from './firebase-config.js';

let allCoursesCache = []; 
let pendingCourseData = null; 
let conflictDataCache = null; 

window.addEventListener('userReady', (e) => {
    const { role, email } = e.detail;
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        loadDashboard(role === 'admin', email);
        loadActiveNotifications();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            loadDashboard(role === 'admin', email);
            loadActiveNotifications();
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window.toggleModal = (modalID) => {
        const modal = document.getElementById(modalID);
        if (modal) {
            modal.classList.toggle('hidden');
            modal.classList.toggle('flex');
        }
    }
    setupCourseForm();
});

// --- CARGAR NOTIFICACIONES ---
async function loadActiveNotifications() {
    const container = document.getElementById('dashboard-notifications-list');
    if (!container) return;

    try {
        const notifRef = collection(db, 'artifacts', appId, 'public', 'data', 'notificaciones');
        const snapshot = await getDocs(notifRef);

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-6 opacity-50">
                    <span class="material-symbols-outlined text-2xl text-text-secondary mb-1">check_circle</span>
                    <p class="text-[10px] text-text-secondary">No hay avisos nuevos.</p>
                </div>`;
            return;
        }

        let notifications = [];
        snapshot.forEach(docSnap => {
            notifications.push(docSnap.data());
        });

        notifications.sort((a, b) => {
            const dateA = new Date(a.fecha || 0);
            const dateB = new Date(b.fecha || 0);
            return dateB - dateA;
        });

        container.innerHTML = '';
        notifications.slice(0, 5).forEach(data => {
            let dateStr = 'Hoy';
            try { if (data.fecha) dateStr = new Date(data.fecha).toLocaleDateString(); } catch(e){}
            
            let color = "bg-surface-border/30 border-surface-border";
            let icon = "info";
            
            if (data.tipo === 'urgent') { 
                color = "bg-danger/10 border-danger/20"; 
                icon = "priority_high";
            } else if (data.tipo === 'warning') { 
                color = "bg-admin/10 border-admin/20"; 
                icon = "warning"; 
            }

            const item = document.createElement('div');
            item.className = `p-3 rounded-xl border ${color} flex gap-3 items-start transition-all hover:brightness-110 cursor-default`;
            item.innerHTML = `
                <span class="material-symbols-outlined text-sm mt-0.5 shrink-0 opacity-70">${icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-0.5">
                        <h4 class="text-xs font-bold text-white truncate pr-2">${data.titulo}</h4>
                        <span class="text-[9px] text-text-secondary whitespace-nowrap">${dateStr}</span>
                    </div>
                    <p class="text-[10px] text-text-secondary leading-relaxed line-clamp-2">${data.mensaje}</p>
                </div>
            `;
            container.appendChild(item);
        });

    } catch (error) {
        console.error("Error cargando notificaciones:", error);
        container.innerHTML = '<p class="text-[10px] text-danger text-center">Error de conexión.</p>';
    }
}

// --- CONFIGURACIÓN FORMULARIO CURSO ---
function setupCourseForm() {
    const formCurso = document.getElementById('form-create-course');
    if (formCurso) {
        formCurso.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (auth.currentUser.email !== 'admin@mail.com') {
                alert("Solo los administradores pueden gestionar cursos.");
                return;
            }

            const nombreCurso = document.getElementById('course-name').value;
            const idCurso = document.getElementById('course-id').value.trim();
            const emailDocente = document.getElementById('course-teacher-email').value.trim();
            const submitBtn = formCurso.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> Verificando...';

            try {
                let conflictFound = null;
                if (emailDocente) {
                    const q = query(collection(db, "cursos_globales"), where("titular_email", "==", emailDocente));
                    const querySnapshot = await getDocs(q);
                    querySnapshot.forEach(docSnap => {
                        if (docSnap.id !== idCurso) conflictFound = { id: docSnap.id, ...docSnap.data() };
                    });
                }

                if (conflictFound) {
                    pendingCourseData = {
                        id: idCurso, nombre: nombreCurso, titular_email: emailDocente,
                        creado_por: auth.currentUser.email, creado_fecha: new Date()
                    };
                    conflictDataCache = conflictFound;
                    openConflictModal(conflictFound, emailDocente);
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
                }

                await saveCourseDirectly(idCurso, {
                    nombre: nombreCurso, id: idCurso, titular_email: emailDocente,
                    creado_por: auth.currentUser.email, creado_fecha: new Date()
                });

                alert(`Curso "${nombreCurso}" guardado correctamente.`);
                toggleModal('modal-create-course');
                formCurso.reset();
                loadDashboard(true, auth.currentUser.email);

            } catch (error) {
                console.error(error);
                alert("Error al procesar: " + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        });
    }
}

function openConflictModal(conflictCourse, teacherEmail) {
    const modal = document.getElementById('modal-teacher-conflict');
    const teacherSelect = document.getElementById('course-teacher-email');
    const teacherName = teacherSelect.options[teacherSelect.selectedIndex].text;
    document.getElementById('conflict-teacher-name').innerText = teacherName;
    document.getElementById('conflict-course-name').innerText = conflictCourse.nombre;
    document.getElementById('conflict-step-1').classList.remove('hidden');
    document.getElementById('conflict-step-2').classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeConflictModal = () => {
    const modal = document.getElementById('modal-teacher-conflict');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingCourseData = null;
    conflictDataCache = null;
}

window.showReplacementStep = () => {
    document.getElementById('conflict-step-1').classList.add('hidden');
    document.getElementById('conflict-step-2').classList.remove('hidden');
    document.getElementById('replacement-course-target').innerText = conflictDataCache.nombre;
    const originalSelect = document.getElementById('course-teacher-email');
    const replacementSelect = document.getElementById('conflict-replacement-select');
    replacementSelect.innerHTML = '<option value="" disabled selected>Selecciona un profesor...</option>';
    Array.from(originalSelect.options).forEach(opt => {
        if (opt.value && opt.value !== pendingCourseData.titular_email) {
            const newOpt = document.createElement('option');
            newOpt.value = opt.value;
            newOpt.text = opt.text;
            replacementSelect.appendChild(newOpt);
        }
    });
}

window.backToConflictStep1 = () => {
    document.getElementById('conflict-step-2').classList.add('hidden');
    document.getElementById('conflict-step-1').classList.remove('hidden');
}

window.confirmTeacherSwap = async () => {
    const replacementEmail = document.getElementById('conflict-replacement-select').value;
    if (!replacementEmail) { alert("Debes seleccionar un profesor reemplazo."); return; }

    const btn = document.querySelector('#conflict-step-2 button');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Procesando...';
    btn.disabled = true;

    try {
        await runTransaction(db, async (transaction) => {
            const newCourseRef = doc(db, "cursos_globales", pendingCourseData.id);
            const oldCourseRef = doc(db, "cursos_globales", conflictDataCache.id);
            transaction.set(newCourseRef, pendingCourseData, { merge: true });
            transaction.update(oldCourseRef, { titular_email: replacementEmail });
        });
        if (window.showToast) window.showToast("Intercambio exitoso", "success");
        closeConflictModal();
        toggleModal('modal-create-course');
        document.getElementById('form-create-course').reset();
        loadDashboard(true, auth.currentUser.email);
    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function saveCourseDirectly(id, data) {
    await setDoc(doc(db, "cursos_globales", id), data, { merge: true });
}

// --- CARGAR DASHBOARD (CURSOS) ---
async function loadDashboard(isAdmin, userEmail) {
    const listContainer = document.getElementById('dashboard-courses-list');
    const courseSelect = document.getElementById('quick-task-course');
    if (!listContainer) return;

    try {
        const q = query(collection(db, "cursos_globales"));
        const snapshot = await getDocs(q);
        allCoursesCache = [];
        listContainer.innerHTML = '';
        if (courseSelect) courseSelect.innerHTML = '<option value="" disabled selected>Selecciona un curso...</option>';

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-text-secondary col-span-full text-center py-10">No hay cursos disponibles.</p>';
            return;
        }

        let hasCourses = false;

        snapshot.forEach(docSnap => {
            const course = docSnap.data();
            course.id = docSnap.id;
            
            // --- CORRECCIÓN PERMISOS ---
            const isTitular = (course.titular_email === userEmail);
            let isTeacher = false;
            if (course.profesores_materias) {
                isTeacher = Object.values(course.profesores_materias).some(email => email === userEmail);
            }

            if (isAdmin || isTitular || isTeacher) {
                hasCourses = true;
                allCoursesCache.push(course);
                const card = document.createElement('a');
                card.href = `calificaciones.html?curso=${course.id}`;
                card.className = "group bg-surface-dark border border-surface-border p-5 rounded-2xl hover:border-primary/50 transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between h-40";
                
                const initial = course.nombre ? course.nombre.charAt(0).toUpperCase() : 'C';
                const subjectCount = (course.materias || []).length;
                const studentCount = (course.estudiantes || []).length;

                // Etiqueta de Rol
                let roleTag = "";
                if(isTitular) roleTag = `<span class="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">Titular</span>`;
                else if(isTeacher) roleTag = `<span class="text-[10px] bg-surface-border/50 text-text-secondary px-1.5 py-0.5 rounded">Docente</span>`;

                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="h-10 w-10 rounded-lg bg-surface-border flex items-center justify-center text-lg font-bold text-white group-hover:bg-primary group-hover:text-background-dark transition-colors">${initial}</div>
                        <div class="flex flex-col items-end gap-1">
                            <span class="material-symbols-outlined text-text-secondary group-hover:text-primary">arrow_outward</span>
                            ${roleTag}
                        </div>
                    </div>
                    <div>
                        <h4 class="text-lg font-bold text-white leading-tight mb-1 group-hover:text-primary transition-colors truncate" title="${course.nombre}">${course.nombre}</h4>
                        <p class="text-xs text-text-secondary">${subjectCount} Materias • ${studentCount} Estudiantes</p>
                    </div>
                `;
                listContainer.appendChild(card);

                if (courseSelect) {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = course.nombre;
                    courseSelect.appendChild(option);
                }
            }
        });
        
        if (!hasCourses) {
            listContainer.innerHTML = '<p class="text-text-secondary col-span-full text-center py-10 bg-surface-dark rounded-xl border border-surface-border">No tienes cursos asignados.</p>';
        }
    } catch (error) {
        console.error("Error cargando dashboard:", error);
        listContainer.innerHTML = '<p class="text-danger col-span-full text-center py-4">Error cargando cursos.</p>';
    }
}

// Lógica de Tarea Rápida
const quickForm = document.getElementById('form-quick-task');
const courseSelect = document.getElementById('quick-task-course');
const subjectSelect = document.getElementById('quick-task-subject');
const subjectContainer = document.getElementById('subject-container');
const detailsContainer = document.getElementById('details-container');
const statusMsg = document.getElementById('quick-status');

if (courseSelect) {
    courseSelect.addEventListener('change', (e) => {
        const courseId = e.target.value;
        const selectedCourse = allCoursesCache.find(c => c.id === courseId);
        subjectSelect.innerHTML = '<option value="" disabled selected>Selecciona materia...</option>';

        // Solo mostrar materias donde el usuario es profesor o si es titular/admin ve todas
        let materiasDisponibles = selectedCourse.materias || [];
        
        // Si no es admin ni titular, filtrar materias
        // (Nota: Esta lógica es opcional, ya que el backend debería validar, 
        // pero mejora UX mostrar solo donde puede editar)
        const currentUserEmail = auth.currentUser.email;
        if(auth.currentUser && selectedCourse.titular_email !== currentUserEmail && currentUserEmail !== 'admin@mail.com') {
             if (selectedCourse.profesores_materias) {
                 materiasDisponibles = materiasDisponibles.filter(m => selectedCourse.profesores_materias[m] === currentUserEmail);
             } else {
                 materiasDisponibles = []; // No tiene asignaciones específicas
             }
        }

        if (materiasDisponibles.length > 0) {
            materiasDisponibles.forEach(materia => {
                const opt = document.createElement('option');
                opt.value = materia;
                opt.textContent = materia;
                subjectSelect.appendChild(opt);
            });
            subjectContainer.classList.remove('hidden');
            if (statusMsg) statusMsg.classList.add('hidden');
        } else {
            subjectContainer.classList.add('hidden');
            detailsContainer.classList.add('hidden');
            if (window.showToast) window.showToast("No tienes materias asignadas en este curso.", "warning");
        }
    });

    if (subjectSelect) subjectSelect.addEventListener('change', () => { if (subjectSelect.value) detailsContainer.classList.remove('hidden'); });

    if (quickForm) {
        quickForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const courseId = courseSelect.value;
            const subject = subjectSelect.value;
            const name = document.getElementById('quick-task-name').value.trim();
            const valueInput = document.getElementById('quick-task-value');
            const period = document.getElementById('quick-task-period').value;
            const value = parseFloat(valueInput.value);

            if (!courseId || !subject || !name || isNaN(value)) return;
            if (value > 100) { alert("Valor máximo 100%."); return; }

            const btn = quickForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...';
            btn.disabled = true;

            try {
                const courseRef = doc(db, "cursos_globales", courseId);
                const courseDoc = await getDoc(courseRef);
                if (courseDoc.exists()) {
                    const data = courseDoc.data();
                    let actividades = data.actividades || {};
                    if (!actividades[subject]) actividades[subject] = [];

                    const actsPeriodo = actividades[subject].filter(act => (act.periodo || 'p1') === period);
                    let sumaActual = 0;
                    actsPeriodo.forEach(act => sumaActual += (parseFloat(act.valor) || 0));

                    if ((sumaActual + value) > 100) {
                        alert(`La suma excedería el 100% (Actual: ${sumaActual}%).`);
                        return;
                    }

                    actividades[subject].push({ nombre: name, valor: value, periodo: period });
                    await updateDoc(courseRef, { actividades: actividades });
                    if (window.showToast) window.showToast("Tarea creada", "success");
                    document.getElementById('quick-task-name').value = '';
                    document.getElementById('quick-task-value').value = '';
                }
            } catch (error) {
                console.error(error);
                alert("Error: " + error.message);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
}