// ============================================================
// app.js — Orquestador y punto de entrada modular
// ============================================================

// Importar todos los módulos para registrar sus funciones en window
// y establecer las dependencias mutuas.
import { posts } from './componentes/state.js';
import { initializePosts } from './componentes/storage.js';
import { initializeTheme } from './componentes/theme.js';
import { 
    renderFileTree,
    renderExpandedPostList,
    renderSidebarLabels, 
    updateSectionCounts,
    setSidebarMode,
    initSidebarResize
} from './componentes/sidebar.js';
import { loadPost, setupAutoSave, showEmptyState } from './componentes/editor.js';
import { initGithubSync } from './componentes/settings.js';

// Importación para registrar funciones en window
import './componentes/toast.js';
import './componentes/search.js';
import './componentes/labels.js';
import './componentes/history.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Inicializar base de datos y cargar estado inicial
        await initializePosts();

        // 1b. Inicializar sincronización con GitHub (cifrado local)
        await initGithubSync();

        // 2. Inicializar sistema de temas (claro/oscuro/auto)
        initializeTheme();

        // 3. Renderizar componentes de UI del Sidebar
        renderSidebarLabels();
        renderFileTree();
        updateSectionCounts();

        // 4. Iniciar en modo pantalla completa mostrando la lista de todas las entradas
        setSidebarMode(true);
        renderExpandedPostList();

        // 5. Configurar el auto-guardado automático
        setupAutoSave();

        // 6. Inicializar redimensionamiento del sidebar
        initSidebarResize();

        // 7. Inicializar efecto marquee sobre elementos truncados
        initTextMarqueeHover();

        console.log('[BlogApp] Inicializada con éxito.');
    } catch (error) {
        console.error('[BlogApp] Error crítico durante la inicialización:', error);
    }
});

/**
 * Inicializa el desplazamiento automático de textos truncados al pasar el cursor (efecto marquee).
 */
function initTextMarqueeHover() {
    document.addEventListener('mouseenter', (e) => {
        const el = e.target.closest('.truncate');
        if (!el) return;

        // Comprobar si el texto desborda el ancho visible
        if (el.scrollWidth > el.clientWidth) {
            // Buffer de 10 píxeles para que no quede pegado al final
            const scrollDistance = el.scrollWidth - el.clientWidth + 10;
            el.style.setProperty('--scroll-dist', `-${scrollDistance}px`);
            
            // Velocidad de 35px por segundo para lectura cómoda
            const duration = Math.max(1.5, scrollDistance / 35);
            el.style.setProperty('--scroll-duration', `${duration}s`);
            el.classList.add('scrolling-active');
        }
    }, true);

    document.addEventListener('mouseleave', (e) => {
        const el = e.target.closest('.truncate');
        if (!el) return;
        el.classList.remove('scrolling-active');
    }, true);
}
