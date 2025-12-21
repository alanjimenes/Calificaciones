import { db, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, getDoc, appId } from './firebase-config.js';

let allStudentsCache = [];
let currentStudentContext = null; // Guardará el contexto: si viene de un array de curso o colección global

document.addEventListener('DOMContentLoaded', () => {
    loadStudents();

    // Filtro de búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allStudentsCache.filter(student => 
                (student.nombre || '').toLowerCase().includes(term) ||
                (student.matricula || '').toLowerCase().includes(term) ||
                (student.email || '').toLowerCase().includes(term) ||
                (student.cursoNombre || '').toLowerCase().includes(term)
            );
            renderStudentsTable(filtered);
        });
    }

    // Formulario Editar Estudiante
    const formEdit = document.getElementById('form-edit-student');
    if(formEdit) formEdit.addEventListener('submit', saveStudentChanges);
});

// --- CARGAR ESTUDIANTES (GLOBALES + ARRAYS DE CURSOS) ---
async function loadStudents() {
    const tableBody = document.getElementById('students-table-body');
    const countSpan = document.getElementById('student-count');
    if (!tableBody) return;

    try {
        allStudentsCache = [];

        // 1. Cargar estudiantes de la colección Global (Archivos sueltos/Legacy)
        // Intentamos leer de la raíz 'estudiantes' por si acaso hay datos antiguos ahí
        try {
            const globalRef = collection(db, 'estudiantes');
            const globalSnap = await getDocs(globalRef);
            
            globalSnap.forEach(doc => {
                allStudentsCache.push({ 
                    uniqueId: `global_${doc.id}`, 
                    realId: doc.id,
                    ...doc.data(),
                    cursoNombre: 'Directorio Global',
                    _context: { type: 'global_doc', path: `estudiantes/${doc.id}` }
                });
            });
        } catch (e) { console.warn("No se pudo cargar colección global raíz:", e); }

        // 2. Cargar estudiantes dentro de los Arrays de Cursos (Lo que usa gradebook.js)
        // CORRECCIÓN: Usamos la colección raíz 'cursos_globales' donde dashboard.js guarda los datos
        const coursesRef = collection(db, 'cursos_globales');
        const coursesSnap = await getDocs(coursesRef);

        coursesSnap.forEach(courseDoc => {
            const courseData = courseDoc.data();
            const studentsArray = courseData.estudiantes || []; // Leemos el ARRAY, no subcolección

            studentsArray.forEach(student => {
                // Usamos student.id (ID SIGERD) como realId
                allStudentsCache.push({
                    uniqueId: `course_${courseDoc.id}_${student.id}`,
                    realId: student.id,
                    // Mapeamos campos para que coincidan con la vista
                    nombre: student.nombre,
                    matricula: student.id, // ID SIGERD es la matrícula usualmente
                    rne: student.rne,
                    email: student.email || '',
                    telefono: student.telefono || '',
                    creado_fecha: student.fecha_creacion || new Date().toISOString(), // Fallback fecha
                    
                    // Datos completos para el modal
                    sexo: student.sexo,
                    fecha_nacimiento: student.fecha_nacimiento,
                    direccion: student.direccion,
                    padre_nombre: student.padre,
                    padre_telefono: student.telefono_padre,
                    madre_nombre: student.madre,
                    madre_telefono: student.telefono_madre,
                    tutor: student.tutor,
                    sangre: student.tipo_sangre,
                    alergias: student.alergias_medicas,
                    emergencia_nombre: student.emergencia_nombre,
                    emergencia_telefono: student.emergencia_telefono,
                    observaciones: student.observacion,

                    // Metadatos de origen
                    cursoNombre: courseData.nombre || 'Curso Sin Nombre',
                    _context: { 
                        type: 'course_array', 
                        courseId: courseDoc.id, 
                        coursePath: `cursos_globales/${courseDoc.id}`, // Ruta corregida a raíz
                        studentId: student.id 
                    }
                });
            });
        });

        // UI Vacía
        if (allStudentsCache.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-text-secondary">
                        <span class="material-symbols-outlined text-4xl mb-2 opacity-50">school</span>
                        <p>No se encontraron estudiantes.</p>
                    </td>
                </tr>`;
            if(countSpan) countSpan.innerText = "0";
            return;
        }

        // Ordenar alfabéticamente
        allStudentsCache.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        
        if(countSpan) countSpan.innerText = allStudentsCache.length;
        renderStudentsTable(allStudentsCache);

    } catch (error) {
        console.error("Error loading students:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-danger">Error al cargar datos. Verifica permisos.</td></tr>';
    }
}

// --- RENDERIZAR TABLA ---
function renderStudentsTable(students) {
    const tableBody = document.getElementById('students-table-body');
    tableBody.innerHTML = '';

    students.forEach(student => {
        const initials = student.nombre ? student.nombre.substring(0, 2).toUpperCase() : '??';
        // Formato de fecha seguro
        let date = 'N/A';
        try { if(student.creado_fecha) date = new Date(student.creado_fecha).toLocaleDateString(); } catch(e){}

        const originTag = student.cursoNombre !== 'Directorio Global' 
            ? `<span class="text-[10px] bg-surface-border px-1.5 py-0.5 rounded text-text-secondary ml-2 border border-surface-border/50">${student.cursoNombre}</span>` 
            : '<span class="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded ml-2 border border-blue-500/20">Global</span>';

        const row = document.createElement('tr');
        row.className = "border-b border-surface-border hover:bg-surface-border/20 transition-colors group";
        
        row.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                        ${initials}
                    </div>
                    <div>
                        <p class="font-bold text-white text-sm flex items-center flex-wrap gap-1">${student.nombre} ${originTag}</p>
                        <p class="text-xs text-text-secondary">${student.email || 'Sin correo'}</p>
                    </div>
                </div>
            </td>
            <td class="p-4 text-text-secondary font-mono text-xs">${student.matricula || student.realId}</td>
            <td class="p-4 text-text-secondary text-xs">
                ${student.telefono || '<span class="opacity-50">--</span>'}
            </td>
            <td class="p-4 text-text-secondary text-xs">${date}</td>
            <td class="p-4 text-right">
                <button onclick="openStudentDetails('${student.uniqueId}')" 
                    class="p-2 rounded-lg hover:bg-surface-dark text-text-secondary hover:text-primary transition-colors" title="Ver Detalles Completos">
                    <span class="material-symbols-outlined">visibility</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- VER DETALLES COMPLETOS ---
window.openStudentDetails = async (uniqueId) => {
    let student = allStudentsCache.find(s => s.uniqueId === uniqueId);
    if (!student) return;

    // Guardamos el contexto para saber cómo guardar/borrar
    currentStudentContext = student._context;
    document.getElementById('edit-doc-id').value = student.realId; // Solo referencia visual
    
    // Llenar TODOS los campos (Mapeo de nombres de campos)
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };

    // Básicos
    setVal('detail-name', student.nombre);
    setVal('detail-matricula', student.matricula);
    setVal('detail-rne', student.rne);
    setVal('detail-sexo', student.sexo || 'M');
    setVal('detail-nacimiento', student.fecha_nacimiento);
    setVal('detail-email', student.email);
    setVal('detail-phone', student.telefono);
    setVal('detail-address', student.direccion);

    // Familia
    setVal('detail-padre', student.padre_nombre);
    setVal('detail-telefono-padre', student.padre_telefono);
    setVal('detail-madre', student.madre_nombre);
    setVal('detail-telefono-madre', student.madre_telefono);
    setVal('detail-tutor', student.tutor);

    // Médica
    setVal('detail-sangre', student.sangre);
    setVal('detail-medica', student.alergias);
    setVal('detail-emergencia-nombre', student.emergencia_nombre);
    setVal('detail-emergencia-telefono', student.emergencia_telefono);

    // Obs
    setVal('detail-observations', student.observaciones);
    
    // Header Modal
    const initials = (student.nombre || '??').substring(0, 2).toUpperCase();
    document.getElementById('detail-initials').innerText = initials;
    document.getElementById('detail-id-display').innerText = `ID: ${student.matricula || '---'}`;

    cancelEditMode();
    window.toggleModal('modal-student-details');
}

// --- MODO EDICIÓN ---
window.enableEditMode = () => {
    const inputs = document.querySelectorAll('#form-edit-student input, #form-edit-student textarea, #form-edit-student select');
    inputs.forEach(input => input.disabled = false);
    document.getElementById('detail-name').focus();
    document.getElementById('btn-enable-edit').classList.add('hidden');
    document.getElementById('btn-delete-student').classList.add('hidden');
    document.getElementById('btn-save-changes').classList.remove('hidden');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-save-changes').classList.add('flex');
}

window.cancelEditMode = () => {
    const inputs = document.querySelectorAll('#form-edit-student input, #form-edit-student textarea, #form-edit-student select');
    inputs.forEach(input => input.disabled = true);
    document.getElementById('btn-enable-edit').classList.remove('hidden');
    document.getElementById('btn-delete-student').classList.remove('hidden');
    document.getElementById('btn-save-changes').classList.add('hidden');
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('btn-save-changes').classList.remove('flex');
}

// --- GUARDAR CAMBIOS (LÓGICA ADAPTADA) ---
async function saveStudentChanges(e) {
    e.preventDefault();
    if(!currentStudentContext) return;

    const btn = document.getElementById('btn-save-changes');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Guardando...';
    btn.disabled = true;

    // Recoger valores del formulario
    const getVal = (id) => document.getElementById(id).value.trim();
    
    const updates = {
        nombre: getVal('detail-name'),
        // La matrícula es el ID, a veces no se debe cambiar, pero aquí permitimos editar campos informativos
        rne: getVal('detail-rne'),
        sexo: document.getElementById('detail-sexo').value,
        fecha_nacimiento: getVal('detail-nacimiento'),
        email: getVal('detail-email'),
        telefono: getVal('detail-phone'),
        direccion: getVal('detail-address'),
        
        padre: getVal('detail-padre'), // Nota: gradebook usa 'padre', 'madre', etc.
        telefono_padre: getVal('detail-telefono-padre'),
        madre: getVal('detail-madre'),
        telefono_madre: getVal('detail-telefono-madre'),
        tutor: getVal('detail-tutor'),

        tipo_sangre: document.getElementById('detail-sangre').value,
        alergias_medicas: getVal('detail-medica'),
        emergencia_nombre: getVal('detail-emergencia-nombre'),
        emergencia_telefono: getVal('detail-emergencia-telefono'),
        observacion: getVal('detail-observations') // gradebook usa 'observacion'
    };

    try {
        if (currentStudentContext.type === 'course_array') {
            // LÓGICA ARRAY: Leer curso, buscar estudiante, actualizar objeto, guardar array
            const courseRef = doc(db, currentStudentContext.coursePath);
            const courseSnap = await getDoc(courseRef);
            
            if (courseSnap.exists()) {
                const courseData = courseSnap.data();
                let estudiantes = courseData.estudiantes || [];
                const index = estudiantes.findIndex(s => s.id === currentStudentContext.studentId);
                
                if (index !== -1) {
                    // Mezclamos datos existentes (notas, asistencia) con los nuevos
                    estudiantes[index] = { ...estudiantes[index], ...updates };
                    
                    // Si cambió el ID visual (matricula), ojo: gradebook usa ID como key. 
                    // Aquí updates no cambia el 'id' propiedad raíz, solo campos de info.
                    
                    await updateDoc(courseRef, { estudiantes: estudiantes });
                } else {
                    throw new Error("El estudiante ya no existe en el curso origen.");
                }
            }
        } else {
            // LÓGICA GLOBAL (LEGACY)
            const docRef = doc(db, currentStudentContext.path);
            // Mapeo inverso para legacy si es necesario, o guardar directo
            await updateDoc(docRef, {
                nombre: updates.nombre,
                matricula: updates.id || getVal('detail-matricula'),
                rne: updates.rne,
                email: updates.email,
                // ... resto de campos mapeados a estructura legacy si difiere
                observaciones: updates.observacion
            });
        }

        if(window.showToast) window.showToast("Perfil actualizado correctamente", "success");
        loadStudents(); 
        cancelEditMode();
        
        document.getElementById('detail-initials').innerText = updates.nombre.substring(0, 2).toUpperCase();

    } catch (error) {
        console.error(error);
        alert("Error al actualizar: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- ELIMINAR ESTUDIANTE ---
window.deleteStudentFromModal = async () => {
    if(!currentStudentContext) return;

    if(!confirm("¿ESTÁS SEGURO?\n\nEsta acción eliminará permanentemente al estudiante y todos sus datos (notas, asistencia).")) return;

    const btn = document.getElementById('btn-delete-student');
    btn.disabled = true;
    btn.innerHTML = 'Eliminando...';

    try {
        if (currentStudentContext.type === 'course_array') {
            // LÓGICA ARRAY: Filtrar y guardar
            const courseRef = doc(db, currentStudentContext.coursePath);
            const courseSnap = await getDoc(courseRef);
            
            if (courseSnap.exists()) {
                const courseData = courseSnap.data();
                const nuevosEstudiantes = (courseData.estudiantes || []).filter(s => s.id !== currentStudentContext.studentId);
                
                await updateDoc(courseRef, { estudiantes: nuevosEstudiantes });
            }
        } else {
            // LÓGICA GLOBAL
            await deleteDoc(doc(db, currentStudentContext.path));
        }
        
        if(window.showToast) window.showToast("Estudiante eliminado", "info");
        window.toggleModal('modal-student-details');
        loadStudents();

    } catch (error) {
        console.error(error);
        alert("Error al eliminar: " + error.message);
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined">delete</span> Eliminar';
    }
}

window.toggleModal = (modalID) => {
    const modal = document.getElementById(modalID);
    if (modal) {
        modal.classList.toggle('hidden');
        modal.classList.toggle('flex');
    }
}