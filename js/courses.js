import { db, auth, onAuthStateChanged, collection, query, getDocs, getDoc, doc } from './firebase-config.js';

const coursesGrid = document.getElementById('courses-grid');

// Función principal para inicializar la carga de cursos
async function initCourses() {
    const user = auth.currentUser;
    if (!user) {
        // Si no hay usuario, limpiamos la grilla por seguridad
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
        await loadCourses(user);
    } catch (error) {
        console.error("Error al cargar cursos:", error);
        if (coursesGrid) {
            coursesGrid.innerHTML = `<p class="text-danger p-4">Error cargando cursos: ${error.message}</p>`;
        }
    }
}

// Escuchar cambios en la autenticación
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Siempre intentar cargar cursos cuando hay usuario autenticado
        initCourses();
    } else {
        // Usuario cerró sesión
        if (coursesGrid) {
            coursesGrid.innerHTML = '';
        }
    }
});

// También escuchar el evento personalizado 'appReady' (por si llega después)
window.addEventListener('appReady', () => {
    initCourses();
});

async function loadCourses(user) {
    let rol = 'profesor';

    // Super admin hardcoded
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

    // Obtener todos los cursos globales
    const q = query(collection(db, "cursos_globales"));
    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
        const course = docSnap.data();
        course.id = docSnap.id;

        if (rol === 'admin' || rol === 'secretaria') {
            // Admin y secretaria ven TODOS los cursos
            coursesList.push(course);
        } else {
            // Profesores: solo si son titular o imparten alguna materia
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

        // Determinar rol visible en la tarjeta
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