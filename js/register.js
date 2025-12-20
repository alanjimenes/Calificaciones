// Importamos firebaseConfig para tener las credenciales correctas
import { auth, db, setDoc, doc, addDoc, collection, signOut, firebaseConfig } from './firebase-config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    console.log("Script de registro cargado.");

    // Descripciones de rol
    const roleSelect = document.getElementById('reg-role');
    const roleDesc = document.getElementById('role-desc');
    const descriptions = {
        'profesor': '<span class="font-bold text-white block mb-1">Profesor:</span> Acceso limitado a sus clases asignadas.',
        'titular': '<span class="font-bold text-white block mb-1">Titular:</span> Acceso intermedio. Puede gestionar estudiantes.',
        'secretaria': '<span class="font-bold text-white block mb-1">Secretaria:</span> Gestión académica. Puede ver cursos, registrar estudiantes y generar boletines.',
        'admin': '<span class="font-bold text-white block mb-1">Administrador:</span> Control total del sistema.'
    };

    if (roleSelect && roleDesc) {
        roleSelect.addEventListener('change', (e) => roleDesc.innerHTML = descriptions[e.target.value] || '');
    }

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

            const nombre = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const rol = document.getElementById('reg-role').value;
            
            const nivelInput = document.getElementById('reg-nivel');
            const nivel = nivelInput ? nivelInput.value : '';
            
            const telefonoInput = document.getElementById('reg-telefono');
            const telefono = telefonoInput ? telefonoInput.value : '';

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
                    telefono: telefono,
                    creado_por: auth.currentUser.email,
                    fecha_creacion: new Date()
                });

                // Auditoría
                await addDoc(collection(db, "registros_auditoria"), {
                    accion: "crear_usuario",
                    target_email: email,
                    admin: auth.currentUser.email,
                    fecha: new Date()
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