import { state } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';

export function toggleCardPin(noteId, event) {
    if (event) event.stopPropagation();
    const note = state.notes.find(n => n.id === noteId);
    if (note) {
        note.isPinned = !note.isPinned;
        saveNotesToStorage();
        refreshNotesView();
        showToast(note.isPinned ? "Nota fijada en destacados" : "Nota quitada de destacados");
    }
}

export function toggleCardArchive(noteId, event) {
    if (event) event.stopPropagation();
    const note = state.notes.find(n => n.id === noteId);
    if (note) {
        note.isArchived = !note.isArchived;
        if(note.isArchived) note.isPinned = false;
        saveNotesToStorage();
        refreshNotesView();
        
        showToast(
            note.isArchived ? "Nota movida al archivo" : "Nota sacada del archivo", 
            "Deshacer", 
            () => {
                note.isArchived = !note.isArchived;
                saveNotesToStorage();
                refreshNotesView();
            }
        );
    }
}

export function moveNoteToTrash(noteId, event) {
    if (event) event.stopPropagation();
    const noteIndex = state.notes.findIndex(n => n.id === noteId);
    if (noteIndex !== -1) {
        const note = state.notes[noteIndex];
        note.isTrash = true;
        note.isPinned = false;
        saveNotesToStorage();
        refreshNotesView();

        showToast(
            "Nota enviada a la papelera", 
            "Deshacer", 
            () => {
                note.isTrash = false;
                saveNotesToStorage();
                refreshNotesView();
            }
        );
    }
}

export function restoreNoteFromTrash(noteId, event) {
    if (event) event.stopPropagation();
    const note = state.notes.find(n => n.id === noteId);
    if (note) {
        note.isTrash = false;
        saveNotesToStorage();
        refreshNotesView();
        showToast("Nota restaurada de la papelera");
    }
}

export function permanentlyDeleteNote(noteId, event) {
    if (event) event.stopPropagation();
    const noteIndex = state.notes.findIndex(n => n.id === noteId);
    if (noteIndex !== -1) {
        state.notes.splice(noteIndex, 1);
        saveNotesToStorage();
        refreshNotesView();
        showToast("Nota eliminada de forma permanente");
    }
}

window.toggleCardPin = toggleCardPin;
window.toggleCardArchive = toggleCardArchive;
window.moveNoteToTrash = moveNoteToTrash;
window.restoreNoteFromTrash = restoreNoteFromTrash;
window.permanentlyDeleteNote = permanentlyDeleteNote;
