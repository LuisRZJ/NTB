let labelsList = ["Personal", "Trabajo", "Ideas", "Tareas"];

export function getLabelsList() {
    return [...labelsList];
}

export function setLabelsList(newLabels) {
    labelsList = newLabels;
}

export function addLabel(label) {
    if (!labelsList.includes(label)) {
        labelsList.push(label);
    }
}

export function removeLabel(label) {
    labelsList = labelsList.filter(l => l !== label);
}

export { labelsList };

export const colorPalette = {
    default: {
        bgLight: 'bg-white',
        borderLight: 'border-slate-200',
        bgDark: 'dark:bg-[#202124]',
        borderDark: 'dark:border-slate-800',
        accent: 'bg-slate-400'
    },
    blue: {
        bgLight: 'bg-[#d3e3fd]',
        borderLight: 'border-[#a8c7fa]',
        bgDark: 'dark:bg-[#0c2a52]',
        borderDark: 'dark:border-[#103e73]',
        accent: 'bg-[#1a73e8]'
    },
    green: {
        bgLight: 'bg-[#e6f4ea]',
        borderLight: 'border-[#c2e7cc]',
        bgDark: 'dark:bg-[#0f3d23]',
        borderDark: 'dark:border-[#175c36]',
        accent: 'bg-[#1e8e3e]'
    },
    yellow: {
        bgLight: 'bg-[#fef7e0]',
        borderLight: 'border-[#fbe09e]',
        bgDark: 'dark:bg-[#4d3a0c]',
        borderDark: 'dark:border-[#6e5316]',
        accent: 'bg-[#f9ab00]'
    },
    pink: {
        bgLight: 'bg-[#fce8e6]',
        borderLight: 'border-[#fad2cf]',
        bgDark: 'dark:bg-[#4d0c1b]',
        borderDark: 'dark:border-[#73132a]',
        accent: 'bg-[#d93025]'
    },
    purple: {
        bgLight: 'bg-[#f3e8fd]',
        borderLight: 'border-[#e1befa]',
        bgDark: 'dark:bg-[#3d0c4d]',
        borderDark: 'dark:border-[#5c1373]',
        accent: 'bg-[#a142f4]'
    }
};

export const state = {
    notes: [],
    currentTab: 'notes',
    selectedLabelFilter: '',
    searchQuery: '',
    layoutGrid: true,
    lastDeletedNote: null,
    lastDeletedNoteIndex: null,
    lastAction: null,
    quickColor: 'default',
    quickIsPinned: false,
    currentEditingId: null,
    dialogColor: 'default',
    dialogIsPinned: false,
    dialogIsArchived: false
};

export function resetQuickState() {
    state.quickColor = 'default';
    state.quickIsPinned = false;
}

export function resetDialogState() {
    state.currentEditingId = null;
    state.dialogColor = 'default';
    state.dialogIsPinned = false;
    state.dialogIsArchived = false;
}

export function createNoteSnapshot(note, action = 'create') {
    return {
        id: 'snapshot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        noteId: note.id,
        title: note.title,
        content: note.content,
        color: note.color,
        label: note.label,
        isPinned: note.isPinned,
        timestamp: Date.now(),
        action: action
    };
}

export function addNoteToHistory(note, action = 'edit') {
    if (!note.history) {
        note.history = [];
    }
    const snapshot = createNoteSnapshot(note, action);
    note.history.push(snapshot);
    if (note.history.length > 50) {
        note.history = note.history.slice(-50);
    }
    note.updatedAt = Date.now();
}

export function getNoteHistory(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    return note ? (note.history || []) : [];
}

export function restoreNoteFromSnapshot(noteId, snapshotId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return null;

    const snapshot = note.history?.find(s => s.id === snapshotId);
    if (!snapshot) return null;

    note.title = snapshot.title;
    note.content = snapshot.content;
    note.color = snapshot.color;
    note.label = snapshot.label;
    note.isPinned = snapshot.isPinned;
    note.updatedAt = Date.now();

    addNoteToHistory(note, 'restore');

    return note;
}
