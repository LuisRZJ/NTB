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

        console.log('[BlogApp] Inicializada con éxito.');
    } catch (error) {
        console.error('[BlogApp] Error crítico durante la inicialización:', error);
    }
});
