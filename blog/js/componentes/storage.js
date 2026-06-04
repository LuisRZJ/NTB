// ============================================================
// storage.js — Capa de persistencia IndexedDB para el Blog
// ============================================================
// Base de datos: BlogEditorDB v1
// Stores: 'posts' (keyPath: 'id'), 'labels' (keyPath: 'id')
// ============================================================

import { posts, setPosts, labels, setLabels } from './state.js';

const DB_NAME = 'BlogEditorDB';
const DB_VERSION = 2;

// ── Apertura / creación de la base de datos ─────────────────

/**
 * Abre (o crea) la base de datos IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('[BlogDB] Error al abrir IndexedDB:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Crear store de posts si no existe
            if (!db.objectStoreNames.contains('posts')) {
                db.createObjectStore('posts', { keyPath: 'id' });
            }

            // Crear store de etiquetas si no existe
            if (!db.objectStoreNames.contains('labels')) {
                db.createObjectStore('labels', { keyPath: 'id' });
            }

            // Crear store de configuración general si no existe
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config', { keyPath: 'key' });
            }
        };
    });
}

// ── Guardar posts ───────────────────────────────────────────

/**
 * Limpia el store de posts y reescribe todos los posts actuales.
 */
export function savePostsToStorage() {
    openDB().then(db => {
        const transaction = db.transaction('posts', 'readwrite');
        const store = transaction.objectStore('posts');

        // Limpiar y reescribir
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
            posts.forEach(post => {
                store.put(post);
            });
        };

        transaction.oncomplete = () => {
            db.close();
        };

        transaction.onerror = (e) => {
            console.error('[BlogDB] Error al guardar posts:', e.target.error);
            db.close();
        };
    }).catch(err => {
        console.error('[BlogDB] Error al abrir DB para guardar posts:', err);
    });
}

// ── Guardar etiquetas ───────────────────────────────────────

/**
 * Limpia el store de etiquetas y reescribe todas las etiquetas actuales.
 */
export function saveLabelsToStorage() {
    openDB().then(db => {
        const transaction = db.transaction('labels', 'readwrite');
        const store = transaction.objectStore('labels');

        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
            labels.forEach(label => {
                store.put(label);
            });
        };

        transaction.oncomplete = () => {
            db.close();
        };

        transaction.onerror = (e) => {
            console.error('[BlogDB] Error al guardar etiquetas:', e.target.error);
            db.close();
        };
    }).catch(err => {
        console.error('[BlogDB] Error al abrir DB para guardar etiquetas:', err);
    });
}

// ── Cargar posts desde IDB ──────────────────────────────────

/**
 * Lee todos los posts de IndexedDB y los carga en el estado.
 * Si no hay posts, siembra los posts de demostración.
 * @returns {Promise<void>}
 */
function loadPostsFromStorage() {
    return new Promise((resolve) => {
        openDB().then(db => {
            const transaction = db.transaction('posts', 'readonly');
            const store = transaction.objectStore('posts');
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;

                if (results && results.length > 0) {
                    // Ordenar por fecha de creación descendente (más recientes primero)
                    results.sort((a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );

                    // Asegurar integridad de cada post
                    results.forEach(post => {
                        if (!post.history) post.history = [];
                        if (!post.databases) post.databases = {};
                        if (!Array.isArray(post.labels)) post.labels = [];
                        if (!post.createdAt) post.createdAt = new Date().toISOString();
                        if (!post.updatedAt) post.updatedAt = post.createdAt;
                    });

                    setPosts(results);
                    resolve();
                } else {
                    // Primera ejecución: sembrar posts de demostración si no se ha sembrado antes
                    const seeded = localStorage.getItem('blog_seeded');
                    if (!seeded) {
                        setPosts(getDefaultPosts());
                        localStorage.setItem('blog_seeded', 'true');
                    } else {
                        setPosts([]);
                    }
                    resolve();
                }
            };

            request.onerror = (e) => {
                console.error('[BlogDB] Error al cargar posts:', e.target.error);
                const seeded = localStorage.getItem('blog_seeded');
                if (!seeded) {
                    setPosts(getDefaultPosts());
                    localStorage.setItem('blog_seeded', 'true');
                } else {
                    setPosts([]);
                }
                resolve();
            };

            transaction.oncomplete = () => {
                db.close();
            };
        }).catch(err => {
            console.error('[BlogDB] Error al abrir DB para cargar posts:', err);
            const seeded = localStorage.getItem('blog_seeded');
            if (!seeded) {
                setPosts(getDefaultPosts());
                localStorage.setItem('blog_seeded', 'true');
            } else {
                setPosts([]);
            }
            resolve();
        });
    });
}

// ── Cargar etiquetas desde IDB ──────────────────────────────

/**
 * Lee todas las etiquetas de IndexedDB y las carga en el estado.
 * @returns {Promise<void>}
 */
function loadLabelsFromStorage() {
    return new Promise((resolve) => {
        openDB().then(db => {
            const transaction = db.transaction('labels', 'readonly');
            const store = transaction.objectStore('labels');
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result;

                if (results && results.length > 0) {
                    setLabels(results);
                } else {
                    // Sin etiquetas predeterminadas; empezar vacío
                    setLabels([]);
                }
                resolve();
            };

            request.onerror = (e) => {
                console.error('[BlogDB] Error al cargar etiquetas:', e.target.error);
                setLabels([]);
                resolve();
            };

            transaction.oncomplete = () => {
                db.close();
            };
        }).catch(err => {
            console.error('[BlogDB] Error al abrir DB para cargar etiquetas:', err);
            setLabels([]);
            resolve();
        });
    });
}

// ── Posts de demostración ───────────────────────────────────

/**
 * Genera 3 posts de ejemplo para la primera ejecución.
 * @returns {Array<Object>}
 */
function getDefaultPosts() {
    return [
        {
            id: crypto.randomUUID(),
            icon: '📈',
            title: 'Trading - Análisis Técnico EUR/USD',
            content: '<h1>Análisis del Mercado</h1><p>El precio se encuentra en una zona de liquidez clave.</p><ul><li><b>Alcista:</b> Ruptura confirmada por encima de la resistencia H4.</li><li><b>Bajista:</b> Rechazo en la zona de oferta actual.</li></ul><blockquote>El mercado siempre tiene la razón.</blockquote>',
            pinned: true,
            archived: false,
            trashed: false,
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: []
        },
        {
            id: crypto.randomUUID(),
            icon: '🌱',
            title: 'Modelo PERMA - Bienestar',
            content: '<h1>El modelo de bienestar de Seligman</h1><p>Los 5 pilares:</p><ol><li><b>P</b>ositive Emotions</li><li><b>E</b>ngagement</li><li><b>R</b>elationships</li><li><b>M</b>eaning</li><li><b>A</b>ccomplishment</li></ol>',
            pinned: false,
            archived: false,
            trashed: false,
            labels: [],
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 86400000).toISOString(),
            history: []
        },
        {
            id: crypto.randomUUID(),
            icon: '🗓️',
            title: 'Planificación Octubre',
            content: '<h1>Metas para el mes</h1><ul><li>Organizar celebración de cumpleaños.</li><li>Revisar portafolio de criptomonedas.</li><li>Leer nuevo libro sobre psicología del trading.</li></ul>',
            pinned: false,
            archived: false,
            trashed: false,
            labels: [],
            createdAt: new Date(Date.now() - 172800000).toISOString(),
            updatedAt: new Date(Date.now() - 172800000).toISOString(),
            history: []
        }
    ];
}

// ── Inicialización principal ────────────────────────────────

/**
 * Punto de entrada: abre la DB, carga posts y etiquetas en el
 * estado, y persiste los datos iniciales (útil si se sembraron
 * posts de demostración en la primera ejecución).
 * @returns {Promise<void>}
 */
export async function initializePosts() {
    await loadPostsFromStorage();
    await loadLabelsFromStorage();

    // Persistir para asegurar que los datos de demostración se guarden
    savePostsToStorage();
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
