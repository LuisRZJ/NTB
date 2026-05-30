import { state, getLabelsList, setLabelsList } from './state.js';
import { updateBadgesCounts } from './badges.js';

const DEFAULT_LABELS = [
    { name: "Personal", color: "#6366f1" },
    { name: "Trabajo", color: "#3b82f6" },
    { name: "Ideas", color: "#ec4899" },
    { name: "Tareas", color: "#10b981" }
];
const DB_NAME = 'GoogleKeepNotesDB';
const DB_VERSION = 2;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('notes')) {
                db.createObjectStore('notes', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('labels')) {
                db.createObjectStore('labels', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config', { keyPath: 'key' });
            }
        };
    });
}

export function saveNotesToStorage() {
    openDB().then(db => {
        const transaction = db.transaction('notes', 'readwrite');
        const store = transaction.objectStore('notes');
        
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
            state.notes.forEach(note => {
                store.put(note);
            });
        };

        transaction.oncomplete = () => {
            db.close();
            updateBadgesCounts();
        };

        transaction.onerror = (e) => {
            console.error('Error saving notes to IndexedDB:', e.target.error);
            db.close();
        };
    }).catch(err => {
        console.error('Error opening DB for saving notes:', err);
        updateBadgesCounts();
    });
}

export function saveLabelsToStorage() {
    openDB().then(db => {
        const transaction = db.transaction('labels', 'readwrite');
        const store = transaction.objectStore('labels');
        
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
            getLabelsList().forEach(label => {
                store.put({ name: label.name, color: label.color });
            });
        };

        transaction.oncomplete = () => {
            db.close();
        };

        transaction.onerror = (e) => {
            console.error('Error saving labels to IndexedDB:', e.target.error);
            db.close();
        };
    }).catch(err => {
        console.error('Error opening DB for saving labels:', err);
    });
}

export function loadLabelsFromStorage() {
    return new Promise((resolve) => {
        openDB().then(db => {
            const transaction = db.transaction('labels', 'readonly');
            const store = transaction.objectStore('labels');
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;
                if (results && results.length > 0) {
                    const labels = results.map(r => ({
                        name: typeof r === 'string' ? r : r.name,
                        color: (r && typeof r === 'object') ? (r.color || null) : null
                    }));
                    setLabelsList(labels);
                    resolve();
                } else {
                    // Intentar migrar desde localStorage
                    const stored = localStorage.getItem('google_keep_labels');
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                const mapped = parsed.map(lbl => typeof lbl === 'string' ? { name: lbl, color: null } : lbl);
                                setLabelsList(mapped);
                                console.log('Etiquetas migradas de localStorage a IndexedDB.');
                                saveLabelsToStorage();
                                localStorage.removeItem('google_keep_labels');
                                resolve();
                                return;
                            }
                        } catch (e) {
                            console.error('Error al parsear etiquetas de localStorage para migración:', e);
                        }
                    }
                    setLabelsList([...DEFAULT_LABELS]);
                    resolve();
                }
            };

            request.onerror = (e) => {
                console.error('Error loading labels from IndexedDB:', e.target.error);
                setLabelsList([...DEFAULT_LABELS]);
                resolve();
            };

            transaction.oncomplete = () => {
                db.close();
            };
        }).catch(err => {
            console.error('Error opening DB for loading labels:', err);
            setLabelsList([...DEFAULT_LABELS]);
            resolve();
        });
    });
}

export function loadNotesFromStorage() {
    return new Promise((resolve) => {
        openDB().then(db => {
            const transaction = db.transaction('notes', 'readonly');
            const store = transaction.objectStore('notes');
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;
                if (results && results.length > 0) {
                    let notes = results;
                    notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    notes.forEach(note => {
                        if (!note.history) note.history = [];
                        if (!note.createdAt) note.createdAt = Date.now();
                        if (!note.updatedAt) note.updatedAt = note.createdAt;
                        // Migración: label (string) → tags (array)
                        if (!Array.isArray(note.tags)) {
                            note.tags = (typeof note.label === 'string' && note.label) ? [note.label] : [];
                            delete note.label;
                        }
                    });
                    state.notes = notes;
                    resolve();
                } else {
                    // Intentar migrar desde localStorage
                    const stored = localStorage.getItem('google_keep_notes');
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                state.notes = parsed;
                                console.log('Notas migradas de localStorage a IndexedDB.');
                                saveNotesToStorage();
                                localStorage.removeItem('google_keep_notes');
                                resolve();
                                return;
                            }
                        } catch (e) {
                            console.error('Error al parsear notas de localStorage para migración:', e);
                        }
                    }
                    state.notes = getDefaultNotes();
                    resolve();
                }
            };

            request.onerror = (e) => {
                console.error('Error loading notes from IndexedDB:', e.target.error);
                state.notes = getDefaultNotes();
                resolve();
            };

            transaction.oncomplete = () => {
                db.close();
            };
        }).catch(err => {
            console.error('Error opening DB for loading notes:', err);
            state.notes = getDefaultNotes();
            resolve();
        });
    });
}

function getDefaultNotes() {
    const now = Date.now();
    return [
        {
            id: 'mock-1',
            title: '💡 Ideas para el Fin de Semana',
            content: '1. Ir a andar en bicicleta al parque nacional.\n2. Probar la nueva cafetería de especialidad en el centro.\n3. Terminar de diseñar la interfaz inspirada en Material Design 3.',
            color: 'purple',
            tags: ['Ideas'],
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
            tags: ['Trabajo'],
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
            tags: ['Personal'],
            isPinned: false,
            isArchived: false,
            isTrash: false,
            createdAt: now - 86400000,
            updatedAt: now - 86400000,
            history: []
        }
    ];
}

export async function initializeNotes() {
    await loadNotesFromStorage();
    await loadLabelsFromStorage();
    saveNotesToStorage();
    saveLabelsToStorage();
}

// ── Métodos de Configuración (Config Store) ─────────────────

/**
 * Obtiene un valor de configuración por clave.
 * @param {string} key
 * @returns {Promise<any>}
 */
export function getConfig(key) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction('config', 'readonly');
            const store = transaction.objectStore('config');
            const request = store.get(key);

            request.onsuccess = (event) => {
                resolve(event.target.result ? event.target.result.value : null);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };

            transaction.oncomplete = () => db.close();
        }).catch(reject);
    });
}

/**
 * Guarda un valor de configuración por clave.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export function saveConfig(key, value) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction('config', 'readwrite');
            const store = transaction.objectStore('config');
            const request = store.put({ key, value });

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };

            transaction.oncomplete = () => db.close();
        }).catch(reject);
    });
}
