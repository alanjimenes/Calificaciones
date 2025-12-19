// boletin.js - Sistema de generaciÃ³n de boletines oficiales
import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';

let allCourses = [];
let selectedCourseData = null;
let selectedStudentData = null;

const AREAS_CURRICULARES = [
    'Lengua EspaÃ±ola',
    'Lenguas Extranjeras (inglÃ©s)',
    'Lenguas Extranjeras (FrancÃ©s)',
    'MatemÃ¡tica',
    'Ciencias Sociales',
    'Ciencias de la Naturaleza',
    'EducaciÃ³n ArtÃ­stica',
    'EducaciÃ³n FÃ­sica',
    'FormaciÃ³n Integral Humana y Religiosa'
];

// Esperar a que el usuario estÃ© listo
window.addEventListener('userReady', async (e) => {
    const { role, email } = e.detail;
    document.getElementById('main-body').classList.remove('opacity-0');
    await loadCourses(role === 'admin', email);
});

// Cargar cursos disponibles
async function loadCourses(isAdmin, userEmail) {
    const selectCourse = document.getElementById('select-course');
    
    try {
        const q = query(collection(db, "cursos_globales"));
        const snapshot = await getDocs(q);
        
        selectCourse.innerHTML = '<option value="">Selecciona un curso...</option>';
        allCourses = [];
        
        snapshot.forEach(docSnap => {
            const course = docSnap.data();
            course.id = docSnap.id;
            
            // Filtrar por permisos
            const isTitular = (course.titular_email === userEmail);
            if (isAdmin || isTitular) {
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
                await loadStudents(courseId);
            }
        });
        
    } catch (error) {
        console.error("Error cargando cursos:", error);
    }
}

// Cargar estudiantes del curso
async function loadStudents(courseId) {
    const selectStudent = document.getElementById('select-student');
    selectStudent.innerHTML = '<option value="">Selecciona un estudiante...</option>';
    
    if (!selectedCourseData || !selectedCourseData.estudiantes) {
        return;
    }
    
    selectedCourseData.estudiantes.forEach((student, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${student.nombre} (${student.id})`;
        selectStudent.appendChild(option);
    });
    
    selectStudent.addEventListener('change', (e) => {
        const studentIndex = e.target.value;
        if (studentIndex !== "") {
            selectedStudentData = selectedCourseData.estudiantes[studentIndex];
        }
    });
}

// Generar el boletÃ­n
window.generateBoletin = function() {
    if (!selectedCourseData || !selectedStudentData) {
        alert("Por favor selecciona un curso y un estudiante");
        return;
    }
    
    const yearFrom = document.getElementById('year-from').value || '2024';
    const yearTo = document.getElementById('year-to').value || '2025';
    
    const boletinHTML = createBoletinHTML(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    document.getElementById('boletin-preview').innerHTML = boletinHTML;
}

// Crear HTML del boletÃ­n oficial
function createBoletinHTML(course, student, yearFrom, yearTo) {
    // Calcular promedios por Ã¡rea
    const gradeSummary = calculateGradeSummary(course, student);
    const attendanceSummary = calculateAttendanceSummary(course, student);
    
    return `
        <div style="font-family: Arial, sans-serif; font-size: 12px; color: #000;">
            
            <!-- ENCABEZADO -->
            <div style="text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;">
                <div style="font-size: 10px; margin-bottom: 5px;">
                    <strong>Viceministro de Servicios TÃ©cnicos y PedagÃ³gicos</strong><br>
                    <strong>DirecciÃ³n General de EducaciÃ³n Secundaria</strong>
                </div>
                <h1 style="font-size: 18px; margin: 10px 0; font-weight: bold;">BOLETÃN DE CALIFICACIONES</h1>
                <div style="font-size: 11px;">
                    AÃ±o escolar: 20<u>${yearFrom}</u> &nbsp;&nbsp; 20<u>${yearTo}</u>
                </div>
            </div>

            <!-- INFORMACIÃ“N DEL ESTUDIANTE -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <tr>
                    <td style="padding: 3px; font-size: 10px;"><strong>SecciÃ³n:</strong> ${course.nombre}</td>
                    <td style="padding: 3px; font-size: 10px;"><strong>NÃºmero de orden:</strong> ${student.id}</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 3px; font-size: 10px;"><strong>Nombre(s) y Apellido(s):</strong> ${student.nombre}</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 3px; font-size: 10px;"><strong>ID estudiante (SIGERD):</strong> ${student.id}</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 3px; font-size: 10px;"><strong>Centro educativo:</strong> ________________________________</td>
                </tr>
                <tr>
                    <td style="padding: 3px; font-size: 10px;"><strong>CÃ³digo del centro:</strong> _____________</td>
                    <td style="padding: 3px; font-size: 10px;"><strong>Tanda:</strong> _____________</td>
                </tr>
                <tr>
                    <td style="padding: 3px; font-size: 10px;"><strong>Distrito educativo:</strong> _____________</td>
                    <td style="padding: 3px; font-size: 10px;"><strong>Regional:</strong> _____________</td>
                </tr>
            </table>

            <!-- TABLA DE CALIFICACIONES -->
            <table class="boletin-table" style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <thead>
                    <tr style="background-color: #e0e0e0;">
                        <th rowspan="3" style="width: 20%; vertical-align: middle;">ÃREAS CURRICULARES</th>
                        <th colspan="4" style="text-align: center;">PROMEDIO GRUPO DE COMPETENCIAS ESPECÃFICAS</th>
                        <th rowspan="2" colspan="2" style="text-align: center;">CALIFICACIÃ“N<br>FINAL DEL ÃREA</th>
                        <th rowspan="3" style="width: 8%;">SITUACIÃ“N FINAL</th>
                    </tr>
                    <tr style="background-color: #e0e0e0;">
                        <th>P1</th>
                        <th>P2</th>
                        <th>P3</th>
                        <th>P4</th>
                    </tr>
                    <tr style="background-color: #e0e0e0;">
                        <th colspan="4" style="text-align: center;">PC1-PC2-PC3-PC4</th>
                        <th>C.F.</th>
                        <th>50%</th>
                    </tr>
                </thead>
                <tbody>
                    ${AREAS_CURRICULARES.map(area => {
                        const grades = gradeSummary[area] || { p1: '', p2: '', p3: '', p4: '', promedio: '', situacion: '' };
                        return `
                            <tr>
                                <td style="font-weight: bold;">${area}</td>
                                <td style="text-align: center;">${grades.p1}</td>
                                <td style="text-align: center;">${grades.p2}</td>
                                <td style="text-align: center;">${grades.p3}</td>
                                <td style="text-align: center;">${grades.p4}</td>
                                <td style="text-align: center; font-weight: bold;">${grades.promedio}</td>
                                <td style="text-align: center;">50%</td>
                                <td style="text-align: center; font-weight: bold;">${grades.situacion}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- TABLA DE ASISTENCIA -->
            <table class="boletin-table" style="width: 50%; border-collapse: collapse; margin-bottom: 15px;">
                <thead>
                    <tr style="background-color: #e0e0e0;">
                        <th colspan="4" style="text-align: center;">RESUMEN DE ASISTENCIA</th>
                    </tr>
                    <tr style="background-color: #e0e0e0;">
                        <th>PerÃ­odo</th>
                        <th>Asistencia</th>
                        <th>Ausencia</th>
                        <th>% Asist.</th>
                    </tr>
                </thead>
                <tbody>
                    ${['P1', 'P2', 'P3', 'P4'].map(period => {
                        const att = attendanceSummary[period] || { asistencia: 0, ausencia: 0, porcentaje: '0%' };
                        return `
                            <tr>
                                <td style="text-align: center; font-weight: bold;">${period}</td>
                                <td style="text-align: center;">${att.asistencia}</td>
                                <td style="text-align: center;">${att.ausencia}</td>
                                <td style="text-align: center;">${att.porcentaje}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- LEYENDA -->
            <div style="font-size: 9px; border: 1px solid #000; padding: 8px; margin-bottom: 15px;">
                <strong>LEYENDA:</strong><br>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-top: 5px;">
                    <div>(P1-P4) PerÃ­odo 1-4</div>
                    <div>(C.F.) CalificaciÃ³n Final</div>
                    <div>(A) Aprobado</div>
                    <div>(PC) Promedio Competencias</div>
                    <div>(C.E.C.) Cal. Completiva</div>
                    <div>(R) Reprobado</div>
                </div>
            </div>

            <!-- OBSERVACIONES -->
            <div style="border: 1px solid #000; padding: 10px; min-height: 80px; margin-bottom: 15px;">
                <strong style="font-size: 11px;">Observaciones:</strong>
                <div style="margin-top: 5px; line-height: 1.6;">
                    _________________________________________________________________<br>
                    _________________________________________________________________<br>
                    _________________________________________________________________
                </div>
            </div>

            <!-- PIE DE PÃGINA -->
            <div style="margin-top: 30px;">
                <table style="width: 100%; font-size: 10px;">
                    <tr>
                        <td style="text-align: center; border-top: 1px solid #000; padding-top: 5px;">
                            Maestro(a) Encargado(a) del Grado
                        </td>
                        <td style="width: 50px;"></td>
                        <td style="text-align: center; border-top: 1px solid #000; padding-top: 5px;">
                            Director(a) del Centro Educativo
                        </td>
                    </tr>
                </table>
                
                <div style="margin-top: 20px; text-align: center;">
                    <div style="border-top: 1px solid #000; display: inline-block; width: 40%; padding-top: 5px;">
                        FIRMA DEL PADRE, MADRE O TUTOR
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 20px; text-align: center; font-size: 9px; color: #666;">
                Generado por EduSys - ${new Date().toLocaleDateString('es-DO')}
            </div>

        </div>
    `;
}

// Calcular promedios por Ã¡rea curricular
function calculateGradeSummary(course, student) {
    const summary = {};
    const notas = student.notas || {};
    const materias = course.materias || [];
    const actividades = course.actividades || {};
    
    // Mapear cada materia del curso a un Ã¡rea curricular
    materias.forEach(materia => {
        // Buscar Ã¡rea curricular correspondiente (puedes personalizar este mapeo)
        let area = matchAreaCurricular(materia);
        
        if (!summary[area]) {
            summary[area] = { p1: '', p2: '', p3: '', p4: '', promedio: '', situacion: '' };
        }
        
        const notasMateria = notas[materia] || {};
        const actividadesMateria = actividades[materia] || [];
        
        // Calcular promedios por perÃ­odo
        ['p1', 'p2', 'p3', 'p4'].forEach(periodo => {
            const actPeriodo = actividadesMateria.filter(a => (a.periodo || 'p1') === periodo);
            if (actPeriodo.length > 0) {
                let sum = 0, count = 0;
                actPeriodo.forEach(act => {
                    const nota = notasMateria[act.nombre];
                    if (nota !== undefined && nota !== '') {
                        sum += parseFloat(nota);
                        count++;
                    }
                });
                if (count > 0) {
                    summary[area][periodo] = Math.round(sum / count);
                }
            }
        });
        
        // Calcular promedio general
        const promedios = [summary[area].p1, summary[area].p2, summary[area].p3, summary[area].p4]
            .filter(p => p !== '');
        
        if (promedios.length > 0) {
            const avg = Math.round(promedios.reduce((a, b) => a + b, 0) / promedios.length);
            summary[area].promedio = avg;
            summary[area].situacion = avg >= 70 ? 'A' : 'R';
        }
    });
    
    return summary;
}

// Mapear materias a Ã¡reas curriculares oficiales
function matchAreaCurricular(materia) {
    const lower = materia.toLowerCase();
    
    if (lower.includes('espaÃ±ol') || lower.includes('lengua')) return 'Lengua EspaÃ±ola';
    if (lower.includes('inglÃ©s') || lower.includes('ingles')) return 'Lenguas Extranjeras (inglÃ©s)';
    if (lower.includes('francÃ©s') || lower.includes('frances')) return 'Lenguas Extranjeras (FrancÃ©s)';
    if (lower.includes('matemÃ¡tica') || lower.includes('matematica')) return 'MatemÃ¡tica';
    if (lower.includes('social') || lower.includes('historia') || lower.includes('geografÃ­a')) return 'Ciencias Sociales';
    if (lower.includes('naturaleza') || lower.includes('biologÃ­a') || lower.includes('fÃ­sica') || lower.includes('quÃ­mica')) return 'Ciencias de la Naturaleza';
    if (lower.includes('artÃ­stica') || lower.includes('arte') || lower.includes('mÃºsica')) return 'EducaciÃ³n ArtÃ­stica';
    if (lower.includes('fÃ­sica ed') || lower.includes('deporte')) return 'EducaciÃ³n FÃ­sica';
    if (lower.includes('religiÃ³n') || lower.includes('Ã©tica') || lower.includes('moral')) return 'FormaciÃ³n Integral Humana y Religiosa';
    
    // Por defecto
    return 'Lengua EspaÃ±ola';
}

// Calcular resumen de asistencia
function calculateAttendanceSummary(course, student) {
    const summary = {};
    const asistencia = student.asistencia || {};
    const materias = course.materias || [];
    
    // Inicializar perÃ­odos
    ['P1', 'P2', 'P3', 'P4'].forEach(p => {
        summary[p] = { asistencia: 0, ausencia: 0, porcentaje: '0%' };
    });
    
    // Procesar asistencia de todas las materias
    materias.forEach(materia => {
        const asistenciaMateria = asistencia[materia] || {};
        
        Object.entries(asistenciaMateria).forEach(([fecha, estado]) => {
            const mes = parseInt(fecha.split('-')[1]);
            let periodo = 'P1';
            
            // Mapear mes a perÃ­odo (ajustar segÃºn calendario escolar)
            if (mes >= 8 && mes <= 10) periodo = 'P1';
            else if (mes >= 11 || mes <= 1) periodo = 'P2';
            else if (mes >= 2 && mes <= 3) periodo = 'P3';
            else if (mes >= 4 && mes <= 6) periodo = 'P4';
            
            if (estado === 'P') summary[periodo].asistencia++;
            else if (estado === 'A') summary[periodo].ausencia++;
        });
    });
    
    // Calcular porcentajes
    Object.keys(summary).forEach(periodo => {
        const total = summary[periodo].asistencia + summary[periodo].ausencia;
        if (total > 0) {
            const pct = Math.round((summary[periodo].asistencia / total) * 100);
            summary[periodo].porcentaje = pct + '%';
        }
    });
    
    return summary;
}