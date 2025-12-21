import { db, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, appId } from './firebase-config.js';

let currentUser = null;

window.addEventListener('userReady', (e) => {
    currentUser = e.detail.user;
    loadNotifications();
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-notification');
    if (form) {
        form.addEventListener('submit', handleNotificationSubmit);
    }
});

// --- MANEJO DEL FORMULARIO (CREAR O EDITAR) ---
async function handleNotificationSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const idInput = document.getElementById('notif-id');
    const notificationId = idInput.value; 
    
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-message').value.trim();
    const typeRadio = document.querySelector('input[name="notif-type"]:checked');
    const type = typeRadio ? typeRadio.value : 'info';

    const btn = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const originalText = btnText.innerText;
    
    btn.disabled = true;
    btnText.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> Procesando...';

    try {
        // RUTA SEGURA: artifacts/{appId}/public/data/notificaciones
        const collectionPath = ['artifacts', appId, 'public', 'data', 'notificaciones'];
        
        if (notificationId) {
            // EDITAR
            const docRef = doc(db, ...collectionPath, notificationId);
            await updateDoc(docRef, {
                titulo: title,
                mensaje: message,
                tipo: type,
                editado_por: currentUser.email,
                fecha_edicion: new Date().toISOString()
            });
            if (window.showToast) window.showToast("Notificación actualizada", "success");
        } else {
            // CREAR
            const colRef = collection(db, ...collectionPath);
            await addDoc(colRef, {
                titulo: title,
                mensaje: message,
                tipo: type,
                creado_por: currentUser.email,
                fecha: new Date().toISOString(), // Guardamos fecha como ISO String
                destinatario: 'global'
            });
            if (window.showToast) window.showToast("Notificación publicada", "success");
        }

        resetForm();
        setTimeout(loadNotifications, 500);

    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        if(btnText.innerText.includes("Procesando")) btnText.innerText = originalText;
    }
}

// --- CARGAR HISTORIAL (CORREGIDO: ORDENAMIENTO EN JS) ---
window.loadNotifications = async () => {
    const list = document.getElementById('notifications-list');
    if (!list) return;

    list.innerHTML = `
        <div class="text-center py-12 text-text-secondary">
            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p class="text-xs">Cargando historial...</p>
        </div>`;
    
    try {
        // 1. PETICIÓN SIMPLE (Sin orderBy/limit para evitar error de índice)
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notificaciones');
        const snapshot = await getDocs(colRef);

        list.innerHTML = ''; 

        if (snapshot.empty) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 opacity-50">
                    <span class="material-symbols-outlined text-4xl mb-2 text-text-secondary">notifications_off</span>
                    <p class="text-sm text-text-secondary">No hay notificaciones recientes.</p>
                </div>`;
            return;
        }

        // 2. PROCESAR Y ORDENAR EN MEMORIA
        let notifications = [];
        snapshot.forEach(doc => {
            notifications.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar por fecha descendente (más nuevo primero)
        notifications.sort((a, b) => {
            const dateA = new Date(a.fecha || 0);
            const dateB = new Date(b.fecha || 0);
            return dateB - dateA;
        });

        // 3. RENDERIZAR
        notifications.forEach(data => {
            // Manejo seguro de fechas
            let dateStr = 'Reciente';
            try {
                if (data.fecha) dateStr = new Date(data.fecha).toLocaleString();
            } catch (e) {}
            
            let icon = 'info';
            let colorClass = 'border-primary/30 bg-primary/5 text-primary';
            
            if (data.tipo === 'warning') {
                icon = 'warning';
                colorClass = 'border-admin/30 bg-admin/5 text-admin';
            } else if (data.tipo === 'urgent') {
                icon = 'priority_high';
                colorClass = 'border-danger/30 bg-danger/5 text-danger';
            }

            const safeTitle = (data.titulo || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const safeMsg = (data.mensaje || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");

            const item = document.createElement('div');
            item.className = `p-4 rounded-xl border ${colorClass} flex items-start justify-between group transition-all hover:bg-surface-border/10`;
            
            item.innerHTML = `
                <div class="flex gap-4 w-full">
                    <div class="p-2 rounded-lg bg-surface-dark border border-white/5 h-fit shrink-0">
                        <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-white text-sm mb-1">${data.titulo}</h4>
                        <p class="text-xs text-text-secondary mb-2 leading-relaxed whitespace-pre-wrap">${data.mensaje}</p>
                        <div class="flex items-center gap-3 text-[10px] text-text-secondary/60 font-mono">
                            <span><span class="font-bold text-text-secondary">Por:</span> ${data.creado_por || 'Admin'}</span>
                            <span>•</span>
                            <span>${dateStr}</span>
                            ${data.editado_por ? `<span class="text-primary italic">(Editado)</span>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button onclick="editNotification('${data.id}', '${safeTitle}', '${safeMsg}', '${data.tipo}')" 
                        class="p-2 rounded-lg hover:bg-surface-dark hover:text-white text-text-secondary transition-colors" title="Editar">
                        <span class="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onclick="deleteNotification('${data.id}')" 
                        class="p-2 rounded-lg hover:bg-surface-dark hover:text-danger text-text-secondary transition-colors" title="Eliminar">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });

    } catch (error) {
        console.error(error);
        list.innerHTML = '<p class="text-danger text-xs text-center py-4">Error al cargar historial. Verifica permisos.</p>';
    }
}

// --- PREPARAR EDICIÓN ---
window.editNotification = (id, title, message, type) => {
    document.getElementById('notif-id').value = id;
    document.getElementById('notif-title').value = title;
    document.getElementById('notif-message').value = message;
    
    const radios = document.getElementsByName('notif-type');
    for(const r of radios) {
        if(r.value === type) r.checked = true;
    }

    document.getElementById('form-title').innerText = 'Editar Aviso';
    document.getElementById('btn-text').innerText = 'Actualizar Notificación';
    document.getElementById('btn-icon').innerText = 'save';
    document.getElementById('btn-cancel-edit').classList.remove('hidden'); 
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.cancelEdit = () => { resetForm(); }

function resetForm() {
    document.getElementById('form-notification').reset();
    document.getElementById('notif-id').value = '';
    document.getElementById('form-title').innerText = 'Nuevo Aviso';
    document.getElementById('btn-text').innerText = 'Publicar Notificación';
    document.getElementById('btn-icon').innerText = 'send';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

window.deleteNotification = async (id) => {
    if(!confirm("¿Eliminar este mensaje permanentemente?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'notificaciones', id));
        if (window.showToast) window.showToast("Mensaje eliminado", "info");
        if(document.getElementById('notif-id').value === id) resetForm();
        loadNotifications();
    } catch (error) {
        alert("Error: " + error.message);
    }
}