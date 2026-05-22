import { initializeTheme } from './componentes/theme.js';
import { initializeNotes, saveNotesToStorage } from './componentes/storage.js';
import { refreshNotesView } from './componentes/renderer.js';
import { updateBadgesCounts } from './componentes/badges.js';
import { handleSearch } from './componentes/search.js';
import { toggleLayout, toggleLayoutStyles } from './componentes/layout.js';
import { toggleTheme } from './componentes/theme.js';
import { openFullEditor } from './componentes/dialog-editor.js';
import { populateLabelSelectors, renderSidebarLabels } from './componentes/labels.js';

export function initializeApp() {
    initializeTheme();
    initializeNotes();
    populateLabelSelectors();
    renderSidebarLabels();
    refreshNotesView();
    updateBadgesCounts();
    toggleLayoutStyles();
    detectTouchDevice();
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
