import { db, collection, getDocs, doc, getDoc, deleteDoc, updateDoc, setDoc, arrayUnion, arrayRemove, query, orderBy, onSnapshot } from './firebase-config.js';

const grid = document.getElementById('courses-grid');
let isAdminUser = false;
let currentCourseIdForSubjects = null; 

window.addEventListener('userReady', (e) => {
    const { role } = e.detail;
    isAdminUser = (role === 'admin');
    loadCourses(isAdminUser);
    
    // Cargar catálogo global si es admin
    if(isAdminUser) {
        loadGlobalCatalog();
        // Llenar selectores de profesores en los modales
        loadTeachersIntoSelects();
    }
});

// --- CARGAR CURSOS ---
async function loadCourses(isAdmin) {
    if (!grid) return;
    grid.innerHTML = '<div class="col-span-full flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>';

    try {
        const q = query(collection(db, "cursos_globales")); 
        const querySnapshot = await getDocs(q);
        grid.innerHTML = '';

        if (querySnapshot.empty) {
            grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center p-10 bg-surface-dark rounded-2xl border border-surface-border text-center opacity-70">
                    <span class="material-symbols-outlined text-4xl text-surface-border mb-2">library_books</span>
                    <p class="text-text-secondary">No hay cursos registrados.</p>
                </div>`;
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const course = docSnap.data();
            const courseId = docSnap.id;
            const materias = course.materias || [];
            
            // Imagen de fondo aleatoria o fija
            const bgImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuBKlz27CPdY5AUeYAH0R7A2Yrl2WzbhGdLaBUGg3p_xUikEJVl26Mk9zA091rWSG50VbCFg78jdEL0vL1ecxCTiWwxqJGg400D11mOOULbqiQUGt6-7E-pMaXlCsearuXwFT2QaFHlIrHC2xrm2WP4G1XJSmcQ6ZosWkQ9XchVCDFoQkBQXHkXTcWzUqgtMphMVvYiqLIe_es6_NGzsl1F3BA3JIsChgbT7ejE4QbA1C-iuQCESqaro8OWeO80wPZaJqEDZA0X_wJhI";

            const card = document.createElement('div');
            card.className = "group flex flex-col overflow-hidden rounded-2xl bg-surface-dark border border-surface-border transition-all hover:border-primary/50 shadow-lg hover:shadow-xl h-full";
            
            // Sección Superior (Imagen y Título)
            let cardContent = `
                <a href="calificaciones.html?curso=${courseId}" class="block relative h-32 w-full bg-cover bg-center" style='background-image: url("${bgImage}");'>
                    <div class="absolute inset-0 bg-gradient-to-t from-surface-dark to-transparent"></div>
                    <div class="absolute left-4 bottom-4">
                        <h3 class="text-xl font-bold text-white group-hover:text-primary transition-colors leading-tight drop-shadow-md">${course.nombre}</h3>
                        <p class="text-xs text-white/80 font-mono tracking-wide mt-0.5 drop-shadow-md">${course.id.toUpperCase()}</p>
                    </div>
                </a>
                
                <div class="flex-1 p-5 flex flex-col gap-4">
                    <div class="flex items-center gap-2 text-xs text-text-secondary">
                        <span class="material-symbols-outlined text-sm">person</span>
                        <span class="truncate">${course.titular_email || "Sin Titular"}</span>
                    </div>

                    <div class="flex flex-wrap gap-1.5">
                        ${materias.length > 0 
                            ? `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-surface-border text-white border border-surface-border/50">${materias.length} Asignaturas</span>` 
                            : `<span class="px-2 py-1 rounded-md text-[10px] font-bold bg-surface-border/20 text-text-secondary border border-surface-border/20 border-dashed">Sin plan</span>`
                        }
                        <span class="px-2 py-1 rounded-md text-[10px] font-bold bg-surface-border text-white border border-surface-border/50">${(course.estudiantes || []).length} Estudiantes</span>
                    </div>
                </div>
            `;

            // Sección Inferior (Botones de Acción VISIBLES)
            if (isAdmin) {
                cardContent += `
                    <div class="p-3 border-t border-surface-border bg-black/20 flex items-center gap-2 justify-between">
                        <button onclick="openSubjectsModal('${courseId}', '${course.nombre}')" class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-border/50 hover:bg-surface-border text-white text-xs font-bold transition-colors">
                            <span class="material-symbols-outlined text-sm">view_list</span> Materias
                        </button>
                        <button onclick="openEditModal('${courseId}')" class="flex items-center justify-center p-2 rounded-lg bg-surface-border/50 hover:bg-admin hover:text-background-dark text-admin transition-colors" title="Editar Info">
                            <span class="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button onclick="deleteCourse('${courseId}')" class="flex items-center justify-center p-2 rounded-lg bg-surface-border/50 hover:bg-danger hover:text-white text-danger transition-colors" title="Eliminar Curso">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                `;
            } else {
                 cardContent += `
                    <div class="p-3 border-t border-surface-border bg-black/20 text-center">
                        <a href="calificaciones.html?curso=${courseId}" class="block w-full py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-background-dark text-xs font-bold transition-colors">
                            Ver Calificaciones
                        </a>
                    </div>
                 `;
            }

            card.innerHTML = cardContent;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error("Error al cargar cursos:", error);
    }
}

// --- GESTIÓN DE CATÁLOGO GLOBAL ---

async function loadGlobalCatalog() {
    const list = document.getElementById('global-catalog-list');
    const select = document.getElementById('select-global-subject'); // El select del modal de curso
    
    if(!list) return;

    try {
        const q = query(collection(db, "asignaturas_catalogo"), orderBy("nombre"));
        onSnapshot(q, (snapshot) => {
            list.innerHTML = '';
            if(select) select.innerHTML = '<option value="" disabled selected>Selecciona asignatura...</option>';
            
            if (snapshot.empty) {
                list.innerHTML = '<p class="text-xs text-text-secondary italic text-center p-4">Catálogo vacío.</p>';
                return;
            }

            snapshot.forEach(docSnap => {
                const item = docSnap.data();
                
                // 1. Renderizar en la lista de gestión del catálogo
                const div = document.createElement('div');
                div.className = "flex justify-between items-center p-2 bg-surface-dark border border-surface-border rounded-lg group hover:border-primary/50";
                div.innerHTML = `
                    <span class="text-sm text-white font-medium pl-2">${item.nombre}</span>
                    <button onclick="deleteGlobalSubject('${docSnap.id}')" class="text-text-secondary hover:text-danger p-1 rounded transition opacity-0 group-hover:opacity-100">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                `;
                list.appendChild(div);

                // 2. Llenar el Select del modal de curso
                if(select) {
                    const option = document.createElement('option');
                    option.value = item.nombre;
                    option.textContent = item.nombre;
                    select.appendChild(option);
                }
            });
        });
    } catch (e) {
        console.error("Error cargando catálogo:", e);
    }
}

window.addGlobalSubject = async () => {
    const input = document.getElementById('new-global-subject-name');
    const name = input.value.trim();
    if(!name) return;

    try {
        // Usar el nombre como ID para evitar duplicados fácilmente
        await setDoc(doc(db, "asignaturas_catalogo", name.toLowerCase().replace(/\s+/g, '_')), {
            nombre: name
        });
        input.value = '';
        if(window.showToast) window.showToast("Asignatura agregada al catálogo", "success");
    } catch(e) {
        console.error(e);
        alert("Error al crear asignatura.");
    }
}

window.deleteGlobalSubject = async (id) => {
    if(!confirm("¿Eliminar del catálogo global? Esto no afectará a los cursos que ya la tengan.")) return;
    try {
        await deleteDoc(doc(db, "asignaturas_catalogo", id));
    } catch(e) { console.error(e); }
}

// --- GESTIÓN DE MATERIAS EN CURSO ---

window.openSubjectsModal = async (courseId, courseName) => {
    currentCourseIdForSubjects = courseId;
    const titleEl = document.getElementById('modal-course-title');
    if(titleEl) titleEl.innerHTML = `Curso: <span class="text-white font-bold">${courseName}</span>`;
    
    // Aseguramos que el select de docentes esté cargado
    loadTeachersIntoSelects(); 

    if(window.toggleModal) window.toggleModal('modal-manage-subjects');
    loadCourseSubjects(courseId);
}

async function loadCourseSubjects(courseId) {
    const list = document.getElementById('subjects-list');
    const countBadge = document.getElementById('subject-count');
    if(!list) return;
    
    list.innerHTML = '<div class="text-center p-4"><div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary inline-block"></div></div>';
    
    try {
        const docSnap = await getDoc(doc(db, "cursos_globales", courseId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            const materias = data.materias || []; 
            const profesores = data.profesores_materias || {}; 
            
            if(countBadge) countBadge.innerText = materias.length;
            list.innerHTML = '';
            
            if (materias.length === 0) {
                list.innerHTML = `<p class="text-center text-xs text-text-secondary py-4">Sin asignaturas.</p>`;
            } else {
                materias.forEach(materia => {
                    const teacherEmail = profesores[materia] || "Sin asignar";
                    const isAssigned = profesores[materia] ? true : false;

                    const item = document.createElement('div');
                    item.className = "flex items-center justify-between p-2.5 bg-surface-dark rounded-xl border border-surface-border mb-2";
                    item.innerHTML = `
                        <div>
                            <p class="text-white font-bold text-sm">${materia}</p>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="material-symbols-outlined text-[10px] text-text-secondary">person</span>
                                <span class="text-[10px] ${isAssigned ? 'text-primary' : 'text-text-secondary/50'}">${teacherEmail}</span>
                            </div>
                        </div>
                        <button onclick="removeSubjectFromCourse('${materia}')" class="text-text-secondary hover:text-danger p-1.5 transition-colors" title="Quitar">
                            <span class="material-symbols-outlined text-lg">close</span>
                        </button>
                    `;
                    list.appendChild(item);
                });
            }
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p class="text-danger text-xs">Error.</p>';
    }
}

window.addSubjectToCourse = async () => {
    const selectSubject = document.getElementById('select-global-subject');
    const selectTeacher = document.getElementById('new-subject-teacher');
    
    const subjectName = selectSubject.value;
    const teacherEmail = selectTeacher.value;
    
    if (!subjectName || !currentCourseIdForSubjects) {
        alert("Selecciona una asignatura del catálogo.");
        return;
    }
    
    try {
        const updateData = {
            materias: arrayUnion(subjectName)
        };
        if (teacherEmail) {
            updateData[`profesores_materias.${subjectName}`] = teacherEmail;
        }

        await updateDoc(doc(db, "cursos_globales", currentCourseIdForSubjects), updateData);
        
        await loadCourseSubjects(currentCourseIdForSubjects); 
        loadCourses(isAdminUser); // Actualizar tarjeta en grid
        
        if(window.showToast) window.showToast("Materia agregada al curso", "success");

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    }
}

window.removeSubjectFromCourse = async (materiaName) => {
    if(!confirm(`¿Quitar "${materiaName}" de este curso?`)) return;
    try {
        await updateDoc(doc(db, "cursos_globales", currentCourseIdForSubjects), {
            materias: arrayRemove(materiaName)
        });
        await loadCourseSubjects(currentCourseIdForSubjects);
        loadCourses(isAdminUser);
    } catch (e) { console.error(e); }
}

// --- AUXILIARES ---

async function loadTeachersIntoSelects() {
    // Cargar en el select de "Crear Curso" y en "Gestionar Materias"
    const selects = [
        document.getElementById('course-teacher-email'),
        document.getElementById('new-subject-teacher')
    ];

    try {
        const usersSnap = await getDocs(collection(db, "usuarios"));
        const optionsHTML = [];
        optionsHTML.push('<option value="" selected>Sin asignar</option>');

        usersSnap.forEach(doc => {
            const user = doc.data();
            // Filtrar solo profesores/titulares si se desea, o todos
            if (user.email !== 'admin@mail.com') {
                optionsHTML.push(`<option value="${user.email}">${user.nombre || user.email}</option>`);
            }
        });

        selects.forEach(sel => {
            if(sel) sel.innerHTML = optionsHTML.join('');
        });
    } catch (e) { console.error("Error cargando profesores", e); }
}

// --- EDICIÓN Y ELIMINACIÓN DE CURSOS ---

window.openEditModal = async (courseId) => {
    if(window.toggleModal) window.toggleModal('modal-create-course');
    const form = document.getElementById('form-create-course');
    form.reset();
    
    // Cargar docentes antes de setear valor
    await loadTeachersIntoSelects();

    try {
        const docSnap = await getDoc(doc(db, "cursos_globales", courseId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('course-name').value = data.nombre || '';
            const idInput = document.getElementById('course-id');
            idInput.value = data.id || '';
            idInput.disabled = true;
            idInput.classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('course-teacher-email').value = data.titular_email || '';
        }
    } catch(e) { console.error(e); }
}

window.deleteCourse = async (courseId) => {
    if (!confirm(`PELIGRO: ¿Eliminar curso "${courseId}" y todos sus datos?`)) return;
    try {
        await deleteDoc(doc(db, "cursos_globales", courseId));
        if(window.showToast) window.showToast("Curso eliminado", "success");
        loadCourses(isAdminUser);
    } catch (error) { console.error(error); alert("Error: " + error.message); }
}