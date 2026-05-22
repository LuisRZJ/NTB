import { state } from './state.js';
import { updateBadgesCounts } from './badges.js';

export function saveNotesToStorage() {
    localStorage.setItem('google_keep_notes', JSON.stringify(state.notes));
    updateBadgesCounts();
}

export function loadNotesFromStorage() {
    const stored = localStorage.getItem('google_keep_notes');
    if (stored) {
        try {
            state.notes = JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing stored notes:', e);
            state.notes = getDefaultNotes();
        }
    } else {
        state.notes = getDefaultNotes();
    }
}

function getDefaultNotes() {
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
            createdAt: Date.now() - 3600000
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
            createdAt: Date.now() - 7200000
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
            createdAt: Date.now() - 86400000
        }
    ];
}

export function initializeNotes() {
    loadNotesFromStorage();
    saveNotesToStorage();
}
