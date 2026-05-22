import { state, colorPalette, resetDialogState, addNoteToHistory, createNoteSnapshot } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { refreshNotesView, formatFullDate, formatDate } from './renderer.js';
import { showToast } from './toast.js';
import { moveNoteToTrash } from './note-mutations.js';
import { populateLabelSelectors } from './labels.js';
import { openNoteHistory } from './history.js';

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

    populateLabelSelectors();
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
    const datesDiv = document.getElementById('dialog-note-dates');
    const createdDateSpan = document.getElementById('dialog-created-date');
    const editedDateSpan = document.getElementById('dialog-edited-date');
    const editedDateValue = document.getElementById('dialog-edited-date-value');
    const historyBtn = document.getElementById('dialog-history-btn');

    if (headerText) headerText.innerText = "Editar Nota";
    if (titleInput) titleInput.value = note.title || '';
    if (contentInput) contentInput.value = note.content || '';
    if (labelSelector) labelSelector.value = note.label || '';
    if (deleteBtn) deleteBtn.classList.remove('hidden');

    if (datesDiv) {
        const wasEdited = note.updatedAt && note.updatedAt !== note.createdAt;
        if (createdDateSpan) createdDateSpan.textContent = `Creada el ${formatFullDate(note.createdAt)}`;
        if (editedDateSpan && editedDateValue) {
            if (wasEdited) {
                editedDateValue.textContent = formatFullDate(note.updatedAt);
                editedDateSpan.classList.remove('hidden');
            } else {
                editedDateSpan.classList.add('hidden');
            }
        }
        datesDiv.classList.remove('hidden');
    }

    const hasHistory = note.history && note.history.length > 0;
    if (historyBtn) {
        if (hasHistory) {
            historyBtn.classList.remove('hidden');
        } else {
            historyBtn.classList.add('hidden');
        }
    }

    populateLabelSelectors();
    setDialogColor(state.dialogColor);
    updateDialogPinButton();
    updateDialogArchiveButton();

    toggleDialogUI(true);
}

export function openHistoryFromDialog() {
    if (state.currentEditingId) {
        toggleDialogUI(false);
        setTimeout(() => {
            openNoteHistory(state.currentEditingId);
        }, 200);
    }
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
    const header = container?.querySelector('div:first-child');
    const footer = document.getElementById('dialog-footer');

    if (!container) return;

    const colorMap = {
        default: { bg: 'bg-white dark:bg-[#202124]', text: 'text-slate-800 dark:text-slate-100', inputText: 'text-slate-800 dark:text-slate-100 placeholder-slate-400', border: 'border-slate-100 dark:border-slate-800', footerBg: 'bg-slate-50 dark:bg-[#1a1c1e]', footerBorder: 'border-slate-100 dark:border-slate-800' },
        blue: { bg: 'bg-[#d3e3fd] dark:bg-[#0c2a52]', text: 'text-[#0c2a52] dark:text-[#d3e3fd]', inputText: 'text-[#0c2a52] dark:text-[#d3e3fd] placeholder-[#5c7c9c]', border: 'border-[#a8c7fa] dark:border-[#103e73]', footerBg: 'bg-[#c0d9f9] dark:bg-[#0a2244]', footerBorder: 'border-[#a8c7fa] dark:border-[#103e73]' },
        green: { bg: 'bg-[#e6f4ea] dark:bg-[#0f3d23]', text: 'text-[#0f3d23] dark:text-[#e6f4ea]', inputText: 'text-[#0f3d23] dark:text-[#e6f4ea] placeholder-[#4d7a58]', border: 'border-[#c2e7cc] dark:border-[#175c36]', footerBg: 'bg-[#d1ead8] dark:bg-[#0b2916]', footerBorder: 'border-[#c2e7cc] dark:border-[#175c36]' },
        yellow: { bg: 'bg-[#fef7e0] dark:bg-[#4d3a0c]', text: 'text-[#4d3a0c] dark:text-[#fef7e0]', inputText: 'text-[#4d3a0c] dark:text-[#fef7e0] placeholder-[#7d6340]', border: 'border-[#fbe09e] dark:border-[#6e5316]', footerBg: 'bg-[#fceca0] dark:bg-[#3d2c09]', footerBorder: 'border-[#fbe09e] dark:border-[#6e5316]' },
        pink: { bg: 'bg-[#fce8e6] dark:bg-[#4d0c1b]', text: 'text-[#4d0c1b] dark:text-[#fce8e6]', inputText: 'text-[#4d0c1b] dark:text-[#fce8e6] placeholder-[#8c4d5c]', border: 'border-[#fad2cf] dark:border-[#73132a]', footerBg: 'bg-[#f9d0cc] dark:bg-[#3d0915]', footerBorder: 'border-[#fad2cf] dark:border-[#73132a]' },
        purple: { bg: 'bg-[#f3e8fd] dark:bg-[#3d0c4d]', text: 'text-[#3d0c4d] dark:text-[#f3e8fd]', inputText: 'text-[#3d0c4d] dark:text-[#f3e8fd] placeholder-[#7d4d8c]', border: 'border-[#e1befa] dark:border-[#5c1373]', footerBg: 'bg-[#e0d0f9] dark:bg-[#2d0a3d]', footerBorder: 'border-[#e1befa] dark:border-[#5c1373]' }
    };

    const colors = colorMap[colorName] || colorMap.default;

    container.className = `w-full max-w-lg ${colors.bg} rounded-md3 shadow-2xl overflow-hidden transform transition-all duration-300 flex flex-col max-h-[90vh]`;

    if (body) {
        body.className = `flex-1 overflow-y-auto p-6 space-y-4 ${colors.text}`;
        const titleInput = document.getElementById('dialog-note-title');
        const contentInput = document.getElementById('dialog-note-content');
        if (titleInput) {
            titleInput.className = `w-full text-xl font-bold bg-transparent border-none outline-none ${colors.inputText}`;
        }
        if (contentInput) {
            contentInput.className = `w-full text-sm bg-transparent border-none outline-none resize-none ${colors.inputText}`;
        }
    }

    if (header) {
        header.className = `flex items-center justify-between px-6 py-4 border-b ${colors.border}`;
    }

    if (footer) {
        footer.className = `px-6 py-4 border-t ${colors.footerBg} ${colors.footerBorder} space-y-4`;
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
            const titleChanged = note.title !== title;
            const contentChanged = note.content !== content;

            if (titleChanged || contentChanged || note.color !== state.dialogColor || note.label !== (label || null)) {
                addNoteToHistory(note, 'edit');
            }

            note.title = title;
            note.content = content;
            note.color = state.dialogColor;
            note.label = label || null;
            note.isPinned = state.dialogIsPinned;
            note.isArchived = state.dialogIsArchived;
            note.updatedAt = Date.now();
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
            createdAt: Date.now(),
            updatedAt: Date.now(),
            history: []
        };
        addNoteToHistory(newNote, 'create');
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
window.openHistoryFromDialog = openHistoryFromDialog;
