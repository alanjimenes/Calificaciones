import { auth, db, setDoc, doc, getDoc, getDocs, collection, query, updateDoc, where, runTransaction } from './firebase-config.js';

let allCoursesCache = []; // Caché local

// Variables globales para el manejo de conflictos
let pendingCourseData = null; // Datos del curso que intentamos crear/editar
let conflictDataCache = null; // Datos del curso que tiene el conflicto (el curso viejo)

// --- CORRECCIÓN CRÍTICA: Escuchar evento INMEDIATAMENTE ---
window.addEventListener('userReady', (e) => {
    const { role, email } = e.detail;
    // Aseguramos que el DOM esté listo antes de pintar
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        loadDashboard(role === 'admin', email);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            loadDashboard(role === 'admin', email);
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

    // --- Lógica Crear/Editar Curso (MODIFICADA CON VALIDACIÓN) ---
    const formCurso = document.getElementById('form-create-course');
    if (formCurso) {
        formCurso.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Verificación simple de admin (idealmente backend rules)
            if (auth.currentUser.email !== 'admin@mail.com') {
                alert("Solo los administradores pueden gestionar cursos.");
                return;
            }

            const nombreCurso = document.getElementById('course-name').value;
            const idCurso = document.getElementById('course-id').value.trim();
            const emailDocente = document.getElementById('course-teacher-email').value.trim();

            const submitBtn = formCurso.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            // Estado de carga
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> Verificando...';

            try {
                // 1. Verificar si el profesor ya está asignado a otro curso
                let conflictFound = null;

                if (emailDocente) {
                    // Buscamos cursos donde este profesor sea titular
                    const q = query(collection(db, "cursos_globales"), where("titular_email", "==", emailDocente));
                    const querySnapshot = await getDocs(q);

                    querySnapshot.forEach(docSnap => {
                        // Si encuentra un curso y NO es el mismo que estamos editando...
                        if (docSnap.id !== idCurso) {
                            conflictFound = { id: docSnap.id, ...docSnap.data() };
                        }
                    });
                }

                if (conflictFound) {
                    // --- DETECTAMOS CONFLICTO ---
                    console.log("Conflicto detectado con curso:", conflictFound.nombre);

                    // Guardamos los datos temporalmente
                    pendingCourseData = {
                        id: idCurso,
                        nombre: nombreCurso,
                        titular_email: emailDocente,
                        creado_por: auth.currentUser.email,
                        creado_fecha: new Date()
                    };
                    conflictDataCache = conflictFound;

                    // Abrimos el modal de resolución de conflicto
                    openConflictModal(conflictFound, emailDocente);

                    // Restauramos botón pero no guardamos aún
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
                }

                // 2. Si no hay conflicto, guardamos normalmente
                await saveCourseDirectly(idCurso, {
                    nombre: nombreCurso,
                    id: idCurso,
                    titular_email: emailDocente,
                    creado_por: auth.currentUser.email,
                    creado_fecha: new Date()
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
});

// --- FUNCIONES DE RESOLUCIÓN DE CONFLICTOS ---

// 1. Abrir Modal y mostrar Paso 1
function openConflictModal(conflictCourse, teacherEmail) {
    const modal = document.getElementById('modal-teacher-conflict');
    const teacherSelect = document.getElementById('course-teacher-email');
    const teacherName = teacherSelect.options[teacherSelect.selectedIndex].text;

    // Llenar datos visuales
    document.getElementById('conflict-teacher-name').innerText = teacherName;
    document.getElementById('conflict-course-name').innerText = conflictCourse.nombre;

    // Resetear pasos
    document.getElementById('conflict-step-1').classList.remove('hidden');
    document.getElementById('conflict-step-2').classList.add('hidden');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// 2. Cerrar Modal (Cancelar todo)
window.closeConflictModal = () => {
    const modal = document.getElementById('modal-teacher-conflict');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingCourseData = null;
    conflictDataCache = null;
}

// 3. Pasar al Paso 2 (Seleccionar Reemplazo)
window.showReplacementStep = () => {
    document.getElementById('conflict-step-1').classList.add('hidden');
    document.getElementById('conflict-step-2').classList.remove('hidden');

    document.getElementById('replacement-course-target').innerText = conflictDataCache.nombre;

    // Llenar el select de reemplazo con los mismos profesores del formulario original
    const originalSelect = document.getElementById('course-teacher-email');
    const replacementSelect = document.getElementById('conflict-replacement-select');

    replacementSelect.innerHTML = '<option value="" disabled selected>Selecciona un profesor...</option>';

    // Clonar opciones excepto la del profesor en conflicto
    Array.from(originalSelect.options).forEach(opt => {
        if (opt.value && opt.value !== pendingCourseData.titular_email) {
            const newOpt = document.createElement('option');
            newOpt.value = opt.value;
            newOpt.text = opt.text;
            replacementSelect.appendChild(newOpt);
        }
    });
}

// 4. Volver al Paso 1
window.backToConflictStep1 = () => {
    document.getElementById('conflict-step-2').classList.add('hidden');
    document.getElementById('conflict-step-1').classList.remove('hidden');
}

// 5. CONFIRMAR INTERCAMBIO (Transacción Atómica)
window.confirmTeacherSwap = async () => {
    const replacementEmail = document.getElementById('conflict-replacement-select').value;

    if (!replacementEmail) {
        alert("Debes seleccionar un profesor reemplazo para el curso anterior.");
        return;
    }

    const btn = document.querySelector('#conflict-step-2 button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Procesando cambios...';
    btn.disabled = true;

    try {
        // Ejecutamos todo como una transacción para asegurar consistencia
        await runTransaction(db, async (transaction) => {
            const newCourseRef = doc(db, "cursos_globales", pendingCourseData.id);
            const oldCourseRef = doc(db, "cursos_globales", conflictDataCache.id);

            // 1. Actualizar (o crear) el Nuevo Curso con el titular deseado
            transaction.set(newCourseRef, pendingCourseData, { merge: true });

            // 2. Actualizar el Viejo Curso con el titular de reemplazo
            transaction.update(oldCourseRef, { titular_email: replacementEmail });
        });

        // Éxito
        if (window.showToast) window.showToast("Intercambio de profesores realizado con éxito", "success");
        else alert("Intercambio realizado exitosamente.");

        // Limpieza
        closeConflictModal();
        toggleModal('modal-create-course');
        document.getElementById('form-create-course').reset();

        // Recargar Dashboard
        loadDashboard(true, auth.currentUser.email);

    } catch (error) {
        console.error("Error en transacción:", error);
        alert("Error al realizar el intercambio: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Función auxiliar para guardar normal (sin conflicto)
async function saveCourseDirectly(id, data) {
    await setDoc(doc(db, "cursos_globales", id), data, { merge: true });
}

// --- RESTO DEL CÓDIGO ORIGINAL DEL DASHBOARD ---

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

        snapshot.forEach(docSnap => {
            const course = docSnap.data();
            course.id = docSnap.id;

            // Filtro: Mostrar si es Admin o es el Titular
            const isTitular = (course.titular_email === userEmail);

            if (isAdmin || isTitular) {
                allCoursesCache.push(course);

                // A. Renderizar Tarjeta
                const card = document.createElement('a');
                card.href = `calificaciones.html?curso=${course.id}`;
                card.className = "group bg-surface-dark border border-surface-border p-5 rounded-2xl hover:border-primary/50 transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between h-40";

                const initial = course.nombre ? course.nombre.charAt(0).toUpperCase() : 'C';
                const subjectCount = (course.materias || []).length;
                const studentCount = (course.estudiantes || []).length;

                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="h-10 w-10 rounded-lg bg-surface-border flex items-center justify-center text-lg font-bold text-white group-hover:bg-primary group-hover:text-background-dark transition-colors">
                            ${initial}
                        </div>
                        <span class="material-symbols-outlined text-text-secondary group-hover:text-primary">arrow_outward</span>
                    </div>
                    <div>
                        <h4 class="text-lg font-bold text-white leading-tight mb-1 group-hover:text-primary transition-colors">${course.nombre}</h4>
                        <p class="text-xs text-text-secondary">${subjectCount} Materias • ${studentCount} Estudiantes</p>
                    </div>
                `;
                listContainer.appendChild(card);

                // B. Llenar Select de Tarea Rápida
                if (courseSelect) {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = course.nombre;
                    courseSelect.appendChild(option);
                }
            }
        });

        if (allCoursesCache.length === 0) {
            listContainer.innerHTML = '<p class="text-text-secondary col-span-full text-center py-10 bg-surface-dark rounded-xl border border-surface-border">No tienes cursos asignados.</p>';
        }

    } catch (error) {
        console.error("Error cargando dashboard:", error);
        listContainer.innerHTML = '<p class="text-danger">Error al cargar datos.</p>';
    }
}

// --- LÓGICA DE TAREA RÁPIDA ---
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

        if (selectedCourse && selectedCourse.materias && selectedCourse.materias.length > 0) {
            selectedCourse.materias.forEach(materia => {
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
            if (window.showToast) window.showToast("Este curso no tiene materias registradas.", "error");
        }
    });

    if (subjectSelect) {
        subjectSelect.addEventListener('change', () => {
            if (subjectSelect.value) detailsContainer.classList.remove('hidden');
        });
    }

    if (quickForm) {
        quickForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const courseId = courseSelect.value;
            const subject = subjectSelect.value;
            const name = document.getElementById('quick-task-name').value.trim();
            const valueInput = document.getElementById('quick-task-value');
            const period = document.getElementById('quick-task-period').value;

            // --- CORRECCIÓN: Validación numérica ---
            const value = parseFloat(valueInput.value);

            if (!courseId || !subject || !name || isNaN(value)) return;

            // 1. Validar que la nota individual no sea mayor a 100
            if (value > 100) {
                alert("El valor de la actividad no puede ser mayor al 100%.");
                return;
            }

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

                    // --- VALIDACIÓN DE SUMA ---
                    const actividadesDelPeriodo = actividades[subject].filter(act => (act.periodo || 'p1') === period);
                    let sumaActual = 0;
                    actividadesDelPeriodo.forEach(act => {
                        sumaActual += (parseFloat(act.valor) || 0);
                    });

                    const sumaTotal = sumaActual + value;
                    if (sumaTotal > 100) {
                        alert(`Error: La suma del periodo excedería el 100%.\n\nActual: ${sumaActual}%\nNueva: ${value}%\nTotal: ${sumaTotal}%`);
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        return;
                    }

                    actividades[subject].push({
                        nombre: name,
                        valor: value,
                        periodo: period
                    });

                    await updateDoc(courseRef, { actividades: actividades });

                    if (window.showToast) window.showToast("Tarea creada exitosamente", "success");
                    else alert("Tarea creada");

                    document.getElementById('quick-task-name').value = '';
                    document.getElementById('quick-task-value').value = '';
                }
            } catch (error) {
                console.error(error);
                alert("Error al crear tarea: " + error.message);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
}