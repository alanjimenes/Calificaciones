import { auth, db, setDoc, doc, getDoc, getDocs, collection, query, updateDoc } from './firebase-config.js';

let allCoursesCache = []; // Caché local

// --- CORRECCIÓN CRÍTICA: Escuchar evento INMEDIATAMENTE ---
// Se movió este listener fuera de 'DOMContentLoaded' para evitar perder el evento
// si main.js lo dispara muy rápido.
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

    // --- Lógica Crear/Editar Curso (Solo Admin) ---
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
            
            try {
                await setDoc(doc(db, "cursos_globales", idCurso), {
                    nombre: nombreCurso,
                    id: idCurso,
                    titular_email: emailDocente,
                    creado_por: auth.currentUser.email,
                    creado_fecha: new Date()
                }, { merge: true });

                alert(`Curso "${nombreCurso}" guardado.`);
                toggleModal('modal-create-course');
                formCurso.reset();
                // Recargar dashboard manualmente
                loadDashboard(true, auth.currentUser.email);
            } catch (error) {
                console.error(error);
                alert("Error al guardar curso: " + error.message);
            }
        });
    }
});

async function loadDashboard(isAdmin, userEmail) {
    const listContainer = document.getElementById('dashboard-courses-list');
    const courseSelect = document.getElementById('quick-task-course');
    
    if (!listContainer) return; 

    try {
        const q = query(collection(db, "cursos_globales"));
        const snapshot = await getDocs(q);
        
        allCoursesCache = [];
        listContainer.innerHTML = '';
        if(courseSelect) courseSelect.innerHTML = '<option value="" disabled selected>Selecciona un curso...</option>';

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
                if(courseSelect) {
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
            if(statusMsg) statusMsg.classList.add('hidden');
        } else {
            subjectContainer.classList.add('hidden');
            detailsContainer.classList.add('hidden');
            if(window.showToast) window.showToast("Este curso no tiene materias registradas.", "error");
        }
    });

    if(subjectSelect) {
        subjectSelect.addEventListener('change', () => {
            if(subjectSelect.value) detailsContainer.classList.remove('hidden');
        });
    }

    if(quickForm) {
        quickForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const courseId = courseSelect.value;
            const subject = subjectSelect.value;
            const name = document.getElementById('quick-task-name').value.trim();
            const value = document.getElementById('quick-task-value').value;
            const period = document.getElementById('quick-task-period').value;

            if(!courseId || !subject || !name || !value) return;

            const btn = quickForm.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...';
            btn.disabled = true;

            try {
                const courseRef = doc(db, "cursos_globales", courseId);
                const courseDoc = await getDoc(courseRef);
                
                if(courseDoc.exists()) {
                    const data = courseDoc.data();
                    let actividades = data.actividades || {};
                    
                    if (!actividades[subject]) actividades[subject] = [];
                    
                    actividades[subject].push({
                        nombre: name,
                        valor: parseFloat(value),
                        periodo: period
                    });

                    await updateDoc(courseRef, { actividades: actividades });
                    
                    if(window.showToast) window.showToast("Tarea creada exitosamente", "success");
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