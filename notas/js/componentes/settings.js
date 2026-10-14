import { state, setLabelsList, getLabelsList } from './state.js';
import { saveNotesToStorage, saveLabelsToStorage, getConfig, saveConfig } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';
import { populateLabelSelectors, renderSidebarLabels } from './labels.js';
import { clearMarkdownCache } from './markdown.js';
export function loadSettingsStats() {
    const notesCount = state.notes.length;
    const labelsCount = getLabelsList().length;

    const notesCountEl = document.getElementById('stats-notes-count');
    const labelsCountEl = document.getElementById('stats-labels-count');
    const dbSizeEl = document.getElementById('stats-db-size');

    if (notesCountEl) notesCountEl.textContent = notesCount;
    if (labelsCountEl) labelsCountEl.textContent = labelsCount;

    // Calcular tamaño estimado de almacenamiento de los datos en memoria
    const rawData = JSON.stringify({ notes: state.notes, labels: getLabelsList() });
    const bytes = new Blob([rawData]).size;
    const sizeKB = (bytes / 1024).toFixed(2);

    if (dbSizeEl) {
        dbSizeEl.textContent = `${sizeKB} KB (datos netos)`;
    }

    // Consultar espacio de almacenamiento disponible en el dispositivo
    if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(estimate => {
            const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
            const quotaGB = (estimate.quota / (1024 * 1024 * 1024)).toFixed(2);
            
            // Calculamos el espacio restante (libre)
            const remainingBytes = estimate.quota - estimate.usage;
            const remainingGB = (remainingBytes / (1024 * 1024 * 1024)).toFixed(2);
            
            // Porcentaje de uso del espacio asignado para el origen
            const usePercentage = ((estimate.usage / estimate.quota) * 100).toFixed(4);

            const storageInfoEl = document.getElementById('stats-device-storage');
            if (storageInfoEl) {
                storageInfoEl.innerHTML = `
                    <div class="flex flex-col gap-1 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                        <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Espacio libre en disco (dispositivo):</span>
                            <span class="font-bold text-google-blue dark:text-google-blueDark">${remainingGB} GB libres</span>
                        </div>
                        <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                            <div class="bg-google-blue dark:bg-google-blueDark h-full transition-all duration-500" style="width: ${Math.max(1, usePercentage)}%"></div>
                        </div>
                        <div class="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                            <span>Cuota de navegador: ${quotaGB} GB</span>
                            <span>Usado por la app: ${usageMB} MB</span>
                        </div>
                    </div>
                `;
            }
        }).catch(err => {
            console.error('Error al estimar el almacenamiento:', err);
        });
    }
    loadBirthdayConfig();
}

export async function exportData() {
    try {
        const cloudAutoSync = await getConfig('cloudAutoSync');
        const backup = {
            version: "1.0",
            timestamp: Date.now(),
            labels: getLabelsList(),
            notes: state.notes,
            meta: {
                cloudAutoSync: cloudAutoSync === true || (typeof _cloudAutoSyncEnabled !== 'undefined' && _cloudAutoSyncEnabled) || localStorage.getItem('notas_cloud_auto_sync') === 'true'
            }
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `keep_notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Datos exportados correctamente");
    } catch (e) {
        console.error('Error al exportar datos:', e);
        showToast("Error al exportar datos");
    }
}

/**
 * Detecta si el JSON importado proviene de la aplicación externa (app-notas).
 * Criterios: presencia de meta.version === 3 ó notas con id numérico y tags como
 * arreglo de objetos {name, color}.
 */
function isExternalFormat(data) {
    // Criterio principal: metadatos de versión
    if (data.meta && data.meta.version === 3) return true;

    // Criterio secundario: las notas tienen id numérico
    if (Array.isArray(data.notes) && data.notes.length > 0) {
        const firstNote = data.notes[0];
        if (typeof firstNote.id === 'number') return true;
    }

    // Criterio terciario: tags globales son objetos con {name, color}
    if (Array.isArray(data.tags) && data.tags.length > 0) {
        const firstTag = data.tags[0];
        if (typeof firstTag === 'object' && firstTag !== null && typeof firstTag.name === 'string') {
            return true;
        }
    }

    return false;
}

/**
 * Normaliza una nota del formato externo (app-notas) al esquema local.
 * - id numérico → string con prefijo 'note-'
 * - tags (array de strings) → primer elemento como label
 * - updatedAt (string ISO) → timestamp numérico
 * - Valores por defecto para campos de estado ausentes
 */
function normalizeExternalNote(note) {
    const createdAt = typeof note.id === 'number' ? note.id : Date.now();
    
    // Convertir updatedAt de string ISO a timestamp numérico
    let updatedAt = createdAt;
    if (typeof note.updatedAt === 'string') {
        const parsed = new Date(note.updatedAt).getTime();
        if (!isNaN(parsed)) updatedAt = parsed;
    } else if (typeof note.updatedAt === 'number') {
        updatedAt = note.updatedAt;
    }

    // Extraer TODOS los tags disponibles como array de strings
    let tags = [];
    if (Array.isArray(note.tags)) {
        note.tags.forEach(tag => {
            if (typeof tag === 'string' && tag.trim()) {
                tags.push(tag.trim());
            } else if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string' && tag.name.trim()) {
                tags.push(tag.name.trim());
            }
        });
    }

    return {
        id: 'note-' + String(createdAt),
        title: typeof note.title === 'string' ? note.title : '',
        content: typeof note.content === 'string' ? note.content : '',
        color: 'default',
        tags: tags,
        isPinned: false,
        isArchived: false,
        isTrash: false,
        createdAt: createdAt,
        updatedAt: updatedAt,
        history: []
    };
}

/**
 * Extrae y combina etiquetas del formato externo.
 * Los tags globales del archivo externo son objetos {name, color}, y cada nota
 * puede tener tags como array de strings o de objetos. Se recopilan todos los
 * nombres únicos y se devuelven como array de strings.
 */
function normalizeExternalLabels(data) {
    const labelsMap = new Map(); // name -> color

    // Extraer de tags globales (array de objetos {name, color})
    if (Array.isArray(data.tags)) {
        for (const tag of data.tags) {
            if (typeof tag === 'string' && tag.trim()) {
                const name = tag.trim();
                if (!labelsMap.has(name)) labelsMap.set(name, null);
            } else if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string' && tag.name.trim()) {
                const name = tag.name.trim();
                const color = typeof tag.color === 'string' ? tag.color : null;
                labelsMap.set(name, color);
            }
        }
    }

    // Extraer de tags individuales de cada nota
    if (Array.isArray(data.notes)) {
        for (const note of data.notes) {
            if (Array.isArray(note.tags)) {
                for (const tag of note.tags) {
                    if (typeof tag === 'string' && tag.trim()) {
                        const name = tag.trim();
                        if (!labelsMap.has(name)) labelsMap.set(name, null);
                    } else if (typeof tag === 'object' && tag !== null && typeof tag.name === 'string' && tag.name.trim()) {
                        const name = tag.name.trim();
                        const color = typeof tag.color === 'string' ? tag.color : null;
                        if (!labelsMap.has(name) || (color && !labelsMap.get(name))) {
                            labelsMap.set(name, color);
                        }
                    }
                }
            }
        }
    }

    return Array.from(labelsMap.entries()).map(([name, color]) => ({ name, color }));
}

export function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validación estricta del tipo de archivo (extensión .json)
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        showToast("Error: Solo se permiten archivos de respaldo en formato .json");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validación del esquema del archivo importado
            if (!data || typeof data !== 'object') {
                throw new Error("El JSON no es un objeto válido.");
            }
            if (!data.notes || !Array.isArray(data.notes)) {
                throw new Error("La lista de notas no es válida o está ausente.");
            }

            let validNotes;
            let importedLabels;
            const isExternal = isExternalFormat(data);

            if (isExternal) {
                // === Ruta de importación para formato externo (app-notas) ===
                validNotes = data.notes
                    .filter(note => note && typeof note === 'object' && (typeof note.id === 'number' || note.id))
                    .map(note => normalizeExternalNote(note));

                // Combinar etiquetas externas con las existentes
                const externalLabels = normalizeExternalLabels(data);
                const existingLabels = getLabelsList();
                
                const labelMap = new Map();
                existingLabels.forEach(l => labelMap.set(l.name, l.color));
                externalLabels.forEach(l => {
                    if (!labelMap.has(l.name) || (l.color && !labelMap.get(l.name))) {
                        labelMap.set(l.name, l.color);
                    }
                });
                importedLabels = Array.from(labelMap.entries()).map(([name, color]) => ({ name, color }));

            } else {
                // === Ruta de importación para formato nativo (local) ===
                validNotes = data.notes.filter(note => {
                    return note && 
                           typeof note === 'object' && 
                           note.id && 
                           typeof note.id === 'string';
                }).map(note => {
                    return {
                        id: note.id,
                        title: typeof note.title === 'string' ? note.title : '',
                        content: typeof note.content === 'string' ? note.content : '',
                        color: typeof note.color === 'string' ? note.color : 'default',
                        tags: Array.isArray(note.tags) ? note.tags.filter(t => typeof t === 'string') : [],
                        isPinned: Boolean(note.isPinned),
                        isArchived: Boolean(note.isArchived),
                        isTrash: Boolean(note.isTrash),
                        createdAt: Number(note.createdAt) || Date.now(),
                        updatedAt: Number(note.updatedAt) || Number(note.createdAt) || Date.now(),
                        history: Array.isArray(note.history) ? note.history : []
                    };
                });

                if (data.labels && Array.isArray(data.labels)) {
                    importedLabels = data.labels.map(lbl => {
                        if (typeof lbl === 'string') {
                            return { name: lbl, color: null };
                        } else if (lbl && typeof lbl === 'object' && typeof lbl.name === 'string') {
                            return { name: lbl.name, color: typeof lbl.color === 'string' ? lbl.color : null };
                        }
                        return null;
                    }).filter(Boolean);
                } else {
                    importedLabels = [];
                }
            }

            if (validNotes.length === 0 && data.notes.length > 0) {
                throw new Error("Ninguna nota contiene una estructura de campos de datos compatible.");
            }

            state.notes = validNotes;
            setLabelsList(importedLabels);

            if (data.meta && typeof data.meta.cloudAutoSync === 'boolean') {
                _cloudAutoSyncEnabled = data.meta.cloudAutoSync;
                await saveConfig('cloudAutoSync', _cloudAutoSyncEnabled);
                localStorage.setItem('notas_cloud_auto_sync', _cloudAutoSyncEnabled ? 'true' : 'false');
                updateAutoSyncUIState(_cloudAutoSyncEnabled);
            }

            // Escribir en IndexedDB
            saveNotesToStorage();
            saveLabelsToStorage();

            // Sincronizar UI
            clearMarkdownCache();
            populateLabelSelectors();
            renderSidebarLabels();
            refreshNotesView();
            loadSettingsStats();

            const sourceLabel = isExternal ? ' (formato app-notas)' : '';
            showToast(`Se importaron ${validNotes.length} notas y ${importedLabels.length} etiquetas${sourceLabel}.`);
        } catch (err) {
            console.error('Error importando datos:', err);
            showToast(`Error: ${err.message || 'El archivo JSON no es compatible.'}`);
        } finally {
            event.target.value = '';
        }
    };

    reader.readAsText(file);
}

export function resetApplicationData() {
    const backdrop = document.getElementById('reset-db-dialog-backdrop');
    const container = document.getElementById('reset-db-dialog-container');
    if (!backdrop || !container) return;

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');

    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

export function closeResetDbDialog() {
    const backdrop = document.getElementById('reset-db-dialog-backdrop');
    const container = document.getElementById('reset-db-dialog-container');
    if (!backdrop || !container) return;

    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

export async function confirmResetApplicationData() {
    localStorage.clear();
    
    _cloudAutoSyncEnabled = false;
    await saveConfig('cloudAutoSync', false);
    updateAutoSyncUIState(false);

    state.notes = [];
    setLabelsList([]);

    // Escribir vacío en IndexedDB
    saveNotesToStorage();
    saveLabelsToStorage();

    // Actualizar UI
    clearMarkdownCache();
    populateLabelSelectors();
    renderSidebarLabels();
    refreshNotesView();
    loadSettingsStats();
    
    closeResetDbDialog();
    showToast("Se han eliminado todos los datos locales con éxito.");
}

// Funciones de Cumpleaños
export function saveBirthday() {
    const month = document.getElementById('birthday-month')?.value;
    const day = document.getElementById('birthday-day')?.value;

    if (month && day) {
        localStorage.setItem('user_birthday', JSON.stringify({ month, day: parseInt(day) }));
    } else {
        localStorage.removeItem('user_birthday');
    }
    checkBirthday();
}


export function loadBirthdayConfig() {
    const stored = localStorage.getItem('user_birthday');
    if (stored) {
        try {
            const birthday = JSON.parse(stored);
            const monthSel = document.getElementById('birthday-month');
            const dayInput = document.getElementById('birthday-day');
            
            if (monthSel) monthSel.value = birthday.month || '';
            if (dayInput) dayInput.value = birthday.day || '';
        } catch (e) {
            console.error('Error al cargar config de cumpleaños:', e);
        }
    }
}

export function checkBirthday() {
    const banner = document.getElementById('birthday-banner');
    if (!banner) return;

    const stored = localStorage.getItem('user_birthday');
    if (!stored) {
        banner.classList.add('hidden');
        return;
    }

    try {
        const birthday = JSON.parse(stored);
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = now.getDate();

        if (birthday.month === currentMonth && parseInt(birthday.day) === currentDay) {
            if (state.currentTab !== 'settings') {
                banner.classList.remove('hidden');
                banner.classList.add('flex');
            } else {
                banner.classList.add('hidden');
            }
        } else {
            banner.classList.add('hidden');
        }
    } catch (e) {
        console.error('Error al verificar cumpleaños:', e);
        banner.classList.add('hidden');
    }
}

// Exponer globalmente
window.exportData = exportData;
window.importData = importData;
window.resetApplicationData = resetApplicationData;
window.loadSettingsStats = loadSettingsStats;
window.closeResetDbDialog = closeResetDbDialog;
window.confirmResetApplicationData = confirmResetApplicationData;
window.saveBirthday = saveBirthday;
window.checkBirthday = checkBirthday;

// ── Sincronización en la Nube (Vercel Serverless) ───────────────────────────────

let _cloudAutoSyncEnabled = false;
let _autoSyncTimer = null;
let _autoSyncRetryTimer = null;
let _autoSyncRetryCount = 0;
let _isSyncingCloud = false;
let _autoSyncPending = false;
let _dataDirty = false;
const AUTO_SYNC_DEBOUNCE_MS = 3500;

export function markDataDirty() {
    if (window._isAppInitializing) return;
    _dataDirty = true;
    if (typeof scheduleAutoSync === 'function' && _cloudAutoSyncEnabled) {
        scheduleAutoSync();
    }
}
window.markDataDirty = markDataDirty;

export function scheduleAutoSync() {
    if (!_cloudAutoSyncEnabled) return;
    const password = sessionStorage.getItem('github_sync_pass');
    if (!password) return;

    if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
    if (_autoSyncRetryTimer) clearTimeout(_autoSyncRetryTimer);

    setCloudStatus('Cambios pendientes...', 'pending');

    _autoSyncTimer = setTimeout(async () => {
        _autoSyncTimer = null;
        await runAutoSync();
    }, AUTO_SYNC_DEBOUNCE_MS);
}

export async function runAutoSync(force = false) {
    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) return;
    if (!_cloudAutoSyncEnabled && !force) return;
    const password = sessionStorage.getItem('github_sync_pass');
    if (!password) return;

    if (_isSyncingCloud) {
        _autoSyncPending = true;
        return;
    }

    if (_autoSyncTimer) {
        clearTimeout(_autoSyncTimer);
        _autoSyncTimer = null;
    }

    _isSyncingCloud = true;

    try {
        await executeCloudBackup({ silent: true, isAuto: true });
        _autoSyncRetryCount = 0;
    } catch (err) {
        _autoSyncRetryCount++;
        const delay = Math.min(60000, 5000 * Math.pow(2, _autoSyncRetryCount - 1));
        _autoSyncRetryTimer = setTimeout(() => {
            runAutoSync();
        }, delay);
    } finally {
        _isSyncingCloud = false;
        if (_autoSyncPending) {
            _autoSyncPending = false;
            if (_dataDirty) {
                runAutoSync();
            }
        }
    }
}

export async function executeCloudBackup({ silent = false, isAuto = false } = {}) {
    const password = sessionStorage.getItem('github_sync_pass');
    if (!password) {
        if (!silent) showToast('Inicia sesión ingresando tu contraseña de sincronización.');
        return false;
    }

    const pushBtn = document.getElementById('btn-github-push');
    const originalHTML = pushBtn ? pushBtn.innerHTML : '';
    if (pushBtn && !silent) {
        pushBtn.disabled = true;
        pushBtn.innerHTML = '<span class="material-symbols-outlined text-lg animate-spin">sync</span> Subiendo respaldo...';
    }

    setCloudStatus('Guardando en la nube...', 'loading');

    try {
        const cloudAutoSync = await getConfig('cloudAutoSync');
        const backupData = {
            version: 1,
            app: 'notas-app',
            exportedAt: new Date().toISOString(),
            notes: state.notes,
            labels: getLabelsList(),
            meta: {
                cloudAutoSync: cloudAutoSync === true || _cloudAutoSyncEnabled
            }
        };

        const res = await callSyncAPI('push', password, backupData);

        await saveConfig('last_backup_sha', res.sha);
        _dataDirty = false;

        const t = new Date();
        const timeStr = t.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
        setCloudStatus('Sincronizado · ' + timeStr, 'ok');

        if (!silent) {
            showToast('Copia de seguridad subida con éxito a la nube');
        }
        return true;
    } catch (e) {
        console.error('[CloudSync] Error al respaldar:', e);
        if (!silent) {
            showToast('Error al respaldar en la nube: ' + e.message);
        }
        setCloudStatus(isAuto ? 'Error al sincronizar · Reintentando...' : 'Error al subir', 'err');
        throw e;
    } finally {
        if (pushBtn && !silent) {
            pushBtn.disabled = false;
            pushBtn.innerHTML = originalHTML;
        }
    }
}

export function updateAutoSyncUIState(enabled) {
    const toggle = document.getElementById('cloud-autosync-toggle');
    const badge = document.getElementById('cloud-autosync-badge');
    const subhint = document.getElementById('cloud-autosync-subhint');
    if (toggle) toggle.checked = !!enabled;
    if (badge) {
        badge.textContent = enabled ? 'Activo' : 'Desactivado';
        badge.classList.toggle('active', !!enabled);
    }
    if (subhint) {
        subhint.textContent = enabled
            ? 'Sincronizando automáticamente en segundo plano (debounce 3.5s).'
            : 'Debounce de 3.5s y respaldo inmediato al cambiar o cerrar pestaña.';
    }
}

export function setCloudStatus(msg, type) {
    const badge = document.getElementById('github-status-badge');
    const headerSync = document.getElementById('header-cloud-sync');
    const headerDot = document.getElementById('header-cloud-dot');
    const headerText = document.getElementById('header-cloud-text');

    let dotColorClass = 'bg-slate-400';
    if (type === 'ok') dotColorClass = 'bg-green-500';
    else if (type === 'err') dotColorClass = 'bg-red-500';
    else if (type === 'loading') dotColorClass = 'bg-google-blue dark:bg-google-blueDark animate-spin';
    else if (type === 'pending') dotColorClass = 'bg-amber-500 animate-pulse';

    if (badge) {
        badge.innerHTML = `<span class="w-2 h-2 rounded-full ${dotColorClass}"></span> <span>${msg}</span>`;
    }

    if (headerSync) {
        const isConn = !!sessionStorage.getItem('github_sync_pass');
        if (isConn) {
            headerSync.style.display = 'inline-flex';
            if (headerDot) headerDot.className = `w-2 h-2 rounded-full ${dotColorClass}`;
            if (headerText) {
                if (msg.startsWith('Sincronizado')) headerText.textContent = 'Sincronizado';
                else if (msg.startsWith('Guardando')) headerText.textContent = 'Guardando...';
                else if (msg.startsWith('Cambios pendientes')) headerText.textContent = 'Pendiente';
                else if (msg.startsWith('Error')) headerText.textContent = 'Error';
                else headerText.textContent = msg;
            }
        } else {
            headerSync.style.display = 'none';
        }
    }
}

function setupCloudAutoSync() {
    const autoSyncToggle = document.getElementById('cloud-autosync-toggle');
    if (autoSyncToggle && !autoSyncToggle._wired) {
        autoSyncToggle._wired = true;
        autoSyncToggle.addEventListener('change', async () => {
            const isChecked = autoSyncToggle.checked;
            const pass = sessionStorage.getItem('github_sync_pass');
            if (isChecked && !pass) {
                autoSyncToggle.checked = false;
                showToast('Conecta la sincronización primero con tu contraseña');
                return;
            }
            _cloudAutoSyncEnabled = isChecked;
            await saveConfig('cloudAutoSync', isChecked);
            localStorage.setItem('notas_cloud_auto_sync', isChecked ? 'true' : 'false');
            updateAutoSyncUIState(isChecked);
            if (isChecked) {
                showToast('Sincronización continua en la nube activada');
                if (_dataDirty) {
                    scheduleAutoSync();
                }
            } else {
                if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
                showToast('Sincronización continua desactivada');
                setCloudStatus('Conectado a la Nube', 'ok');
            }
        });
    }

    if (!window._cloudLifecycleWired) {
        window._cloudLifecycleWired = true;

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && _cloudAutoSyncEnabled && _dataDirty) {
                if (_autoSyncTimer) {
                    clearTimeout(_autoSyncTimer);
                    _autoSyncTimer = null;
                }
                runAutoSync();
            }
        });

        window.addEventListener('pagehide', () => {
            if (_cloudAutoSyncEnabled && _dataDirty) {
                if (_autoSyncTimer) {
                    clearTimeout(_autoSyncTimer);
                    _autoSyncTimer = null;
                }
                runAutoSync();
            }
        });

        window.addEventListener('online', () => {
            if (_cloudAutoSyncEnabled && _dataDirty) {
                showToast('Conexión reestablecida: sincronizando...');
                runAutoSync();
            }
        });

        window.addEventListener('focus', () => {
            const backdrop = document.getElementById('github-update-backdrop');
            const isUpdateModalOpen = backdrop && !backdrop.classList.contains('hidden');
            if (_cloudAutoSyncEnabled && !_dataDirty && !_isSyncingCloud && !isUpdateModalOpen) {
                const pass = sessionStorage.getItem('github_sync_pass');
                if (pass) checkCloudVersion(pass);
            }
        });

        if (!window._cloudPeriodicTimer) {
            window._cloudPeriodicTimer = setInterval(() => {
                const backdrop = document.getElementById('github-update-backdrop');
                const isUpdateModalOpen = backdrop && !backdrop.classList.contains('hidden');
                if (_cloudAutoSyncEnabled && !_dataDirty && !_isSyncingCloud && !isUpdateModalOpen) {
                    const pass = sessionStorage.getItem('github_sync_pass');
                    if (pass) checkCloudVersion(pass);
                }
            }, 180000);
        }
    }
}

/**
 * Llama a la API serverless para realizar operaciones de sincronización.
 */
async function callSyncAPI(action, password, data = null) {
    const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            password,
            module: 'notas',
            action,
            data
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Inicializa y valida el estado de la sincronización de GitHub al arrancar.
 */
export async function initGithubSync() {
    try {
        const savedAutoSync = await getConfig('cloudAutoSync');
        _cloudAutoSyncEnabled = savedAutoSync === true || localStorage.getItem('notas_cloud_auto_sync') === 'true';
        setupCloudAutoSync();
        updateAutoSyncUIState(_cloudAutoSyncEnabled);

        // 1. Verificar si hay sesión en sessionStorage primero
        const sessionPass = sessionStorage.getItem('github_sync_pass');

        if (sessionPass) {
            updateGithubUIState('connected');
            fillGithubUIFields();
            checkCloudVersion(sessionPass);
            return;
        }

        // 2. Si no hay sesión en sessionStorage, verificar localStorage para autologin de 15 días
        const storedPass = localStorage.getItem('github_sync_pass');
        const savedAtStr = localStorage.getItem('github_sync_pass_saved_at');

        if (storedPass && savedAtStr) {
            const savedAt = parseInt(savedAtStr, 10) || 0;
            const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
            const isExpired = (Date.now() - savedAt) >= fifteenDaysMs;

            if (!isExpired) {
                try {
                    // Validar la contraseña contra la API
                    await callSyncAPI('auth', storedPass);
                    
                    // Guardar en sessionStorage para la sesión activa
                    sessionStorage.setItem('github_sync_pass', storedPass);

                    updateGithubUIState('connected');
                    fillGithubUIFields();
                    checkCloudVersion(storedPass);
                    return; // Autologin exitoso
                } catch (err) {
                    console.warn('[Settings] Contraseña de autologin rechazada por el servidor:', err);
                }
            } else {
                // Ha expirado el plazo de 15 días
                updateGithubUIState('locked');
                const backdrop = document.getElementById('github-decrypt-backdrop');
                if (backdrop) backdrop.classList.remove('hidden');

                // Hacer modal no-cerrable
                const skipBtn = document.getElementById('github-skip-decrypt-btn');
                if (skipBtn) skipBtn.classList.add('hidden');

                const subtitle = document.getElementById('github-decrypt-subtitle');
                if (subtitle) {
                    subtitle.innerHTML = '<strong>Tu confirmación periódica de 15 días ha expirado.</strong> Por favor, reintroduce tu contraseña de sincronización para continuar.';
                }
                return;
            }
        }

        // 3. Si no hay autologin configurado o falló, mostrar modal normal
        updateGithubUIState('locked');
        const backdrop = document.getElementById('github-decrypt-backdrop');
        if (backdrop) backdrop.classList.remove('hidden');
        
        const skipBtn = document.getElementById('github-skip-decrypt-btn');
        if (skipBtn) skipBtn.classList.remove('hidden');

        const subtitle = document.getElementById('github-decrypt-subtitle');
        if (subtitle) {
            subtitle.textContent = 'Ingresa tu contraseña de sincronización para conectar con la nube y buscar actualizaciones.';
        }
    } catch (e) {
        console.error('[Settings] Error al inicializar Sincronización:', e);
    }
}

function fillGithubUIFields() {
    const passInput = document.getElementById('github-pass-input');
    const sessionPass = sessionStorage.getItem('github_sync_pass');
    if (passInput && sessionPass) passInput.value = sessionPass;
}

export async function submitGithubDecrypt() {
    const input = document.getElementById('github-decrypt-pass-input');
    const errorMsg = document.getElementById('github-decrypt-error');
    if (!input) return;

    const password = input.value;
    if (!password) {
        if (errorMsg) {
            errorMsg.textContent = 'Ingresa la contraseña';
            errorMsg.classList.remove('hidden');
        }
        return;
    }

    try {
        // Validar contraseña
        await callSyncAPI('auth', password);
        
        sessionStorage.setItem('github_sync_pass', password);

        // Guardar de forma persistente en localStorage para el ciclo de 15 días
        localStorage.setItem('github_sync_pass', password);
        localStorage.setItem('github_sync_pass_saved_at', Date.now().toString());

        const backdrop = document.getElementById('github-decrypt-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
        if (errorMsg) errorMsg.classList.add('hidden');

        // Restaurar estado del modal por si se abre de nuevo
        const skipBtn = document.getElementById('github-skip-decrypt-btn');
        if (skipBtn) skipBtn.classList.remove('hidden');
        const subtitle = document.getElementById('github-decrypt-subtitle');
        if (subtitle) {
            subtitle.textContent = 'Ingresa tu contraseña de sincronización para conectar con la nube y buscar actualizaciones.';
        }

        showToast('Conectado a la nube exitosamente');
        updateGithubUIState('connected');
        fillGithubUIFields();

        checkCloudVersion(password);
    } catch (e) {
        if (errorMsg) {
            errorMsg.textContent = 'Contraseña incorrecta o error de conexión';
            errorMsg.classList.remove('hidden');
        }
    }
}

export function skipGithubDecrypt() {
    const backdrop = document.getElementById('github-decrypt-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    updateGithubUIState('local');
    showToast('Trabajando en modo local (sin sincronizar)');
}

export async function saveGithubSettings() {
    const passInput = document.getElementById('github-pass-input');
    const passVal = passInput ? passInput.value : '';

    if (!passVal) {
        showToast('Ingresa tu contraseña de sincronización.');
        return;
    }

    try {
        showToast('Verificando conexión con el servidor...');

        // Probar conexión y autenticación
        await callSyncAPI('auth', passVal);

        sessionStorage.setItem('github_sync_pass', passVal);

        // Guardar también en localStorage para los 15 días
        localStorage.setItem('github_sync_pass', passVal);
        localStorage.setItem('github_sync_pass_saved_at', Date.now().toString());

        showToast('Conexión establecida con éxito.');
        updateGithubUIState('connected');
        fillGithubUIFields();
        
        checkCloudVersion(passVal);
    } catch (err) {
        showToast('Error de conexión o contraseña incorrecta: ' + err.message);
    }
}

export async function pushToGithub() {
    try {
        await executeCloudBackup({ silent: false, isAuto: false });
    } catch (e) {
        // Error gestionado en executeCloudBackup
    }
}

export function pullFromGithub() {
    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
}

export async function confirmGithubPull() {
    const password = sessionStorage.getItem('github_sync_pass');
    if (!password) {
        showToast('Inicia sesión ingresando tu contraseña de sincronización.');
        return;
    }

    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.add('hidden');

    showToast('Descargando copia de seguridad...');

    try {
        const res = await callSyncAPI('pull', password);
        const backupData = res.content;

        // Reemplazo Total (Pisar todo)
        state.notes = backupData.notes || [];
        await saveNotesToStorage();

        setLabelsList(backupData.labels || []);
        await saveLabelsToStorage();

        if (backupData.meta && typeof backupData.meta.cloudAutoSync === 'boolean') {
            _cloudAutoSyncEnabled = backupData.meta.cloudAutoSync;
            await saveConfig('cloudAutoSync', _cloudAutoSyncEnabled);
            localStorage.setItem('notas_cloud_auto_sync', _cloudAutoSyncEnabled ? 'true' : 'false');
            updateAutoSyncUIState(_cloudAutoSyncEnabled);
        }
        _dataDirty = false;

        // Guardar el SHA local de la versión que acabamos de descargar
        await saveConfig('last_backup_sha', res.sha);

        showToast(`Base de datos restaurada: importadas ${backupData.notes ? backupData.notes.length : 0} notas.`);
        
        setTimeout(() => location.reload(), 1000);
    } catch (e) {
        showToast('Error al restaurar copia: ' + e.message);
    }
}

export function skipGithubUpdate() {
    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    showToast('Actualización de la nube ignorada. Los cambios locales sobrescribirán la nube en tu próximo respaldo.');
    if (_cloudAutoSyncEnabled && _dataDirty) {
        scheduleAutoSync();
    }
}

async function checkCloudVersion(password) {
    try {
        const meta = await callSyncAPI('check', password);

        if (!meta.exists || !meta.sha) return;

        // Comprobar si el archivo en la nube es idéntico al último sincronizado
        const lastBackupSha = await getConfig('last_backup_sha');
        if (meta.sha === lastBackupSha) {
            const t = new Date(meta.updatedAt ? new Date(meta.updatedAt).getTime() : Date.now());
            const timeStr = t.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            setCloudStatus('Sincronizado · ' + timeStr, 'ok');
            return; // Son idénticos, no hay actualización pendiente
        }

        if (!meta.updatedAt) return;

        // Encontrar la fecha del cambio local más reciente en Notas
        let lastLocalUpdate = 0;
        state.notes.forEach(n => {
            const u = Number(n.updatedAt) || Number(n.createdAt) || 0;
            if (u > lastLocalUpdate) {
                lastLocalUpdate = u;
            }
        });

        const cloudTime = new Date(meta.updatedAt).getTime();
        const localTime = lastLocalUpdate;

        // Avisar si la nube es posterior por más de 5 segundos
        if (cloudTime > localTime + 5000) {
            const backdrop = document.getElementById('github-update-backdrop');
            if (backdrop) backdrop.classList.remove('hidden');
        } else {
            const t = new Date(cloudTime || Date.now());
            const timeStr = t.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            setCloudStatus('Sincronizado · ' + timeStr, 'ok');
        }
    } catch (e) {
        console.warn('[Sync] Error al verificar versión silenciosa:', e);
    }
}

function updateGithubUIState(state) {
    const actions = document.getElementById('github-actions-container');
    const autoSyncCard = document.getElementById('cloud-autosync-container');
    const headerSync = document.getElementById('header-cloud-sync');

    if (state === 'unconfigured') {
        setCloudStatus('Sin configurar', '');
        if (actions) actions.classList.add('hidden');
        if (autoSyncCard) autoSyncCard.classList.add('hidden');
        if (headerSync) headerSync.style.display = 'none';
    } else if (state === 'locked') {
        setCloudStatus('Bloqueado (Requiere contraseña)', 'pending');
        if (actions) actions.classList.add('hidden');
        if (autoSyncCard) autoSyncCard.classList.add('hidden');
        if (headerSync) headerSync.style.display = 'none';
    } else if (state === 'connected') {
        setCloudStatus('Conectado a la Nube', 'ok');
        if (actions) actions.classList.remove('hidden');
        if (autoSyncCard) autoSyncCard.classList.remove('hidden');
        if (headerSync) headerSync.style.display = 'inline-flex';
        updateAutoSyncUIState(_cloudAutoSyncEnabled);
    } else if (state === 'local') {
        setCloudStatus('Desconectado (Modo local)', '');
        if (actions) actions.classList.add('hidden');
        if (autoSyncCard) autoSyncCard.classList.add('hidden');
        if (headerSync) headerSync.style.display = 'none';
    }
}

// Exponer globalmente a window para eventos onclick
window.submitGithubDecrypt = submitGithubDecrypt;
window.skipGithubDecrypt = skipGithubDecrypt;
window.saveGithubSettings = saveGithubSettings;
window.pushToGithub = pushToGithub;
window.pullFromGithub = pullFromGithub;
window.confirmGithubPull = confirmGithubPull;
window.skipGithubUpdate = skipGithubUpdate;
window.initGithubSync = initGithubSync;

export function toggleFieldVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = button.querySelector('.material-symbols-outlined');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        if (icon) icon.textContent = 'visibility';
    }
}
window.toggleFieldVisibility = toggleFieldVisibility;

