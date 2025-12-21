import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10",
    provincia: "Santo Domingo",
    municipio: "Santo Domingo Este"
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

const COMPETENCIAS_KEYS = ['c1', 'c2', 'c3', 'c4'];
const PERIODOS_KEYS = ['p1', 'p2', 'p3', 'p4'];

let allCourses = [];
let selectedCourseData = null;
let selectedStudentData = null;

// Inicialización
window.addEventListener('userReady', async (e) => {
    const { role, email } = e.detail;
    const body = document.getElementById('main-body');
    if (body) body.classList.remove('opacity-0');

    // Inyectar CSS de impresión global si no existe
    if (!document.getElementById('print-styles')) {
        const style = document.createElement('style');
        style.id = 'print-styles';
        style.innerHTML = `
            @media print {
                @page { size: landscape; margin: 0; }
                body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                .no-print, #layout-header, #layout-control-panel, nav, aside { display: none !important; }
                #main-content, #main-wrapper, #preview-area { margin: 0 !important; padding: 0 !important; width: 100% !important; height: auto !important; overflow: visible !important; }
                #boletin-preview { display: block !important; width: 100% !important; transform: none !important; box-shadow: none !important; border: none !important; }
                .page-break { page-break-before: always; }
            }
        `;
        document.head.appendChild(style);
    }

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

    const yearFrom = document.getElementById('year-from').value || '2023';
    const yearTo = document.getElementById('year-to').value || '2024';

    if (window.showToast) window.showToast(`Generando boletín oficial...`, "info");

    const boletinHTML = createBoletinOficialHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);

    const container = document.getElementById('boletin-preview');
    container.innerHTML = ""; // Limpiar antes
    container.style.opacity = '0';
    
    setTimeout(() => {
        container.innerHTML = boletinHTML;
        container.style.opacity = '1';
    }, 200);
}

// ==========================================
// DISEÑO OFICIAL MINERD (RÉPLICA EXACTA PDF)
// ==========================================
function createBoletinOficialHTML(course, student, yearFrom, yearTo) {
    const logoEscudo = "https://upload.wikimedia.org/wikipedia/commons/2/26/Coat_of_arms_of_the_Dominican_Republic.svg";
    const logoMinerd = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png/240px-Emblema_del_Ministerio_de_Educaci%C3%B3n_de_la_Rep%C3%BAblica_Dominicana.png";

    const materiasRows = getMateriasRowsOficial(course, student);
    const asistencia = calculateAttendancePercent(course, student);
    const cantReprobadas = getAsignaturasReprobadasCount(course, student);

    let situacionFinal = "PROMOVIDO";
    if (cantReprobadas > 2) situacionFinal = "REPITENTE";
    else if (cantReprobadas > 0) situacionFinal = "APLAZADO";

    // --- ESTILOS EN LÍNEA (CRÍTICOS PARA PDF) ---
    const fontFamily = "font-family: Arial, Helvetica, sans-serif;";
    const border = "border: 1px solid #000;";
    const fontBold = "font-weight: bold;";
    const flexCenter = "display: flex; justify-content: center; align-items: center;";
    const textCenter = "text-align: center;";
    
    // Ancho total para Letter Landscape (aprox 279mm)
    
    return `
    <div style="background: white; color: black; ${fontFamily} width: 100%; box-sizing: border-box;">
        
        <!-- ================= PÁGINA 1: PORTADA ================= -->
        <div class="page-1" style="width: 279mm; height: 215mm; padding: 12mm 15mm; position: relative; box-sizing: border-box; display: flex; flex-direction: column;">
            
            <!-- Encabezado Portada -->
            <div style="text-align: center; margin-bottom: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                    <img src="${logoEscudo}" style="height: 75px; width: auto;">
                    <div style="margin-top: 5px; flex: 1; text-align: center;">
                        <h4 style="margin: 0; font-size: 13px; font-weight: bold; color: #000;">GOBIERNO DE LA</h4>
                        <h2 style="margin: 2px 0; font-size: 19px; font-weight: bold; color: #000;">REPÚBLICA DOMINICANA</h2>
                        <h1 style="margin: 3px 0; font-size: 28px; font-weight: bold; color: #002e5f; letter-spacing: 0.5px;">EDUCACIÓN</h1>
                        <p style="margin: 8px 0 0 0; font-size: 10px; color: #000;">Viceministerio de Servicios Técnicos y Pedagógicos</p>
                        <p style="margin: 0; font-size: 10px; color: #000;">Dirección General de Educación Secundaria</p>
                    </div>
                    <img src="${logoMinerd}" style="height: 75px; width: auto;">
                </div>
                
                <div style="border-top: 2px solid #002e5f; border-bottom: 2px solid #002e5f; padding: 8px 0; margin-top: 15px; margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: bold; color: #002e5f; letter-spacing: 0.5px;">BOLETÍN DE CALIFICACIONES</h1>
                    <div style="display: flex; justify-content: center; align-items: baseline; gap: 40px; margin-top: 6px; font-size: 12px; font-weight: bold; color: #000;">
                        <span>Grado: <span style="border-bottom: 1px solid black; padding: 0 15px; display: inline-block; min-width: 30px;">${course.nombre.replace(/[^0-9]/g, '')}no</span></span>
                        <span>SEGUNDO CICLO</span>
                        <span>NIVEL SECUNDARIO</span>
                    </div>
                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #000;">Año escolar: <span style="border-bottom: 1px solid black; padding: 0 5px;">20${yearFrom.slice(-2)}</span> - <span style="border-bottom: 1px solid black; padding: 0 5px;">20${yearTo.slice(-2)}</span></p>
                </div>
            </div>

            <!-- Datos Informativos (Grid 2 Columnas) -->
            <div style="display: flex; gap: 50px; font-size: 11px; margin-bottom: 20px; color: #000;">
                <!-- Columna Izquierda -->
                <div style="flex: 1;">
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 50px; font-weight:bold;">Sección:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">U</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 95px; font-weight:bold;">Número de orden:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${student.numero_orden || ''}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 65px; font-weight:bold;">Nombre (s):</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${student.nombre.split(' ')[0]}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 65px; font-weight:bold;">Apellido (s):</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${student.nombre.split(' ').slice(1).join(' ')}</div>
                    </div>
                    <div style="margin-bottom: 6px;">
                        <div style="font-weight:bold; margin-bottom: 2px;">ID estudiante (Número de identificación SIGERD):</div>
                        <div style="border-bottom: 1px solid black; width: 100%; height: 16px; padding-left: 5px;">${student.id}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 50px; font-weight:bold;">Docente:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${course.titular_email.split('@')[0]}</div>
                    </div>
                </div>

                <!-- Columna Derecha -->
                <div style="flex: 1;">
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 95px; font-weight:bold;">Centro educativo:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.nombre}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 95px; font-weight:bold;">Código del centro:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.codigo}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 40px; font-weight:bold;">Tanda:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.tanda}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 105px; font-weight:bold;">Teléfono del centro:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">-</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 95px; font-weight:bold;">Distrito educativo:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.distrito}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 120px; font-weight:bold;">Regional de educación:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.regional}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 55px; font-weight:bold;">Provincia:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.provincia}</div>
                    </div>
                    <div style="display:flex; align-items:flex-end; margin-bottom: 6px;">
                        <div style="width: 55px; font-weight:bold;">Municipio:</div>
                        <div style="border-bottom: 1px solid black; flex:1; padding-left: 5px;">${SCHOOL_INFO.municipio}</div>
                    </div>
                </div>
            </div>

            <!-- Tabla de Firmas (Footer Página 1) -->
            <div style="margin-top: auto;">
                <p style="text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 5px; color: #000;">FIRMA DEL PADRE, MADRE O TUTOR</p>
                <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 10px; border: 1px solid black; color: #000;">
                    <thead>
                        <tr>
                            <th style="${border} padding: 5px; width: 20%; font-weight:bold; background-color:#f2f2f2;">Períodos de Reportes de Calificaciones</th>
                            <th style="${border} padding: 5px; width: 20%; font-weight:bold; background-color:#f2f2f2;">Ago-Sept-Oct</th>
                            <th style="${border} padding: 5px; width: 20%; font-weight:bold; background-color:#f2f2f2;">Nov-Dic-Ene</th>
                            <th style="${border} padding: 5px; width: 20%; font-weight:bold; background-color:#f2f2f2;">Feb-Mar</th>
                            <th style="${border} padding: 5px; width: 20%; font-weight:bold; background-color:#f2f2f2;">Abr-May-Jun</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="${border} height: 45px;"></td>
                            <td style="${border}"></td>
                            <td style="${border}"></td>
                            <td style="${border}"></td>
                            <td style="${border}"></td>
                        </tr>
                    </tbody>
                </table>
                <div style="margin-top: 15px; font-size: 11px; color: #000;">
                    <span style="font-weight:bold;">Observaciones:</span>
                    <div style="border-bottom: 1px solid black; margin-top: 20px; width: 100%;"></div>
                    <div style="border-bottom: 1px solid black; margin-top: 20px; width: 100%;"></div>
                </div>
            </div>
        </div>

        <!-- SALTO DE PÁGINA -->
        <div class="page-break"></div>

        <!-- ================= PÁGINA 2: SÁBANA DE CALIFICACIONES ================= -->
        <div class="page-2" style="width: 279mm; height: 215mm; padding: 10mm 5mm; box-sizing: border-box; position: relative; display: flex; flex-direction: column;">
            
            <!-- Tabla Principal Sábana -->
            <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center; border: 1px solid black; color: black;">
                <thead>
                    <!-- Fila 1: Títulos Superiores -->
                    <tr style="height: 40px;">
                        <th rowspan="2" style="${border} width: 120px; font-size: 9px;">COMPETENCIAS<br>FUNDAMENTALES<br><br>ÁREAS<br>CURRICULARES</th>
                        
                        <!-- Colores Oficiales Exactos del PDF -->
                        <th colspan="4" style="${border} background-color: #FCE4D6; vertical-align: middle;">Comunicativa</th>
                        <th colspan="4" style="${border} background-color: #E2EFDA; vertical-align: middle;">Pensamiento Lógico,<br>Creativo y Crítico;<br>Resolución de Problemas</th>
                        <th colspan="4" style="${border} background-color: #DDEBF7; vertical-align: middle;">Científica y<br>Tecnológica;<br>Ambiental y de la Salud</th>
                        <th colspan="4" style="${border} background-color: #FFF2CC; vertical-align: middle;">Ética y Ciudadana;<br>Desarrollo Personal<br>y Espiritual</th>
                        
                        <th rowspan="2" style="${border} width: 40px; background-color: #EDEDED; font-size: 7.5px; vertical-align:middle; padding: 2px;">PROMEDIO GRUPO<br>DE COMPETENCIAS<br>ESPECÍFICAS<br>(C.F.)</th>
                        
                        <!-- Recuperación -->
                        <th colspan="3" style="${border} background-color: #EDEDED; font-size: 7px; vertical-align:middle;">CALIFICACIÓN<br>COMPLETIVA</th>
                        <th colspan="3" style="${border} background-color: #EDEDED; font-size: 7px; vertical-align:middle;">CALIFICACIÓN<br>EXTRAORDINARIA</th>
                        <th rowspan="2" style="${border} width: 25px; background-color: #EDEDED; font-size: 7px; vertical-align:middle;">EVALUACIÓN<br>ESPECIAL<br>(C.E.)</th>
                        
                        <th colspan="2" style="${border} font-size: 7px; vertical-align:middle;">SITUACIÓN<br>FINAL EN LA<br>ASIGNATURA</th>
                    </tr>
                    
                    <!-- Fila 2: Periodos y Porcentajes -->
                    <tr style="height: 25px; font-weight: bold; font-size: 8px;">
                        <!-- Periodos -->
                        <th style="${border} width: 20px;">P1</th><th style="${border} width: 20px;">P2</th><th style="${border} width: 20px;">P3</th><th style="${border} width: 20px;">P4</th>
                        <th style="${border} width: 20px;">P1</th><th style="${border} width: 20px;">P2</th><th style="${border} width: 20px;">P3</th><th style="${border} width: 20px;">P4</th>
                        <th style="${border} width: 20px;">P1</th><th style="${border} width: 20px;">P2</th><th style="${border} width: 20px;">P3</th><th style="${border} width: 20px;">P4</th>
                        <th style="${border} width: 20px;">P1</th><th style="${border} width: 20px;">P2</th><th style="${border} width: 20px;">P3</th><th style="${border} width: 20px;">P4</th>
                        
                        <!-- Completiva -->
                        <th style="${border} width: 25px; font-size: 7px;">50%<br>C.P.C.</th>
                        <th style="${border} width: 25px; font-size: 7px;">50%<br>C.E.C.</th>
                        <th style="${border} width: 25px; font-size: 7px;">C.C.F.</th>
                        
                        <!-- Extraordinaria -->
                        <th style="${border} width: 25px; font-size: 7px;">30%<br>C.P.C.</th>
                        <th style="${border} width: 25px; font-size: 7px;">70%<br>C.E.EX.</th>
                        <th style="${border} width: 25px; font-size: 7px;">C.EX.F.</th>
                        
                        <th style="${border} width: 15px;">A</th>
                        <th style="${border} width: 15px;">R</th>
                    </tr>
                </thead>
                <tbody>
                    ${materiasRows}
                </tbody>
            </table>

            <!-- Pie de Página 2 (Resumen y Firmas) -->
            <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-start; padding-top: 5px;">
                
                <!-- Columna 1: Info + Asistencia -->
                <div style="width: 35%; font-size: 10px; color: black;">
                    <div style="margin-bottom: 4px;"><strong>Nombre(s) y apellido (s):</strong> ${student.nombre}</div>
                    <div style="margin-bottom: 8px;"><strong>Grado:</strong> ${course.nombre.replace(/[^0-9]/g, '')}no &nbsp;&nbsp; <strong>Sección:</strong> U</div>
                    
                    <div style="${fontBold} font-size: 9px; margin-bottom: 3px; text-decoration: underline;">CALIFICACIONES DE RENDIMIENTO</div>
                    <div style="font-size: 9px; margin-bottom: 3px;">RESUMEN DE ASISTENCIA DEL/LA ESTUDIANTE</div>
                    
                    <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center; border: 1px solid black;">
                        <thead>
                            <tr>
                                <th style="${border} width: 25%;">Períodos</th>
                                <th style="${border} width: 25%;">Asistencia</th>
                                <th style="${border} width: 25%;">Ausencia</th>
                                <th style="${border} width: 25%;">% de Asistencia<br>Anual</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="${border}">P1</td><td style="${border}">-</td><td style="${border}">-</td><td rowspan="4" style="${border} ${fontBold} font-size: 12px; vertical-align: middle;">${asistencia}%</td></tr>
                            <tr><td style="${border}">P2</td><td style="${border}">-</td><td style="${border}">-</td></tr>
                            <tr><td style="${border}">P3</td><td style="${border}">-</td><td style="${border}">-</td></tr>
                            <tr><td style="${border}">P4</td><td style="${border}">-</td><td style="${border}">-</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Columna 2: Leyenda -->
                <div style="width: 35%; font-size: 8px; line-height: 1.3; padding: 0 10px; color: black;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 3px;">
                        <span><strong>(P1)</strong> Período 1</span><span><strong>(P2)</strong> Período 2</span>
                        <span><strong>(P3)</strong> Período 3</span><span><strong>(P4)</strong> Período 4</span>
                    </div>
                    <p style="margin: 1px 0;"><strong>(PC)</strong> Promedio Grupo de Competencias Específicas</p>
                    <p style="margin: 1px 0;"><strong>(C.F.)</strong> Calificación Final</p>
                    <p style="margin: 1px 0;"><strong>(C.E.C.)</strong> Calificación Evaluación Completiva</p>
                    <p style="margin: 1px 0;"><strong>(C.C.F.)</strong> Calificación Completiva Final</p>
                    <p style="margin: 1px 0;"><strong>(C.E.EX.)</strong> Calificación Evaluación Extraordinaria</p>
                    <p style="margin: 1px 0;"><strong>(C.EX.F.)</strong> Calificación Extraordinaria Final</p>
                    <p style="margin: 1px 0;"><strong>(C.E.)</strong> Calificación Especial</p>
                    <div style="margin-top: 2px;">
                        <span style="margin-right: 10px;"><strong>(A)</strong> Aprobado</span>
                        <span><strong>(R)</strong> Reprobado</span>
                    </div>
                </div>

                <!-- Columna 3: Condición y Firmas -->
                <div style="width: 30%; font-size: 9px; color: black;">
                    <div style="border: 1px solid black; padding: 4px; margin-bottom: 10px;">
                        <div style="text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 3px; font-weight: bold;">LEYENDA:</div>
                        <div style="font-weight: bold;">SITUACIÓN DEL/DE LA ESTUDIANTE:</div>
                        <div style="margin-top: 3px;">
                            ${situacionFinal === 'PROMOVIDO' ? '☑' : '☐'} Promovido/a<br>
                            ${situacionFinal !== 'PROMOVIDO' ? '☑' : '☐'} Repitente
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="font-weight: bold;">CONDICIÓN FINAL DEL/DE LA ESTUDIANTE:</div>
                        <div style="border-bottom: 1px solid black; height: 16px; text-align: center; font-weight: bold; margin-top: 2px;">${situacionFinal}</div>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="border-bottom: 1px solid black; height: 10px; width: 100%;"></div>
                        <div style="font-size: 8px; margin-bottom: 15px;">Maestro(a) encargado(a) del grado</div>
                        
                        <div style="border-bottom: 1px solid black; height: 10px; width: 100%;"></div>
                        <div style="font-size: 8px;">Director(a) del Centro Educativo</div>
                    </div>
                </div>
            </div>

        </div>
    </div>`;
}

// ==========================================
// LOGICA DE FILAS (SÁBANA HORIZONTAL)
// ==========================================
function getMateriasRowsOficial(course, student) {
    let html = '';
    const todasMaterias = [...new Set([...course.materias || []])];
    if (todasMaterias.length === 0) AREAS_CURRICULARES.forEach(m => todasMaterias.push(m));

    // Añadir OPTATIVA / SALIDA al final
    if (!todasMaterias.includes("OPTATIVA")) todasMaterias.push("OPTATIVA");
    if (!todasMaterias.includes("SALIDA")) todasMaterias.push("SALIDA");

    todasMaterias.forEach((materia, idx) => {
        let sumPeriods = 0;
        let countPeriods = 0;
        PERIODOS_KEYS.forEach(p => {
            const pd = getPeriodDetails(course, student, materia, p);
            if (pd.hasData) { sumPeriods += pd.promedio; countPeriods++; }
        });
        
        const cf = countPeriods > 0 ? Math.round(sumPeriods / countPeriods) : null;
        const rec = calculateRecuperacion(course, student, materia, cf);
        const isAprobado = checkAprobado(cf, rec);
        const f = (val) => (val !== null && val !== undefined && val !== '-' && !isNaN(val)) ? val : '';

        // Altura fija de fila para compactar (18px)
        const rowStyle = "height: 18px;"; 
        const border = "border: 1px solid black; padding: 0 2px;";

        html += `<tr style="${rowStyle}">
            <td style="${border} text-align: left; font-weight: bold; font-size: 8px;">${materia}</td>`;

        // 4 Competencias x 4 Periodos = 16 Celdas
        COMPETENCIAS_KEYS.forEach(comp => {
            PERIODOS_KEYS.forEach(per => {
                const val = calculateCompetenceSpecific(course, student, materia, per, comp);
                const color = (val !== null && val < 70) ? 'color: red;' : '';
                html += `<td style="${border} ${color}">${f(val)}</td>`;
            });
        });

        // C.F.
        const cfColor = (cf !== null && cf < 70) ? 'color: red;' : '';
        html += `<td style="${border} font-weight: bold; background-color: #EDEDED; ${cfColor}">${f(cf)}</td>`;

        // Recuperación
        html += `<td style="${border} font-size: 8px;">${f(rec.cc_50_cpc)}</td>
                 <td style="${border} font-size: 8px;">${f(rec.cc_50_pe)}</td>
                 <td style="${border} font-weight: bold; background-color: #F3F3F3;">${f(rec.cc_final)}</td>`;

        html += `<td style="${border} font-size: 8px;">${f(rec.ce_30_cpc)}</td>
                 <td style="${border} font-size: 8px;">${f(rec.ce_70_pe)}</td>
                 <td style="${border} font-weight: bold; background-color: #F3F3F3;">${f(rec.ce_final)}</td>`;

        html += `<td style="${border} background-color: #EDEDED;">${f(rec.ee_final)}</td>`;

        // A / R
        html += `<td style="${border}">${isAprobado ? 'A' : ''}</td>
                 <td style="${border}">${!isAprobado && cf !== null ? 'R' : ''}</td>`;

        html += `</tr>`;
    });
    return html;
}

// Funciones de Cálculo (Igual que antes)
function calculateCompetenceSpecific(course, student, materia, period, compKey) {
    if (materia === "OPTATIVA" || materia === "SALIDA") return null; 
    const acts = (course.actividades || {})[materia] || [];
    const studentNotas = (student.notas && student.notas[materia]) ? student.notas[materia] : {};
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
    if (simpleCount > 0) return Math.round(simpleSum / simpleCount);
    return null;
}

function calculateRecuperacion(course, student, materia, cf) {
    const result = { cc_50_cpc: '-', cc_50_pe: '-', cc_final: '-', ce_30_cpc: '-', ce_70_pe: '-', ce_final: '-', ee_final: '-' };
    if (cf === null || materia === "OPTATIVA" || materia === "SALIDA") return result;
    if (cf >= 70) return result;

    const notas = (student.notas && student.notas[materia]) ? student.notas[materia] : {};
    const acts = (course.actividades || {})[materia] || [];
    const actCC = acts.find(a => a.tipo === 'completiva') || { nombre: 'Examen Completivo' };
    const actCE = acts.find(a => a.tipo === 'extraordinaria') || { nombre: 'Examen Extraordinario' };
    const actEE = acts.find(a => a.tipo === 'especial') || { nombre: 'Evaluación Especial' };

    const nCC = parseFloat(notas[actCC.nombre] || 0);
    const nCE = parseFloat(notas[actCE.nombre] || 0);
    const nEE = parseFloat(notas[actEE.nombre] || 0);

    result.cc_50_cpc = Math.round(cf * 0.5);
    result.cc_50_pe = Math.round(nCC * 0.5);
    result.cc_final = result.cc_50_cpc + result.cc_50_pe;
    if (result.cc_final >= 70) return result;

    result.ce_30_cpc = Math.round(cf * 0.3);
    result.ce_70_pe = Math.round(nCE * 0.7);
    result.ce_final = result.ce_30_cpc + result.ce_70_pe;
    if (result.ce_final >= 70) return result;

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

function getPeriodDetails(course, student, subjectName, period) {
    if (subjectName === "OPTATIVA" || subjectName === "SALIDA") return { promedio: null, hasData: false };
    let sum = 0;
    let count = 0;
    COMPETENCIAS_KEYS.forEach(k => {
        const val = calculateCompetenceSpecific(course, student, subjectName, period, k);
        if (val !== null) { sum += val; count++; }
    });
    if (count === 0) return { promedio: null, hasData: false };
    return { promedio: Math.round(sum / 4), hasData: true };
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
        let suma = 0, count = 0;
        PERIODOS_KEYS.forEach(p => {
            const d = getPeriodDetails(course, student, materia, p);
            if (d.hasData) { suma += d.promedio; count++; }
        });
        let cf = count > 0 ? Math.round(suma / count) : 0;
        if (count === 0) cf = 100;
        const rec = calculateRecuperacion(course, student, materia, cf);
        if (!checkAprobado(cf, rec)) reprobadas++;
    });
    return reprobadas;
}