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
import { loadPost, setupAutoSave, showEmptyState, initToolbarStateObserver } from './componentes/editor.js';
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

        // 8. Inicializar el observador del toolbar de Markdown y enlaces
        initToolbarStateObserver();

        console.log('[BlogApp] Inicializada con éxito.');
    } catch (error) {
        console.error('[BlogApp] Error crítico durante la inicialización:', error);
    }
});

let inputScrollInterval = null;

function animateInputScroll(input) {
    if (document.activeElement === input) return;
    
    const maxScroll = input.scrollWidth - input.clientWidth;
    if (maxScroll <= 0) return;

    let start = null;
    const speed = 0.035; // 35px por segundo

    function step(timestamp) {
        if (!inputScrollInterval) return;
        if (document.activeElement === input) {
            input.scrollLeft = 0;
            return;
        }

        if (!start) start = timestamp;
        const progress = timestamp - start;
        const scrollAmount = progress * speed;

        if (scrollAmount < maxScroll) {
            input.scrollLeft = scrollAmount;
            requestAnimationFrame(step);
        } else {
            input.scrollLeft = maxScroll;
        }
    }

    inputScrollInterval = true;
    requestAnimationFrame(step);
}

function stopInputScroll(input) {
    inputScrollInterval = null;
    if (input) {
        input.scrollLeft = 0;
    }
}

/**
 * Inicializa el desplazamiento automático de textos truncados al pasar el cursor (efecto marquee).
 */
function initTextMarqueeHover() {
    // Evento de hover en elementos con clase .truncate
    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.truncate');
        if (el) {
            // Evitar re-disparos por elementos internos
            if (e.relatedTarget && el.contains(e.relatedTarget)) {
                return;
            }

            if (el.scrollWidth > el.clientWidth) {
                const scrollDistance = el.scrollWidth - el.clientWidth + 12;
                el.style.setProperty('--scroll-dist', `-${scrollDistance}px`);
                const duration = Math.max(1.5, scrollDistance / 35);
                el.style.setProperty('--scroll-duration', `${duration}s`);
                el.classList.add('scrolling-active');
            }
        }

        // Título del editor
        if (e.target && e.target.id === 'doc-title') {
            animateInputScroll(e.target);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest('.truncate');
        if (el) {
            if (e.relatedTarget && el.contains(e.relatedTarget)) {
                return;
            }
            el.classList.remove('scrolling-active');
        }

        if (e.target && e.target.id === 'doc-title') {
            stopInputScroll(e.target);
        }
    });

    // Detener animación de scroll si el input gana el foco
    document.addEventListener('focusin', (e) => {
        if (e.target && e.target.id === 'doc-title') {
            stopInputScroll(e.target);
        }
    });
}
