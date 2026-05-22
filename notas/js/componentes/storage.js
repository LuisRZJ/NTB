import { state, getLabelsList, setLabelsList } from './state.js';
import { updateBadgesCounts } from './badges.js';

const DEFAULT_LABELS = ["Personal", "Trabajo", "Ideas", "Tareas"];

export function saveNotesToStorage() {
    localStorage.setItem('google_keep_notes', JSON.stringify(state.notes));
    updateBadgesCounts();
}

export function saveLabelsToStorage() {
    localStorage.setItem('google_keep_labels', JSON.stringify(getLabelsList()));
}

export function loadLabelsFromStorage() {
    const stored = localStorage.getItem('google_keep_labels');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                setLabelsList(parsed);
                return;
            }
        } catch (e) {
            console.error('Error parsing stored labels:', e);
        }
    }
    setLabelsList([...DEFAULT_LABELS]);
}

export function loadNotesFromStorage() {
    const stored = localStorage.getItem('google_keep_notes');
    if (stored) {
        try {
            state.notes = JSON.parse(stored);
            state.notes.forEach(note => {
                if (!note.history) note.history = [];
                if (!note.createdAt) note.createdAt = Date.now();
                if (!note.updatedAt) note.updatedAt = note.createdAt;
            });
        } catch (e) {
            console.error('Error parsing stored notes:', e);
            state.notes = getDefaultNotes();
        }
    } else {
        state.notes = getDefaultNotes();
    }
}

function getDefaultNotes() {
    const now = Date.now();
    return [
        {
            id: 'mock-1',
            title: '💡 Ideas para el Fin de Semana',
            content: '1. Ir a andar en bicicleta al parque nacional.\n2. Probar la nueva cafetería de especialidad en el centro.\n3. Terminar de diseñar la interfaz inspirada en Material Design 3.',
            color: 'purple',
            label: 'Ideas',
            isPinned: true,
            isArchived: false,
            isTrash: false,
            createdAt: now - 3600000,
            updatedAt: now - 3600000,
            history: []
        },
        {
            id: 'mock-2',
            title: '🛒 Lista de Compras para la oficina',
            content: '• Café en grano de tostado medio\n• Galletas integrales de avena\n• Post-its de colores (pasteles)\n• Bolígrafos de tinta de gel azul',
            color: 'blue',
            label: 'Trabajo',
            isPinned: false,
            isArchived: false,
            isTrash: false,
            createdAt: now - 7200000,
            updatedAt: now - 7200000,
            history: []
        },
        {
            id: 'mock-3',
            title: '🧘‍♀️ Prácticas diarias de relajación',
            content: 'Dedicar al menos 10 minutos cada tarde a la respiración guiada. Mantener una postura cómoda y silenciar notificaciones del teléfono.',
            color: 'green',
            label: 'Personal',
            isPinned: false,
            isArchived: false,
            isTrash: false,
            createdAt: now - 86400000,
            updatedAt: now - 86400000,
            history: []
        }
    ];
}

export function initializeNotes() {
    loadNotesFromStorage();
    loadLabelsFromStorage();
    saveNotesToStorage();
}
