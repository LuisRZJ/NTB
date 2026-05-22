import { initializeTheme } from './componentes/theme.js';
import { initializeNotes, saveNotesToStorage } from './componentes/storage.js';
import { refreshNotesView, renderLabelsSidebars, updateBadgesCounts } from './componentes/renderer.js';
import { handleSearch } from './componentes/search.js';
import { toggleLayout, toggleLayoutStyles } from './componentes/layout.js';
import { toggleTheme } from './componentes/theme.js';
import { openFullEditor } from './componentes/dialog-editor.js';

export function initializeApp() {
    initializeTheme();
    initializeNotes();
    renderLabelsSidebars();
    refreshNotesView();
    updateBadgesCounts();
    toggleLayoutStyles();
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
    window.expandQuickNote = null;
    window.collapseQuickNote = null;
    window.toggleQuickPin = null;
    window.setQuickColor = null;
    window.handleQuickNoteSubmit = null;
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
