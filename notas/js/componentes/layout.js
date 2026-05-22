import { state } from './state.js';

export function toggleLayout() {
    state.layoutGrid = !state.layoutGrid;
    const icon = document.getElementById('layout-icon');
    if (icon) {
        icon.innerText = state.layoutGrid ? 'grid_view' : 'view_agenda';
    }
    toggleLayoutStyles();
}

export function toggleLayoutStyles() {
    const notesGrid = document.getElementById('notes-grid');
    const pinnedGrid = document.getElementById('pinned-grid');

    if (!notesGrid || !pinnedGrid) return;

    const baseClass = state.layoutGrid 
        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-all duration-300"
        : "flex flex-col gap-4 max-w-2xl mx-auto transition-all duration-300";

    notesGrid.className = baseClass;
    pinnedGrid.className = baseClass;
}
