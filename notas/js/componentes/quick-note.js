import { state, resetQuickState } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';
import { colorPalette } from './state.js';

export function expandQuickNote() {
    document.getElementById('quick-note-collapsed').classList.add('hidden');
    document.getElementById('quick-note-expanded').classList.remove('hidden');
    const contentInput = document.getElementById('qn-content');
    if (contentInput) contentInput.focus();
    
    resetQuickState();
    resetQuickFormStyle();
}

export function collapseQuickNote() {
    document.getElementById('quick-note-collapsed').classList.remove('hidden');
    document.getElementById('quick-note-expanded').classList.add('hidden');
    const form = document.getElementById('quick-note-form');
    if (form) form.reset();
}

export function toggleQuickPin() {
    state.quickIsPinned = !state.quickIsPinned;
    const pinBtn = document.getElementById('qn-pin-btn');
    if (pinBtn) {
        if(state.quickIsPinned) {
            pinBtn.className = "p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full flex text-amber-500";
            const span = pinBtn.querySelector('span');
            if (span) span.classList.add('fill-amber-500');
        } else {
            pinBtn.className = "p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full flex text-slate-400";
            const span = pinBtn.querySelector('span');
            if (span) span.classList.remove('fill-amber-500');
        }
    }
}

export function setQuickColor(colorName) {
    state.quickColor = colorName;
    const container = document.getElementById('quick-note-expanded');
    
    if (!container) return;
    
    container.className = "bg-white dark:bg-[#202124] rounded-3xl border-2 border-google-blue dark:border-google-blueDark shadow-lg p-5 transition-all duration-300";
    
    const meta = colorPalette[colorName];
    if (meta && colorName !== 'default') {
        container.classList.add(meta.bgLight, meta.bgDark);
    }
}

export function resetQuickFormStyle() {
    const container = document.getElementById('quick-note-expanded');
    if (container) {
        container.className = "bg-white dark:bg-[#202124] rounded-3xl border-2 border-google-blue dark:border-google-blueDark shadow-lg p-5 transition-all duration-300";
    }
    const pinBtn = document.getElementById('qn-pin-btn');
    if (pinBtn) {
        pinBtn.className = "p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full flex text-slate-400";
        const span = pinBtn.querySelector('span');
        if (span) span.classList.remove('fill-amber-500');
    }
    const labelSelector = document.getElementById('qn-label-selector');
    if (labelSelector) labelSelector.value = '';
}

export function handleQuickNoteSubmit(e) {
    e.preventDefault();
    const titleInput = document.getElementById('qn-title');
    const contentInput = document.getElementById('qn-content');
    const labelSelector = document.getElementById('qn-label-selector');
    
    const title = titleInput ? titleInput.value : '';
    const content = contentInput ? contentInput.value : '';
    const label = labelSelector ? labelSelector.value : '';

    if(!content.trim() && !title.trim()) {
        collapseQuickNote();
        return;
    }

    const newNote = {
        id: 'note-' + Date.now(),
        title: title.trim(),
        content: content.trim(),
        color: state.quickColor,
        label: label || null,
        isPinned: state.quickIsPinned,
        isArchived: false,
        isTrash: false,
        createdAt: Date.now()
    };

    state.notes.unshift(newNote);
    saveNotesToStorage();
    refreshNotesView();
    collapseQuickNote();
    showToast("Nota creada de forma exitosa");
}

window.expandQuickNote = expandQuickNote;
window.collapseQuickNote = collapseQuickNote;
window.toggleQuickPin = toggleQuickPin;
window.setQuickColor = setQuickColor;
window.handleQuickNoteSubmit = handleQuickNoteSubmit;
