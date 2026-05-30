// ============================================================
// history.js — Gestión del historial de versiones de entradas
// ============================================================

import { posts, currentPostId } from './state.js';
import { savePostsToStorage } from './storage.js';
import { showToast } from './toast.js';

/**
 * Abre el diálogo del historial de versiones para la entrada activa.
 */
export function openHistoryDialog() {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const backdrop = document.getElementById('history-dialog-backdrop');
    const container = document.getElementById('history-dialog-container');
    const titleEl = document.getElementById('history-post-title');
    const listEl = document.getElementById('history-list');

    if (!backdrop || !container || !listEl) return;

    if (titleEl) {
        titleEl.textContent = post.title.trim() || 'Sin Título';
    }

    // Renderizar versiones
    listEl.innerHTML = '';

    const history = post.history || [];

    // Mostrar versión actual arriba de todo
    const currentItem = document.createElement('div');
    currentItem.className = 'p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200/50 dark:border-blue-800/30';
    
    const docTitle = document.getElementById('doc-title');
    const docContent = document.getElementById('doc-content');
    const curTitle = docTitle ? docTitle.value : (post.title || '');
    const curContent = docContent ? docContent.innerHTML : (post.content || '');

    currentItem.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">${curTitle.trim() || 'Sin Título'}</p>
                <p class="text-xs text-blue-600 dark:text-blue-400 font-medium">Versión actual en edición</p>
            </div>
            <span class="text-xs px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-semibold shrink-0">Activo</span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">${stripHTML(curContent) || 'Sin contenido'}</p>
    `;
    listEl.appendChild(currentItem);

    if (history.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'text-center py-8 text-xs text-slate-400 dark:text-slate-500';
        emptyMsg.textContent = 'No hay versiones anteriores guardadas.';
        listEl.appendChild(emptyMsg);
    } else {
        // Mostrar versiones en orden cronológico inverso (más recientes primero)
        [...history].reverse().forEach(snapshot => {
            const dateStr = new Date(snapshot.timestamp).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const entry = document.createElement('div');
            entry.className = 'p-3 bg-slate-50 dark:bg-[#1a1c1e] rounded-xl border border-slate-200/40 dark:border-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700 transition-colors';
            entry.innerHTML = `
                <div class="flex justify-between items-start gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">${snapshot.title.trim() || 'Sin Título'}</p>
                        <p class="text-xs text-slate-400 dark:text-slate-500">${dateStr}</p>
                    </div>
                    <button onclick="restoreVersion('${snapshot.id}')" 
                            class="text-xs px-3 py-1 bg-google-blue/10 dark:bg-google-blueDark/10 text-google-blue dark:text-google-blueDark rounded-full hover:bg-google-blue/20 dark:hover:bg-google-blueDark/20 font-bold shrink-0 transition-colors">
                        Restaurar
                    </button>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">${stripHTML(snapshot.content) || 'Sin contenido'}</p>
            `;
            listEl.appendChild(entry);
        });
    }

    // Abrir diálogo
    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

/**
 * Cierra el diálogo de versiones.
 */
export function closeHistoryDialog() {
    const backdrop = document.getElementById('history-dialog-backdrop');
    const container = document.getElementById('history-dialog-container');

    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

/**
 * Restaura una versión anterior del historial de la entrada activa.
 * 
 * @param {string} snapshotId 
 */
export function restoreVersion(snapshotId) {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const snapshot = post.history?.find(s => s.id === snapshotId);
    if (!snapshot) return;

    // Obtener valores actuales antes de restaurar
    const docTitle = document.getElementById('doc-title');
    const docContent = document.getElementById('doc-content');
    const curTitle = docTitle ? docTitle.value : post.title;
    const curContent = docContent ? docContent.innerHTML : post.content;

    // Crear un snapshot de lo que había justo antes de restaurar para poder regresar
    const undoSnapshot = {
        id: 'snapshot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        title: curTitle,
        content: curContent,
        timestamp: new Date().toISOString()
    };
    
    post.history.push(undoSnapshot);
    if (post.history.length > 30) {
        post.history.shift();
    }

    // Restaurar los datos del snapshot
    post.title = snapshot.title;
    post.content = snapshot.content;
    post.updatedAt = new Date().toISOString();

    savePostsToStorage();

    // Recargar la entrada en el editor y refrescar el sidebar
    if (typeof window.loadPost === 'function') {
        window.loadPost(post.id);
    }
    if (typeof window.renderFileTree === 'function') {
        window.renderFileTree();
    }

    closeHistoryDialog();
    showToast('Versión restaurada correctamente');
}

/**
 * Quita todas las etiquetas HTML de un string de texto.
 */
function stripHTML(html) {
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    } catch (e) {
        return html.replace(/<[^>]*>/g, '');
    }
}

// Exponer a window
window.openHistoryDialog = openHistoryDialog;
window.closeHistoryDialog = closeHistoryDialog;
window.restoreVersion = restoreVersion;
