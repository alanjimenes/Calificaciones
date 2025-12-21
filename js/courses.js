import { db, auth, onAuthStateChanged, collection, query, where, getDocs, getDoc, doc } from './firebase-config.js';

const coursesGrid = document.getElementById('courses-grid');

// Escuchar evento personalizado de que la app está lista (lanzado desde cursos.html)
window.addEventListener('appReady', () => {
    initCourses();
});

// Si el script carga después del evento (navegación directa), iniciamos si hay usuario
onAuthStateChanged(auth, (user) => {
    if (user && document.body.classList.contains('opacity-0') === false) {
        initCourses();
    }
});

async function initCourses() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await loadCourses(user);
    } catch (error) {
        console.error("Error al cargar cursos:", error);
        if (coursesGrid) coursesGrid.innerHTML = `<p class="text-danger p-4">Error cargando cursos: ${error.message}</p>`;
    }
}

async function loadCourses(user) {
    // 1. Obtener datos del usuario para ver su rol
    const userDoc = await getDoc(doc(db, "usuarios", user.uid));
    const userData = userDoc.data();
    const rol = userData?.rol || 'profesor';
    const userEmail = user.email;

    let coursesList = [];

    // Traemos la colección correcta: "cursos_globales"
    const q = query(collection(db, "cursos_globales"));
    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
        const course = docSnap.data();
        course.id = docSnap.id;

        if (rol === 'admin' || rol === 'secretaria') {
            // Admin y Secretaria ven todo
            coursesList.push(course);
        } else {
            // Profesores: Verificar si es Titular O si da alguna materia
            const isTitular = (course.titular_email === userEmail);
            let isTeacher = false;

            if (course.profesores_materias) {
                // Buscamos si su email aparece como valor en el mapa de profesores_materias
                isTeacher = Object.values(course.profesores_materias).some(email => email === userEmail);
            }

            if (isTitular || isTeacher) {
                coursesList.push(course);
            }
        }
    });

    renderCourses(coursesList);
}

function renderCourses(courses) {
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
            // Evitar click si se toca un botón de acción
            if(e.target.closest('button')) return;
            // Navegar al detalle del curso
            window.location.href = `calificaciones.html?curso=${course.id}`;
        };

        // Asignamos datos por defecto si faltan
        const title = course.nombre || "Curso sin nombre";
        const code = course.id; 
        const teacher = course.titular_email || "Sin titular";
        const studentsCount = (course.estudiantes || []).length;
        const subjectsCount = (course.materias || []).length;

        // Determinar rol en este curso para mostrar
        let myRole = "Docente";
        if (auth.currentUser && course.titular_email === auth.currentUser.email) myRole = "Titular";

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