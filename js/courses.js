import { db, auth, onAuthStateChanged, collection, query, where, getDocs, getDoc, doc, collectionGroup } from './firebase-config.js';

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
        coursesGrid.innerHTML = `<p class="text-danger p-4">Error cargando cursos: ${error.message}</p>`;
    }
}

async function loadCourses(user) {
    // 1. Obtener datos del usuario para ver su rol
    const userDoc = await getDoc(doc(db, "usuarios", user.uid));
    const userData = userDoc.data();
    const rol = userData?.rol || 'profesor';

    let coursesList = [];

    // LÓGICA DE FILTRADO
    if (rol === 'admin' || rol === 'secretaria') {
        // A) Admin/Secretaria: Ven TODOS los cursos
        const q = query(collection(db, "cursos"));
        const snapshot = await getDocs(q);
        coursesList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        // B) Profesor/Titular: Ven solo sus cursos
        // Esto requiere dos comprobaciones:
        // 1. ¿Es titular del curso?
        // 2. ¿Da alguna materia dentro del curso?

        const myCourseIds = new Set();

        // 1. Buscar donde soy TITULAR (campo titularUid en el documento del curso)
        const titularQuery = query(collection(db, "cursos"), where("titularUid", "==", user.uid));
        const titularSnap = await getDocs(titularQuery);
        titularSnap.forEach(doc => myCourseIds.add(doc.id));

        // 2. Buscar donde soy PROFESOR DE MATERIA (subcolección 'materias')
        // Usamos collectionGroup para buscar en todas las colecciones 'materias' de la BD
        const materiasQuery = query(collectionGroup(db, "materias"), where("profesorUid", "==", user.uid));
        const materiasSnap = await getDocs(materiasQuery);
        
        materiasSnap.forEach(doc => {
            // El padre del documento materia es la colección 'materias', 
            // y el padre de esa colección es el documento 'curso'.
            // Ref: curso/ID_CURSO/materias/ID_MATERIA
            const courseDocRef = doc.ref.parent.parent;
            if (courseDocRef) {
                myCourseIds.add(courseDocRef.id);
            }
        });

        // 3. Si no tengo cursos, terminamos
        if (myCourseIds.size === 0) {
            renderCourses([]);
            return;
        }

        // 4. Traer los datos de los cursos identificados
        // Firestore no permite hacer un "where id IN [...]" con más de 10 IDs fácilmente,
        // así que para asegurar que funciona siempre, traemos los cursos y filtramos localmente 
        // o hacemos promesas individuales. Para eficiencia en listas largas, mejor 'in' por lotes.
        // Aquí usaremos Promise.all para traer los documentos por ID.
        
        const promises = Array.from(myCourseIds).map(courseId => getDoc(doc(db, "cursos", courseId)));
        const courseDocs = await Promise.all(promises);
        
        coursesList = courseDocs
            .filter(d => d.exists())
            .map(d => ({ id: d.id, ...d.data() }));
    }

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
            // Navegar al detalle del curso (puedes ajustar la URL)
            window.location.href = `curso-detalle.html?id=${course.id}`;
        };

        // Asignamos datos por defecto si faltan
        const title = course.nombre || "Curso sin nombre";
        const code = course.codigo || course.id;
        const teacher = course.titularNombre || "Sin titular asignado";
        const studentsCount = course.estudiantesCount || 0;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-xl bg-background-dark border border-surface-border text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                    <span class="material-symbols-outlined text-2xl">book_2</span>
                </div>
                <!-- Menú de opciones (solo visual por ahora) -->
                <button class="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>
            
            <div class="mb-4 flex-1">
                <h3 class="text-xl font-bold text-white mb-1 group-hover:text-primary transition-colors">${title}</h3>
                <p class="text-sm text-text-secondary font-mono bg-background-dark inline-block px-2 py-0.5 rounded border border-surface-border/50">${code}</p>
            </div>

            <div class="space-y-3 pt-4 border-t border-surface-border/50">
                <div class="flex items-center gap-2 text-sm text-text-secondary">
                    <span class="material-symbols-outlined text-lg">person</span>
                    <span class="truncate">${teacher}</span>
                </div>
                <div class="flex items-center gap-2 text-sm text-text-secondary">
                    <span class="material-symbols-outlined text-lg">groups</span>
                    <span>${studentsCount} Estudiantes</span>
                </div>
            </div>
        `;
        coursesGrid.appendChild(card);
    });
}