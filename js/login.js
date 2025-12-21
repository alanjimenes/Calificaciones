import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // Verificar si ya hay sesión activa
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = 'index.html';
        }
    });

    // Toggle Password Visibility
    const toggleBtn = document.getElementById('toggle-password');
    const passInput = document.getElementById('password');
    
    if(toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            toggleBtn.querySelector('span').innerText = type === 'password' ? 'visibility' : 'visibility_off';
        });
    }

    // Login Submit
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btnLogin = document.getElementById('btn-login');
            const originalBtnContent = btnLogin.innerHTML;

            // Loading state
            btnLogin.disabled = true;
            btnLogin.innerHTML = '<span class="animate-spin material-symbols-outlined">refresh</span> Verificando...';

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // El redireccionamiento lo maneja onAuthStateChanged
                btnLogin.innerHTML = '<span class="material-symbols-outlined">check</span> ¡Bienvenido!';
                btnLogin.classList.add('bg-green-600', 'hover:bg-green-700');
            } catch (error) {
                console.error("Login error:", error);
                
                let msg = "Error al iniciar sesión.";
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    msg = "Credenciales incorrectas. Verifique su correo y contraseña.";
                } else if (error.code === 'auth/too-many-requests') {
                    msg = "Demasiados intentos fallidos. Intente más tarde.";
                }

                alert(msg);
                
                // Reset button
                btnLogin.disabled = false;
                btnLogin.innerHTML = originalBtnContent;
            }
        });
    }
});