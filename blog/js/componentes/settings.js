// settings.js — Ajustes de datos: estadísticas, export/import, reset
import { posts, labels, setPosts, setLabels } from './state.js';
import { savePostsToStorage, saveLabelsToStorage, getConfig, saveConfig } from './storage.js';
import { showToast } from './toast.js';
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
// --- Exportar datos ---
export async function exportData() {
    try {
        const cloudAutoSync = await getConfig('cloudAutoSync');
        const data = {
            version: 1,
            app: 'blog-editor',
            exportedAt: new Date().toISOString(),
            posts: posts,
            labels: labels,
            meta: {
                cloudAutoSync: cloudAutoSync === true || _cloudAutoSyncEnabled
            }
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

            if (data.meta && typeof data.meta.cloudAutoSync === 'boolean') {
                _cloudAutoSyncEnabled = data.meta.cloudAutoSync;
                await saveConfig('cloudAutoSync', _cloudAutoSyncEnabled);
                localStorage.setItem('blog_cloud_auto_sync', _cloudAutoSyncEnabled ? 'true' : 'false');
                updateAutoSyncUIState(_cloudAutoSyncEnabled);
            }
            _dataDirty = false;

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
            app: 'blog-editor',
            exportedAt: new Date().toISOString(),
            posts: posts,
            labels: labels,
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
            localStorage.setItem('blog_cloud_auto_sync', isChecked ? 'true' : 'false');
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
            module: 'blog',
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
 * Inicializa y valida el estado de la sincronización al arrancar.
 */
export async function initGithubSync() {
    try {
        const savedAutoSync = await getConfig('cloudAutoSync');
        _cloudAutoSyncEnabled = savedAutoSync === true || localStorage.getItem('blog_cloud_auto_sync') === 'true';
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

        // 2. Si no hay sesión, verificar localStorage para autologin de 15 días
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
        setPosts(backupData.posts || []);
        await savePostsToStorage();

        setLabels(backupData.labels || []);
        await saveLabelsToStorage();

        if (backupData.meta && typeof backupData.meta.cloudAutoSync === 'boolean') {
            _cloudAutoSyncEnabled = backupData.meta.cloudAutoSync;
            await saveConfig('cloudAutoSync', _cloudAutoSyncEnabled);
            localStorage.setItem('blog_cloud_auto_sync', _cloudAutoSyncEnabled ? 'true' : 'false');
            updateAutoSyncUIState(_cloudAutoSyncEnabled);
        }
        _dataDirty = false;

        // Guardar el SHA local de la versión que acabamos de descargar
        await saveConfig('last_backup_sha', res.sha);

        showToast(`Base de datos restaurada: importadas ${backupData.posts ? backupData.posts.length : 0} entradas.`);
        
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
            if (!_dataDirty) {
                const t = new Date();
                const timeStr = t.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
                setCloudStatus('Sincronizado · ' + timeStr, 'ok');
            }
            return; // Son idénticos, no hay actualización pendiente
        }

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
        console.warn('[Sync] Error al verificar versión silenciosa:', e);
    }
}

function updateGithubUIState(state) {
    const badge = document.getElementById('github-status-badge');
    const actions = document.getElementById('github-actions-container');
    const autoSyncCard = document.getElementById('cloud-autosync-container');
    const headerSync = document.getElementById('header-cloud-sync');

    if (!badge) return;

    if (state === 'unconfigured') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span> Sin configurar';
        if (actions) actions.classList.add('hidden');
        if (autoSyncCard) autoSyncCard.classList.add('hidden');
        if (headerSync) headerSync.style.display = 'none';
    } else if (state === 'locked') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Bloqueado (Requiere contraseña)';
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
