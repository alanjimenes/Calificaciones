import { auth, db, doc, updateDoc, setDoc, signOut, collection, getDocs } from './firebase-config.js';
import { updateProfile, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Esperar a que main.js cargue el usuario
window.addEventListener('userReady', (e) => {
    const { user, role } = e.detail;
    loadUserData(user, role);
    
    // Mostrar sección de backup si es admin
    if (role === 'admin') {
        const backupSection = document.getElementById('section-backup');
        if (backupSection) backupSection.classList.remove('hidden');
    }
});

function loadUserData(user, role) {
    // 1. Cargar Avatar
    const avatarEl = document.getElementById('settings-avatar');
    if (user.photoURL) {
        avatarEl.style.backgroundImage = `url('${user.photoURL}')`;
        avatarEl.innerText = '';
    } else {
        avatarEl.innerText = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    }

    // 2. Cargar Inputs
    const nameInput = document.getElementById('settings-name');
    const roleInput = document.getElementById('settings-role');
    const emailDisplay = document.getElementById('settings-email-current'); 

    if (nameInput) nameInput.value = user.displayName || '';
    if (roleInput) roleInput.value = role || 'Docente';
    
    // Manejar si es input o span
    if (emailDisplay) {
        if(emailDisplay.tagName === 'INPUT') emailDisplay.value = user.email || '';
        else emailDisplay.innerText = user.email || '';
    }
}

// --- COPIAS DE SEGURIDAD (EXPORTAR JSON) ---
const btnBackup = document.getElementById('btn-download-backup');
if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
        if (!confirm("Se generará un archivo con toda la base de datos.\n¿Deseas continuar?")) return;

        const originalText = btnBackup.innerHTML;
        btnBackup.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Generando...';
        btnBackup.disabled = true;

        try {
            // Recolectar datos de las colecciones principales
            const data = {
                metadata: {
                    fecha_exportacion: new Date().toISOString(),
                    generado_por: auth.currentUser.email,
                    version_sistema: "1.0"
                },
                usuarios: [],
                cursos_globales: [],
                asignaturas_catalogo: [],
                registros_auditoria: []
            };

            // 1. Usuarios
            const usersSnap = await getDocs(collection(db, "usuarios"));
            usersSnap.forEach(doc => data.usuarios.push({ id: doc.id, ...doc.data() }));

            // 2. Cursos Globales (Incluye estudiantes y notas)
            const coursesSnap = await getDocs(collection(db, "cursos_globales"));
            coursesSnap.forEach(doc => data.cursos_globales.push({ id: doc.id, ...doc.data() }));

            // 3. Catálogo Asignaturas
            const subjectsSnap = await getDocs(collection(db, "asignaturas_catalogo"));
            subjectsSnap.forEach(doc => data.asignaturas_catalogo.push({ id: doc.id, ...doc.data() }));

            // 4. Auditoría (Opcional, puede ser grande)
            const auditSnap = await getDocs(collection(db, "registros_auditoria"));
            auditSnap.forEach(doc => data.registros_auditoria.push({ id: doc.id, ...doc.data() }));

            // Generar Blob y descargar
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `edusys_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (window.showToast) window.showToast("Copia de seguridad descargada", "success");

        } catch (error) {
            console.error("Error en backup:", error);
            if (window.showToast) window.showToast("Error al generar copia: " + error.message, "error");
        } finally {
            btnBackup.innerHTML = originalText;
            btnBackup.disabled = false;
        }
    });
}

// --- ACTUALIZAR PERFIL (NOMBRE) ---
const formProfile = document.getElementById('form-profile');
if (formProfile) {
    formProfile.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('settings-name').value.trim();
        const btn = formProfile.querySelector('button');
        const originalText = btn.innerHTML;

        if (!newName) return;

        btn.disabled = true;
        btn.innerHTML = '...';

        try {
            await updateProfile(auth.currentUser, { displayName: newName });
            
            try {
                await setDoc(doc(db, "usuarios", auth.currentUser.uid), { nombre: newName }, { merge: true });
            } catch (err) { console.warn("Error actualizando doc por UID:", err); }

            if (auth.currentUser.email) {
                try {
                    await updateDoc(doc(db, "usuarios", auth.currentUser.email), { nombre: newName });
                } catch (err) {}
            }

            if (window.showToast) window.showToast("Nombre actualizado", "success");
            
        } catch (error) {
            console.error("Error global al actualizar:", error);
            if (window.showToast) window.showToast("Error al actualizar", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// --- ACTUALIZAR EMAIL ---
const formEmail = document.getElementById('form-email');
if (formEmail) {
    formEmail.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('settings-email-new').value.trim();
        const btn = formEmail.querySelector('button');
        const originalText = btn.innerHTML;

        if (!newEmail || newEmail === auth.currentUser.email) return;

        if (!confirm("ADVERTENCIA: Al cambiar tu correo, se cerrará tu sesión.\n\n¿Continuar?")) return;

        btn.disabled = true;
        btn.innerHTML = '...';

        try {
            await updateEmail(auth.currentUser, newEmail);
            try {
                await setDoc(doc(db, "usuarios", auth.currentUser.uid), { email: newEmail }, { merge: true });
            } catch(err) {}

            alert("Correo actualizado. Inicia sesión nuevamente.");
            window.location.href = 'login.html';

        } catch (error) {
            console.error(error);
            handleAuthError(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// --- ACTUALIZAR PASSWORD ---
const formPass = document.getElementById('form-password');
if (formPass) {
    formPass.addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = document.getElementById('settings-pass-new').value;
        const p2 = document.getElementById('settings-pass-confirm').value;
        const btn = formPass.querySelector('button');
        const originalText = btn.innerHTML;

        if (p1 !== p2) {
            if (window.showToast) window.showToast("Las contraseñas no coinciden", "error");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '...';

        try {
            await updatePassword(auth.currentUser, p1);
            if (window.showToast) window.showToast("Contraseña actualizada", "success");
            formPass.reset();
        } catch (error) {
            console.error(error);
            handleAuthError(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
}

// --- CERRAR SESIÓN ---
const btnLogout = document.getElementById('btn-logout-settings');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        if (!confirm("¿Cerrar sesión ahora?")) return;
        try {
            await signOut(auth);
            localStorage.removeItem('edusys_user_data');
            window.location.href = 'login.html';
        } catch (error) {
            console.error(error);
        }
    });
}

// Manejo de errores específicos de Auth
function handleAuthError(error) {
    let msg = "Ocurrió un error inesperado.";
    
    if (error.code === 'auth/requires-recent-login') {
        msg = "Por seguridad, debes haber iniciado sesión recientemente para hacer esto.\n\nCierra sesión y vuelve a entrar.";
        alert(msg);
        return;
    }
    
    if (error.code === 'auth/weak-password') msg = "Contraseña muy débil (mínimo 6 caracteres).";
    if (error.code === 'auth/invalid-email') msg = "Correo inválido.";
    if (error.code === 'auth/email-already-in-use') msg = "Correo ya en uso.";

    if (window.showToast) window.showToast(msg, "error");
    else alert(msg);
}