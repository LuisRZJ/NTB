import { state } from './state.js';

export function updateBadgesCounts() {
    let notes = 0;
    let pinned = 0;
    let archive = 0;
    let trash = 0;

    const allNotes = state.notes;
    for (let i = 0; i < allNotes.length; i++) {
        const n = allNotes[i];
        if (n.isTrash) {
            trash++;
        } else if (n.isArchived) {
            archive++;
        } else {
            notes++;
            if (n.isPinned) pinned++;
        }
    }

    const notesEl = document.getElementById('side-count-notes');
    const pinnedEl = document.getElementById('side-count-pinned');
    const archiveEl = document.getElementById('side-count-archive');
    const trashEl = document.getElementById('side-count-trash');

    if (notesEl) notesEl.innerText = notes;
    if (pinnedEl) pinnedEl.innerText = pinned;
    if (archiveEl) archiveEl.innerText = archive;
    if (trashEl) trashEl.innerText = trash;
}

