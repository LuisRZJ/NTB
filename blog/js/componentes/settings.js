// settings.js — Ajustes de datos: estadísticas, export/import, reset
import { posts, labels, setPosts, setLabels } from './state.js';
import { savePostsToStorage, saveLabelsToStorage, getConfig, saveConfig } from './storage.js';
import { showToast } from './toast.js';
import { encryptText, decryptText } from './crypto.js';
import { getBackupMetadata, downloadBackup, uploadBackup } from './github.js';

// --- Estadísticas ---
export function updateSettingsStats() {
    const countEl = document.getElementById('stats-posts-count');
    const labelsEl = document.getElementById('stats-labels-count');
    const sizeEl = document.getElementById('stats-db-size');
    const deviceEl = document.getElementById('stats-device-storage');

    if (countEl) countEl.textContent = posts.filter(p => !p.trashed).length;
    if (labelsEl) labelsEl.textContent = labels.length;

    // Estimar tamaño de la DB
    estimateDbSize().then(size => {
        if (sizeEl) sizeEl.textContent = size;
    });

    // Estimación de almacenamiento del dispositivo
    estimateDeviceStorage(deviceEl);
}

async function estimateDbSize() {
    try {
        const dataStr = JSON.stringify({ posts, labels });
        const bytes = new Blob([dataStr]).size;
        return formatBytes(bytes);
    } catch {
        return 'No disponible';
    }
}

async function estimateDeviceStorage(container) {
    if (!container) return;
    try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const used = formatBytes(estimate.usage || 0);
            const quota = formatBytes(estimate.quota || 0);
            const pct = estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0;
            container.innerHTML = `
                <div class="mt-3 flex items-center justify-between text-xs px-1">
                    <span class="text-slate-500 dark:text-slate-400">Almacenamiento del dispositivo:</span>
                    <span class="font-bold text-slate-700 dark:text-slate-300 font-mono">${used} / ${quota} (${pct}%)</span>
                </div>
                <div class="mt-2 w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-google-blue dark:bg-google-blueDark rounded-full transition-all" style="width: ${Math.min(pct, 100)}%"></div>
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    } catch {
        container.innerHTML = '';
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- Exportar datos ---
export function exportData() {
    try {
        const data = {
            version: 1,
            app: 'blog-editor',
            exportedAt: new Date().toISOString(),
            posts: posts,
            labels: labels
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `blog-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Datos exportados correctamente');
    } catch (e) {
        showToast('Error al exportar: ' + e.message);
    }
}

// --- Importar datos ---
export function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Validar formato
            if (!data.posts || !Array.isArray(data.posts)) {
                throw new Error('Formato de archivo inválido: falta array de posts');
            }

            // Importar posts
            const { setPosts, setLabels } = await import('./state.js');
            setPosts(data.posts);
            await savePostsToStorage();

            // Importar labels si existen
            if (data.labels && Array.isArray(data.labels)) {
                setLabels(data.labels);
                await saveLabelsToStorage();
            }

            showToast(`Importados ${data.posts.length} entradas correctamente`);

            // Recargar la página para reflejar cambios
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            showToast('Error al importar: ' + err.message);
        }
    };
    reader.readAsText(file);

    // Reset input para permitir reimportar el mismo archivo
    event.target.value = '';
}

// --- Reset de datos ---
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

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('flex');
    }, 150);
}

export function confirmResetApplicationData() {
    try {
        const req = indexedDB.open('BlogEditorDB');
        req.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['posts', 'labels'], 'readwrite');
            transaction.objectStore('posts').clear();
            transaction.objectStore('labels').clear();

            transaction.oncomplete = () => {
                db.close();
                // Limpiar localStorage del blog pero preservar la bandera seeded = true
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('blog_') && key !== 'blog_seeded') {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                localStorage.setItem('blog_seeded', 'true');

                showToast('Datos eliminados por completo. Recargando...');
                setTimeout(() => location.reload(), 800);
            };

            transaction.onerror = () => {
                db.close();
                showToast('Error al vaciar los almacenes de la base de datos');
            };
        };
        req.onerror = () => {
            showToast('Error al abrir IndexedDB para restablecer');
        };
    } catch (e) {
        showToast('Error: ' + e.message);
    }
}

// ── Sincronización con GitHub ───────────────────────────────

let githubSettings = null;

/**
 * Inicializa y valida el estado de la sincronización de GitHub al arrancar.
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
        console.error('[Settings] Error al inicializar GitHub Sync:', e);
    }
}

function fillGithubUIFields() {
    if (!githubSettings) return;
    const repoInput = document.getElementById('github-repo-input');
    const branchInput = document.getElementById('github-branch-input');
    const pathInput = document.getElementById('github-path-input');

    if (repoInput) repoInput.value = githubSettings.repo || '';
    if (branchInput) branchInput.value = githubSettings.branch || 'main';
    if (pathInput) pathInput.value = githubSettings.filepath || 'ntb-backup.json';
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
    const pathVal = pathInput ? pathInput.value.trim() : 'ntb-backup.json';
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
        // Empaquetar SOLO posts y labels (excluyendo config de IndexedDB)
        const backupData = {
            version: 1,
            app: 'blog-editor',
            exportedAt: new Date().toISOString(),
            posts: posts,
            labels: labels
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
        setPosts(backupData.posts);
        await savePostsToStorage();

        setLabels(backupData.labels);
        await saveLabelsToStorage();

        showToast(`Base de datos restaurada: importadas ${backupData.posts.length} entradas.`);
        
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

        let lastLocalUpdate = '';
        posts.forEach(p => {
            if (p.updatedAt > lastLocalUpdate) {
                lastLocalUpdate = p.updatedAt;
            }
        });

        const cloudTime = new Date(meta.updatedAt).getTime();
        const localTime = lastLocalUpdate ? new Date(lastLocalUpdate).getTime() : 0;

        // Avisar solo si la nube es posterior por más de 5 segundos
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

// Registrar en window para onclick del HTML
window.exportData = exportData;
window.importData = importData;
window.resetApplicationData = resetApplicationData;
window.closeResetDbDialog = closeResetDbDialog;
window.confirmResetApplicationData = confirmResetApplicationData;
window.updateSettingsStats = updateSettingsStats;

// Funciones globales para control de GitHub Sync
window.submitGithubDecrypt = submitGithubDecrypt;
window.skipGithubDecrypt = skipGithubDecrypt;
window.saveGithubSettings = saveGithubSettings;
window.pushToGithub = pushToGithub;
window.pullFromGithub = pullFromGithub;
window.confirmGithubPull = confirmGithubPull;
window.skipGithubUpdate = skipGithubUpdate;
window.initGithubSync = initGithubSync;
