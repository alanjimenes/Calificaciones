import { db, collection, getDocs, query, orderBy, limit, auth, onAuthStateChanged } from './firebase-config.js';

// Bandera para evitar doble carga
let logsLoaded = false;

// 1. Escuchar el evento personalizado del HTML
window.addEventListener('adminReady', () => {
    if (!logsLoaded) {
        console.log("Evento adminReady recibido");
        loadLogs();
        logsLoaded = true;
    }
});

// 2. FALLBACK DE SEGURIDAD:
// Si el script carga tarde y el evento 'adminReady' ya pasó,
// este listener detectará que hay un usuario activo y cargará los datos.
onAuthStateChanged(auth, (user) => {
    if (user && !logsLoaded) {
        console.log("Usuario detectado por Auth State, cargando logs...");
        loadLogs();
        logsLoaded = true;
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // Buscador en tiempo real
    const searchInput = document.getElementById('audit-search');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#audit-table-body tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }
});

window.loadLogs = async () => {
    const tbody = document.getElementById('audit-table-body');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');

    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        console.log("Consultando Firebase...");
        // Obtenemos los últimos 100 registros ordenados por fecha
        const q = query(collection(db, "registros_auditoria"), orderBy("fecha", "desc"), limit(100));
        const snapshot = await getDocs(q);

        if (loader) loader.classList.add('hidden');

        if (snapshot.empty) {
            console.log("La colección está vacía.");
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');

        snapshot.forEach(doc => {
            const log = doc.data();
            const row = document.createElement('tr');
            row.className = "hover:bg-surface-border/10 transition-colors group";

            // Formato de Fecha
            let fechaStr = "Fecha desconocida";
            if (log.fecha && log.fecha.toDate) {
                fechaStr = log.fecha.toDate().toLocaleString('es-ES', { 
                    day: '2-digit', month: 'short', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit' 
                });
            } else if (log.fecha) {
                // Fallback si es string ISO
                fechaStr = new Date(log.fecha).toLocaleString('es-ES');
            }

            // Formato de Acción (Colores y Nombres)
            let actionBadge = getActionBadge(log.accion);

            // Formato de Detalles
            let details = formatDetails(log);

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-xs text-text-secondary font-mono">
                    ${fechaStr}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-surface-border flex items-center justify-center text-[10px] text-white font-bold">
                            ${(log.admin || "S").charAt(0).toUpperCase()}
                        </div>
                        <span class="text-sm text-white font-medium truncate max-w-[150px]" title="${log.admin}">${log.admin || "Sistema"}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${actionBadge}
                </td>
                <td class="px-6 py-4 text-sm text-text-secondary">
                    ${details}
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error("Error cargando auditoría:", error);
        if (loader) loader.classList.add('hidden');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar registros: ${error.message}</td></tr>`;
    }
};

function getActionBadge(action) {
    const styles = {
        'crear_usuario': { color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', label: 'Crear Usuario' },
        'eliminar_usuario': { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: 'Eliminar Usuario' },
        'editar_usuario': { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', label: 'Editar Usuario' },
        'crear_curso': { color: 'text-admin', bg: 'bg-admin/10', border: 'border-admin/20', label: 'Crear Curso' },
        'subir_notas': { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'Subir Notas' },
        'default': { color: 'text-text-secondary', bg: 'bg-surface-border/20', border: 'border-surface-border/30', label: action || 'Acción' }
    };

    const style = styles[action] || styles['default'];
    
    return `
        <span class="px-2 py-1 inline-flex text-[10px] leading-5 font-bold rounded-full border ${style.bg} ${style.border} ${style.color} uppercase">
            ${style.label}
        </span>
    `;
}

function formatDetails(log) {
    if (log.target_email) {
        return `Afectado: <span class="text-white font-mono">${log.target_email}</span>`;
    }
    if (log.curso) {
        return `Curso: <span class="text-white">${log.curso}</span>`;
    }
    return log.detalles || "Sin detalles adicionales.";
}