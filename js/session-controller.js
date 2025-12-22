import { auth, db, doc, getDoc, collection, getDocs } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("Usuario autenticado en SessionController:", user.email);
            await checkProfessorSession(user);
        }
    });
});

async function checkProfessorSession(user) {
    // 1. Si ya tiene curso seleccionado en sessionStorage → no molestar
    if (sessionStorage.getItem('curso_actual_id')) {
        console.log("Sesión ya activa:", sessionStorage.getItem('curso_actual_nombre'));
        updateHeaderWithCourse();
        return;
    }

    // 2. Determinar rol del usuario (misma lógica que en otros archivos)
    let rol = 'profesor'; // por defecto

    if (user.email === 'admin@mail.com') {
        rol = 'admin';
    } else {
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            if (userDoc.exists()) {
                rol = userDoc.data().rol || 'profesor';
            } else {
                console.warn("Usuario sin documento en /usuarios, asumiendo rol básico.");
            }
        } catch (error) {
            console.error("Error leyendo documento de usuario:", error);
        }
    }

    // 3. SOLUCIÓN CLAVE: Solo profesores y titulares usan este selector de curso
    // Admin y secretaria NO necesitan seleccionar un "curso de trabajo"
    if (rol === 'admin' || rol === 'secretaria') {
        console.log(`Usuario con rol ${rol} no requiere selección de curso.`);
        return;
    }

    // Si no es profesor/titular, pero por algún motivo tiene rol extraño → salir
    if (rol !== 'profesor' && rol !== 'titular') {
        console.log("Rol no docente detectado, omitiendo selector de curso.");
        return;
    }

    try {
        const userEmail = user.email.trim().toLowerCase();
        const userNombre = user.displayName || (await getDoc(doc(db, "usuarios", user.uid))).data()?.nombre || 'Docente';

        // 4. Buscar cursos donde participe
        const snapshot = await getDocs(collection(db, "cursos_globales"));
        const cursosDisponibles = [];

        snapshot.forEach(docCurso => {
            const data = docCurso.data();
            let esMiCurso = false;
            let materiaEnEsteCurso = "Colaborador";

            const titularEmail = (data.titular_email || "").trim().toLowerCase();
            if (titularEmail === userEmail) {
                esMiCurso = true;
                materiaEnEsteCurso = "Titular (Encargado)";
            }

            if (data.profesores_materias && typeof data.profesores_materias === 'object') {
                for (const [materiaName, profEmailRaw] of Object.entries(data.profesores_materias)) {
                    const profEmail = String(profEmailRaw).trim().toLowerCase();
                    if (profEmail === userEmail) {
                        esMiCurso = true;
                        if (materiaEnEsteCurso !== "Titular (Encargado)") {
                            materiaEnEsteCurso = materiaName;
                        }
                    }
                }
            }

            if (esMiCurso) {
                cursosDisponibles.push({
                    id: docCurso.id,
                    nombre: data.nombre || "Curso sin nombre",
                    materia: materiaEnEsteCurso
                });
            }
        });

        // 5. Mostrar modal solo si tiene cursos asignados
        if (cursosDisponibles.length > 0) {
            showCourseSelectionModal(cursosDisponibles, userNombre);
        } else {
            console.info("Docente sin cursos asignados actualmente.");
        }

    } catch (error) {
        console.error("Error en session-controller:", error);
    }
}

function showCourseSelectionModal(cursos, nombreProfesor) {
    if (document.getElementById('modal-session-course')) return;

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
                        <h2 class="text-xl font-bold text-white">¡Hola, ${nombreProfesor.split(' ')[0]}!</h2>
                        <p class="text-sm text-text-secondary">Selecciona el curso en el que trabajarás ahora:</p>
                    </div>
                </div>

                <div class="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                    ${cursos.map(c => `
                        <button onclick="selectSessionCourse('${c.id}', '${c.nombre.escapeHTML() || ''}', '${c.materia.escapeHTML() || ''}')" 
                            class="w-full group flex items-center justify-between p-4 rounded-xl bg-background-dark border border-surface-border hover:border-primary/50 hover:bg-surface-border/50 transition-all duration-200 text-left">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-text-secondary group-hover:text-primary transition-colors">meeting_room</span>
                                <div>
                                    <span class="block font-bold text-white text-lg truncate max-w-[260px]">${c.nombre.escapeHTML() || 'Sin nombre'}</span>
                                    <span class="block text-xs text-text-secondary">${c.materia.escapeHTML() || ''}</span>
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

    // Seguridad básica contra XSS (opcional pero recomendado)
    String.prototype.escapeHTML = function() {
        return this.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    window.selectSessionCourse = (id, nombre, materia) => {
        sessionStorage.setItem('curso_actual_id', id);
        sessionStorage.setItem('curso_actual_nombre', nombre);
        sessionStorage.setItem('materia_actual', materia);

        const modalElement = document.getElementById('modal-session-course');
        if (modalElement) {
            modalElement.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                modalElement.remove();
                window.location.reload();
            }, 300);
        }
    };
}

function updateHeaderWithCourse() {
    const badge = document.getElementById('active-course-badge');
    const nameEl = document.getElementById('active-course-name');
    const courseName = sessionStorage.getItem('curso_actual_nombre');
    
    if (badge && nameEl && courseName) {
        nameEl.innerText = courseName;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
        badge.style.cursor = 'pointer';
        badge.title = "Clic para cambiar de curso";
        badge.onclick = () => {
            if (confirm("¿Cambiar de curso de trabajo? Se recargará la página.")) {
                sessionStorage.removeItem('curso_actual_id');
                sessionStorage.removeItem('curso_actual_nombre');
                sessionStorage.removeItem('materia_actual');
                window.location.reload();
            }
        };
    }
}