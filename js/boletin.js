// js/boletin.js - Generador de Boletines (Portada HTML Dinámica + Detalle)
import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10"
};

// Áreas Oficiales del Currículo Dominicano
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

    if (window.showToast) window.showToast("Generando boletín detallado...", "info");

    const boletinHTML = createBoletinHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    const container = document.getElementById('boletin-preview');

    container.style.opacity = '0.5';
    setTimeout(() => {
        container.innerHTML = boletinHTML;
        container.style.opacity = '1';
        if (window.showToast) window.showToast("Boletín generado correctamente", "success");
    }, 400);
}

// --- LÓGICA DE CÁLCULO DETALLADO (C1-C4) ---
function getPeriodDetails(course, student, subjectName, period) {
    const actividadesConfig = course.actividades || {};
    const actividadesMateria = actividadesConfig[subjectName] || [];
    const notasEstudiante = (student.notas && student.notas[subjectName]) ? student.notas[subjectName] : {};

    const actsPeriodo = actividadesMateria.filter(act => (act.periodo || 'p1') === period);

    if (actsPeriodo.length === 0) {
        return { c1: null, c2: null, c3: null, c4: null, promedio: null, hasData: false };
    }

    const comps = { c1: { sum: 0 }, c2: { sum: 0 }, c3: { sum: 0 }, c4: { sum: 0 } };

    actsPeriodo.forEach(act => {
        const compId = act.competencia || 'c1';
        const val = parseFloat(notasEstudiante[act.nombre] || 0);
        const weight = parseFloat(act.valor || 0);
        if (weight > 0) comps[compId].sum += (val * weight) / 100;
    });

    let scoresList = [];
    let compScores = {};
    COMPETENCIAS.forEach(k => {
        let score = Math.round(comps[k].sum);
        compScores[k] = score;
        scoresList.push(score);
    });

    const totalPeriodo = scoresList.reduce((a, b) => a + b, 0);
    const promedioPeriodo = Math.round(totalPeriodo / 4);

    return {
        c1: compScores.c1, c2: compScores.c2, c3: compScores.c3, c4: compScores.c4,
        promedio: promedioPeriodo, hasData: true
    };
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

// --- RENDERIZADO DEL BOLETÍN (PORTADA HTML + TABLA DETALLADA) ---
function createBoletinHTML(course, student, yearFrom, yearTo) {
    const fechaImpresion = new Date().toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const asistenciaPorcentaje = calculateAttendancePercent(course, student);
    const logoEscudo = "https://upload.wikimedia.org/wikipedia/commons/2/26/Coat_of_arms_of_the_Dominican_Republic.svg";
    const logoMinerd = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png/240px-Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png";

    // --- REPLICA DE LA PORTADA OFICIAL ---
    // NOTA: 'page-break-after: always' está aplicado al contenedor de la portada
    // No usamos div separado para evitar hojas en blanco.
    const portadaHTML = `
    <div style="width: 279mm; height: 215mm; padding: 15mm; background: white; color: black; font-family: 'Times New Roman', serif; box-sizing: border-box; margin: 0 auto; position: relative; page-break-after: always; overflow: hidden;">
        
        <!-- ENCABEZADO PORTADA -->
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <img src="${logoEscudo}" style="height: 70px;">
                <div style="flex: 1; padding: 0 20px;">
                    <h1 style="font-size: 16px; font-weight: bold; margin: 0; letter-spacing: 1px;">REPÚBLICA DOMINICANA</h1>
                    <h2 style="font-size: 14px; font-weight: bold; margin: 5px 0 0 0;">MINISTERIO DE EDUCACIÓN</h2>
                    <h3 style="font-size: 12px; margin: 5px 0 0 0;">VICEMINISTERIO DE SERVICIOS TÉCNICOS Y PEDAGÓGICOS</h3>
                    <h3 style="font-size: 12px; margin: 0;">DIRECCIÓN GENERAL DE EDUCACIÓN SECUNDARIA</h3>
                </div>
                <img src="${logoMinerd}" style="height: 70px;">
            </div>
            
            <div style="border-top: 2px solid black; border-bottom: 1px solid black; padding: 5px 0; margin: 15px 0;">
                <h2 style="font-size: 18px; font-weight: bold; margin: 0;">INFORME DE APRENDIZAJE</h2>
                <h3 style="font-size: 14px; margin: 2px 0;">AÑO ESCOLAR ${yearFrom}-${yearTo}</h3>
            </div>
        </div>

        <!-- DATOS DEL CENTRO Y ESTUDIANTE -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 12px; margin-bottom: 20px;">
            <div style="border: 1px solid black; padding: 10px;">
                <div style="margin-bottom: 5px;"><strong>CENTRO EDUCATIVO:</strong> ${SCHOOL_INFO.nombre}</div>
                <div style="margin-bottom: 5px;"><strong>CÓDIGO:</strong> ${SCHOOL_INFO.codigo}</div>
                <div style="margin-bottom: 5px;"><strong>REGIONAL:</strong> ${SCHOOL_INFO.regional} &nbsp;&nbsp; <strong>DISTRITO:</strong> ${SCHOOL_INFO.distrito}</div>
                <div><strong>TANDA:</strong> ${SCHOOL_INFO.tanda}</div>
            </div>
            <div style="border: 1px solid black; padding: 10px;">
                <div style="margin-bottom: 5px;"><strong>ESTUDIANTE:</strong> ${student.nombre.toUpperCase()}</div>
                <div style="margin-bottom: 5px;"><strong>ID / RNE:</strong> ${student.rne || student.id}</div>
                <div style="margin-bottom: 5px;"><strong>GRADO:</strong> ${course.nombre} &nbsp;&nbsp; <strong>SECCIÓN:</strong> U</div>
                <div><strong>NO. ORDEN:</strong> ${student.numero_orden || '-'}</div>
            </div>
        </div>

        <!-- CUADRO DE OBSERVACIONES -->
        <div style="border: 2px solid black; padding: 2px; height: 350px; margin-bottom: 20px;">
            <div style="background: #eee; border-bottom: 1px solid black; text-align: center; font-weight: bold; padding: 5px; font-size: 12px;">
                OBSERVACIONES DEL DOCENTE
            </div>
            <div style="padding: 15px; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; height: 300px; overflow: hidden; white-space: pre-wrap;">
                ${student.observacion || "No hay observaciones registradas para este estudiante."}
            </div>
        </div>

        <!-- FIRMAS PIE DE PÁGINA -->
        <div style="position: absolute; bottom: 20mm; left: 15mm; right: 15mm; display: flex; justify-content: space-between; text-align: center; font-size: 11px;">
            <div style="width: 200px;">
                <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                <strong>DIRECTOR(A)</strong>
            </div>
            <div style="width: 200px;">
                <div style="border-bottom: 1px solid black; margin-bottom: 5px;"></div>
                <strong>DOCENTE ENCARGADO(A)</strong>
            </div>
        </div>
    </div>
    `;

    // --- CÁLCULO DE TABLA DE NOTAS ---
    let rowsHTML = '';
    let materiasPromedioSum = 0;
    let materiasCount = 0;
    let asignaturasReprobadas = 0;
    let hasP4Data = false;

    const todasMaterias = [...new Set([...AREAS_CURRICULARES, ...(course.materias || [])])];

    todasMaterias.forEach(materia => {
        const esOficial = course.materias.includes(materia) || AREAS_CURRICULARES.includes(materia);
        if (!esOficial) return;

        const p1 = getPeriodDetails(course, student, materia, 'p1');
        const p2 = getPeriodDetails(course, student, materia, 'p2');
        const p3 = getPeriodDetails(course, student, materia, 'p3');
        const p4 = getPeriodDetails(course, student, materia, 'p4');

        if (p4.hasData) hasP4Data = true;

        const periodos = [p1, p2, p3, p4];
        const periodosConData = periodos.filter(p => p.hasData);

        let cf = null;
        if (periodosConData.length > 0) {
            const sumaPromedios = periodosConData.reduce((acc, curr) => acc + curr.promedio, 0);
            cf = Math.round(sumaPromedios / periodosConData.length);
            materiasPromedioSum += cf;
            materiasCount++;
            if (cf < 70) asignaturasReprobadas++;
        }

        const f = (val) => (val !== null && val !== undefined) ? val : '-';
        const styleCF = cf && cf < 70 ? 'color: red; font-weight: bold;' : 'font-weight: bold;';
        const bgProm = "background-color: #f0f0f0; font-weight: bold;";

        rowsHTML += `
        <tr>
            <td style="text-align: left; padding-left: 5px; font-weight: bold;">${materia}</td>
            <td>${f(p1.c1)}</td><td>${f(p1.c2)}</td><td>${f(p1.c3)}</td><td>${f(p1.c4)}</td><td style="${bgProm}">${f(p1.promedio)}</td>
            <td>${f(p2.c1)}</td><td>${f(p2.c2)}</td><td>${f(p2.c3)}</td><td>${f(p2.c4)}</td><td style="${bgProm}">${f(p2.promedio)}</td>
            <td>${f(p3.c1)}</td><td>${f(p3.c2)}</td><td>${f(p3.c3)}</td><td>${f(p3.c4)}</td><td style="${bgProm}">${f(p3.promedio)}</td>
            <td>${f(p4.c1)}</td><td>${f(p4.c2)}</td><td>${f(p4.c3)}</td><td>${f(p4.c4)}</td><td style="${bgProm}">${f(p4.promedio)}</td>
            <td style="${styleCF} font-size: 10px; background-color: #e6e6e6;">${f(cf)}</td>
            <td style="font-size: 8px;">${cf !== null && cf < 70 ? 'CP' : ''}</td>
        </tr>
        `;
    });

    let situacionFinal = "EN PROCESO";
    if (materiasCount > 0 && hasP4Data) {
        situacionFinal = asignaturasReprobadas > 0 ? "APLAZADO" : "PROMOVIDO";
    }
    const promedioGeneral = materiasCount > 0 ? Math.round(materiasPromedioSum / materiasCount) : 0;

    // --- HTML FINAL ---
    // Estructura limpia: Contenedor global > Portada (con salto de página en CSS) > Boletín
    return `
    <div style="background:white; color:black; width: 100%;">
        
        <!-- PÁGINA 1: PORTADA -->
        ${portadaHTML}
        
        <!-- PÁGINA 2: BOLETÍN DE NOTAS -->
        <!-- No necesita salto antes porque la portada ya tiene 'break-after' -->
        <div style="width: 279mm; min-height: 215mm; padding: 10mm; background: white; color: black; font-family: 'Arial Narrow', sans-serif; box-sizing: border-box; margin: 0 auto; page-break-inside: avoid;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px;">
                <img src="${logoEscudo}" style="height: 50px;">
                <div style="text-align: center;">
                    <h1 style="font-size: 18px; font-weight: bold; margin: 0;">REPÚBLICA DOMINICANA</h1>
                    <h2 style="font-size: 14px; font-weight: bold; margin: 0;">MINISTERIO DE EDUCACIÓN</h2>
                    <p style="font-size: 12px; margin: 0;">DETALLE DE CALIFICACIONES</p>
                </div>
                <img src="${logoMinerd}" style="height: 50px;">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border: 1px solid #000; padding: 5px; font-size: 11px; margin-bottom: 10px;">
                <div><strong>ESTUDIANTE:</strong> ${student.nombre.toUpperCase()}</div>
                <div><strong>CURSO:</strong> ${course.nombre}</div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center; border: 1px solid #000;">
                <thead>
                    <tr style="background-color: #333; color: white;">
                        <th rowspan="2" style="width: 15%; border: 1px solid #555;">ÁREAS</th>
                        <th colspan="5" style="border: 1px solid #555;">P1</th>
                        <th colspan="5" style="border: 1px solid #555;">P2</th>
                        <th colspan="5" style="border: 1px solid #555;">P3</th>
                        <th colspan="5" style="border: 1px solid #555;">P4</th>
                        <th rowspan="2" style="width: 4%; border: 1px solid #555;">CF</th>
                        <th rowspan="2" style="width: 3%; border: 1px solid #555;">Sit</th>
                    </tr>
                    <tr style="background-color: #eee; color: #000;">
                        <th style="border:1px solid #ccc;">C1</th><th style="border:1px solid #ccc;">C2</th><th style="border:1px solid #ccc;">C3</th><th style="border:1px solid #ccc;">C4</th><th style="border:1px solid #ccc; font-weight:bold;">PC</th>
                        <th style="border:1px solid #ccc;">C1</th><th style="border:1px solid #ccc;">C2</th><th style="border:1px solid #ccc;">C3</th><th style="border:1px solid #ccc;">C4</th><th style="border:1px solid #ccc; font-weight:bold;">PC</th>
                        <th style="border:1px solid #ccc;">C1</th><th style="border:1px solid #ccc;">C2</th><th style="border:1px solid #ccc;">C3</th><th style="border:1px solid #ccc;">C4</th><th style="border:1px solid #ccc; font-weight:bold;">PC</th>
                        <th style="border:1px solid #ccc;">C1</th><th style="border:1px solid #ccc;">C2</th><th style="border:1px solid #ccc;">C3</th><th style="border:1px solid #ccc;">C4</th><th style="border:1px solid #ccc; font-weight:bold;">PC</th>
                    </tr>
                </thead>
                <tbody style="border: 1px solid #000;">
                    <style>td { border: 1px solid #ccc; padding: 2px; height: 16px; }</style>
                    ${rowsHTML}
                </tbody>
            </table>
            
            <div style="margin-top: 10px; font-size: 10px; text-align: right;">
                Prom. General: <strong>${promedioGeneral}</strong> | Asist: <strong>${asistenciaPorcentaje}%</strong> | Estado: <strong>${situacionFinal}</strong>
            </div>
            
             <div style="position: absolute; bottom: 5px; right: 10px; font-size: 8px; color: #999;">
                Pág 2/2
            </div>
        </div>
    </div>
    `;
}