import { state, addNoteToHistory, restoreNoteFromSnapshot, createNoteSnapshot } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';
import { formatFullDate } from './renderer.js';

let currentHistoryNoteId = null;

export function openNoteHistory(noteId, event) {
    if (event) {
        event.stopPropagation();
    }

    currentHistoryNoteId = noteId;
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    const backdrop = document.getElementById('history-dialog-backdrop');
    const container = document.getElementById('history-dialog-container');
    const title = document.getElementById('history-note-title');
    const list = document.getElementById('history-list');

    if (title) title.textContent = note.title || 'Sin Título';

    if (list) {
        list.innerHTML = '';

        const currentSnapshot = createNoteSnapshot(note, 'current');
        const allSnapshots = [...(note.history || []), currentSnapshot].sort((a, b) => b.timestamp - a.timestamp);

        if (allSnapshots.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No hay historial disponible</p>';
        } else {
            allSnapshots.forEach((snapshot, index) => {
                const isCurrent = snapshot.action === 'current' || index === 0;
                const item = createHistoryItem(snapshot, note.id, isCurrent, index === allSnapshots.length - 1);
                list.appendChild(item);
            });
        }
    }

    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('flex');
    }
    if (container) {
        setTimeout(() => container.classList.remove('scale-95'), 10);
    }
}

function createHistoryItem(snapshot, noteId, isCurrent, isOriginal) {
    const div = document.createElement('div');
    div.className = `p-4 rounded-xl border transition-all ${isCurrent ? 'bg-google-blue/10 dark:bg-google-blueDark/20 border-google-blue dark:border-google-blueDark' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`;

    const actionLabels = {
        create: 'Creada',
        edit: 'Editada',
        restore: 'Restaurada',
        current: 'Actual'
    };

    const actionColors = {
        create: 'text-green-600 dark:text-green-400',
        edit: 'text-slate-600 dark:text-slate-400',
        restore: 'text-amber-600 dark:text-amber-400',
        current: 'text-google-blue dark:text-google-blueDark'
    };

    div.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider ${actionColors[snapshot.action] || actionColors.edit}">${actionLabels[snapshot.action] || 'Editada'}</span>
                    ${isOriginal && snapshot.action !== 'create' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Original</span>' : ''}
                    ${isCurrent ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Actual</span>' : ''}
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">${formatFullDate(snapshot.timestamp)}</p>
                <p class="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">${snapshot.title || 'Sin Título'}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">${snapshot.content || 'Sin contenido'}</p>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
                ${!isCurrent ? `
                    <button onclick="restoreFromHistory('${snapshot.id}')" class="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-full text-green-600 dark:text-green-400 transition-colors" title="Restaurar esta versión">
                        <span class="material-symbols-outlined text-lg">restore</span>
                    </button>
                ` : `
                    <span class="p-2 text-slate-300 dark:text-slate-600" title="Versión actual">
                        <span class="material-symbols-outlined text-lg">check_circle</span>
                    </span>
                `}
            </div>
        </div>
    `;

    return div;
}

export function restoreFromHistory(snapshotId) {
    if (!currentHistoryNoteId) return;

    const note = restoreNoteFromSnapshot(currentHistoryNoteId, snapshotId);
    if (note) {
        saveNotesToStorage();
        refreshNotesView();
        closeHistoryDialog();
        showToast('Nota restaurada correctamente');
    }
}

export function closeHistoryDialog() {
    const backdrop = document.getElementById('history-dialog-backdrop');
    const container = document.getElementById('history-dialog-container');

    if (container) container.classList.add('scale-95');
    if (backdrop) {
        setTimeout(() => {
            backdrop.classList.remove('flex');
            backdrop.classList.add('hidden');
        }, 150);
    }
    currentHistoryNoteId = null;
}

window.openNoteHistory = openNoteHistory;
window.restoreFromHistory = restoreFromHistory;
window.closeHistoryDialog = closeHistoryDialog;