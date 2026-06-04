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

// ── Sincronización en la Nube (Vercel Serverless) ───────────────────────────────

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
    const password = sessionStorage.getItem('github_sync_pass');
    if (!password) {
        showToast('Inicia sesión ingresando tu contraseña de sincronización.');
        return;
    }

    const pushBtn = document.getElementById('btn-github-push');
    const originalHTML = pushBtn ? pushBtn.innerHTML : '';
    if (pushBtn) {
        pushBtn.disabled = true;
        pushBtn.innerHTML = '<span class="material-symbols-outlined text-lg animate-spin">sync</span> Subiendo respaldo...';
    }

    try {
        const backupData = {
            version: 1,
            app: 'blog-editor',
            exportedAt: new Date().toISOString(),
            posts: posts,
            labels: labels
        };

        const res = await callSyncAPI('push', password, backupData);

        await saveConfig('last_backup_sha', res.sha);

        showToast('Copia de seguridad subida con éxito a la nube');
    } catch (e) {
        showToast('Error al respaldar en la nube: ' + e.message);
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
}

async function checkCloudVersion(password) {
    try {
        const meta = await callSyncAPI('check', password);

        if (!meta.exists || !meta.sha) return;

        // Comprobar si el archivo en la nube es idéntico al último sincronizado
        const lastBackupSha = await getConfig('last_backup_sha');
        if (meta.sha === lastBackupSha) {
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

    if (!badge) return;

    if (state === 'unconfigured') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span> Sin configurar';
        if (actions) actions.classList.add('hidden');
    } else if (state === 'locked') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Bloqueado (Requiere contraseña)';
        if (actions) actions.classList.add('hidden');
    } else if (state === 'connected') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span> Conectado a la Nube';
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
