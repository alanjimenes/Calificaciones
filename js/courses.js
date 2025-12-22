import { db, auth, onAuthStateChanged, collection, query, getDocs, getDoc, doc, orderBy } from './firebase-config.js';

const coursesGrid = document.getElementById('courses-grid');

// Función principal para inicializar la carga de cursos
async function initCourses() {
    const user = auth.currentUser;
    if (!user) {
        if (coursesGrid) {
            coursesGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary opacity-50">
                    <span class="material-symbols-outlined text-6xl mb-4">lock</span>
                    <p class="text-lg">Debes iniciar sesión para ver los cursos.</p>
                </div>
            `;
        }
        return;
    }

    try {
        // Cargar la lista de cursos
        await loadCourses(user);
        
        // CORRECCIÓN: Cargar la lista de profesores para los modales
        // Solo intentamos cargar si somos admin o secretaria (quienes gestionan cursos)
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        const rol = user.email === 'admin@mail.com' ? 'admin' : (userDoc.exists() ? userDoc.data().rol : 'profesor');
        
        if (rol === 'admin' || rol === 'secretaria') {
            await fillTeacherSelects();
        }

    } catch (error) {
        console.error("Error al cargar cursos:", error);
        if (coursesGrid) {
            coursesGrid.innerHTML = `<p class="text-danger p-4">Error cargando cursos: ${error.message}</p>`;
        }
    }
}

/**
 * Busca todos los usuarios con roles docentes y llena los selectores de los modales.
 */
async function fillTeacherSelects() {
    try {
        const usersRef = collection(db, "usuarios");
        // Traemos todos los usuarios para filtrar en memoria (más flexible)
        const snapshot = await getDocs(usersRef);
        
        const teachers = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const role = (data.rol || '').toLowerCase();
            // Incluimos admin, titular y profesor como candidatos a impartir clases
            if (['admin', 'titular', 'profesor'].includes(role)) {
                teachers.push({
                    email: data.email,
                    nombre: data.nombre || data.email,
                    rol: role
                });
            }
        });

        // Ordenar por nombre
        teachers.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // IDs de los selectores que necesitan la lista de profesores
        const selectIds = [
            'course-teacher-email',        // Modal crear curso
            'new-subject-teacher',         // Modal gestionar materias
            'conflict-replacement-select'  // Modal conflicto de titulares
        ];

        selectIds.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                let html = '<option value="" selected>Seleccionar docente...</option>';
                teachers.forEach(t => {
                    html += `<option value="${t.email}">${t.nombre} (${t.rol.toUpperCase()})</option>`;
                });
                select.innerHTML = html;
            }
        });

    } catch (error) {
        console.error("Error cargando lista de profesores para selects:", error);
    }
}

// Escuchar cambios en la autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        initCourses();
    } else {
        if (coursesGrid) {
            coursesGrid.innerHTML = '';
        }
    }
});

// También escuchar el evento personalizado 'appReady'
window.addEventListener('appReady', () => {
    initCourses();
});

async function loadCourses(user) {
    let rol = 'profesor';

    if (user.email === 'admin@mail.com') {
        rol = 'admin';
    } else {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            rol = userDoc.data().rol || 'profesor';
        }
    }

    const userEmail = user.email;
    let coursesList = [];

    const q = query(collection(db, "cursos_globales"));
    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
        const course = docSnap.data();
        course.id = docSnap.id;

        if (rol === 'admin' || rol === 'secretaria') {
            coursesList.push(course);
        } else {
            const isTitular = (course.titular_email === userEmail);
            let isTeacher = false;

            if (course.profesores_materias) {
                isTeacher = Object.values(course.profesores_materias).some(email => email === userEmail);
            }

            if (isTitular || isTeacher) {
                coursesList.push(course);
            }
        }
    });

    renderCourses(coursesList, userEmail, rol === 'admin');
}

function renderCourses(courses, currentUserEmail, isAdmin) {
    if (!coursesGrid) return;
    coursesGrid.innerHTML = '';

    if (courses.length === 0) {
        coursesGrid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary opacity-50">
                <span class="material-symbols-outlined text-6xl mb-4">school</span>
                <p class="text-lg">No tienes cursos asignados.</p>
            </div>
        `;
        return;
    }

    courses.forEach(course => {
        const card = document.createElement('div');
        card.className = "group relative bg-surface-dark border border-surface-border rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 cursor-pointer flex flex-col h-full";
        card.onclick = (e) => {
            if (e.target.closest('button')) return;
            window.location.href = `calificaciones.html?curso=${course.id}`;
        };

        const title = course.nombre || "Curso sin nombre";
        const code = course.id;
        const teacher = course.titular_email || "Sin titular";
        const studentsCount = (course.estudiantes || []).length;
        const subjectsCount = (course.materias || []).length;

        let myRole = "Docente";
        if (course.titular_email === currentUserEmail) myRole = "Titular";
        if (isAdmin) myRole = "Admin";

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-xl bg-background-dark border border-surface-border text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                    <span class="material-symbols-outlined text-2xl">book_2</span>
                </div>
                <span class="text-[10px] font-bold px-2 py-1 rounded bg-surface-border/50 text-text-secondary border border-surface-border">${myRole}</span>
            </div>
            
            <div class="mb-4 flex-1">
                <h3 class="text-xl font-bold text-white mb-1 group-hover:text-primary transition-colors truncate" title="${title}">${title}</h3>
                <p class="text-sm text-text-secondary font-mono bg-background-dark inline-block px-2 py-0.5 rounded border border-surface-border/50 text-xs">${code}</p>
            </div>

            <div class="space-y-2 pt-4 border-t border-surface-border/50">
                <div class="flex items-center gap-2 text-xs text-text-secondary" title="Titular: ${teacher}">
                    <span class="material-symbols-outlined text-sm">person</span>
                    <span class="truncate w-full">${teacher}</span>
                </div>
                <div class="flex items-center justify-between text-xs text-text-secondary">
                    <div class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">groups</span>
                        <span>${studentsCount} Est.</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">menu_book</span>
                        <span>${subjectsCount} Mat.</span>
                    </div>
                </div>
            </div>
        `;
        coursesGrid.appendChild(card);
    });
}