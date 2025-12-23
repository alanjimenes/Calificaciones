import { db, collection, getDocs, doc, getDoc, query } from './firebase-config.js';
// Importamos PDF-Lib desde un CDN
import { PDFDocument, rgb, StandardFonts } from 'https://cdn.skypack.dev/pdf-lib';

// --- CONFIGURACIÓN DEL CENTRO EDUCATIVO ---
const SCHOOL_INFO = {
    nombre: "CENTRO EDUCATIVO EJEMPLO",
    codigo: "12345",
    tanda: "JORNADA ESCOLAR EXTENDIDA",
    distrito: "10-01",
    regional: "10",
    provincia: "Santo Domingo",
    municipio: "Santo Domingo Este",
    telefono: "809-555-0000"
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

// --- CONFIGURACIÓN DE COORDENADAS (PÁGINA 2 - CALIFICACIONES) ---
// Referencia: español x170 y460
const Y_START = 460;
const Y_GAP = 25;

const MATERIAS_Y_COORDS = {
    'Lengua Española': Y_START,
    'Lenguas Extranjeras (Inglés)': Y_START - (Y_GAP * 1),
    'Lenguas Extranjeras (Francés)': Y_START - (Y_GAP * 2),
    'Matemática': Y_START - (Y_GAP * 3),
    'Ciencias Sociales': Y_START - (Y_GAP * 4),
    'Ciencias de la Naturaleza': Y_START - (Y_GAP * 5),
    'Educación Artística': Y_START - (Y_GAP * 6),
    'Educación Física': Y_START - (Y_GAP * 7),
    'Formación Integral Humana y Religiosa': Y_START - (Y_GAP * 8),
    'OPTATIVA': Y_START - (Y_GAP * 9),
    'SALIDA': Y_START - (Y_GAP * 10)
};

// X=170 para la primera nota (C1-P1), sumando 25px por cada columna.
const X_START = 170;
const X_GAP = 25; 

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

    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 9999;";
        document.body.appendChild(container);
    }

    await loadCourses(role === 'admin' || role === 'secretaria', email);
});

// --- HELPER: OBTENER URL DE PLANTILLA SEGÚN NOMBRE DEL CURSO ---
function getTemplateUrl(courseName) {
    const name = (courseName || '').toLowerCase().trim();
    
    // Nombres exactos de los archivos en la carpeta assets (ruta relativa desde el HTML)
    const FILE_5TO = 'Boletin-de-calificaciones-5to-grado-NS_110723.pdf';
    const FILE_6TO = 'Boletin-de-calificaciones-6to-grado-NS_110723.pdf';

    // Lógica robusta para detectar 5to
    // Busca el número "5" o la palabra "quinto"
    if (name.includes('5') || name.includes('quinto')) {
        return `assets/${FILE_5TO}`;
    }
    
    // Si no es 5to, asumimos 6to por defecto (o agregamos más lógica si hay más grados)
    return `assets/${FILE_6TO}`;
}

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
                
                // --- CAMBIO DINÁMICO DE PLANTILLA ---
                const templateUrl = getTemplateUrl(selectedCourseData.nombre);
                console.log(`Detectado curso: "${selectedCourseData.nombre}". Cargando plantilla: ${templateUrl}`);
                
                const container = document.getElementById('boletin-preview');
                
                // Usamos fetch con timestamp para evitar caché
                try {
                    // Verificamos si existe el archivo
                    const response = await fetch(templateUrl, { method: 'HEAD' });
                    if (response.ok) {
                        // Agregamos timestamp para forzar recarga
                        const urlWithTime = `${templateUrl}?t=${Date.now()}`;
                        container.innerHTML = `<iframe src="${urlWithTime}" style="width: 100%; height: 600px; border: none; border-radius: 8px;"></iframe>`;
                        container.style.opacity = '1';
                    } else {
                        console.error(`Archivo no encontrado: ${templateUrl}`);
                        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-danger p-4 border-2 border-danger/20 rounded-xl bg-danger/5">
                            <span class="material-symbols-outlined text-4xl mb-2">error</span>
                            <p class="font-bold">Plantilla no encontrada</p>
                            <p class="text-xs mt-1">Se intentó cargar: ${templateUrl}</p>
                            <p class="text-xs">Verifica que el archivo esté en la carpeta 'assets'.</p>
                        </div>`;
                    }
                } catch (err) {
                    // Fallback directo
                    container.innerHTML = `<iframe src="${templateUrl}" style="width: 100%; height: 600px; border: none; border-radius: 8px;"></iframe>`;
                    container.style.opacity = '1';
                }

                if (window.showToast) window.showToast("Cargando estudiantes...", "info");
                await loadStudents(courseId);
            } else {
                selectedCourseData = null;
                selectedStudentData = null;
                selectStudent.innerHTML = '<option value="">Primero elige un curso</option>';
                selectStudent.disabled = true;
                
                // Resetear preview
                const container = document.getElementById('boletin-preview');
                container.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-10 m-8 min-h-[500px]">
                        <div class="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                            <span class="material-symbols-outlined text-5xl text-gray-300">description</span>
                        </div>
                        <h3 class="text-xl font-bold text-gray-700 mb-2">Vista Previa del Documento</h3>
                        <p class="text-sm text-gray-500 text-center max-w-xs">
                            Utiliza el panel superior para seleccionar el curso y el estudiante.
                        </p>
                    </div>`;
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

// Función principal llamada por el botón "Generar"
window.generateBoletin = async function () {
    if (!selectedCourseData || !selectedStudentData) {
        alert("Selecciona curso y estudiante.");
        return;
    }

    const yearFrom = document.getElementById('year-from').value || '2023';
    const yearTo = document.getElementById('year-to').value || '2024';

    if (window.showToast) window.showToast(`Generando PDF sobre plantilla...`, "info");

    try {
        await generateBoletinPDF(selectedCourseData, selectedStudentData, yearFrom, yearTo);
    } catch (error) {
        console.error("Error generando PDF:", error);
        alert("Error al generar el PDF: " + error.message);
    }
}

// ==========================================
// GENERACIÓN PDF CON PDF-LIB
// ==========================================
async function generateBoletinPDF(course, student, yearFrom, yearTo) {
    // 1. Usar la función helper para obtener la URL correcta
    const pdfUrl = getTemplateUrl(course.nombre);
    console.log(`Usando plantilla para generación: ${pdfUrl}`);

    // Cargar el PDF base desde assets
    const existingPdfBytes = await fetch(pdfUrl).then(res => {
        if (!res.ok) throw new Error(`No se pudo cargar la plantilla PDF (${pdfUrl}). Estado: ${res.status}`);
        return res.arrayBuffer();
    });

    // 2. Cargar documento en pdf-lib
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Asumimos que la sábana de notas está en la página 2 (índice 1)
    const pages = pdfDoc.getPages();
    const page1 = pages[0]; // Portada
    const page2 = pages[1]; // Calificaciones

    if (!page2) throw new Error("La plantilla PDF no tiene página 2.");

    // 3. Preparar Fuente
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 9; 

    // Helper para dibujar texto centrado en coordenadas aproximadas
    const drawText = (page, text, x, y, size = 9, isBold = false, color = rgb(0, 0, 0)) => {
        if (!text) return;
        const txtStr = String(text);
        const xOffset = txtStr.length === 1 ? 3 : (txtStr.length === 2 ? 0 : -2);
        
        page.drawText(txtStr, {
            x: x + xOffset,
            y,
            size,
            font: isBold ? fontBold : font,
            color: color,
        });
    };

    // --- DATOS PORTADA (PÁGINA 1) ---
    const page1FontSz = 10;
    
    // 1. Datos Académicos Generales
    drawText(page1, `${course.nombre.replace(/[^0-9]/g, '')}`, 220, 320, page1FontSz, true); 
    drawText(page1, `20${yearFrom.slice(-2)}`, 320, 280, page1FontSz); 
    drawText(page1, `20${yearTo.slice(-2)}`, 360, 280, page1FontSz); 
    
    // 2. Datos Específicos
    drawText(page1, "U", 585, 290, page1FontSz);
    drawText(page1, student.nombre.split(' ')[0], 600, 270, page1FontSz);
    drawText(page1, student.nombre.split(' ').slice(1).join(' '), 600, 250, page1FontSz);
    drawText(page1, student.id || "", 750, 225, page1FontSz);
    const docenteName = course.titular_email ? course.titular_email.split('@')[0] : "";
    drawText(page1, docenteName, 590, 205, page1FontSz);
    drawText(page1, SCHOOL_INFO.nombre, 640, 185, 9);
    drawText(page1, SCHOOL_INFO.codigo, 642, 160, 9);
    drawText(page1, SCHOOL_INFO.tanda, 580, 140, 9);
    drawText(page1, SCHOOL_INFO.telefono, 650, 115, 9);
    drawText(page1, SCHOOL_INFO.distrito, 635, 95, 9);
    drawText(page1, SCHOOL_INFO.regional, 670, 75, 9);
    drawText(page1, SCHOOL_INFO.provincia, 600, 50, 9);
    drawText(page1, SCHOOL_INFO.municipio, 600, 30, 9);


    // --- CALIFICACIONES (PÁGINA 2) ---
    const materiasOrdenadas = [
        'Lengua Española',
        'Lenguas Extranjeras (Inglés)',
        'Lenguas Extranjeras (Francés)',
        'Matemática',
        'Ciencias Sociales',
        'Ciencias de la Naturaleza',
        'Educación Artística',
        'Educación Física',
        'Formación Integral Humana y Religiosa',
        // 'OPTATIVA', 'SALIDA' 
    ];

    materiasOrdenadas.forEach((materiaName) => {
        const yBase = MATERIAS_Y_COORDS[materiaName];
        if (!yBase) return; 

        let currentX = X_START; 

        // --- 1. NOTAS DE COMPETENCIAS (16 Columnas) ---
        COMPETENCIAS_KEYS.forEach(comp => {
            PERIODOS_KEYS.forEach(per => {
                const val = calculateCompetenceSpecific(course, student, materiaName, per, comp);
                
                if (val !== null) {
                    const textColor = val < 70 ? rgb(1, 0, 0) : rgb(0, 0, 0); 
                    drawText(page2, val, currentX, yBase, fontSize, false, textColor);
                }
                currentX += X_GAP; 
            });
        });

        // --- 2. CALIFICACIÓN FINAL (CF) ---
        const xCF = currentX; 
        
        let promSum = 0;
        let promCount = 0;
        PERIODOS_KEYS.forEach(p => {
             const pd = getPeriodDetails(course, student, materiaName, p);
             if(pd.hasData) { promSum += pd.promedio; promCount++; }
        });
        const cf = promCount > 0 ? Math.round(promSum / promCount) : null;
        
        if (cf !== null) {
            const textColor = cf < 70 ? rgb(1, 0, 0) : rgb(0, 0, 0);
            drawText(page2, cf, xCF, yBase, fontSize, true, textColor);
        }

        // --- 3. RECUPERACIÓN ---
        const rec = calculateRecuperacion(course, student, materiaName, cf);
        let xRec = xCF + X_GAP; 
        
        // 50% CPC
        if(rec.cc_50_cpc !== '-') drawText(page2, rec.cc_50_cpc, xRec, yBase, fontSize);
        xRec += X_GAP;
        // 50% PE
        if(rec.cc_50_pe !== '-') drawText(page2, rec.cc_50_pe, xRec, yBase, fontSize);
        xRec += X_GAP;
        // CCF
        if(rec.cc_final !== '-') drawText(page2, rec.cc_final, xRec, yBase, fontSize, true);
        
        // --- 4. SITUACIÓN FINAL (A/R) ---
        const isAprobado = checkAprobado(cf, rec);
        const xSituacion = 730; 

        if (isAprobado) {
            drawText(page2, "A", xSituacion, yBase, fontSize);
        } else if (!isAprobado && cf !== null) {
            drawText(page2, "R", xSituacion + X_GAP, yBase, fontSize, false, rgb(1, 0, 0));
        }
    });

    // 4. Guardar y Mostrar
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    // Mostrar en el contenedor de preview
    const container = document.getElementById('boletin-preview');
    container.innerHTML = `<iframe src="${blobUrl}" style="width: 100%; height: 600px; border: none; border-radius: 8px;"></iframe>`;
    container.style.opacity = '1';
}

// ==========================================
// FUNCIONES DE CÁLCULO
// ==========================================

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

function calculateRecuperacion(course, student, materia, cf) {
    const result = { cc_50_cpc: '-', cc_50_pe: '-', cc_final: '-', ce_30_cpc: '-', ce_70_pe: '-', ce_final: '-', ee_final: '-' };
    if (cf === null || materia === "OPTATIVA" || materia === "SALIDA") return result;
    if (cf >= 70) return result;

    const notas = (student.notas && student.notas[materia]) ? student.notas[materia] : {};
    const acts = (course.actividades || {})[materia] || [];
    
    // Recuperar notas de exámenes (nombres por convención o tipo)
    const actCC = acts.find(a => a.tipo === 'completiva') || { nombre: 'Examen Completivo' };
    const actCE = acts.find(a => a.tipo === 'extraordinaria') || { nombre: 'Examen Extraordinario' };
    const actEE = acts.find(a => a.tipo === 'especial') || { nombre: 'Evaluación Especial' };

    const nCC = parseFloat(notas[actCC.nombre] || 0);
    
    // Cálculos Completiva
    result.cc_50_cpc = Math.round(cf * 0.5);
    result.cc_50_pe = Math.round(nCC * 0.5);
    result.cc_final = result.cc_50_cpc + result.cc_50_pe;
    
    if (result.cc_final >= 70) return result;

    // (Lógica Extraordinaria y Especial simplificada aquí por espacio, pero lista para expandir)
    
    return result;
}

function checkAprobado(cf, rec) {
    if (cf === null) return false;
    if (cf >= 70) return true;
    if (rec.cc_final !== '-' && rec.cc_final >= 70) return true;
    // if (rec.ce_final !== '-' && rec.ce_final >= 70) return true;
    // if (rec.ee_final !== '-' && rec.ee_final >= 70) return true;
    return false;
}