// Variables globales (declaradas pero no asignadas aún)
let tasksTableBody, taskModal, taskForm, modalTitle, searchInput, filterSubject, btnNovaTarea;
let taskIdInput, taskTitleInput, taskDescInput, taskSubjectSelect, taskDateInput;
let currentUserData = null;

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Asignar referencias al DOM AQUI, cuando el HTML ya cargó
    tasksTableBody = document.getElementById('tasksTableBody');
    taskModal = document.getElementById('taskModal');
    taskForm = document.getElementById('taskForm');
    modalTitle = document.getElementById('modalTitle');
    searchInput = document.getElementById('searchInput');
    filterSubject = document.getElementById('filterSubject');
    btnNovaTarea = document.getElementById('btnNovaTarea');

    taskIdInput = document.getElementById('taskId');
    taskTitleInput = document.getElementById('taskTitle');
    taskDescInput = document.getElementById('taskDesc');
    taskSubjectSelect = document.getElementById('taskSubject');
    taskDateInput = document.getElementById('taskDate');

    // 2. Verificar autenticación
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const userDoc = await db.collection('usuarios').doc(user.uid).get();
                if (userDoc.exists) {
                    currentUserData = userDoc.data();

                    // Normalizar rol a minúsculas para evitar errores (Profesor vs profesor)
                    if (currentUserData.rol) {
                        currentUserData.rol = currentUserData.rol.toLowerCase();
                    }

                    // Personalizar la vista según el rol
                    setupVistaPorRol();

                    // Cargar tareas (Filtro estricto desde BD)
                    cargarTareas();

                    // Cargar filtro solo si NO es profesor
                    if (currentUserData.rol !== 'profesor') {
                        cargarFiltroAsignaturas();
                    }
                } else {
                    console.error("No se encontró el perfil del usuario.");
                }
            } catch (error) {
                console.error("Error al obtener datos del usuario:", error);
            }
        } else {
            window.location.href = 'login.html';
        }
    });

    // Event Listeners
    if (btnNovaTarea) {
        btnNovaTarea.addEventListener('click', () => abrirModalTarea());
    }

    window.onclick = function (event) {
        if (event.target == taskModal) {
            cerrarModal();
        }
    }

    if (taskForm) taskForm.addEventListener('submit', guardarTarea);
    if (searchInput) searchInput.addEventListener('input', filtrarTareas);
    if (filterSubject) filterSubject.addEventListener('change', filtrarTareas);
});

// --- LÓGICA DE SEGURIDAD Y VISUALIZACIÓN ---

function setupVistaPorRol() {
    // Si es profesor, ocultamos agresivamente el menú de filtro
    if (currentUserData.rol === 'profesor') {
        console.log(`Configurando vista restringida para Profesor: ${currentUserData.asignatura}`);

        if (filterSubject) {
            // 1. Ocultar el select
            filterSubject.style.display = 'none';

            // 2. Intentar ocultar su etiqueta (Label)
            const filterLabel = document.querySelector('label[for="filterSubject"]');
            if (filterLabel) filterLabel.style.display = 'none';

            // 3. Intentar ocultar el contenedor padre si es exclusivo para el filtro 
            // (para que no quede un hueco en la interfaz)
            // Verificamos si el padre es pequeño (tipo col-md-3) para ocultarlo.
            const parent = filterSubject.parentElement;
            if (parent && parent.classList.contains('col-md-3') || parent.classList.contains('form-group')) {
                parent.style.display = 'none';
            }
        }
    }
}

// Función para abrir el modal
async function abrirModalTarea(id = null) {
    if (!taskForm) return;

    taskForm.reset();
    taskIdInput.value = '';
    modalTitle.textContent = 'Nueva Tarea';
    taskSubjectSelect.innerHTML = '';

    const modalLabel = document.querySelector('label[for="taskSubject"]');

    if (currentUserData && currentUserData.rol === 'profesor') {
        // --- MODO PROFESOR: Asignación automática ---
        const asignaturaAsignada = currentUserData.asignatura;

        if (asignaturaAsignada) {
            const option = document.createElement('option');
            option.value = asignaturaAsignada;
            option.textContent = asignaturaAsignada;
            option.selected = true;
            taskSubjectSelect.appendChild(option);

            // OCULTAR EL MENU (SELECT) y su ETIQUETA
            taskSubjectSelect.style.display = 'none';
            if (modalLabel) modalLabel.style.display = 'none';

            // Ocultar contenedor padre si es necesario para limpiar el modal
            if (taskSubjectSelect.parentElement && taskSubjectSelect.parentElement.classList.contains('form-group')) {
                taskSubjectSelect.parentElement.style.display = 'none';
            }

        } else {
            taskSubjectSelect.innerHTML = '<option value="">Error: Sin asignatura</option>';
            taskSubjectSelect.style.display = 'block';
        }

    } else {
        // --- MODO ADMIN ---
        // Asegurar visibilidad
        taskSubjectSelect.style.display = 'block';
        if (modalLabel) modalLabel.style.display = 'block';
        if (taskSubjectSelect.parentElement) taskSubjectSelect.parentElement.style.display = 'block';

        const optionDefault = document.createElement('option');
        optionDefault.value = "";
        optionDefault.textContent = "Seleccione una asignatura";
        taskSubjectSelect.appendChild(optionDefault);

        try {
            const querySnapshot = await db.collection('asignaturas').get();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const option = document.createElement('option');
                option.value = data.nombre;
                option.textContent = data.nombre;
                taskSubjectSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Error asignaturas:", error);
        }
    }

    // Edición
    if (id) {
        modalTitle.textContent = 'Editar Tarea';
        taskIdInput.value = id;
        try {
            const doc = await db.collection('tareas').doc(id).get();
            if (doc.exists) {
                const data = doc.data();
                taskTitleInput.value = data.titulo;
                taskDescInput.value = data.descripcion;
                taskDateInput.value = data.fechaEntrega;

                if (currentUserData.rol !== 'profesor') {
                    taskSubjectSelect.value = data.asignatura;
                }
            }
        } catch (error) {
            console.error("Error tarea:", error);
        }
    }

    taskModal.style.display = 'block';
}

function cerrarModal() {
    taskModal.style.display = 'none';
}

async function guardarTarea(e) {
    e.preventDefault();

    const id = taskIdInput.value;
    let titulo = taskTitleInput.value;
    let descripcion = taskDescInput.value;
    let asignatura = taskSubjectSelect.value;
    let fechaEntrega = taskDateInput.value;

    // SEGURIDAD FINAL: Forzar asignatura
    if (currentUserData.rol === 'profesor') {
        asignatura = currentUserData.asignatura;
    }

    if (!titulo || !asignatura || !fechaEntrega) {
        alert("Por favor completa los campos obligatorios.");
        return;
    }

    const tareaData = {
        titulo: titulo,
        descripcion: descripcion,
        asignatura: asignatura,
        fechaEntrega: fechaEntrega,
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: auth.currentUser.email,
        creadorId: auth.currentUser.uid
    };

    try {
        if (id) {
            await db.collection('tareas').doc(id).update(tareaData);
            alert('Tarea actualizada correctamente');
        } else {
            await db.collection('tareas').add(tareaData);
            alert('Tarea creada correctamente');
        }
        cerrarModal();
        cargarTareas();
    } catch (error) {
        console.error("Error guardar:", error);
        alert("Error al guardar la tarea.");
    }
}

async function cargarTareas() {
    tasksTableBody.innerHTML = '';

    try {
        let docs = [];

        // CONSULTA SEGURA
        if (currentUserData.rol === 'profesor') {
            const snapshot = await db.collection('tareas')
                .where('asignatura', '==', currentUserData.asignatura)
                .get();
            docs = snapshot.docs;
        } else {
            const snapshot = await db.collection('tareas').get();
            docs = snapshot.docs;
        }

        let tareas = docs.map(doc => ({ id: doc.id, ...doc.data() }));

        tareas.sort((a, b) => {
            const fechaA = a.fechaCreacion ? a.fechaCreacion.seconds : 0;
            const fechaB = b.fechaCreacion ? b.fechaCreacion.seconds : 0;
            return fechaB - fechaA;
        });

        tareas.forEach(data => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.titulo}</td>
                <td>${data.asignatura}</td>
                <td>${data.fechaEntrega}</td>
                <td>
                    <button class="btn-action btn-edit" onclick="abrirModalTarea('${data.id}')">Editar</button>
                    <button class="btn-action btn-delete" onclick="eliminarTarea('${data.id}')">Eliminar</button>
                </td>
            `;
            tasksTableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error cargar tareas:", error);
    }
}

async function eliminarTarea(id) {
    if (confirm('¿Estás seguro de eliminar esta tarea?')) {
        try {
            await db.collection('tareas').doc(id).delete();
            cargarTareas();
        } catch (error) {
            console.error("Error eliminar:", error);
        }
    }
}

async function cargarFiltroAsignaturas() {
    if (!filterSubject) return; // Seguridad extra
    filterSubject.innerHTML = '<option value="">Todas las asignaturas</option>';
    const snapshot = await db.collection('asignaturas').get();
    snapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.data().nombre;
        option.textContent = doc.data().nombre;
        filterSubject.appendChild(option);
    });
}

function filtrarTareas() {
    if (!searchInput || !filterSubject) return;

    const texto = searchInput.value.toLowerCase();
    const asignaturaFiltro = filterSubject.value;

    const filas = tasksTableBody.getElementsByTagName('tr');

    for (let fila of filas) {
        const titulo = fila.cells[0].textContent.toLowerCase();
        const asignatura = fila.cells[1].textContent;

        const cumpleTexto = titulo.includes(texto);
        const cumpleAsignatura = asignaturaFiltro === "" || asignatura === asignaturaFiltro;

        if (cumpleTexto && cumpleAsignatura) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    }
}

// Exponer funciones globales
window.abrirModalTarea = abrirModalTarea;
window.cerrarModal = cerrarModal;
window.eliminarTarea = eliminarTarea;