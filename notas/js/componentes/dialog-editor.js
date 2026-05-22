import { state, colorPalette, resetDialogState } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';
import { moveNoteToTrash } from './note-mutations.js';

export function openFullEditor() {
    resetDialogState();

    const headerText = document.getElementById('dialog-header-text');
    const titleInput = document.getElementById('dialog-note-title');
    const contentInput = document.getElementById('dialog-note-content');
    const labelSelector = document.getElementById('dialog-note-label');
    const deleteBtn = document.getElementById('dialog-delete-btn');

    if (headerText) headerText.innerText = "Crear Nota";
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    if (labelSelector) labelSelector.value = '';
    if (deleteBtn) deleteBtn.classList.add('hidden');

    setDialogColor('default');
    updateDialogPinButton();
    updateDialogArchiveButton();

    toggleDialogUI(true);
}

export function openFullEditorForEdit(noteId, event) {
    if (event) {
        if (event.target.closest('button')) return;
    }

    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    if (note.isTrash) return;

    state.currentEditingId = noteId;
    state.dialogColor = note.color || 'default';
    state.dialogIsPinned = note.isPinned;
    state.dialogIsArchived = note.isArchived;

    const headerText = document.getElementById('dialog-header-text');
    const titleInput = document.getElementById('dialog-note-title');
    const contentInput = document.getElementById('dialog-note-content');
    const labelSelector = document.getElementById('dialog-note-label');
    const deleteBtn = document.getElementById('dialog-delete-btn');

    if (headerText) headerText.innerText = "Editar Nota";
    if (titleInput) titleInput.value = note.title || '';
    if (contentInput) contentInput.value = note.content || '';
    if (labelSelector) labelSelector.value = note.label || '';
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    setDialogColor(state.dialogColor);
    updateDialogPinButton();
    updateDialogArchiveButton();

    toggleDialogUI(true);
}

export function toggleDialogUI(show) {
    const backdrop = document.getElementById('note-dialog-backdrop');
    const container = document.getElementById('note-dialog-container');

    if (!backdrop || !container) return;

    if (show) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('flex');
        setTimeout(() => {
            container.classList.remove('scale-95');
            container.classList.add('scale-100');
        }, 10);
        const contentInput = document.getElementById('dialog-note-content');
        if (contentInput) contentInput.focus();
    } else {
        container.classList.remove('scale-100');
        container.classList.add('scale-95');
        setTimeout(() => {
            backdrop.classList.remove('flex');
            backdrop.classList.add('hidden');
        }, 150);
    }
}

export function closeDialog() {
    toggleDialogUI(false);
}

export function setDialogColor(colorName) {
    state.dialogColor = colorName;
    const container = document.getElementById('note-dialog-container');
    const body = document.getElementById('dialog-body');

    if (!container) return;

    container.className = "w-full max-w-lg bg-white dark:bg-[#202124] rounded-md3 shadow-2xl overflow-hidden transform transition-all duration-300 flex flex-col max-h-[90vh]";
    
    const meta = colorPalette[colorName];
    if (meta && colorName !== 'default') {
        container.classList.add(meta.bgLight, meta.bgDark);
    }

    document.querySelectorAll("[id^='color-choice-']").forEach(btn => {
        btn.classList.remove('ring-4', 'ring-google-blue', 'ring-google-blueDark');
    });
    const selBtn = document.getElementById(`color-choice-${colorName}`);
    if(selBtn) selBtn.classList.add('ring-4', 'ring-google-blue', 'dark:ring-google-blueDark');
}

export function toggleDialogPin() {
    state.dialogIsPinned = !state.dialogIsPinned;
    updateDialogPinButton();
}

export function updateDialogPinButton() {
    const pinBtn = document.getElementById('dialog-pin-btn');
    if (pinBtn) {
        if (state.dialogIsPinned) {
            pinBtn.className = "p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-amber-500";
            const span = pinBtn.querySelector('span');
            if (span) span.classList.add('fill-amber-500');
        } else {
            pinBtn.className = "p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500";
            const span = pinBtn.querySelector('span');
            if (span) span.classList.remove('fill-amber-500');
        }
    }
}

export function toggleDialogArchive() {
    state.dialogIsArchived = !state.dialogIsArchived;
    if (state.dialogIsArchived) state.dialogIsPinned = false;
    updateDialogArchiveButton();
    updateDialogPinButton();
}

export function updateDialogArchiveButton() {
    const archBtn = document.getElementById('dialog-archive-btn');
    if (archBtn) {
        if (state.dialogIsArchived) {
            archBtn.className = "p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-google-blue dark:text-google-blueDark";
        } else {
            archBtn.className = "p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500";
        }
    }
}

export function saveDialogNote() {
    const titleInput = document.getElementById('dialog-note-title');
    const contentInput = document.getElementById('dialog-note-content');
    const labelSelector = document.getElementById('dialog-note-label');

    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';
    const label = labelSelector ? labelSelector.value : '';

    if (!title && !content) {
        showToast("No se puede guardar una nota vacía");
        closeDialog();
        return;
    }

    if (state.currentEditingId) {
        const note = state.notes.find(n => n.id === state.currentEditingId);
        if (note) {
            note.title = title;
            note.content = content;
            note.color = state.dialogColor;
            note.label = label || null;
            note.isPinned = state.dialogIsPinned;
            note.isArchived = state.dialogIsArchived;
        }
    } else {
        const newNote = {
            id: 'note-' + Date.now(),
            title: title,
            content: content,
            color: state.dialogColor,
            label: label || null,
            isPinned: state.dialogIsPinned,
            isArchived: state.dialogIsArchived,
            isTrash: false,
            createdAt: Date.now()
        };
        state.notes.unshift(newNote);
    }

    saveNotesToStorage();
    refreshNotesView();
    closeDialog();
    showToast("Nota guardada correctamente");
}

export function dialogDeleteNote() {
    if (state.currentEditingId) {
        moveNoteToTrash(state.currentEditingId);
        closeDialog();
    }
}

window.openFullEditor = openFullEditor;
window.openFullEditorForEdit = openFullEditorForEdit;
window.closeDialog = closeDialog;
window.toggleDialogPin = toggleDialogPin;
window.toggleDialogArchive = toggleDialogArchive;
window.setDialogColor = setDialogColor;
window.saveDialogNote = saveDialogNote;
window.dialogDeleteNote = dialogDeleteNote;
