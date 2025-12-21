// js/boletin.js - Generador de Boletines Oficiales (MINERD Style)
import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10"
};

// Áreas Oficiales
const AREAS_CURRICULARES = [
    'Lengua Española',
    'Lenguas Extranjeras (Inglés)',
    'Lenguas Extranjeras (Francés)',
    'Matemática',
    'Ciencias Sociales',
    'Ciencias de la Naturaleza',
    'Educación Artística',
    'Educación Física',
    'Formación Integral Humana y Religiosa'
];

const COMPETENCIAS = ['c1', 'c2', 'c3', 'c4'];

let allCourses = [];
let selectedCourseData = null;
let selectedStudentData = null;

// Esperar a que el usuario esté listo
window.addEventListener('userReady', async (e) => {
    const { role, email } = e.detail;
    const body = document.getElementById('main-body');
    if (body) body.classList.remove('opacity-0');

    // Verificar contenedor de notificaciones
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 9999;";
        document.body.appendChild(container);
    }

    await loadCourses(role === 'admin' || role === 'secretaria', email);
});

// Cargar cursos disponibles
async function loadCourses(isAdminOrSecretaria, userEmail) {
    const selectCourse = document.getElementById('select-course');
    const selectStudent = document.getElementById('select-student');

    try {
        const q = query(collection(db, "cursos_globales"));
        const snapshot = await getDocs(q);

        selectCourse.innerHTML = '<option value="">Selecciona un curso...</option>';
        allCourses = [];

        snapshot.forEach(docSnap => {
            const course = docSnap.data();
            course.id = docSnap.id;
            const isTitular = (course.titular_email === userEmail);

            if (isAdminOrSecretaria || isTitular) {
                allCourses.push(course);
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = course.nombre;
                selectCourse.appendChild(option);
            }
        });

        selectCourse.addEventListener('change', async (e) => {
            const courseId = e.target.value;
            if (courseId) {
                selectedCourseData = allCourses.find(c => c.id === courseId);
                if (window.showToast) window.showToast("Cargando estudiantes...", "info");
                await loadStudents(courseId);
            } else {
                selectedCourseData = null;
                selectedStudentData = null;
                selectStudent.innerHTML = '<option value="">Primero elige un curso</option>';
                selectStudent.disabled = true;
            }
        });

    } catch (error) {
        console.error("Error cargando cursos:", error);
    }
}

// Cargar estudiantes del curso
async function loadStudents(courseId) {
    const selectStudent = document.getElementById('select-student');

    selectStudent.disabled = false;
    selectStudent.innerHTML = '<option value="">Selecciona un estudiante...</option>';

    if (!selectedCourseData || !selectedCourseData.estudiantes) {
        selectStudent.innerHTML = '<option value="">Sin estudiantes registrados</option>';
        return;
    }

    const sortedStudents = [...selectedCourseData.estudiantes].sort((a, b) => {
        const ordenA = parseInt(a.numero_orden) || 999;
        const ordenB = parseInt(b.numero_orden) || 999;
        return ordenA - ordenB;
    });

    sortedStudents.forEach((student) => {
        const option = document.createElement('option');
        option.value = student.id;
        const prefix = student.numero_orden ? `#${student.numero_orden}. ` : '';
        option.textContent = `${prefix}${student.nombre}`;
        selectStudent.appendChild(option);
    });

    selectStudent.onchange = (e) => {
        const studentId = e.target.value;
        if (studentId !== "") {
            selectedStudentData = selectedCourseData.estudiantes.find(s => s.id === studentId);
        } else {
            selectedStudentData = null;
        }
    };
}

// Función Principal de Generación
window.generateBoletin = function () {
    if (!selectedCourseData || !selectedStudentData) {
        alert("Selecciona curso y estudiante.");
        return;
    }

    const yearFrom = document.getElementById('year-from').value || '2024';
    const yearTo = document.getElementById('year-to').value || '2025';
    
    // Obtener Nivel Seleccionado
    const nivelRadio = document.querySelector('input[name="nivel-boletin"]:checked');
    const nivel = nivelRadio ? nivelRadio.value : 'primaria';

    if (window.showToast) window.showToast(`Generando boletín de ${nivel}...`, "info");

    let boletinHTML = "";
    if (nivel === 'primaria') {
        boletinHTML = createBoletinPrimariaHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    } else {
        boletinHTML = createBoletinSecundariaHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    }

    const container = document.getElementById('boletin-preview');
    container.style.opacity = '0.5';
    setTimeout(() => {
        container.innerHTML = boletinHTML;
        container.style.opacity = '1';
    }, 400);
}

// --- LOGOS ---
const logoEscudo = "https://upload.wikimedia.org/wikipedia/commons/2/26/Coat_of_arms_of_the_Dominican_Republic.svg";
const logoMinerd = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png/240px-Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png";

// ==========================================
// PLANTILLA 1: PRIMARIA (Estilo Informe de Aprendizaje)
// ==========================================
function createBoletinPrimariaHTML(course, student, yearFrom, yearTo) {
    const asistencia = calculateAttendancePercent(course, student);
    const materias = getMateriasRows(course, student, 'primaria');

    return `
    <div style="background:white; color:black; width: 100%; font-family: 'Times New Roman', serif; box-sizing: border-box;">
        
        <!-- HOJA 1: PORTADA -->
        <div style="width: 279mm; height: 215mm; padding: 10mm 15mm; position: relative; page-break-after: always;">
            
            <!-- Encabezado con Logos -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <img src="${logoEscudo}" style="height: 80px; width: auto;">
                <div style="text-align: center; flex: 1; padding-top: 5px;">
                    <h1 style="font-size: 14px; font-weight: bold; margin: 0; line-height: 1.2;">GOBIERNO DE LA</h1>
                    <h1 style="font-size: 16px; font-weight: bold; margin: 0; line-height: 1.2;">REPÚBLICA DOMINICANA</h1>
                    <h2 style="font-size: 18px; font-weight: bold; margin: 5px 0; color: #000;">EDUCACIÓN</h2>
                    <p style="font-size: 11px; margin: 0;">Viceministerio de Servicios Técnicos y Pedagógicos</p>
                    <p style="font-size: 11px; margin: 0;">Dirección General de Educación Primaria</p>
                </div>
                <img src="${logoMinerd}" style="height: 80px; width: auto;">
            </div>

            <!-- Título del Documento -->
            <div style="text-align: center; border-top: 2px solid black; border-bottom: 2px solid black; padding: 10px; margin: 20px 0;">
                <h2 style="font-size: 24px; font-weight: bold; margin: 0; letter-spacing: 1px;">INFORME DE APRENDIZAJE</h2>
                <h3 style="font-size: 16px; font-weight: bold; margin: 5px 0;">NIVEL PRIMARIO</h3>
            </div>

            <!-- Datos del Estudiante (Grid) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 12px; margin-top: 20px;">
                <!-- Columna Izquierda -->
                <div>
                    <p style="margin: 5px 0;"><strong>Año Escolar:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${yearFrom} - ${yearTo}</span></p>
                    <p style="margin: 5px 0;"><strong>Centro Educativo:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${SCHOOL_INFO.nombre}</span></p>
                    <p style="margin: 5px 0;"><strong>Código:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${SCHOOL_INFO.codigo}</span></p>
                    <p style="margin: 5px 0;"><strong>Grado:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${course.nombre}</span></p>
                    <p style="margin: 5px 0;"><strong>Tanda:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${SCHOOL_INFO.tanda}</span></p>
                </div>
                <!-- Columna Derecha -->
                <div>
                    <p style="margin: 5px 0;"><strong>Estudiante:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${student.nombre.toUpperCase()}</span></p>
                    <p style="margin: 5px 0;"><strong>ID (SIGERD):</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${student.id}</span></p>
                    <p style="margin: 5px 0;"><strong>No. Orden:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${student.numero_orden || '-'}</span></p>
                    <p style="margin: 5px 0;"><strong>RNE:</strong> <span style="border-bottom: 1px solid #999; padding: 0 5px;">${student.rne || '-'}</span></p>
                </div>
            </div>

            <!-- Caja de Observaciones -->
            <div style="margin-top: 40px; border: 1px solid black; height: 200px; position: relative;">
                <div style="position: absolute; top: 0; left: 0; right: 0; background: #eee; border-bottom: 1px solid black; text-align: center; padding: 5px; font-weight: bold; font-size: 12px;">
                    OBSERVACIONES
                </div>
                <div style="padding: 30px 10px 10px 10px; font-size: 12px;">
                    ${student.observacion || "Sin observaciones registradas."}
                </div>
            </div>

            <!-- Firmas -->
            <div style="position: absolute; bottom: 20mm; left: 15mm; right: 15mm; display: flex; justify-content: space-around;">
                <div style="text-align: center;">
                    <div style="width: 200px; border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                    <p style="font-size: 11px; margin: 0;">Maestro(a) Encargado(a)</p>
                </div>
                <div style="text-align: center;">
                    <div style="width: 200px; border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                    <p style="font-size: 11px; margin: 0;">Director(a) del Centro</p>
                </div>
            </div>
        </div>

        <!-- HOJA 2: CALIFICACIONES -->
        <div style="width: 279mm; height: 215mm; padding: 10mm 15mm; position: relative; page-break-inside: avoid;">
            
            <div style="text-align: center; margin-bottom: 15px;">
                <h3 style="font-size: 14px; font-weight: bold; text-transform: uppercase;">Informe de Rendimiento Académico</h3>
                <p style="font-size: 12px;">Estudiante: <strong>${student.nombre}</strong></p>
            </div>

            <!-- Tabla de Calificaciones -->
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; border: 2px solid black;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th rowspan="2" style="border: 1px solid black; width: 30%; text-align: left; padding-left: 10px;">ÁREAS CURRICULARES</th>
                        <th colspan="4" style="border: 1px solid black;">CALIFICACIONES POR PERÍODO</th>
                        <th rowspan="2" style="border: 1px solid black; width: 12%; background-color: #e0e0e0;">CALIFICACIÓN<br>FINAL</th>
                        <th rowspan="2" style="border: 1px solid black; width: 15%;">SITUACIÓN</th>
                    </tr>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid black; width: 10%;">P1<br><span style="font-size: 9px; font-weight: normal;">Ago-Oct</span></th>
                        <th style="border: 1px solid black; width: 10%;">P2<br><span style="font-size: 9px; font-weight: normal;">Nov-Ene</span></th>
                        <th style="border: 1px solid black; width: 10%;">P3<br><span style="font-size: 9px; font-weight: normal;">Feb-Mar</span></th>
                        <th style="border: 1px solid black; width: 10%;">P4<br><span style="font-size: 9px; font-weight: normal;">Abr-Jun</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${materias}
                </tbody>
            </table>

            <!-- Pie de Página: Leyenda y Asistencia -->
            <div style="margin-top: 30px; display: flex; gap: 20px;">
                <!-- Leyenda -->
                <div style="flex: 1; border: 1px solid black; padding: 0;">
                    <div style="background: #eee; border-bottom: 1px solid black; text-align: center; font-weight: bold; font-size: 11px; padding: 3px;">LEYENDA DE CALIFICACIONES</div>
                    <table style="width: 100%; font-size: 10px; border-collapse: collapse;">
                        <tr><td style="padding: 2px 5px; border-bottom: 1px solid #ccc;"><strong>A (90-100)</strong>: Logro Destacado</td></tr>
                        <tr><td style="padding: 2px 5px; border-bottom: 1px solid #ccc;"><strong>B (80-89)</strong>: Logro Satisfactorio</td></tr>
                        <tr><td style="padding: 2px 5px; border-bottom: 1px solid #ccc;"><strong>C (70-79)</strong>: Logro en Proceso</td></tr>
                        <tr><td style="padding: 2px 5px;"><strong>D (0-69)</strong>: Logro Insuficiente</td></tr>
                    </table>
                </div>

                <!-- Asistencia -->
                <div style="flex: 1; border: 1px solid black; padding: 0;">
                    <div style="background: #eee; border-bottom: 1px solid black; text-align: center; font-weight: bold; font-size: 11px; padding: 3px;">RESUMEN DE ASISTENCIA</div>
                    <div style="padding: 10px; text-align: center; font-size: 12px;">
                        <p style="margin: 5px 0;">Porcentaje Anual de Asistencia:</p>
                        <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">${asistencia}%</p>
                        <p style="margin: 0; font-size: 10px; color: ${asistencia >= 80 ? 'green' : 'red'};">${asistencia >= 80 ? 'CUMPLE CON EL REQUISITO' : 'NO CUMPLE REQUISITO DE ASISTENCIA'}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ==========================================
// PLANTILLA 2: SECUNDARIA (Estilo Boletín Complejo)
// ==========================================
function createBoletinSecundariaHTML(course, student, yearFrom, yearTo) {
    const asistencia = calculateAttendancePercent(course, student);
    const materiasRows = getMateriasRows(course, student, 'secundaria');

    return `
    <div style="background:white; color:black; width: 100%; font-family: 'Arial', sans-serif; box-sizing: border-box;">
        
        <!-- HOJA 1: PORTADA SECUNDARIA -->
        <div style="width: 279mm; height: 215mm; padding: 10mm 15mm; position: relative; page-break-after: always;">
            
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double black; padding-bottom: 15px; margin-bottom: 15px;">
                    <img src="${logoEscudo}" style="height: 70px;">
                    <div>
                        <h1 style="font-size: 16px; font-weight: bold; margin: 0;">REPÚBLICA DOMINICANA</h1>
                        <h2 style="font-size: 18px; font-weight: bold; margin: 5px 0;">MINISTERIO DE EDUCACIÓN</h2>
                        <p style="font-size: 11px; margin: 0;">Viceministerio de Servicios Técnicos y Pedagógicos</p>
                        <p style="font-size: 11px; margin: 0;">Dirección General de Educación Secundaria</p>
                    </div>
                    <img src="${logoMinerd}" style="height: 70px;">
                </div>
                
                <h1 style="font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0;">Boletín de Calificaciones</h1>
                <h2 style="font-size: 14px; font-weight: bold;">NIVEL SECUNDARIO - MODALIDAD ACADÉMICA</h2>
            </div>

            <!-- Datos Generales -->
            <div style="border: 1px solid black; padding: 15px; margin-bottom: 20px; font-size: 12px;">
                <table style="width: 100%; border: none;">
                    <tr>
                        <td style="padding: 5px;"><strong>CENTRO EDUCATIVO:</strong> ${SCHOOL_INFO.nombre}</td>
                        <td style="padding: 5px;"><strong>CÓDIGO:</strong> ${SCHOOL_INFO.codigo}</td>
                        <td style="padding: 5px;"><strong>AÑO ESCOLAR:</strong> ${yearFrom}-${yearTo}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px;"><strong>ESTUDIANTE:</strong> ${student.nombre.toUpperCase()}</td>
                        <td style="padding: 5px;"><strong>ID SIGERD:</strong> ${student.id}</td>
                        <td style="padding: 5px;"><strong>GRADO:</strong> ${course.nombre}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px;"><strong>RNE:</strong> ${student.rne || '-'}</td>
                        <td style="padding: 5px;"><strong>TANDA:</strong> ${SCHOOL_INFO.tanda}</td>
                        <td style="padding: 5px;"><strong>SECCIÓN:</strong> U</td>
                    </tr>
                </table>
            </div>

            <!-- Estado Final Resumido -->
            <div style="display: flex; justify-content: space-between; gap: 20px; margin-top: 40px;">
                <div style="border: 1px solid black; width: 48%; padding: 10px;">
                    <h3 style="text-align: center; border-bottom: 1px solid black; margin: 0 0 10px 0; padding-bottom: 5px; font-size: 12px; font-weight: bold;">ESTADO ACADÉMICO</h3>
                    <p style="font-size: 12px; margin: 5px 0;"><strong>Asignaturas Aprobadas:</strong> --</p>
                    <p style="font-size: 12px; margin: 5px 0;"><strong>Asignaturas Pendientes:</strong> ${getAsignaturasReprobadas(course, student)}</p>
                    <p style="font-size: 14px; margin: 10px 0; text-align: center; font-weight: bold;">
                        ${getAsignaturasReprobadas(course, student) > 2 ? 'REPITENTE' : (getAsignaturasReprobadas(course, student) > 0 ? 'APLAZADO' : 'PROMOVIDO')}
                    </p>
                </div>
                
                <div style="border: 1px solid black; width: 48%; padding: 10px;">
                    <h3 style="text-align: center; border-bottom: 1px solid black; margin: 0 0 10px 0; padding-bottom: 5px; font-size: 12px; font-weight: bold;">ASISTENCIA</h3>
                    <div style="text-align: center;">
                        <span style="font-size: 28px; font-weight: bold;">${asistencia}%</span>
                    </div>
                </div>
            </div>

            <!-- Firmas -->
            <div style="position: absolute; bottom: 20mm; width: 100%; display: flex; justify-content: space-between; padding: 0 20px; box-sizing: border-box;">
                <div style="text-align: center; width: 40%;">
                    <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                    <p style="font-size: 11px; margin: 0;">Director(a) del Centro</p>
                </div>
                <div style="text-align: center; width: 40%;">
                    <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                    <p style="font-size: 11px; margin: 0;">Coordinador(a) Docente</p>
                </div>
            </div>
        </div>

        <!-- HOJA 2: TABLA COMPLEJA SECUNDARIA -->
        <div style="width: 279mm; height: 215mm; padding: 10mm 10mm; position: relative; page-break-inside: avoid;">
            <h3 style="text-align: center; font-size: 12px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">Registro de Calificaciones y Rendimiento</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center; border: 1px solid black;">
                <thead>
                    <!-- Fila 1 Encabezados -->
                    <tr style="background-color: #333; color: white;">
                        <th rowspan="2" style="border: 1px solid #999; width: 20%; padding: 5px;">ASIGNATURAS</th>
                        <th colspan="4" style="border: 1px solid #999;">CALIFICACIONES POR PERÍODO</th>
                        <th rowspan="2" style="border: 1px solid #999; width: 6%; background-color: #555;">C.F.</th>
                        <th colspan="3" style="border: 1px solid #999;">CALIFICACIÓN COMPLETIVA</th>
                        <th colspan="3" style="border: 1px solid #999;">CALIFICACIÓN EXTRAORDINARIA</th>
                        <th colspan="2" style="border: 1px solid #999;">SITUACIÓN</th>
                    </tr>
                    <!-- Fila 2 Encabezados -->
                    <tr style="background-color: #eee; color: black; font-weight: bold;">
                        <!-- Periodos -->
                        <th style="border: 1px solid #999; width: 5%;">P1</th>
                        <th style="border: 1px solid #999; width: 5%;">P2</th>
                        <th style="border: 1px solid #999; width: 5%;">P3</th>
                        <th style="border: 1px solid #999; width: 5%;">P4</th>
                        
                        <!-- Completiva -->
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px;">50%<br>C.P.C.</th>
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px;">50%<br>P.E.</th>
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px; background: #ddd;">C.C.</th>
                        
                        <!-- Extraordinaria -->
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px;">30%<br>C.P.C.</th>
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px;">70%<br>P.E.</th>
                        <th style="border: 1px solid #999; width: 5%; font-size: 8px; background: #ddd;">C.E.</th>
                        
                        <!-- Situación -->
                        <th style="border: 1px solid #999; width: 4%;">A</th>
                        <th style="border: 1px solid #999; width: 4%;">R</th>
                    </tr>
                </thead>
                <tbody>
                    ${materiasRows}
                </tbody>
            </table>
            
            <div style="margin-top: 10px; font-size: 9px; color: #555; border-top: 1px dotted #ccc; padding-top: 5px;">
                <strong>Leyenda:</strong> C.F. = Calificación Final | C.P.C. = Calificación Promedio Competencias | P.E. = Prueba Escrita | C.C. = Calificación Completiva | C.E. = Calificación Extraordinaria | A = Aprobado | R = Reprobado
            </div>
        </div>
    </div>`;
}

// --- UTILIDADES DE CÁLCULO ---

function getMateriasRows(course, student, tipo) {
    let rows = '';
    // Unir materias oficiales con las del curso, eliminando duplicados
    const todasMaterias = [...new Set([...AREAS_CURRICULARES, ...(course.materias || [])])];

    todasMaterias.forEach(materia => {
        const p1 = getPeriodDetails(course, student, materia, 'p1');
        const p2 = getPeriodDetails(course, student, materia, 'p2');
        const p3 = getPeriodDetails(course, student, materia, 'p3');
        const p4 = getPeriodDetails(course, student, materia, 'p4');

        const periodos = [p1, p2, p3, p4];
        const periodosConData = periodos.filter(p => p.hasData);
        
        let cf = null;
        if (periodosConData.length > 0) {
            const suma = periodosConData.reduce((acc, curr) => acc + curr.promedio, 0);
            cf = Math.round(suma / periodosConData.length);
        }

        const f = (val) => (val !== null && val !== undefined && !isNaN(val)) ? val : '-';
        const stBold = "font-weight: bold;";
        
        if (tipo === 'primaria') {
            rows += `
            <tr>
                <td style="text-align: left; padding: 5px 10px; border: 1px solid black;">${materia}</td>
                <td style="border: 1px solid black;">${f(p1.promedio)}</td>
                <td style="border: 1px solid black;">${f(p2.promedio)}</td>
                <td style="border: 1px solid black;">${f(p3.promedio)}</td>
                <td style="border: 1px solid black;">${f(p4.promedio)}</td>
                <td style="border: 1px solid black; background-color: #e0e0e0; ${stBold}">${f(cf)}</td>
                <td style="border: 1px solid black; font-size: 9px; font-weight: bold;">
                    ${cf ? (cf >= 70 ? 'PROMOVIDO' : 'REPROBADO') : '-'}
                </td>
            </tr>`;
        } else {
            // Secundaria (Filas complejas)
            const aprobado = cf && cf >= 70;
            const reprobado = cf && cf < 70;
            
            rows += `
            <tr style="height: 25px;">
                <td style="text-align: left; padding: 2px 8px; border: 1px solid #999; font-size: 10px;">${materia}</td>
                <!-- Periodos -->
                <td style="border: 1px solid #999;">${f(p1.promedio)}</td>
                <td style="border: 1px solid #999;">${f(p2.promedio)}</td>
                <td style="border: 1px solid #999;">${f(p3.promedio)}</td>
                <td style="border: 1px solid #999;">${f(p4.promedio)}</td>
                
                <!-- CF -->
                <td style="border: 1px solid #999; background-color: #ddd; font-weight: bold; color: ${reprobado ? 'red' : 'black'}">${f(cf)}</td>
                
                <!-- Completiva (Placeholders) -->
                <td style="border: 1px solid #999; color: #ccc;">-</td>
                <td style="border: 1px solid #999; color: #ccc;">-</td>
                <td style="border: 1px solid #999; background-color: #f9f9f9;">-</td>
                
                <!-- Extraordinaria (Placeholders) -->
                <td style="border: 1px solid #999; color: #ccc;">-</td>
                <td style="border: 1px solid #999; color: #ccc;">-</td>
                <td style="border: 1px solid #999; background-color: #f9f9f9;">-</td>
                
                <!-- Situación -->
                <td style="border: 1px solid #999; font-weight: bold;">${aprobado ? 'X' : ''}</td>
                <td style="border: 1px solid #999; font-weight: bold; color: red;">${reprobado ? 'X' : ''}</td>
            </tr>`;
        }
    });
    return rows;
}

function getPeriodDetails(course, student, subjectName, period) {
    const actividadesConfig = course.actividades || {};
    const actividadesMateria = actividadesConfig[subjectName] || [];
    const notasEstudiante = (student.notas && student.notas[subjectName]) ? student.notas[subjectName] : {};

    // Filtrar actividades del periodo
    const actsPeriodo = actividadesMateria.filter(act => (act.periodo || 'p1') === period);

    if (actsPeriodo.length === 0) {
        return { promedio: null, hasData: false };
    }

    // Calcular suma ponderada por competencia
    const comps = { 
        c1: { sum: 0, count: 0 }, 
        c2: { sum: 0, count: 0 }, 
        c3: { sum: 0, count: 0 }, 
        c4: { sum: 0, count: 0 } 
    };

    actsPeriodo.forEach(act => {
        const compId = act.competencia || 'c1';
        const val = parseFloat(notasEstudiante[act.nombre] || 0);
        const weight = parseFloat(act.valor || 0);
        
        // Asumiendo que el valor en la config es peso (ej: 30) y no decimal (0.3)
        // Si el peso es 0, se asume promedio simple, si > 0, promedio ponderado
        if (weight > 0) {
            comps[compId].sum += (val * weight) / 100; // Si el peso es 100 total
        } else {
            // Logica simple si no hay pesos definidos (fallback)
            comps[compId].sum += val;
            comps[compId].count++;
        }
    });

    let scoresList = [];
    COMPETENCIAS.forEach(k => {
        let val = Math.round(comps[k].sum);
        // Si usamos fallback de conteo simple
        if(comps[k].count > 0 && comps[k].sum > 100) val = Math.round(comps[k].sum / comps[k].count);
        scoresList.push(val);
    });

    // Promedio de las 4 competencias = Nota del Periodo
    const totalPeriodo = scoresList.reduce((a, b) => a + b, 0);
    const promedioPeriodo = Math.round(totalPeriodo / 4);

    return { promedio: promedioPeriodo, hasData: true };
}

function calculateAttendancePercent(course, student) {
    let p = 0, total = 0;
    const asistencia = student.asistencia || {};
    // Recorrer materias
    Object.values(asistencia).forEach(materiaAsist => {
        // Recorrer fechas
        Object.values(materiaAsist).forEach(status => {
            if (status === 'P') p++;
            total++;
        });
    });
    if (total === 0) return 100;
    return Math.round((p / total) * 100);
}

function getAsignaturasReprobadas(course, student) {
    let reprobadas = 0;
    const todasMaterias = [...new Set([...AREAS_CURRICULARES, ...(course.materias || [])])];
    
    todasMaterias.forEach(materia => {
        let periodosCount = 0;
        let suma = 0;
        ['p1','p2','p3','p4'].forEach(p => {
            const d = getPeriodDetails(course, student, materia, p);
            if(d.hasData) { suma += d.promedio; periodosCount++; }
        });
        if(periodosCount > 0) {
            const final = Math.round(suma/periodosCount);
            if(final < 70) reprobadas++;
        }
    });
    return reprobadas;
}