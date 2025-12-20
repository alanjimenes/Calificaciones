// boletin.js - Sistema de generación de boletines oficiales
import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
// Estos datos aparecerán en el encabezado oficial
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10"
};

let allCourses = [];
let selectedCourseData = null;
let selectedStudentData = null;

const AREAS_CURRICULARES = [
    'Lengua Española',
    'Lenguas Extranjeras (Inglés)',
    'Lenguas Extranjeras (Francés)',
    'Matemática',
    'Ciencias Sociales',
    'Ciencias de la Naturaleza',
    'Educación Artística',
    'Educación Física',
    'Formación Integral Humana y Religiosa',
    'Salidas Optativas / Tecnología'
];

// Esperar a que el usuario esté listo
window.addEventListener('userReady', async (e) => {
    const { role, email } = e.detail;
    const body = document.getElementById('main-body');
    if (body) body.classList.remove('opacity-0');

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
        if (window.showToast) window.showToast("Error al cargar cursos", "error");
    }
}

// Cargar estudiantes del curso
async function loadStudents(courseId) {
    const selectStudent = document.getElementById('select-student');

    selectStudent.disabled = false;
    selectStudent.innerHTML = '<option value="">Selecciona un estudiante...</option>';

    if (!selectedCourseData || !selectedCourseData.estudiantes) {
        selectStudent.innerHTML = '<option value="">Sin estudiantes registrados</option>';
        if (window.showToast) window.showToast("Este curso no tiene estudiantes", "warning");
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

// Generar el boletín
window.generateBoletin = function () {
    if (!selectedCourseData) {
        if (window.showToast) window.showToast("⚠️ Debes seleccionar un curso primero", "error");
        else alert("Selecciona un curso.");
        return;
    }

    if (!selectedStudentData) {
        if (window.showToast) window.showToast("⚠️ Debes seleccionar un estudiante", "error");
        else alert("Selecciona un estudiante.");
        return;
    }

    const yearFrom = document.getElementById('year-from').value || '2024';
    const yearTo = document.getElementById('year-to').value || '2025';

    if (window.showToast) window.showToast("Generando documento...", "info");

    const boletinHTML = createBoletinHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    const container = document.getElementById('boletin-preview');

    container.style.opacity = '0.5';
    setTimeout(() => {
        container.innerHTML = boletinHTML;
        container.style.opacity = '1';
        if (window.showToast) window.showToast("Boletín generado correctamente", "success");
    }, 400);
}

// --- FUNCIÓN DE RENDERIZADO DEL BOLETÍN (ENCABEZADO OFICIAL + TABLA COMPLETA) ---
function createBoletinHTML(course, student, yearFrom, yearTo) {
    const gradeSummary = calculateGradeSummary(course, student);
    const attendanceSummary = calculateAttendanceSummary(course, student);
    const fechaImpresion = new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Logos oficiales (URLs públicas)
    const logoEscudo = "https://upload.wikimedia.org/wikipedia/commons/2/26/Coat_of_arms_of_the_Dominican_Republic.svg";
    const logoMinerd = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png/240px-Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png";

    // Lista de Competencias Fundamentales
    const competenciasFundamentales = [
        "• Comunicativa",
        "• Pensamiento Lógico, Creativo y Crítico",
        "• Resolución de Problemas",
        "• Científica y Tecnológica",
        "• Ambiental y de la Salud",
        "• Ética y Ciudadana",
        "• Desarrollo Personal y Espiritual"
    ];

    return `
    <div style="width: 270mm; margin: 0 auto; background: white; padding: 15px; font-family: 'Times New Roman', Times, serif; color: black; box-sizing: border-box;">
        
        <!-- ENCABEZADO INSTITUCIONAL OFICIAL -->
        <table style="width: 100%; border-bottom: 2px solid #000; margin-bottom: 10px;">
            <tr>
                <td style="width: 10%; text-align: center; vertical-align: top; padding-bottom: 5px;">
                     <img src="${logoEscudo}" style="width: 60px; height: auto;">
                </td>
                <td style="width: 80%; text-align: center; vertical-align: top;">
                    <h2 style="margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase;">República Dominicana</h2>
                    <h3 style="margin: 0; font-size: 12pt; font-weight: bold; text-transform: uppercase;">Ministerio de Educación</h3>
                    <p style="margin: 2px 0 0 0; font-size: 9pt;">Viceministerio de Servicios Técnicos y Pedagógicos</p>
                    <p style="margin: 0; font-size: 9pt;">Dirección General de Educación Secundaria</p>
                    
                    <div style="margin-top: 8px; font-weight: bold; font-size: 11pt; border: 1px solid black; display: inline-block; padding: 3px 20px; background: #e0e0e0; text-transform: uppercase;">
                        Informe de Evaluación del Aprendizaje
                    </div>
                </td>
                <td style="width: 10%; text-align: center; vertical-align: top; padding-bottom: 5px;">
                     <img src="${logoMinerd}" style="width: 70px; height: auto;">
                </td>
            </tr>
        </table>

        <!-- DATOS DEL CENTRO Y ESTUDIANTE (GRID TIPO FICHA) -->
        <table style="width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 15px;">
            <!-- Fila 1 -->
            <tr>
                <td class="cell-head" style="width: 8%;">Regional:</td>
                <td class="cell-data center" style="width: 8%;">${SCHOOL_INFO.regional}</td>
                <td class="cell-head" style="width: 8%;">Distrito:</td>
                <td class="cell-data center" style="width: 8%;">${SCHOOL_INFO.distrito}</td>
                <td class="cell-head" style="width: 12%;">Centro Educativo:</td>
                <td class="cell-data" colspan="3">${SCHOOL_INFO.nombre}</td>
                <td class="cell-head" style="width: 8%;">Código:</td>
                <td class="cell-data center" style="width: 10%;">${SCHOOL_INFO.codigo}</td>
                <td class="cell-head" style="width: 10%;">Año Escolar:</td>
                <td class="cell-data center" style="width: 10%;">${yearFrom}-${yearTo}</td>
            </tr>
            <!-- Fila 2 -->
            <tr>
                <td class="cell-head">Estudiante:</td>
                <td class="cell-data" colspan="7" style="font-weight: bold; text-transform: uppercase;">${student.nombre}</td>
                <td class="cell-head">ID:</td>
                <td class="cell-data center">${student.id}</td>
                <td class="cell-head">RNE:</td>
                <td class="cell-data center">${student.rne || ''}</td>
            </tr>
            <!-- Fila 3 -->
            <tr>
                <td class="cell-head">Grado:</td>
                <td class="cell-data" colspan="3">${course.nombre}</td>
                <td class="cell-head">Sección:</td>
                <td class="cell-data center">A</td>
                <td class="cell-head">Tanda:</td>
                <td class="cell-data center">${SCHOOL_INFO.tanda}</td>
                <td class="cell-head" colspan="2" style="text-align: right; padding-right: 5px;">Número de Orden:</td>
                <td class="cell-data center" colspan="2" style="font-weight: bold;">${student.numero_orden || ''}</td>
            </tr>
        </table>

        <!-- TABLA COMPLETA DE CALIFICACIONES (Parte final "perfecta") -->
        <table style="width: 100%; border-collapse: collapse; font-size: 8pt; border: 1px solid black;">
            <thead>
                <tr>
                    <!-- Columna 1: Competencias y Asignaturas -->
                    <th rowspan="3" style="border: 1px solid black; background: white; width: 18%; vertical-align: top; padding: 5px; text-align: left;">
                        <div style="font-weight: bold; font-size: 9pt; margin-bottom: 5px; border-bottom: 1px solid #ccc; padding-bottom: 2px;">ÁREAS / ASIGNATURAS</div>
                        <div style="font-weight: bold; font-size: 7pt; color: #333; margin-bottom: 3px;">COMPETENCIAS FUNDAMENTALES:</div>
                        <div style="font-size: 7pt; color: #444; line-height: 1.3;">
                            ${competenciasFundamentales.join('<br>')}
                        </div>
                    </th>
                    
                    <!-- Columna 2: Promedios P1-P4 -->
                    <th colspan="4" style="border: 1px solid black; background: #e6e6e6; text-align: center; font-weight: bold;">
                        PROMEDIO GRUPO DE<br>COMPETENCIAS ESPECÍFICAS
                    </th>
                    
                    <!-- Columna 3: Calificación Final -->
                    <th rowspan="3" style="border: 1px solid black; background: #e6e6e6; width: 5%; text-align: center; vertical-align: middle;">
                        CALIFICACIÓN<br>FINAL DEL<br>ÁREA
                    </th>

                    <!-- Columna 4: Asistencia -->
                    <th rowspan="3" style="border: 1px solid black; background: #e6e6e6; width: 4%; text-align: center; vertical-align: middle;">
                        %<br>ASIST.
                    </th>

                    <!-- Columna 5: Completiva -->
                    <th colspan="3" style="border: 1px solid black; background: #e6e6e6; text-align: center;">
                        CALIFICACIÓN<br>COMPLETIVA
                    </th>

                    <!-- Columna 6: Extraordinaria -->
                    <th colspan="3" style="border: 1px solid black; background: #e6e6e6; text-align: center;">
                        CALIFICACIÓN<br>EXTRAORDINARIA
                    </th>

                    <!-- Columna 7: Especial -->
                    <th rowspan="3" style="border: 1px solid black; background: #e6e6e6; width: 5%; text-align: center; vertical-align: middle;">
                        EVALUACIÓN<br>ESPECIAL
                    </th>

                    <!-- Columna 8: Situación -->
                    <th rowspan="3" style="border: 1px solid black; background: #e6e6e6; width: 8%; text-align: center; vertical-align: middle;">
                        SITUACIÓN<br>FINAL EN LA<br>ASIGNATURA
                    </th>
                </tr>
                
                <!-- Sub-Encabezados Fila 2 -->
                <tr>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%;">P1</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%;">P2</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%;">P3</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%;">P4</th>
                    
                    <!-- Completiva Sub -->
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">C.P.C.<br>(50%)</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">P.C.<br>(50%)</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">C.C.</th>

                    <!-- Extraordinaria Sub -->
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">C.P.Ex<br>(30%)</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">P.Ex<br>(70%)</th>
                    <th style="border: 1px solid black; background: #f2f2f2; width: 4%; font-size: 7pt;">C.Ex</th>
                </tr>

                <!-- Fila 3 (Separador) -->
                <tr style="height: 5px;">
                    <th colspan="4" style="border: 1px solid black; background: #fff;"></th>
                    <th colspan="3" style="border: 1px solid black; background: #fff;"></th>
                    <th colspan="3" style="border: 1px solid black; background: #fff;"></th>
                </tr>
            </thead>
            <tbody>
                ${generateRows(gradeSummary, attendanceSummary)}
            </tbody>
        </table>

        <!-- PIE DE PÁGINA (LEYENDA Y FIRMAS) -->
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; font-size: 8pt;">
            <div style="border: 1px solid black; padding: 5px; width: 60%;">
                <strong>LEYENDA:</strong><br>
                <span>P1-P4: Periodos</span> &nbsp;|&nbsp; 
                <span>C.F.: Calificación Final</span> &nbsp;|&nbsp;
                <span>C.P.C: Calificación Parcial Completiva</span> &nbsp;|&nbsp;
                <span>P.C.: Prueba Completiva</span><br>
                <span>C.C.: Calificación Completiva</span> &nbsp;|&nbsp;
                <span>C.P.Ex: Calificación Parcial Extraordinaria</span> &nbsp;|&nbsp;
                <span>C.Ex: Calificación Extraordinaria</span>
            </div>
            <div style="width: 38%; text-align: center; border: 1px solid black; padding: 5px;">
                <strong>ESTADO FINAL DEL ESTUDIANTE</strong>
                <div style="font-size: 11pt; font-weight: bold; margin-top: 5px; text-transform: uppercase;">
                    ${calculateCondicionFinal(gradeSummary)}
                </div>
            </div>
        </div>

        <table style="width: 100%; margin-top: 40px; font-size: 9pt;">
            <tr>
                <td style="text-align: center; width: 40%;">
                    <div style="border-top: 1px solid black; margin: 0 20px; padding-top: 5px;">
                        <strong>Director(a) del Centro</strong>
                    </div>
                </td>
                <td style="width: 20%;"></td>
                <td style="text-align: center; width: 40%;">
                    <div style="border-top: 1px solid black; margin: 0 20px; padding-top: 5px;">
                        <strong>Titular de Curso / Encargado(a)</strong>
                    </div>
                </td>
            </tr>
        </table>
        
        <div style="text-align: right; font-size: 7pt; margin-top: 10px; color: #666;">
            Impreso el: ${fechaImpresion}
        </div>

        <style>
            .cell-head { border: 1px solid black; background: #f2f2f2; font-weight: bold; padding: 3px 5px; }
            .cell-data { border: 1px solid black; padding: 3px 5px; }
            .center { text-align: center; }
        </style>
    </div>
    `;
}

function generateRows(gradeSummary, attendanceSummary) {
    const asistTotal = calculateTotalAttendancePercent(attendanceSummary);

    return AREAS_CURRICULARES.map((area) => {
        const grades = gradeSummary[area] || { p1: '', p2: '', p3: '', p4: '', promedio: '', situacion: '' };

        return `
        <tr style="height: 22px;">
            <td style="border: 1px solid black; padding: 2px 5px; font-weight: bold;">${area}</td>
            
            <!-- P1-P4 -->
            <td style="border: 1px solid black; text-align: center;">${grades.p1 || ''}</td>
            <td style="border: 1px solid black; text-align: center;">${grades.p2 || ''}</td>
            <td style="border: 1px solid black; text-align: center;">${grades.p3 || ''}</td>
            <td style="border: 1px solid black; text-align: center;">${grades.p4 || ''}</td>
            
            <!-- Calificación Final -->
            <td style="border: 1px solid black; text-align: center; font-weight: bold; background: #f9f9f9;">${grades.promedio || ''}</td>
            
            <!-- Asistencia -->
            <td style="border: 1px solid black; text-align: center;">${asistTotal}</td>
            
            <!-- Completiva (Vacío por ahora) -->
            <td style="border: 1px solid black; text-align: center;">-</td>
            <td style="border: 1px solid black; text-align: center;">-</td>
            <td style="border: 1px solid black; text-align: center;">-</td>
            
            <!-- Extraordinaria (Vacío por ahora) -->
            <td style="border: 1px solid black; text-align: center;">-</td>
            <td style="border: 1px solid black; text-align: center;">-</td>
            <td style="border: 1px solid black; text-align: center;">-</td>
            
            <!-- Especial (Vacío) -->
            <td style="border: 1px solid black; text-align: center;">-</td>
            
            <!-- Situación -->
            <td style="border: 1px solid black; text-align: center; font-size: 7pt; font-weight: bold;">${grades.situacion}</td>
        </tr>
        `;
    }).join('');
}

// --- LÓGICA DE CÁLCULO ---

function calculateCondicionFinal(summary) {
    let reprobadas = 0;
    let completas = 0;
    const areas = Object.values(summary);

    areas.forEach(a => {
        if (a.situacion === 'R') reprobadas++;
        if (a.promedio) completas++;
    });

    if (completas < AREAS_CURRICULARES.length) return "EN PROCESO";
    return reprobadas > 0 ? "APLAZADO" : "PROMOVIDO";
}

function calculateGradeSummary(course, student) {
    const summary = {};
    const notas = student.notas || {};
    const actividades = course.actividades || {};

    course.materias.forEach(materia => {
        let area = matchAreaCurricular(materia);
        if (!summary[area]) {
            summary[area] = { p1: '', p2: '', p3: '', p4: '', promedio: '', situacion: '' };
        }

        const notasMateria = notas[materia] || {};
        const actividadesMateria = actividades[materia] || [];

        ['p1', 'p2', 'p3', 'p4'].forEach(periodo => {
            const actPeriodo = actividadesMateria.filter(a => (a.periodo || 'p1') === periodo);
            if (actPeriodo.length > 0) {
                let sum = 0;
                let hasWeights = actPeriodo.some(a => a.valor > 0);
                let count = 0;

                actPeriodo.forEach(act => {
                    const val = parseFloat(notasMateria[act.nombre] || 0);
                    if (hasWeights) {
                        sum += (val * parseFloat(act.valor)) / 100;
                    } else {
                        if (notasMateria[act.nombre]) {
                            sum += val;
                            count++;
                        }
                    }
                });

                if (hasWeights) summary[area][periodo] = Math.round(sum);
                else summary[area][periodo] = count > 0 ? Math.round(sum / count) : 0;
            }
        });

        const pvals = [summary[area].p1, summary[area].p2, summary[area].p3, summary[area].p4].filter(v => v !== '' && v !== 0);
        if (pvals.length > 0) {
            const avg = Math.round(pvals.reduce((a, b) => a + b, 0) / pvals.length);
            summary[area].promedio = avg;
            summary[area].situacion = avg >= 70 ? 'A' : 'R';
        }
    });

    return summary;
}

function matchAreaCurricular(materia) {
    const lower = materia.toLowerCase();
    if (lower.includes('español') || lower.includes('lengua')) return 'Lengua Española';
    if (lower.includes('inglés')) return 'Lenguas Extranjeras (Inglés)';
    if (lower.includes('francés')) return 'Lenguas Extranjeras (Francés)';
    if (lower.includes('matemática')) return 'Matemática';
    if (lower.includes('social')) return 'Ciencias Sociales';
    if (lower.includes('naturaleza') || lower.includes('biología') || lower.includes('química')) return 'Ciencias de la Naturaleza';
    if (lower.includes('artística')) return 'Educación Artística';
    if (lower.includes('física') && !lower.includes('matemática')) return 'Educación Física';
    if (lower.includes('religión') || lower.includes('formación')) return 'Formación Integral Humana y Religiosa';
    return 'Salidas Optativas / Tecnología';
}

function calculateAttendanceSummary(course, student) {
    let p = 0, a = 0;
    const asistencia = student.asistencia || {};
    Object.values(asistencia).forEach(materiaAsist => {
        Object.values(materiaAsist).forEach(status => {
            if (status === 'P') p++;
            if (status === 'A') a++;
        });
    });
    return { present: p, absent: a };
}

function calculateTotalAttendancePercent(summary) {
    const total = summary.present + summary.absent;
    if (total === 0) return '100%';
    return Math.round((summary.present / total) * 100) + '%';
}