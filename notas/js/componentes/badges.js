import { state } from './state.js';

export function updateBadgesCounts() {
    const counts = {
        notes: state.notes.filter(n => !n.isArchived && !n.isTrash).length,
        pinned: state.notes.filter(n => n.isPinned && !n.isArchived && !n.isTrash).length,
        archive: state.notes.filter(n => n.isArchived && !n.isTrash).length,
        trash: state.notes.filter(n => n.isTrash).length
    };

    const notesEl = document.getElementById('side-count-notes');
    const pinnedEl = document.getElementById('side-count-pinned');
    const archiveEl = document.getElementById('side-count-archive');
    const trashEl = document.getElementById('side-count-trash');

    if(notesEl) notesEl.innerText = counts.notes;
    if(pinnedEl) pinnedEl.innerText = counts.pinned;
    if(archiveEl) archiveEl.innerText = counts.archive;
    if(trashEl) trashEl.innerText = counts.trash;
}
