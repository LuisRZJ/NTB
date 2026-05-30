import { state, setLabelsList, getLabelsList } from './state.js';
import { saveNotesToStorage, saveLabelsToStorage, getConfig, saveConfig } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';
import { populateLabelSelectors, renderSidebarLabels } from './labels.js';
import { clearMarkdownCache } from './markdown.js';
import { encryptText, decryptText } from './crypto.js';
import { getBackupMetadata, downloadBackup, uploadBackup } from './github.js';

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

export function exportData() {
    try {
        const backup = {
            version: "1.0",
            timestamp: Date.now(),
            labels: getLabelsList(),
            notes: state.notes
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

export function confirmResetApplicationData() {
    localStorage.clear();
    
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

// ── Sincronización con GitHub ───────────────────────────────

let githubSettings = null;

/**
 * Inicializa y valida el estado de la sincronización de GitHub al arrancar el módulo de Notas.
 */
export async function initGithubSync() {
    try {
        const settings = await getConfig('github_settings');
        if (!settings) {
            updateGithubUIState('unconfigured');
            return;
        }

        githubSettings = settings;
        
        // Restaurar estado si ya se inició en esta sesión
        const sessionToken = sessionStorage.getItem('github_token');
        if (sessionToken) {
            updateGithubUIState('connected');
            fillGithubUIFields();
            verifyCloudVersionSilently(sessionToken);
        } else {
            updateGithubUIState('locked');
            const backdrop = document.getElementById('github-decrypt-backdrop');
            if (backdrop) backdrop.classList.remove('hidden');
        }
    } catch (e) {
        console.error('[Settings] Error al inicializar GitHub Sync en Notas:', e);
    }
}

function fillGithubUIFields() {
    if (!githubSettings) return;
    const repoInput = document.getElementById('github-repo-input');
    const branchInput = document.getElementById('github-branch-input');
    const pathInput = document.getElementById('github-path-input');

    if (repoInput) repoInput.value = githubSettings.repo || '';
    if (branchInput) branchInput.value = githubSettings.branch || 'main';
    if (pathInput) pathInput.value = githubSettings.filepath || 'notas-backup.json';
}

export async function submitGithubDecrypt() {
    const input = document.getElementById('github-decrypt-pass-input');
    const errorMsg = document.getElementById('github-decrypt-error');
    if (!input || !githubSettings) return;

    const password = input.value;
    if (!password) {
        if (errorMsg) {
            errorMsg.textContent = 'Ingresa una contraseña';
            errorMsg.classList.remove('hidden');
        }
        return;
    }

    try {
        const token = await decryptText(githubSettings.encryptedToken, password);
        
        sessionStorage.setItem('github_token', token);
        sessionStorage.setItem('github_sync_pass', password);

        const backdrop = document.getElementById('github-decrypt-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
        if (errorMsg) errorMsg.classList.add('hidden');

        showToast('Credenciales descifradas e inicio de sesión exitoso');
        updateGithubUIState('connected');
        fillGithubUIFields();

        verifyCloudVersionSilently(token);
    } catch (e) {
        if (errorMsg) {
            errorMsg.textContent = 'Contraseña incorrecta';
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
    const repoInput = document.getElementById('github-repo-input');
    const tokenInput = document.getElementById('github-token-input');
    const branchInput = document.getElementById('github-branch-input');
    const pathInput = document.getElementById('github-path-input');
    const passInput = document.getElementById('github-pass-input');

    const repoVal = repoInput ? repoInput.value.trim() : '';
    const tokenVal = tokenInput ? tokenInput.value.trim() : '';
    const branchVal = branchInput ? branchInput.value.trim() : 'main';
    const pathVal = pathInput ? pathInput.value.trim() : 'notas-backup.json';
    const passVal = passInput ? passInput.value : '';

    if (!repoVal || !branchVal || !pathVal) {
        showToast('Rellena los campos del repositorio, rama y ruta del archivo.');
        return;
    }

    let tokenToEncrypt = tokenVal;
    let passwordToUse = passVal;

    if (!tokenVal && githubSettings) {
        const sessionToken = sessionStorage.getItem('github_token');
        if (sessionToken) {
            tokenToEncrypt = sessionToken;
        } else {
            showToast('Ingresa tu Personal Access Token (PAT) de GitHub.');
            return;
        }
    } else if (tokenVal && !passVal) {
        showToast('Ingresa tu Contraseña Maestra de Cifrado para asegurar tus credenciales.');
        return;
    }

    if (!passwordToUse) {
        passwordToUse = sessionStorage.getItem('github_sync_pass') || '';
    }

    if (!passwordToUse) {
        showToast('Proporciona una contraseña para cifrar tus datos.');
        return;
    }

    try {
        showToast('Cifrando y verificando conexión...');

        // Probar conexión a GitHub antes de guardar
        const meta = await getBackupMetadata(tokenToEncrypt, repoVal, pathVal, branchVal);

        const encryptedToken = await encryptText(tokenToEncrypt, passwordToUse);

        const settingsObj = {
            repo: repoVal,
            branch: branchVal,
            filepath: pathVal,
            encryptedToken: encryptedToken
        };

        await saveConfig('github_settings', settingsObj);
        githubSettings = settingsObj;

        sessionStorage.setItem('github_token', tokenToEncrypt);
        sessionStorage.setItem('github_sync_pass', passwordToUse);

        if (tokenInput) tokenInput.value = '';
        if (passInput) passInput.value = '';

        showToast('Configuración de GitHub guardada con éxito.');
        updateGithubUIState('connected');
        
        if (meta.updatedAt) {
            verifyCloudVersionSilently(tokenToEncrypt);
        }
    } catch (err) {
        showToast('Error de conexión o de credenciales: ' + err.message);
    }
}

export async function pushToGithub() {
    const token = sessionStorage.getItem('github_token');
    if (!token || !githubSettings) {
        showToast('Inicia sesión en GitHub descifrando tus credenciales.');
        return;
    }

    const pushBtn = document.getElementById('btn-github-push');
    const originalHTML = pushBtn ? pushBtn.innerHTML : '';
    if (pushBtn) {
        pushBtn.disabled = true;
        pushBtn.innerHTML = '<span class="material-symbols-outlined text-lg animate-spin">sync</span> Subiendo respaldo...';
    }

    try {
        // Empaquetar datos de notas y etiquetas (formato keep_notes nativo)
        const backupData = {
            version: "1.0",
            timestamp: Date.now(),
            notes: state.notes,
            labels: getLabelsList()
        };

        await uploadBackup(
            token,
            githubSettings.repo,
            githubSettings.filepath,
            githubSettings.branch,
            backupData
        );

        showToast('Copia de seguridad subida con éxito a GitHub');
    } catch (e) {
        showToast('Error al respaldar en GitHub: ' + e.message);
    } finally {
        if (pushBtn) {
            pushBtn.disabled = false;
            pushBtn.innerHTML = originalHTML;
        }
    }
}

export function pullFromGithub() {
    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
}

export async function confirmGithubPull() {
    const token = sessionStorage.getItem('github_token');
    if (!token || !githubSettings) {
        showToast('Inicia sesión en GitHub descifrando tus credenciales.');
        return;
    }

    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.add('hidden');

    showToast('Descargando copia de seguridad...');

    try {
        const backupData = await downloadBackup(
            token,
            githubSettings.repo,
            githubSettings.filepath,
            githubSettings.branch
        );

        // Reemplazo Total (Pisar todo)
        state.notes = backupData.notes;
        await saveNotesToStorage();

        setLabelsList(backupData.labels);
        await saveLabelsToStorage();

        showToast(`Base de datos restaurada: importadas ${backupData.notes.length} notas.`);
        
        setTimeout(() => location.reload(), 1000);
    } catch (e) {
        showToast('Error al restaurar copia: ' + e.message);
    }
}

export function skipGithubUpdate() {
    const backdrop = document.getElementById('github-update-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    showToast('Actualización de la nube ignorada. Los cambios locales sobrescribirán la nube en tu próximo respaldo.');
}

async function verifyCloudVersionSilently(token) {
    if (!githubSettings) return;

    try {
        const meta = await getBackupMetadata(
            token,
            githubSettings.repo,
            githubSettings.filepath,
            githubSettings.branch
        );

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
        }
    } catch (e) {
        console.warn('[GitHubSync] Error al verificar versión silenciosa:', e);
    }
}

function updateGithubUIState(state) {
    const badge = document.getElementById('github-status-badge');
    const actions = document.getElementById('github-actions-container');

    if (!badge) return;

    if (state === 'unconfigured') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span> Sin configurar';
        if (actions) actions.classList.add('hidden');
    } else if (state === 'locked') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Bloqueado (Requiere contraseña)';
        if (actions) actions.classList.add('hidden');
    } else if (state === 'connected') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado a GitHub';
        if (actions) actions.classList.remove('hidden');
    } else if (state === 'local') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span> Desconectado (Modo local)';
        if (actions) actions.classList.add('hidden');
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
