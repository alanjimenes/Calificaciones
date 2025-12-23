document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;

    // Función principal que hace el cambio
    function aplicarTema(tema) {
        if (tema === 'dark') {
            html.classList.add('dark');
            localStorage.setItem('tema', 'dark');
            if (themeToggleBtn) themeToggleBtn.checked = true;
        } else {
            html.classList.remove('dark');
            localStorage.setItem('tema', 'light');
            if (themeToggleBtn) themeToggleBtn.checked = false;
        }
    }

    // 1. Cargar preferencia al iniciar
    // Si no hay nada guardado, por defecto activamos el modo oscuro ('dark')
    const temaGuardado = localStorage.getItem('tema') || 'dark';
    aplicarTema(temaGuardado);

    // 2. Escuchar el clic en el interruptor
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('change', () => {
            if (themeToggleBtn.checked) {
                aplicarTema('dark');
            } else {
                aplicarTema('light');
            }
        });
    }
});