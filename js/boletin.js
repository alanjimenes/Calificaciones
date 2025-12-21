import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10"
};

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

// Nombres descriptivos para el boletín detallado
const MAPA_COMPETENCIAS = {
    c1: "Ética y Ciudadana / Comunicativa",
    c2: "Pensamiento Lógico / Crítico",
    c3: "Resolución de Problemas / Científica",
    c4: "Ambiental / Desarrollo Personal"
};

const COMPETENCIAS_KEYS = ['c1', 'c2', 'c3', 'c4'];
const PERIODOS_KEYS = ['p1', 'p2', 'p3', 'p4'];

let allCourses = [];
let selectedCourseData = null;
let selectedStudentData = null;

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

window.generateBoletin = function () {
    if (!selectedCourseData || !selectedStudentData) {
        alert("Selecciona curso y estudiante.");
        return;
    }

    const yearFrom = document.getElementById('year-from').value || '2024';
    const yearTo = document.getElementById('year-to').value || '2025';

    const nivelRadio = document.querySelector('input[name="nivel-boletin"]:checked');
    const nivel = nivelRadio ? nivelRadio.value : 'secundaria';

    if (window.showToast) window.showToast(`Generando boletín detallado...`, "info");

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

const logoEscudo = "https://upload.wikimedia.org/wikipedia/commons/2/26/Coat_of_arms_of_the_Dominican_Republic.svg";
const logoMinerd = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png/240px-Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png";

// ==========================================
// PLANTILLA SECUNDARIA DETALLADA (FORMATO SÁBANA HORIZONTAL)
// ==========================================
function createBoletinSecundariaHTML(course, student, yearFrom, yearTo) {
    const asistencia = calculateAttendancePercent(course, student);
    const materiasRows = getMateriasRowsHorizontal(course, student);
    const cantAsignaturasReprobadas = getAsignaturasReprobadasCount(course, student);

    let estadoGeneral = "PROMOVIDO";
    if (cantAsignaturasReprobadas > 2) estadoGeneral = "REPITENTE";
    else if (cantAsignaturasReprobadas > 0) estadoGeneral = "APLAZADO";

    return `
    <div style="background:white; color:black; width: 100%; font-family: 'Arial Narrow', Arial, sans-serif; box-sizing: border-box;">
        
        <div style="width: 279mm; min-height: 215mm; padding: 5mm 5mm; position: relative;">
            
            <!-- Encabezado Oficial -->
            <div style="display: flex; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px;">
                <div style="width: 10%; text-align: center;"><img src="${logoEscudo}" style="height: 50px;"></div>
                <div style="width: 80%; text-align: center;">
                    <h1 style="font-size: 14px; font-weight: bold; margin: 0;">MINISTERIO DE EDUCACIÓN DE LA REPÚBLICA DOMINICANA</h1>
                    <h2 style="font-size: 11px; font-weight: bold; margin: 2px 0;">REGISTRO DE EVALUACIÓN DE LOS APRENDIZAJES - NIVEL SECUNDARIO</h2>
                    <h3 style="font-size: 10px; font-weight: normal; margin: 0;">AÑO ESCOLAR ${yearFrom}-${yearTo}</h3>
                </div>
                <div style="width: 10%; text-align: center;"><img src="${logoMinerd}" style="height: 50px;"></div>
            </div>

            <!-- Datos Informativos -->
            <div style="display: flex; flex-wrap: wrap; font-size: 10px; margin-bottom: 5px; border: 1px solid #000; padding: 2px 5px; background: #f9f9f9;">
                <div style="width: 40%;"><strong>Centro:</strong> ${SCHOOL_INFO.nombre} (${SCHOOL_INFO.codigo})</div>
                <div style="width: 40%;"><strong>Estudiante:</strong> ${student.nombre.toUpperCase()}</div>
                <div style="width: 20%;"><strong>ID:</strong> ${student.rne || student.id}</div>
                <div style="width: 40%;"><strong>Grado/Sección:</strong> ${course.nombre} - U</div>
                <div style="width: 40%;"><strong>Tanda:</strong> ${SCHOOL_INFO.tanda}</div>
                <div style="width: 20%;"><strong>No.</strong> ${student.numero_orden || '-'}</div>
            </div>

            <!-- TABLA DETALLADA COMPLEJA -->
            <table style="width: 100%; border-collapse: collapse; font-size: 8px; text-align: center; border: 1px solid black;">
                <thead>
                    <!-- FILA 1: COMPETENCIAS Y RECUPERACIÓN -->
                    <tr style="background-color: #333; color: white; height: 15px;">
                        <th rowspan="2" style="border: 1px solid #999; width: 120px; vertical-align: middle;">ASIGNATURAS</th>
                        
                        <th colspan="4" style="border: 1px solid #999; background-color: #444;" title="${MAPA_COMPETENCIAS['c1']}">COMPETENCIA 1</th>
                        <th colspan="4" style="border: 1px solid #999; background-color: #555;" title="${MAPA_COMPETENCIAS['c2']}">COMPETENCIA 2</th>
                        <th colspan="4" style="border: 1px solid #999; background-color: #444;" title="${MAPA_COMPETENCIAS['c3']}">COMPETENCIA 3</th>
                        <th colspan="4" style="border: 1px solid #999; background-color: #555;" title="${MAPA_COMPETENCIAS['c4']}">COMPETENCIA 4</th>
                        
                        <th rowspan="2" style="border: 1px solid #999; width: 25px; background-color: #222; font-weight: bold;">C.F.</th>
                        
                        <!-- SECCIÓN RECUPERACIÓN -->
                        <th colspan="3" style="border: 1px solid #999; background-color: #666;">COMPLETIVA (C.C.)</th>
                        <th colspan="3" style="border: 1px solid #999; background-color: #777;">EXTRAORD. (C.E.)</th>
                        <th rowspan="2" style="border: 1px solid #999; width: 20px; background-color: #222;">E.E.</th>
                        <th colspan="2" style="border: 1px solid #999; background-color: #333;">EST</th>
                    </tr>
                    
                    <!-- FILA 2: PERIODOS -->
                    <tr style="background-color: #eee; color: black; font-weight: bold; height: 15px;">
                        <!-- C1 -->
                        <th style="border: 1px solid #999; width: 18px;">P1</th><th style="border: 1px solid #999; width: 18px;">P2</th><th style="border: 1px solid #999; width: 18px;">P3</th><th style="border: 1px solid #999; width: 18px;">P4</th>
                        <!-- C2 -->
                        <th style="border: 1px solid #999; width: 18px;">P1</th><th style="border: 1px solid #999; width: 18px;">P2</th><th style="border: 1px solid #999; width: 18px;">P3</th><th style="border: 1px solid #999; width: 18px;">P4</th>
                        <!-- C3 -->
                        <th style="border: 1px solid #999; width: 18px;">P1</th><th style="border: 1px solid #999; width: 18px;">P2</th><th style="border: 1px solid #999; width: 18px;">P3</th><th style="border: 1px solid #999; width: 18px;">P4</th>
                        <!-- C4 -->
                        <th style="border: 1px solid #999; width: 18px;">P1</th><th style="border: 1px solid #999; width: 18px;">P2</th><th style="border: 1px solid #999; width: 18px;">P3</th><th style="border: 1px solid #999; width: 18px;">P4</th>
                        
                        <!-- C.C. -->
                        <th style="border: 1px solid #999; width: 20px; font-size: 7px;">50%<br>C.F.</th>
                        <th style="border: 1px solid #999; width: 20px; font-size: 7px;">50%<br>C.P.</th>
                        <th style="border: 1px solid #999; width: 20px; background-color: #ddd;">C.C.</th>
                        
                        <!-- C.E. -->
                        <th style="border: 1px solid #999; width: 20px; font-size: 7px;">30%<br>C.F.</th>
                        <th style="border: 1px solid #999; width: 20px; font-size: 7px;">70%<br>C.P.</th>
                        <th style="border: 1px solid #999; width: 20px; background-color: #ddd;">C.E.</th>

                        <th style="border: 1px solid #999; width: 12px; font-size: 7px;">A</th>
                        <th style="border: 1px solid #999; width: 12px; font-size: 7px;">R</th>
                    </tr>
                </thead>
                <tbody>
                    ${materiasRows}
                </tbody>
            </table>

            <!-- Resumen y Firmas -->
            <div style="margin-top: 10px; display: flex; justify-content: space-between; border: 1px solid #000; padding: 5px; font-size: 9px; background: #fff;">
                <div style="width: 25%;">
                    <strong>ASISTENCIA:</strong> ${asistencia}% <br>
                    <strong>CONDICIÓN:</strong> ${asistencia >= 80 ? 'Cumple' : 'No Cumple'}
                </div>
                <div style="width: 50%; font-size: 8px; color: #444;">
                    <strong>COMPETENCIAS:</strong> 
                    1. Ética y Ciudadana / Comunicativa &nbsp;|&nbsp; 
                    2. Pensamiento Lógico, Creativo y Crítico &nbsp;|&nbsp; 
                    3. Resolución de Problemas / Científica &nbsp;|&nbsp; 
                    4. Ambiental / Desarrollo Personal
                </div>
                <div style="width: 20%; text-align: right;">
                    <strong>ESTADO FINAL:</strong> <span style="font-weight: bold; background: #eee; padding: 0 4px;">${estadoGeneral}</span>
                </div>
            </div>

            <div style="position: absolute; bottom: 8mm; width: 90%; display: flex; justify-content: space-between; font-size: 10px;">
                <div style="text-align: center; border-top: 1px solid #000; width: 200px; padding-top: 5px;">Director(a) del Centro</div>
                <div style="text-align: center; border-top: 1px solid #000; width: 200px; padding-top: 5px;">Encargado(a) de Registro</div>
            </div>
        </div>
    </div>`;
}

// ==========================================
// LÓGICA HORIZONTAL (FILA ÚNICA POR MATERIA)
// ==========================================
function getMateriasRowsHorizontal(course, student) {
    let html = '';
    const todasMaterias = [...new Set([...course.materias || []])];
    if (todasMaterias.length === 0) AREAS_CURRICULARES.forEach(m => todasMaterias.push(m));

    todasMaterias.forEach((materia, idx) => {
        // 1. Calcular C.F. General
        let sumPeriods = 0;
        let countPeriods = 0;
        PERIODOS_KEYS.forEach(p => {
            const pd = getPeriodDetails(course, student, materia, p);
            if (pd.hasData) { sumPeriods += pd.promedio; countPeriods++; }
        });
        const cf = countPeriods > 0 ? Math.round(sumPeriods / countPeriods) : null;

        // 2. Calcular Recuperaciones
        const rec = calculateRecuperacion(course, student, materia, cf);
        const isAprobado = checkAprobado(cf, rec);
        const f = (val) => (val !== null && val !== undefined && val !== '-' && !isNaN(val)) ? val : '';

        // Estilos
        const bgRow = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
        const border = 'border-right: 1px solid #ccc; border-bottom: 1px solid #ccc;';

        html += `<tr style="height: 20px; ${idx % 2 !== 0 ? 'background-color: #f7f7f7;' : ''}">
            <td style="text-align: left; padding-left: 4px; border: 1px solid #999; font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 120px;" title="${materia}">${materia}</td>`;

        // 3. Celdas de Competencias (4 comps x 4 periodos = 16 celdas)
        COMPETENCIAS_KEYS.forEach(comp => {
            PERIODOS_KEYS.forEach(per => {
                const val = calculateCompetenceSpecific(course, student, materia, per, comp);
                html += `<td style="border: 1px solid #ddd;">${f(val)}</td>`;
            });
        });

        // 4. Columna C.F.
        html += `<td style="border: 1px solid #999; font-weight: bold; background-color: #e0e0e0;">${f(cf)}</td>`;

        // 5. Columnas Recuperación
        // C.C.
        html += `<td style="border: 1px solid #ddd; font-size: 7px;">${f(rec.cc_50_cpc)}</td>
                 <td style="border: 1px solid #ddd; font-size: 7px;">${f(rec.cc_50_pe)}</td>
                 <td style="border: 1px solid #999; background-color: #f0f0f0; font-weight: bold;">${f(rec.cc_final)}</td>`;

        // C.E.
        html += `<td style="border: 1px solid #ddd; font-size: 7px;">${f(rec.ce_30_cpc)}</td>
                 <td style="border: 1px solid #ddd; font-size: 7px;">${f(rec.ce_70_pe)}</td>
                 <td style="border: 1px solid #999; background-color: #f0f0f0; font-weight: bold;">${f(rec.ce_final)}</td>`;

        // E.E.
        html += `<td style="border: 1px solid #999; background-color: #e6e6e6;">${f(rec.ee_final)}</td>`;

        // Estado
        html += `<td style="border: 1px solid #999;">${isAprobado ? '•' : ''}</td>
                 <td style="border: 1px solid #999; color: red;">${!isAprobado ? '•' : ''}</td>`;

        html += `</tr>`;
    });
    return html;
}

// Calculo de nota de una competencia específica en un periodo específico
function calculateCompetenceSpecific(course, student, materia, period, compKey) {
    const acts = (course.actividades || {})[materia] || [];
    const studentNotas = (student.notas && student.notas[materia]) ? student.notas[materia] : {};

    // Filtrar actividades de ese periodo y esa competencia
    const targetActs = acts.filter(a => (a.periodo || 'p1') === period && (a.competencia || 'c1') === compKey && (!a.tipo || a.tipo === 'regular'));

    if (targetActs.length === 0) return null;

    let sum = 0;
    let weightTotal = 0;
    let simpleSum = 0;
    let simpleCount = 0;

    targetActs.forEach(act => {
        const val = parseFloat(studentNotas[act.nombre] || 0);
        const w = parseFloat(act.valor || 0);
        if (w > 0) {
            sum += (val * w) / 100;
            weightTotal += w;
        } else {
            simpleSum += val;
            simpleCount++;
        }
    });

    if (weightTotal > 0) return Math.round(sum);
    // Si no hay pesos, promedio simple
    if (simpleCount > 0) return Math.round(simpleSum / simpleCount);

    return null;
}

// Función auxiliar para calcular recuperaciones (Reutilizada y limpiada)
function calculateRecuperacion(course, student, materia, cf) {
    const result = {
        cc_50_cpc: '-', cc_50_pe: '-', cc_final: '-',
        ce_30_cpc: '-', ce_70_pe: '-', ce_final: '-',
        ee_final: '-'
    };

    if (cf === null) return result;
    if (cf >= 70) return result; // Aprobado, no hay recuperación

    // Datos necesarios
    const notas = (student.notas && student.notas[materia]) ? student.notas[materia] : {};
    const acts = (course.actividades || {})[materia] || [];

    const actCC = acts.find(a => a.tipo === 'completiva') || { nombre: 'Examen Completivo' };
    const actCE = acts.find(a => a.tipo === 'extraordinaria') || { nombre: 'Examen Extraordinario' };
    const actEE = acts.find(a => a.tipo === 'especial') || { nombre: 'Evaluación Especial' };

    const nCC = parseFloat(notas[actCC.nombre] || 0);
    const nCE = parseFloat(notas[actCE.nombre] || 0);
    const nEE = parseFloat(notas[actEE.nombre] || 0);

    // 1. Completiva
    const val_cc_50_cpc = Math.round(cf * 0.5);
    const val_cc_50_pe = Math.round(nCC * 0.5);
    const val_cc_final = val_cc_50_cpc + val_cc_50_pe;

    result.cc_50_cpc = val_cc_50_cpc;
    result.cc_50_pe = val_cc_50_pe;
    result.cc_final = val_cc_final;

    if (val_cc_final >= 70) return result; // Pasó en C.C.

    // 2. Extraordinaria
    const val_ce_30_cpc = Math.round(cf * 0.3);
    const val_ce_70_pe = Math.round(nCE * 0.7);
    const val_ce_final = val_ce_30_cpc + val_ce_70_pe;

    result.ce_30_cpc = val_ce_30_cpc;
    result.ce_70_pe = val_ce_70_pe;
    result.ce_final = val_ce_final;

    if (val_ce_final >= 70) return result; // Pasó en C.E.

    // 3. Especial
    result.ee_final = nEE > 0 ? nEE : 0;

    return result;
}

function checkAprobado(cf, rec) {
    if (cf === null) return false;
    if (cf >= 70) return true;
    if (rec.cc_final !== '-' && rec.cc_final >= 70) return true;
    if (rec.ce_final !== '-' && rec.ce_final >= 70) return true;
    if (rec.ee_final !== '-' && rec.ee_final >= 70) return true;
    return false;
}

// ... (Funciones auxiliares estándar como getPeriodDetails, calculateAttendance, getReprobadas se mantienen) ...

function getPeriodDetails(course, student, subjectName, period) {
    // Esta función calcula el promedio general del periodo (Promedio de las 4 comps)
    let sum = 0;
    let count = 0;
    COMPETENCIAS_KEYS.forEach(k => {
        const val = calculateCompetenceSpecific(course, student, subjectName, period, k);
        if (val !== null) {
            sum += val;
            count++; // Asumimos que todas las competencias pesan igual en el promedio del periodo
        }
    });

    if (count === 0) return { promedio: null, hasData: false };
    return { promedio: Math.round(sum / 4), hasData: true }; // Siempre dividir por 4 estándar curricular
}

function calculateAttendancePercent(course, student) {
    let p = 0, total = 0;
    const asistencia = student.asistencia || {};
    Object.values(asistencia).forEach(materiaAsist => {
        Object.values(materiaAsist).forEach(status => {
            if (status === 'P') p++;
            total++;
        });
    });
    if (total === 0) return 100;
    return Math.round((p / total) * 100);
}

function getAsignaturasReprobadasCount(course, student) {
    let reprobadas = 0;
    const todasMaterias = [...new Set([...course.materias || []])];
    if (todasMaterias.length === 0) AREAS_CURRICULARES.forEach(m => todasMaterias.push(m));

    todasMaterias.forEach(materia => {
        // Recalcular CF rápido
        let suma = 0, count = 0;
        ['p1', 'p2', 'p3', 'p4'].forEach(p => {
            const d = getPeriodDetails(course, student, materia, p);
            if (d.hasData) { suma += d.promedio; count++; }
        });

        let cf = count > 0 ? Math.round(suma / count) : 0;
        // Si no hay datos, asumimos aprobado o ignoramos para el conteo de "reprobadas activas"
        if (count === 0) cf = 100;

        const rec = calculateRecuperacion(course, student, materia, cf);
        if (!checkAprobado(cf, rec)) reprobadas++;
    });
    return reprobadas;
}

// Placeholder para Primaria (Versión simple)
function createBoletinPrimariaHTML(course, student, yearFrom, yearTo) {
    const materias = getMateriasRowsSimple(course, student);
    return `
    <div style="padding: 20px; font-family: sans-serif;">
        <h1 style="text-align: center;">BOLETÍN PRIMARIA</h1>
        <p style="text-align: center;">${student.nombre} - ${course.nombre}</p>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid black; margin-top: 20px;">
            <tr style="background: #eee;">
                <th style="border: 1px solid black; padding: 5px;">Asignatura</th>
                <th style="border: 1px solid black;">P1</th>
                <th style="border: 1px solid black;">P2</th>
                <th style="border: 1px solid black;">P3</th>
                <th style="border: 1px solid black;">P4</th>
                <th style="border: 1px solid black;">Final</th>
            </tr>
            ${materias}
        </table>
    </div>`;
}

function getMateriasRowsSimple(course, student) {
    let html = '';
    const todas = [...new Set([...course.materias || []])];
    todas.forEach(m => {
        const p1 = getPeriodDetails(course, student, m, 'p1').promedio || '-';
        const p2 = getPeriodDetails(course, student, m, 'p2').promedio || '-';
        const p3 = getPeriodDetails(course, student, m, 'p3').promedio || '-';
        const p4 = getPeriodDetails(course, student, m, 'p4').promedio || '-';
        html += `<tr><td style="border: 1px solid black; padding: 5px;">${m}</td><td style="border: 1px solid black; text-align: center;">${p1}</td><td style="border: 1px solid black; text-align: center;">${p2}</td><td style="border: 1px solid black; text-align: center;">${p3}</td><td style="border: 1px solid black; text-align: center;">${p4}</td><td style="border: 1px solid black; text-align: center;">-</td></tr>`;
    });
    return html;
}