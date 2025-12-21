// Importamos firebaseConfig para tener las credenciales correctas
import { auth, db, setDoc, doc, addDoc, collection, getDocs, orderBy, query } from './firebase-config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Script de registro cargado.");

    // Descripciones de rol
    const roleSelect = document.getElementById('reg-role');
    const roleDesc = document.getElementById('role-desc');
    const containerMateria = document.getElementById('container-materia');
    const selectMateria = document.getElementById('reg-materia');

    const descriptions = {
        'profesor': '<span class="font-bold text-white block mb-1">Profesor:</span> Acceso limitado a sus clases asignadas.',
        'titular': '<span class="font-bold text-white block mb-1">Titular:</span> Acceso intermedio. Puede gestionar estudiantes.',
        'secretaria': '<span class="font-bold text-white block mb-1">Secretaria:</span> Gestión académica. Puede ver cursos, registrar estudiantes y generar boletines.',
        'admin': '<span class="font-bold text-white block mb-1">Administrador:</span> Control total del sistema.'
    };

    // Función para manejar el cambio de rol
    const handleRoleChange = (e) => {
        const role = e.target.value;
        if (roleDesc) roleDesc.innerHTML = descriptions[role] || '';
        
        // Mostrar selector de materia solo si es profesor
        if (containerMateria) {
            if (role === 'profesor') {
                containerMateria.classList.remove('hidden');
            } else {
                containerMateria.classList.add('hidden');
                if(selectMateria) selectMateria.value = ""; // Resetear
            }
        }
    };

    if (roleSelect) {
        roleSelect.addEventListener('change', handleRoleChange);
        // Inicializar estado (por si el navegador recuerda la selección al recargar)
        handleRoleChange({ target: roleSelect });
    }

    // Cargar Catálogo de Materias para el selector
    async function loadSubjectsCatalog() {
        if (!selectMateria) return;
        try {
            const q = query(collection(db, "asignaturas_catalogo"), orderBy("nombre"));
            const snapshot = await getDocs(q);
            
            let optionsHTML = '<option value="">Seleccionar Materia </option>';
            snapshot.forEach(doc => {
                const sub = doc.data();
                optionsHTML += `<option value="${sub.nombre}">${sub.nombre}</option>`;
            });
            selectMateria.innerHTML = optionsHTML;
        } catch (error) {
            console.error("Error cargando catálogo de materias:", error);
        }
    }
    loadSubjectsCatalog();


    // Generador Pass
    const btnGenerate = document.getElementById('btn-generate-pass');
    const inputPass = document.getElementById('reg-password');
    if (btnGenerate && inputPass) {
        btnGenerate.addEventListener('click', () => {
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
            let pass = "";
            for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
            inputPass.value = pass;
        });
    }

    // Manejo Submit
    const formRegister = document.getElementById('form-register-user');
    if (formRegister) {
        formRegister.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nombre = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const rol = document.getElementById('reg-role').value;
            
            const nivelInput = document.getElementById('reg-nivel');
            const nivel = nivelInput ? nivelInput.value : '';
            
            // --- NUEVO MANEJO DE TELÉFONO ---
            const telPrefijo = document.getElementById('reg-telefono-prefijo').value;
            const telNumero = document.getElementById('reg-telefono-numero').value.trim();
            let telefonoCompleto = "";
            
            if(telNumero) {
                // Formatear: +1 809-123-4567 (Añadir guión si es necesario)
                const numLimpio = telNumero.replace(/[^0-9]/g, '');
                if (numLimpio.length === 7) {
                    const parte1 = numLimpio.substring(0, 3);
                    const parte2 = numLimpio.substring(3, 7);
                    telefonoCompleto = `${telPrefijo} ${parte1}-${parte2}`;
                } else {
                    telefonoCompleto = `${telPrefijo} ${numLimpio}`;
                }
            }
            // ---------------------------------

            // Capturar la materia predeterminada
            const materiaInput = document.getElementById('reg-materia');
            const materiaDefault = (materiaInput && rol === 'profesor') ? materiaInput.value : '';

            // --- VALIDACIÓN: MATERIA OBLIGATORIA PARA PROFESORES ---
            if (rol === 'profesor' && !materiaDefault) {
                alert("⚠️ Error: Es obligatorio asignar una materia predeterminada a los profesores.");
                return; // Detenemos el envío
            }
            // -------------------------------------------------------

            const btnSubmit = formRegister.querySelector('button[type="submit"]');

            if(!auth.currentUser) {
                alert("Error: No hay sesión de administrador activa.");
                return;
            }

            try {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<span class="animate-spin material-symbols-outlined">refresh</span> Procesando...';

                // --- PROCESO DE CREACIÓN (App Secundaria) ---
                // Usamos la firebaseConfig importada que tiene la API Key correcta
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const newUser = userCredential.user;
                
                await signOutSecondary(secondaryAuth);
                deleteApp(secondaryApp).catch(console.error);
                // --------------------------------------------

                // Guardar datos en Firestore
                await setDoc(doc(db, "usuarios", newUser.uid), {
                    nombre: nombre,
                    email: email,
                    rol: rol,
                    nivel_estudios: nivel,
                    telefono: telefonoCompleto, // Guardamos el formato completo
                    materia_default: materiaDefault, 
                    creado_por: auth.currentUser.email,
                    fecha_creacion: new Date()
                });

                // Auditoría
                await addDoc(collection(db, "registros_auditoria"), {
                    accion: "crear_usuario",
                    target_email: email,
                    admin: auth.currentUser.email,
                    fecha: new Date(),
                    detalles: `Rol: ${rol}, Materia Def: ${materiaDefault || 'N/A'}`
                });

                // Mensaje de éxito
                const overlay = document.createElement('div');
                overlay.className = 'fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 backdrop-blur-md transition-opacity duration-300';
                overlay.innerHTML = `
                    <div class="bg-surface-dark border border-primary/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
                        <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary mb-6 ring-1 ring-primary/30">
                            <span class="material-symbols-outlined text-5xl">check_circle</span>
                        </div>
                        <h2 class="text-2xl font-bold text-white mb-2">Usuario Registrado</h2>
                        <p class="text-text-secondary text-sm mb-6">La cuenta <strong>${email}</strong> ha sido creada correctamente.</p>
                        ${materiaDefault ? `<p class="text-xs text-primary bg-primary/10 p-2 rounded mb-4">Materia asignada: <strong>${materiaDefault}</strong></p>` : ''}
                        <div class="relative w-full bg-surface-border h-1.5 rounded-full overflow-hidden mb-2">
                            <div class="absolute top-0 left-0 h-full bg-primary animate-[shrink_1s_linear_forwards]" style="width: 100%"></div>
                        </div>
                        <p class="text-[10px] text-text-secondary uppercase tracking-widest">Volviendo al Directorio...</p>
                    </div>
                    <style>@keyframes shrink { from { width: 100%; } to { width: 0%; } }</style>
                `;
                document.body.appendChild(overlay);

                setTimeout(() => {
                    window.location.href = 'usuarios.html';
                }, 1200);

            } catch (error) {
                console.error("Error al registrar:", error);
                let msg = error.message;
                if(error.code === 'auth/email-already-in-use') msg = "Ese correo ya está registrado.";
                if(error.code === 'auth/weak-password') msg = "La contraseña es muy débil.";
                
                alert("Error: " + msg);
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Registrar Usuario';
            }
        });
    }
});