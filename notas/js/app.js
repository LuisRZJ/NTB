import { initializeTheme } from './componentes/theme.js';
import { initializeNotes, saveNotesToStorage } from './componentes/storage.js';
import { refreshNotesView } from './componentes/renderer.js';
import './componentes/settings.js';
import './componentes/metrics.js';
import { updateBadgesCounts } from './componentes/badges.js';
import { handleSearch } from './componentes/search.js';
import { toggleLayout, toggleLayoutStyles } from './componentes/layout.js';
import { toggleTheme } from './componentes/theme.js';
import { openFullEditor } from './componentes/dialog-editor.js';
import { populateLabelSelectors, renderSidebarLabels } from './componentes/labels.js';
import { initGithubSync } from './componentes/settings.js';

export async function initializeApp() {
    initializeTheme();
    await initializeNotes();
    await initGithubSync();
    populateLabelSelectors();
    renderSidebarLabels();
    refreshNotesView();
    updateBadgesCounts();
    toggleLayoutStyles();
    detectTouchDevice();
    initializeUsageMetrics();
}

function initializeUsageMetrics() {
    // 1. Registrar una nueva sesión
    if (!sessionStorage.getItem('metrics_session_active')) {
        let sessionCount = parseInt(localStorage.getItem('metrics_sessions_count')) || 0;
        sessionCount++;
        localStorage.setItem('metrics_sessions_count', sessionCount.toString());
        sessionStorage.setItem('metrics_session_active', 'true');
    }

    // 2. Rastrear tiempo total de uso (sumar cada 5 segundos si la pestaña está visible)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            let totalTime = parseInt(localStorage.getItem('metrics_total_time')) || 0;
            totalTime += 5;
            localStorage.setItem('metrics_total_time', totalTime.toString());
        }
    }, 5000);
}

function detectTouchDevice() {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch-device');
    }
}

export function cleanupForExport() {
    window.switchTab = null;
    window.filterByLabel = null;
    window.clearSearch = null;
    window.toggleMobileSidebar = null;
    window.toggleCardPin = null;
    window.toggleCardArchive = null;
    window.moveNoteToTrash = null;
    window.restoreNoteFromTrash = null;
    window.permanentlyDeleteNote = null;
    window.openFullEditor = null;
    window.openFullEditorForEdit = null;
    window.closeDialog = null;
    window.toggleDialogPin = null;
    window.toggleDialogArchive = null;
    window.setDialogColor = null;
    window.saveDialogNote = null;
    window.dialogDeleteNote = null;
}

window.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

window.toggleTheme = toggleTheme;
window.toggleLayout = toggleLayout;
window.openFullEditor = openFullEditor;
window.handleSearch = handleSearch;
