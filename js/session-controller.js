import { auth, db, doc, getDoc, collection, getDocs, query } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar estado de autenticación
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Usuario autenticado en SessionController:", user.email);
            await checkProfessorSession(user);
        }
    });
});

async function checkProfessorSession(user) {
    // 1. VERIFICAR MEMORIA (REACTIVADO)
    // Si ya elegiste curso, detenemos la función aquí para no molestarte.
    if (sessionStorage.getItem('curso_actual_id')) {
        console.log("Sesión ya activa:", sessionStorage.getItem('curso_actual_nombre'));
        // Actualizar UI si es necesario (opcional)
        updateHeaderWithCourse();
        return; 
    }

    try {
        console.log("Iniciando búsqueda de cursos para:", user.email);

        // 2. Obtener datos del usuario
        const userDocRef = doc(db, "usuarios", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            console.error("No se encontró perfil de usuario en Firestore.");
            return;
        }

        const userData = userDoc.data();
        
        // Permitir profesor y titular
        if (userData.rol !== 'profesor' && userData.rol !== 'titular') {
            return;
        }

        const userEmail = user.email.trim().toLowerCase();
        
        // 3. Buscar cursos disponibles
        const cursosRef = collection(db, "cursos_globales");
        const snapshot = await getDocs(cursosRef);
        
        const cursosDisponibles = [];

        snapshot.forEach(docCurso => {
            const data = docCurso.data();
            let esMiCurso = false;
            let materiaEnEsteCurso = "Colaborador"; 

            // A. Verificamos si es titular del curso (Normalizamos email)
            const titularEmail = (data.titular_email || "").trim().toLowerCase();
            if (titularEmail === userEmail) {
                esMiCurso = true;
                materiaEnEsteCurso = "Titular (Encargado)";
            }

            // B. Verificamos si da clases de alguna materia
            if (data.profesores_materias && typeof data.profesores_materias === 'object') {
                for (const [materiaName, profEmailRaw] of Object.entries(data.profesores_materias)) {
                    const profEmail = String(profEmailRaw).trim().toLowerCase();
                    
                    if (profEmail === userEmail) {
                        esMiCurso = true;
                        // Priorizamos mostrar si es Titular, si no, mostramos la materia
                        if (materiaEnEsteCurso !== "Titular (Encargado)") {
                            materiaEnEsteCurso = materiaName;
                        }
                    }
                }
            }

            if (esMiCurso) {
                cursosDisponibles.push({
                    id: docCurso.id,
                    nombre: data.nombre,
                    materia: materiaEnEsteCurso 
                });
            }
        });

        // 4. Mostrar modal solo si no ha seleccionado y tiene cursos
        if (cursosDisponibles.length > 0) {
            showCourseSelectionModal(cursosDisponibles, userData.nombre);
        } else {
            console.warn("Este docente no tiene cursos asignados.");
        }

    } catch (error) {
        console.error("Error en session-controller:", error);
    }
}

function showCourseSelectionModal(cursos, nombreProfesor) {
    if(document.getElementById('modal-session-course')) return;

    const modalHTML = `
    <div id="modal-session-course" class="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
        <div class="bg-surface-dark border border-surface-border rounded-2xl shadow-2xl max-w-lg w-full relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-blue-400 to-primary"></div>
            
            <div class="p-8">
                <div class="flex items-center gap-4 mb-6">
                    <div class="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/20">
                        <span class="material-symbols-outlined text-2xl">school</span>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white">¡Hola, ${nombreProfesor ? nombreProfesor.split(' ')[0] : 'Docente'}!</h2>
                        <p class="text-sm text-text-secondary">Selecciona dónde trabajarás ahora:</p>
                    </div>
                </div>

                <div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                    ${cursos.map(c => `
                        <button onclick="selectSessionCourse('${c.id}', '${c.nombre}', '${c.materia}')" 
                            class="w-full group flex items-center justify-between p-4 rounded-xl bg-background-dark border border-surface-border hover:border-primary/50 hover:bg-surface-border/50 transition-all duration-200 text-left">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-text-secondary group-hover:text-primary transition-colors">meeting_room</span>
                                <div>
                                    <span class="block font-bold text-white text-lg">${c.nombre}</span>
                                    <span class="block text-xs text-text-secondary">${c.materia}</span>
                                </div>
                            </div>
                            <span class="material-symbols-outlined text-surface-border group-hover:text-primary transition-colors group-hover:translate-x-1">arrow_forward_ios</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <div class="bg-surface-border/30 p-4 text-center border-t border-surface-border/50">
                <p class="text-[10px] text-text-secondary uppercase tracking-widest">EduSys Session Manager</p>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    window.selectSessionCourse = (id, nombre, materia) => {
        // 1. Guardar en memoria
        sessionStorage.setItem('curso_actual_id', id);
        sessionStorage.setItem('curso_actual_nombre', nombre);
        sessionStorage.setItem('materia_actual', materia);

        // 2. Ocultar Modal visualmente
        const modalElement = document.getElementById('modal-session-course');
        if(modalElement) {
            modalElement.classList.add('opacity-0', 'scale-95');
            
            // 3. Esperar un momento y recargar
            setTimeout(() => {
                modalElement.remove();
                window.location.reload(); // Al recargar, entrará en el 'if' inicial y no mostrará el modal
            }, 300);
        }
    };
}

// Función auxiliar para mostrar qué curso está activo (Visual)
function updateHeaderWithCourse() {
    const badge = document.getElementById('active-course-badge');
    const nameEl = document.getElementById('active-course-name');
    const courseName = sessionStorage.getItem('curso_actual_nombre');
    
    if (badge && nameEl && courseName) {
        nameEl.innerText = courseName;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
        
        // Añadir funcionalidad de "Cambiar curso" al badge
        badge.style.cursor = 'pointer';
        badge.onclick = () => {
            if(confirm("¿Cambiar de curso de trabajo?")) {
                sessionStorage.removeItem('curso_actual_id');
                window.location.reload();
            }
        };
        badge.title = "Clic para cambiar de curso";
    }
}