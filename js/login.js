import { auth, signInWithEmailAndPassword } from './firebase-config.js';

const loginForm = document.getElementById('login-form');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('error-msg');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // La redirección la maneja main.js automáticamente
        } catch (error) {
            console.error("Error Login:", error);
            
            let message = "Error al iniciar sesión.";
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                message = "Correo o contraseña incorrectos.";
            } else if (error.code === 'auth/too-many-requests') {
                message = "Demasiados intentos. Espera un poco.";
            }

            if (errorMsg) {
                errorMsg.textContent = message;
                errorMsg.classList.remove('hidden');
            }
        }
    });
}