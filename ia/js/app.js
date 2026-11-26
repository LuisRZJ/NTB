// ia/js/app.js — Plataforma centralizada de Chat con IA y Ajustes IA (conectada a TareasDB)

// ── Tema de 3 modos sincronizado con index.html ──
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_META = {
  auto: { icon: 'brightness_auto', label: 'Tema: Automático (según el dispositivo)' },
  light: { icon: 'light_mode', label: 'Tema: Claro' },
  dark: { icon: 'dark_mode', label: 'Tema: Oscuro' }
};
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getThemeMode() {
  try {
    const saved = localStorage.getItem('index_theme_mode');
    return THEME_ORDER.includes(saved) ? saved : 'auto';
  } catch (e) {
    return 'auto';
  }
}

function applyTheme(mode) {
  const html = document.documentElement;
  const safeMode = THEME_ORDER.includes(mode) ? mode : 'auto';
  const isDark = safeMode === 'dark' || (safeMode === 'auto' && systemDarkQuery.matches);
  html.classList.toggle('dark', isDark);
  html.classList.toggle('light', !isDark);

  const meta = THEME_META[safeMode];
  const themeIcon = document.querySelector('.theme-icon');
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeIcon) themeIcon.textContent = meta.icon;
  if (themeBtn) {
    themeBtn.title = meta.label;
    themeBtn.setAttribute('aria-label', meta.label);
  }
}

function toggleTheme() {
  const currentMode = getThemeMode();
  const nextMode = THEME_ORDER[(THEME_ORDER.indexOf(currentMode) + 1) % THEME_ORDER.length];
  try { localStorage.setItem('index_theme_mode', nextMode); } catch (e) {}
  applyTheme(nextMode);
}
window.toggleTheme = toggleTheme;

const handleSystemThemeChange = () => {
  if (getThemeMode() === 'auto') applyTheme('auto');
};
if (typeof systemDarkQuery.addEventListener === 'function') {
  systemDarkQuery.addEventListener('change', handleSystemThemeChange);
}

// ── Estado global compartido con TareasDB ──
let tasks = [];
let aiChats = [];
let aiChatFolders = [];
let _toastTimer = null;
let _aiContextRevision = 0;
let _aiContextCache = null;
const _aiToolQueryCache = new Map();

let currentAIChatId = null;
let activeAIChatTab = 'home';
let aiChatSearchQuery = '';
let _isAIChatGenerating = false;
let _renamingChatId = null;
let _deletingChatId = null;

const AI_HISTORY_WINDOW_MAX = 18;
const AI_HISTORY_RECENT_KEEP = 16;
const AI_CONTEXT_CACHE_TTL_MS = 60000;
const FOLDER_CONTEXT_MAX_TOKENS = 5000;

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let _cloudAutoSyncEnabled = false;
let _dataDirty = false;
let _autoSyncTimer = null;
let _isSyncingCloud = false;
let _autoSyncPending = false;
let _autoSyncRetryCount = 0;
let _autoSyncRetryTimer = null;
const AUTO_SYNC_DEBOUNCE_MS = 3500;

function setIACloudStatus(msg, type = '') {
  const wrap = document.getElementById('ia-cloud-sync-status');
  const dot = document.getElementById('ia-cloud-sync-dot');
  const txt = document.getElementById('ia-cloud-sync-text');
  if (!wrap || !dot || !txt) return;

  wrap.classList.remove('hidden');
  txt.textContent = msg;

  let dotCls = 'w-2 h-2 rounded-full ';
  if (type === 'ok') dotCls += 'bg-emerald-500';
  else if (type === 'err') dotCls += 'bg-red-500';
  else if (type === 'loading') dotCls += 'bg-google-blue dark:bg-google-blueDark animate-pulse';
  else if (type === 'pending') dotCls += 'bg-amber-500 animate-pulse';
  else dotCls += 'bg-slate-400';
  dot.className = dotCls;
}

async function executeIACloudBackup({ silent = false, isAuto = false } = {}) {
  const password = sessionStorage.getItem('github_sync_pass');
  const encKey = sessionStorage.getItem('github_enc_key');
  if (!password || !encKey) {
    if (!silent) showToast('Conecta tu contraseña de sincronización y clave de cifrado en Ajustes de IA.');
    return false;
  }

  setIACloudStatus('Guardando en la nube...', 'loading');

  try {
    const [
      taskList, catList, projList, histList, chatList, folderList,
      orModel, gModel, aiProv,
      makerCats, savedThemeConfig, cloudAutoSync
    ] = await Promise.all([
      dbGetAll(), dbGetAllCats(), dbGetAllProjects(), dbGetHistory(),
      typeof dbGetAllChats === 'function' ? dbGetAllChats() : Promise.resolve([]),
      typeof dbGetAllChatFolders === 'function' ? dbGetAllChatFolders() : Promise.resolve([]),
      dbGetMeta('openRouterModel'),
      dbGetMeta('googleAIModel'),
      dbGetMeta('aiProvider'),
      dbGetMeta('makerCategories'),
      dbGetMeta('themeConfig'),
      dbGetMeta('cloudAutoSync')
    ]);

    const backupData = {
      version: 1,
      exported: new Date().toISOString(),
      tasks: taskList,
      categories: catList,
      projects: projList,
      history: histList,
      aiChats: chatList,
      aiChatFolders: folderList,
      meta: {
        openRouterModel: orModel || null,
        googleAIModel: gModel || null,
        aiProvider: aiProv || null,
        cloudAutoSync: cloudAutoSync === true,
        makerCategories: makerCats || [],
        themeConfig: savedThemeConfig || null
      }
    };

    const encryptedPayload = await window.encryptText(JSON.stringify(backupData), encKey);
    const envelope = {
      encrypted: true,
      v: 1,
      alg: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: 100000,
      ...encryptedPayload
    };

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        module: 'tareas',
        action: 'push',
        data: envelope
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error HTTP ${response.status}`);
    }

    const res = await response.json();
    _dataDirty = false;
    await dbSetMeta('lastBackupTime', backupData.exported);
    await dbSetMeta('last_backup_sha', res.sha);

    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setIACloudStatus('Sincronizado · ' + timeStr, 'ok');
    if (!silent) showToast('☁ Respaldo cifrado subido a la nube');
    return true;
  } catch (e) {
    console.error('[IASync] Error al respaldar:', e);
    if (!silent) showToast('Error al respaldar: ' + e.message);
    setIACloudStatus(isAuto ? 'Error al sincronizar · Reintentando...' : 'Error al subir', 'err');
    throw e;
  }
}

function scheduleAutoSync() {
  if (!_cloudAutoSyncEnabled) return;
  if (!sessionStorage.getItem('github_sync_pass') || !sessionStorage.getItem('github_enc_key')) return;

  if (_autoSyncTimer) clearTimeout(_autoSyncTimer);
  if (_autoSyncRetryTimer) clearTimeout(_autoSyncRetryTimer);

  setIACloudStatus('Cambios pendientes...', 'pending');
  _autoSyncTimer = setTimeout(async () => {
    _autoSyncTimer = null;
    await runAutoSync();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function runAutoSync(force = false) {
  if (!_cloudAutoSyncEnabled && !force) return;
  if (!sessionStorage.getItem('github_sync_pass') || !sessionStorage.getItem('github_enc_key')) return;

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
    await executeIACloudBackup({ silent: true, isAuto: true });
    _autoSyncRetryCount = 0;
  } catch (err) {
    _autoSyncRetryCount++;
    const delay = Math.min(60000, 5000 * Math.pow(2, _autoSyncRetryCount - 1));
    _autoSyncRetryTimer = setTimeout(() => runAutoSync(), delay);
  } finally {
    _isSyncingCloud = false;
    if (_autoSyncPending) {
      _autoSyncPending = false;
      if (_dataDirty) runAutoSync();
    }
  }
}

function markDirty() {
  _aiContextRevision++;
  _aiContextCache = null;
  _aiToolQueryCache.clear();
  _dataDirty = true;
  if (_cloudAutoSyncEnabled) {
    scheduleAutoSync();
  }
}

// ── Helpers de fecha y tareas ──
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function parseISODateLocal(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatISODateLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = parseISODateLocal(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + Number(days));
  return formatISODateLocal(d);
}

function isDateAllowedByWeeklyRepeat(dateStr, repeatVal) {
  const repStr = String(repeatVal || '');
  if (!repStr.startsWith('dw:')) return true;
  const allowed = repStr.slice(3).split(',').map(Number).filter(x => !isNaN(x) && x >= 0 && x <= 6);
  if (!allowed.length) return true;
  const d = parseISODateLocal(dateStr);
  return d ? allowed.includes(d.getDay()) : true;
}

function isTaskScheduledForDate(task, dateStr) {
  if (!task || task.due !== dateStr) return false;
  return isDateAllowedByWeeklyRepeat(dateStr, task.repeat);
}

function isTaskOverdue(t) {
  if (!t || t.done || !t.due) return false;
  const today = todayISO();
  if (t.due < today) return true;
  if (t.due === today && t.dueTime && t.dueTime.includes(':')) {
    const [hh, mm] = t.dueTime.split(':').map(Number);
    const nowD = new Date();
    return (nowD.getHours() * 60 + nowD.getMinutes()) > (hh * 60 + mm);
  }
  return false;
}

function formatRepeat(repeatVal) {
  if (!repeatVal) return '';
  const repStr = String(repeatVal);
  if (repStr.startsWith('dw:')) {
    const dayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const days = repStr.slice(3).split(',').map(Number).filter(x => !isNaN(x) && x >= 0 && x <= 6);
    return days.map(d => dayLabels[d]).join(' ');
  }
  let n, unit;
  if (repStr.includes(':')) { [n, unit] = repStr.split(':'); n = Number(n); }
  else { n = Number(repStr); unit = 'd'; }
  const labels = { h: n === 1 ? 'hora' : 'horas', d: n === 1 ? 'día' : 'días', w: n === 1 ? 'semana' : 'semanas', m: n === 1 ? 'mes' : 'meses', y: n === 1 ? 'año' : 'años' };
  return `cada ${n} ${labels[unit] || unit}`;
}

function getTaskCats(t) {
  if (Array.isArray(t.cats) && t.cats.length) return t.cats;
  return t.cat ? [t.cat] : [];
}

function getSubtasks(id) {
  return tasks.filter(t => String(t.parentId) === String(id));
}

function sortTasks(arr) {
  return [...arr].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const aDue = a.due || '';
    const bDue = b.due || '';
    if (!aDue && !bDue) return 0;
    if (!aDue) return 1;
    if (!bDue) return -1;
    if (a.done) return aDue > bDue ? -1 : aDue < bDue ? 1 : 0;
    return aDue < bDue ? -1 : aDue > bDue ? 1 : 0;
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ── Métricas de rendimiento (para herramienta get_productivity_metrics) ──
function isoWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function calcWinRate(allTasks, viewYear, viewMonth) {
  const planned = allTasks.filter(t => {
    if (!t.due) return false;
    const d = new Date(t.due + 'T00:00:00');
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
  if (!planned.length) return null;
  const completedOnTime = planned.filter(t => t.done && t.doneAt === t.due);
  return Math.round(completedOnTime.length / planned.length * 100);
}

function calcCycleTime(doneTasks) {
  const valid = doneTasks.filter(t => !t.parentId && t.doneAt);
  if (!valid.length) return null;
  const total = valid.reduce((sum, t) => {
    const created = new Date(t.id);
    created.setHours(0, 0, 0, 0);
    const doneDate = new Date(t.doneAt + 'T00:00:00');
    return sum + Math.max(0, (doneDate - created) / 86400000);
  }, 0);
  return Math.round(total / valid.length * 10) / 10;
}

function calcWeekStreak(doneTasks) {
  const weekSet = new Set();
  doneTasks.forEach(t => {
    if (t.doneAt) weekSet.add(isoWeek(new Date(t.doneAt + 'T00:00:00')));
  });
  return { count: weekSet.size };
}

function calcImpactFactor(doneTasks, makerCats) {
  if (!makerCats || !makerCats.length) return null;
  const total = doneTasks.length;
  if (!total) return null;
  const makerCount = doneTasks.filter(t => getTaskCats(t).some(c => makerCats.includes(c))).length;
  return { maker: makerCount, manager: total - makerCount, pct: Math.round(makerCount / total * 100) };
}

// ── Gestión de Tokens de Carpetas y Carga Inicial ──
function estimateFolderContextTokens(text) {
  if (!text) return 0;
  const str = String(text);
  if (!str.trim()) return 0;
  const charBased = Math.ceil(str.length / 3.8);
  const segments = str.trim().match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
  let lexicalTokens = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i].length;
    lexicalTokens += len > 6 ? Math.ceil(len / 4.2) : 1;
  }
  return Math.max(1, Math.max(charBased, lexicalTokens));
}

function truncateToMaxFolderTokens(text, maxTokens = FOLDER_CONTEXT_MAX_TOKENS) {
  const str = String(text || '');
  const initialTokens = estimateFolderContextTokens(str);
  if (initialTokens <= maxTokens) return { text: str, truncated: false, tokens: initialTokens };
  let low = 0, high = str.length, best = '';
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = str.slice(0, mid);
    if (estimateFolderContextTokens(candidate) <= maxTokens) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { text: best, truncated: true, tokens: estimateFolderContextTokens(best) };
}

function normalizeAIChatFolder(rawFolder) {
  if (!rawFolder || typeof rawFolder !== 'object') return null;
  const rawContext = typeof rawFolder.contextPrompt === 'string' ? rawFolder.contextPrompt.trim() : '';
  const capped = rawContext ? truncateToMaxFolderTokens(rawContext, FOLDER_CONTEXT_MAX_TOKENS) : { text: '', tokens: 0 };
  return { ...rawFolder, contextPrompt: capped.text, contextTokens: capped.tokens };
}

async function loadAIChats() {
  try {
    const raw = typeof dbGetAllChats === 'function' ? await dbGetAllChats() : [];
    aiChats = Array.isArray(raw) ? raw : [];
    aiChats.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  } catch (err) {
    aiChats = [];
  }
}

async function loadAIChatFolders() {
  try {
    const raw = typeof dbGetAllChatFolders === 'function' ? await dbGetAllChatFolders() : [];
    aiChatFolders = (Array.isArray(raw) ? raw : []).map(normalizeAIChatFolder).filter(Boolean);
    aiChatFolders.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (err) {
    aiChatFolders = [];
  }
}

async function sanitizeAIChatFolderReferences() {
  if (!Array.isArray(aiChats) || !aiChats.length) return;
  const validIds = new Set(aiChatFolders.map(f => String(f.id)));
  for (const chat of aiChats) {
    if (chat.folderId && !validIds.has(String(chat.folderId))) {
      chat.folderId = null;
      await dbPutChat(chat).catch(() => {});
    }
  }
}

// ── Proxy IA y Autenticación ──
async function restoreSessionFromLocalStorage() {
  const storedEncKey = localStorage.getItem('github_enc_key');
  if (sessionStorage.getItem('github_sync_pass')) {
    if (!sessionStorage.getItem('github_enc_key') && storedEncKey) {
      sessionStorage.setItem('github_enc_key', storedEncKey);
    }
    return true;
  }
  const storedPass = localStorage.getItem('github_sync_pass');
  const savedAtStr = localStorage.getItem('github_sync_pass_saved_at');
  if (!storedPass || !savedAtStr) return false;
  const savedAt = parseInt(savedAtStr, 10) || 0;
  if ((Date.now() - savedAt) >= 15 * 24 * 60 * 60 * 1000) return false;
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: storedPass, action: 'auth' })
    });
    if (res.ok) {
      sessionStorage.setItem('github_sync_pass', storedPass);
      if (storedEncKey) sessionStorage.setItem('github_enc_key', storedEncKey);
      return true;
    }
  } catch (e) {}
  return false;
}

async function callAIProxy(payload) {
  const password = sessionStorage.getItem('github_sync_pass');
  if (!password) {
    throw new Error('Conecta tu sesión en Ajustes de IA (icono de configuración) para usar la IA.');
  }
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, action: 'chat', ...payload })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || `Error HTTP ${res.status} en /api/ai`);
  }
  return await res.json();
}

async function getActiveAIProviderConfig() {
  const [providerRaw, orModel, gModel] = await Promise.all([
    dbGetMeta('aiProvider'),
    dbGetMeta('openRouterModel'),
    dbGetMeta('googleAIModel')
  ]);
  const hasSession = Boolean(sessionStorage.getItem('github_sync_pass'));
  const provider = (providerRaw === 'googleai' || providerRaw === 'google') ? 'googleai' : 'openrouter';
  if (provider === 'googleai') {
    const modelRaw = (gModel || '').trim() || 'gemini-2.5-flash';
    const cleanModel = modelRaw.startsWith('models/') ? modelRaw.slice(7) : modelRaw;
    return { provider: 'googleai', providerName: 'Google AI Studio', hasSession, model: cleanModel, shortModel: cleanModel.split('/').pop() };
  }
  const cleanModel = (orModel || '').trim() || 'mistralai/mistral-small-2603';
  return { provider: 'openrouter', providerName: 'OpenRouter', hasSession, model: cleanModel, shortModel: cleanModel.split('/').pop() };
}

async function callAIChatProvider(messages, systemInstruction, options = {}) {
  const cfg = await getActiveAIProviderConfig();
  if (!cfg.hasSession) {
    openAISettingsModal();
    showToast('⚠️ Conecta tu sesión en Ajustes de IA para continuar');
    throw new Error('Falta conectar la sesión en Ajustes de IA.');
  }
  return await callAIProxy({
    provider: cfg.provider,
    model: cfg.model,
    messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    systemInstruction: systemInstruction || undefined,
    maxTokens: options.maxTokens
  });
}

// ── Contexto Base y 7 Herramientas DB (Solo módulo de Tareas) ──
async function buildAISystemContext() {
  const today = todayISO();
  const nowMs = Date.now();
  if (_aiContextCache && _aiContextCache.dateKey === today && _aiContextCache.revision === _aiContextRevision && (nowMs - _aiContextCache.ts) < AI_CONTEXT_CACHE_TTL_MS) {
    return _aiContextCache.prompt;
  }

  const makerCats = (await dbGetMeta('makerCategories').catch(() => null)) || [];
  const topTasks = tasks.filter(t => !t.parentId);
  const pendingTop = topTasks.filter(t => !t.done);
  const doneToday = topTasks.filter(t => t.done && t.doneAt === today);
  const overdueTop = pendingTop.filter(t => isTaskOverdue(t));

  const formatCompactTask = (t) => {
    const cats = getTaskCats(t).map(k => CATS[k]?.label || k).join(', ');
    const proj = t.project ? (getProjectById(Number(t.project))?.name || '') : '';
    const subs = getSubtasks(t.id);
    const subInfo = subs.length ? ` | Subtareas: ${subs.filter(s => s.done).length}/${subs.length}` : '';
    const snoozes = Array.isArray(t.snoozedDates) && t.snoozedDates.length ? ` | Pospuesta ${t.snoozedDates.length}x` : '';
    const dueInfo = t.due ? `${t.due}${t.dueTime ? ' ' + t.dueTime : ''}` : 'Sin fecha';
    return `- [ID:${t.id}] "${t.text}" | Pri:${t.pri || 'mid'} | Estado:${t.done ? 'Completada' : 'Pendiente'} | Fecha:${dueInfo}${proj ? ' | Proy:' + proj : ''}${cats ? ' | Cat:' + cats : ''}${subInfo}${snoozes}`;
  };

  const todayPending = sortTasks(pendingTop.filter(t => isTaskScheduledForDate(t, today)));
  const todayLines = [...todayPending.slice(0, 20).map(formatCompactTask), ...doneToday.slice(0, 10).map(formatCompactTask)];
  const overdueLines = [...overdueTop].sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 10).map(formatCompactTask);
  const nextWeekDate = addDays(today, 7);
  const upcomingLines = sortTasks(pendingTop.filter(t => t.due && t.due > today && t.due <= nextWeekDate)).slice(0, 8).map(formatCompactTask);

  const projSummary = PROJECTS.length
    ? PROJECTS.map(p => {
        const pTasks = topTasks.filter(t => String(t.project) === String(p.id));
        return `[ID:${p.id}] ${p.name} (${pTasks.filter(t => !t.done).length} pend / ${pTasks.filter(t => t.done).length} comp)`;
      }).join(' · ')
    : 'Ningún proyecto creado aún';

  const catSummary = Object.entries(CATS).map(([k, c]) => `${k}: ${c.label}${makerCats.includes(k) ? ' [Maker]' : ''}`).join(' · ');
  const daysName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];

  const prompt = `Eres el Asistente IA de NTB Workspace, conectado únicamente a los datos del módulo "Daily Planner" (Tareas).
Responde siempre en español con un tono profesional, cálido, directo y analítico. Utiliza formato Markdown claro.

=== HABILIDADES Y HERRAMIENTAS DE BASE DE DATOS (TOOL CALLING) ===
Tienes acceso directo a la base de datos IndexedDB de Tareas del usuario mediante 7 habilidades.
Cuando necesites consultar más tareas o cuando el usuario te pida crear, completar o modificar una tarea, emite ÚNICAMENTE un bloque con este formato exacto:
<tool_call>{"tool": "NOMBRE_HERRAMIENTA", "args": {...}}</tool_call>

Herramientas disponibles:
1. "search_tasks": { "query": "texto", "status": "pending|done|overdue|all", "priority": "high|mid|low", "category": "clave_cat", "projectId": id, "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD", "includeSubtasks": true|false, "limit": 25 }
2. "get_task_details": { "taskId": id_de_la_tarea }
3. "get_project_tasks": { "projectId": id_opcional, "projectName": "nombre_opcional" }
4. "get_activity_history": { "days": 14, "type": "all|created|completed", "limit": 40 }
5. "get_productivity_metrics": { "monthOffset": 0 }
6. "create_task": { "title": "Título", "desc": "Markdown", "pri": "high|mid|low", "due": "YYYY-MM-DD", "dueTime": "HH:MM", "cat": "clave_cat", "project": "id_proyecto", "subtasks": ["Subtarea 1"] }
7. "update_task_status": { "taskId": id, "done": true|false, "due": "YYYY-MM-DD", "dueTime": "HH:MM", "pri": "high|mid|low", "title": "Nuevo título" }

=== EXTRACTO BASE EN CACHÉ (ESTADO ACTUAL DE TAREAS) ===
Fecha actual: ${daysName}, ${today}
Resumen global: ${pendingTop.length} tareas principales pendientes · ${overdueTop.length} vencidas · ${doneToday.length} completadas hoy · ${tasks.length} registros totales.
Proyectos activos: ${projSummary}
Categorías disponibles: ${catSummary}

[TAREAS DE HOY (${todayLines.length})]:
${todayLines.length ? todayLines.join('\n') : '(Sin tareas programadas específicamente para hoy)'}

[TAREAS VENCIDAS / ATRASADAS (Mostrando ${overdueLines.length} de ${overdueTop.length})]:
${overdueLines.length ? overdueLines.join('\n') : '(Ninguna tarea vencida)'}

[PRÓXIMAS TAREAS EN LOS SIGUIENTES 7 DÍAS (Top ${upcomingLines.length})]:
${upcomingLines.length ? upcomingLines.join('\n') : '(Sin tareas programadas para los próximos 7 días)'}`;

  _aiContextCache = {
    dateKey: today,
    revision: _aiContextRevision,
    ts: nowMs,
    prompt,
    stats: { pendingCount: pendingTop.length, overdueCount: overdueTop.length, projectsCount: PROJECTS.length }
  };

  updateAIChatContextPill(_aiContextCache.stats);
  return prompt;
}

function updateAIChatContextPill(stats) {
  const pillText = document.getElementById('aichat-context-pill-text');
  if (!pillText) return;
  const pend = stats ? stats.pendingCount : tasks.filter(t => !t.parentId && !t.done).length;
  const over = stats ? stats.overdueCount : tasks.filter(t => !t.parentId && isTaskOverdue(t)).length;
  pillText.textContent = `Tareas en caché: ${pend} pendiente${pend === 1 ? '' : 's'}${over > 0 ? ` (${over} vencida${over === 1 ? '' : 's'})` : ''} · ${PROJECTS.length} proyecto${PROJECTS.length === 1 ? '' : 's'} · 7 habilidades`;
}

function buildSlidingChatHistory(messages) {
  const valid = (Array.isArray(messages) ? messages : []).filter(
    m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
  );
  if (valid.length <= AI_HISTORY_WINDOW_MAX) return valid.map(m => ({ role: m.role, content: m.content }));
  const firstTwo = valid.slice(0, 2).map(m => ({ role: m.role, content: m.content }));
  const middle = valid.slice(2, valid.length - AI_HISTORY_RECENT_KEEP);
  const recent = valid.slice(valid.length - AI_HISTORY_RECENT_KEEP).map(m => ({ role: m.role, content: m.content }));
  const middleDigest = middle.map(m => {
    const clean = m.content.replace(/\s+/g, ' ').trim();
    return `- ${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${clean.length > 160 ? clean.slice(0, 157) + '...' : clean}`;
  }).join('\n');
  return [...firstTwo, { role: 'user', content: `[Resumen de ${middle.length} mensajes intermedios:\n${middleDigest}]` }, ...recent];
}

async function executeAITool(toolName, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const isReadOnly = ['search_tasks', 'get_task_details', 'get_project_tasks', 'get_activity_history', 'get_productivity_metrics'].includes(toolName);
  const cacheKey = isReadOnly ? `${_aiContextRevision}:${toolName}:${JSON.stringify(args)}` : null;
  if (cacheKey && _aiToolQueryCache.has(cacheKey)) return _aiToolQueryCache.get(cacheKey);

  let output = null;
  try {
    if (toolName === 'search_tasks') {
      const q = String(args.query || '').trim().toLowerCase();
      const status = args.status || 'all';
      const pri = args.priority || '';
      const cat = args.category || '';
      const projId = args.projectId !== undefined && args.projectId !== null ? String(args.projectId) : '';
      const dateFrom = args.dateFrom || '';
      const dateTo = args.dateTo || '';
      const incSubs = !!args.includeSubtasks;
      const limit = Math.min(60, Math.max(1, Number(args.limit) || 25));

      let pool = tasks.filter(t => incSubs ? true : !t.parentId);
      if (status === 'pending') pool = pool.filter(t => !t.done);
      else if (status === 'done') pool = pool.filter(t => t.done);
      else if (status === 'overdue') pool = pool.filter(t => isTaskOverdue(t));
      if (pri) pool = pool.filter(t => t.pri === pri);
      if (cat) pool = pool.filter(t => getTaskCats(t).includes(cat));
      if (projId) {
        pool = pool.filter(t => {
          if (String(t.project) === projId) return true;
          const pObj = getProjectById(Number(t.project));
          return pObj && pObj.name.toLowerCase().includes(projId.toLowerCase());
        });
      }
      if (dateFrom) pool = pool.filter(t => (t.due || t.doneAt || '') >= dateFrom);
      if (dateTo) pool = pool.filter(t => (t.due || t.doneAt || '') <= dateTo);
      if (q) pool = pool.filter(t => (t.text && t.text.toLowerCase().includes(q)) || (t.desc && t.desc.toLowerCase().includes(q)));

      const results = pool.slice(0, limit).map(t => ({
        id: t.id, title: t.text, descPreview: t.desc ? t.desc.slice(0, 180) : '', done: !!t.done, doneAt: t.doneAt || null,
        priority: t.pri || 'mid', due: t.due || null, dueTime: t.dueTime || null,
        categories: getTaskCats(t).map(k => CATS[k]?.label || k),
        project: t.project ? (getProjectById(Number(t.project))?.name || t.project) : null,
        snoozeCount: Array.isArray(t.snoozedDates) ? t.snoozedDates.length : 0, subtasksCount: getSubtasks(t.id).length
      }));
      output = { badgeLabel: `🔍 Búsqueda en BD: ${results.length} tarea(s)`, data: { totalMatched: pool.length, returned: results.length, tasks: results } };

    } else if (toolName === 'get_task_details') {
      const t = tasks.find(x => String(x.id) === String(args.taskId));
      if (!t) {
        output = { badgeLabel: `🔍 Tarea #${args.taskId}: no encontrada`, data: { error: `No se encontró tarea con ID ${args.taskId}` } };
      } else {
        output = {
          badgeLabel: `📄 Detalle: "${t.text.slice(0, 32)}"`,
          data: {
            id: t.id, title: t.text, descriptionMarkdown: t.desc || '(Sin descripción)', done: !!t.done, doneAt: t.doneAt || null,
            priority: t.pri || 'mid', due: t.due || null, dueTime: t.dueTime || null,
            repeat: t.repeat ? formatRepeat(t.repeat) : null,
            categories: getTaskCats(t).map(k => CATS[k]?.label || k),
            project: t.project ? (getProjectById(Number(t.project))?.name || null) : null,
            snoozedDates: t.snoozedDates || [],
            subtasks: getSubtasks(t.id).map(s => ({ id: s.id, title: s.text, done: !!s.done, doneAt: s.doneAt || null, priority: s.pri || 'mid' }))
          }
        };
      }

    } else if (toolName === 'get_project_tasks') {
      const pId = args.projectId;
      const pName = String(args.projectName || '').trim().toLowerCase();
      let targetProjects = PROJECTS;
      if (pId !== undefined && pId !== null && pId !== '') targetProjects = PROJECTS.filter(p => String(p.id) === String(pId));
      else if (pName) targetProjects = PROJECTS.filter(p => p.name.toLowerCase().includes(pName));

      const projectDetails = targetProjects.map(p => {
        const pTasks = tasks.filter(t => !t.parentId && String(t.project) === String(p.id));
        return {
          id: p.id, name: p.name, description: p.desc || '', totalTasks: pTasks.length,
          pendingCount: pTasks.filter(t => !t.done).length, completedCount: pTasks.filter(t => t.done).length,
          overdueCount: pTasks.filter(t => isTaskOverdue(t)).length,
          tasks: pTasks.slice(0, 30).map(t => ({ id: t.id, title: t.text, done: !!t.done, priority: t.pri || 'mid', due: t.due || null }))
        };
      });
      output = { badgeLabel: `◫ Proyectos consultados (${projectDetails.length})`, data: { projects: projectDetails } };

    } else if (toolName === 'get_activity_history') {
      const days = Math.min(90, Math.max(1, Number(args.days) || 14));
      const type = args.type || 'all';
      const limit = Math.min(80, Math.max(1, Number(args.limit) || 40));
      const cutoffIso = new Date(Date.now() - days * 86400000).toISOString();
      const allHist = await dbGetHistory();
      let filtered = allHist.filter(h => (h.ts || '') >= cutoffIso);
      if (type === 'created') filtered = filtered.filter(h => h.type === 'created' || h.type === 'migrated');
      else if (type === 'completed') filtered = filtered.filter(h => h.type === 'completed');
      filtered.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      output = {
        badgeLabel: `🕒 Historial (${Math.min(limit, filtered.length)} eventos en ${days}d)`,
        data: { daysAnalyzed: days, totalEvents: filtered.length, events: filtered.slice(0, limit).map(h => ({ type: h.type, taskTitle: h.taskText, priority: h.taskPri || 'mid', timestamp: h.ts })) }
      };

    } else if (toolName === 'get_productivity_metrics') {
      const offset = Number(args.monthOffset) || 0;
      const nowD = new Date();
      const viewYear = nowD.getFullYear() + Math.floor((nowD.getMonth() + offset) / 12);
      const viewMonth = ((nowD.getMonth() + offset) % 12 + 12) % 12;
      const done = tasks.filter(t => t.done);
      const makerCats = (await dbGetMeta('makerCategories').catch(() => null)) || [];
      output = {
        badgeLabel: `📊 Métricas analizadas`,
        data: {
          month: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`,
          winRatePercent: calcWinRate(tasks, viewYear, viewMonth),
          avgCycleTimeDays: calcCycleTime(done),
          weeklyStreak: calcWeekStreak(done).count,
          makerImpactFactor: calcImpactFactor(done, makerCats)
        }
      };

    } else if (toolName === 'create_task') {
      const title = String(args.title || '').trim();
      if (!title) {
        output = { badgeLabel: '⚠️ Falta título', data: { error: 'El campo title es obligatorio' } };
      } else {
        const pri = ['high', 'mid', 'low'].includes(args.pri) ? args.pri : 'mid';
        const due = args.due ? String(args.due).trim() : todayISO();
        const dueTime = args.dueTime ? String(args.dueTime).trim() : '';
        const desc = args.desc ? String(args.desc).trim() : '';
        const cats = args.cat && CATS[args.cat] ? [args.cat] : [];
        let projId = '';
        if (args.project) {
          const foundProj = PROJECTS.find(p => String(p.id) === String(args.project) || p.name.toLowerCase() === String(args.project).toLowerCase());
          if (foundProj) projId = String(foundProj.id);
        }
        const newId = Date.now();
        const newTask = { id: newId, text: title, desc, cats, cat: cats[0] || '', pri, project: projId, due, origDue: due, dueTime, repeat: '', done: false };
        tasks.unshift(newTask);
        await dbPut(newTask);
        await dbAddHistory({ id: Date.now() + Math.floor(Math.random() * 999), type: 'created', taskId: newId, taskText: title, taskPri: pri, cats, ts: new Date().toISOString() });

        const createdSubs = [];
        if (Array.isArray(args.subtasks)) {
          let offsetMs = 1;
          for (const subTitle of args.subtasks) {
            const cleanSub = String(subTitle || '').trim();
            if (!cleanSub) continue;
            const subTask = { id: newId + (offsetMs++), text: cleanSub, done: false, pri: 'mid', cats, cat: cats[0] || '', project: projId, parentId: newId };
            tasks.push(subTask);
            await dbPut(subTask);
            createdSubs.push(cleanSub);
          }
        }
        markDirty();
        output = { badgeLabel: `✓ Tarea creada: "${title.slice(0, 34)}"`, data: { success: true, createdTask: { id: newId, title, pri, due, dueTime, subtasksCreated: createdSubs.length } } };
      }

    } else if (toolName === 'update_task_status') {
      const t = tasks.find(x => String(x.id) === String(args.taskId));
      if (!t) {
        output = { badgeLabel: `⚠️ Tarea #${args.taskId} no encontrada`, data: { error: `No existe tarea con ID ${args.taskId}` } };
      } else {
        if (typeof args.title === 'string' && args.title.trim()) t.text = args.title.trim();
        if (typeof args.desc === 'string') t.desc = args.desc.trim();
        if (['high', 'mid', 'low'].includes(args.pri)) t.pri = args.pri;
        if (typeof args.due === 'string') { t.due = args.due.trim(); if (!t.origDue) t.origDue = t.due; }
        if (typeof args.dueTime === 'string') t.dueTime = args.dueTime.trim();
        if (typeof args.done === 'boolean' && args.done !== !!t.done) {
          t.done = args.done;
          t.doneAt = args.done ? todayISO() : null;
          if (args.done) {
            await dbAddHistory({ id: Date.now() + Math.floor(Math.random() * 999), type: 'completed', taskId: t.id, taskText: t.text, taskPri: t.pri || 'mid', cats: getTaskCats(t), ts: new Date().toISOString() });
          }
        }
        await dbPut(t);
        markDirty();
        output = { badgeLabel: `✓ Tarea actualizada: "${t.text.slice(0, 32)}"`, data: { success: true, updatedTask: { id: t.id, title: t.text, done: !!t.done, due: t.due, pri: t.pri } } };
      }
    } else {
      output = { badgeLabel: `⚠️ Habilidad desconocida: ${toolName}`, data: { error: `La herramienta "${toolName}" no existe.` } };
    }
  } catch (err) {
    output = { badgeLabel: `⚠️ Error en ${toolName}`, data: { error: err.message || 'Error interno en IndexedDB' } };
  }

  if (cacheKey && output) _aiToolQueryCache.set(cacheKey, output);
  return output;
}

function parseToolCallFromResponse(text) {
  if (!text) return null;
  const match = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (!match) return null;
  try {
    let rawJson = match[1].trim();
    if (rawJson.startsWith('```')) rawJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed.tool === 'string') return { tool: parsed.tool, args: parsed.args || {} };
  } catch (e) {}
  return null;
}

async function runAIChatTurnWithTools(chat, onToolActivity) {
  const baseSystemPrompt = await buildAISystemContext();
  const folder = (chat && chat.folderId) ? getAIChatFolderById(chat.folderId) : null;
  const rawFolderContext = (folder && typeof folder.contextPrompt === 'string') ? folder.contextPrompt.trim() : '';
  const cappedFolderContext = rawFolderContext ? truncateToMaxFolderTokens(rawFolderContext, FOLDER_CONTEXT_MAX_TOKENS).text : '';

  const systemPrompt = cappedFolderContext
    ? `${baseSystemPrompt}\n\n=== CONTEXTO ADICIONAL PRECARGADO DE LA CARPETA «${folder.name}» ===\n"""\n${cappedFolderContext}\n"""`
    : baseSystemPrompt;

  const workingMessages = buildSlidingChatHistory(chat.messages);
  const executedTools = [];
  let lastProviderInfo = null;

  for (let round = 0; round < 3; round++) {
    const res = await callAIChatProvider(workingMessages, systemPrompt);
    lastProviderInfo = { provider: res.provider, model: res.model };

    const toolCall = parseToolCallFromResponse(res.text);
    if (!toolCall) {
      return { replyText: res.text || 'Sin respuesta del modelo.', executedTools, provider: res.provider, model: res.model };
    }
    if (typeof onToolActivity === 'function') onToolActivity(`Consultando habilidad: ${toolCall.tool}...`);
    const toolResult = await executeAITool(toolCall.tool, toolCall.args);
    executedTools.push({ tool: toolCall.tool, badge: toolResult.badgeLabel });
    if (typeof onToolActivity === 'function') onToolActivity(toolResult.badgeLabel);

    workingMessages.push({ role: 'assistant', content: `<tool_call>${JSON.stringify({ tool: toolCall.tool, args: toolCall.args })}</tool_call>` });
    workingMessages.push({ role: 'user', content: `[RESULTADO_HERRAMIENTA "${toolCall.tool}"]:\n${JSON.stringify(toolResult.data)}\n\nProporciona la respuesta final en Markdown.` });
  }

  const finalRes = await callAIChatProvider(workingMessages, systemPrompt);
  return {
    replyText: finalRes.text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim() || 'Consulta completada.',
    executedTools,
    provider: finalRes.provider || lastProviderInfo?.provider,
    model: finalRes.model || lastProviderInfo?.model
  };
}

async function generateShortChatTitle(userFirstMessage, assistantFirstReply) {
  const statusEl = document.getElementById('aichat-title-gen-status');
  if (statusEl) statusEl.classList.remove('hidden');
  try {
    const titleSystem = 'Devuelve ÚNICAMENTE un título corto en español de 3 a 6 palabras que resuma la conversación. Sin comillas ni punto final.';
    const titlePrompt = `Usuario: "${String(userFirstMessage).slice(0, 350)}"\nAsistente: "${String(assistantFirstReply).slice(0, 350)}"\n\nTítulo corto:`;
    const res = await callAIChatProvider([{ role: 'user', content: titlePrompt }], titleSystem, { maxTokens: 35 });
    let cleanTitle = (res.text || '').replace(/^["'«“]+|["'»”]+$/g, '').replace(/^(t[íi]tulo|tema|asunto)\s*:\s*/i, '').replace(/[.]+$/, '').replace(/\n+/g, ' ').trim();
    if (cleanTitle.length > 60) cleanTitle = cleanTitle.slice(0, 57).trim() + '...';
    return cleanTitle || null;
  } catch (err) {
    return null;
  } finally {
    if (statusEl) statusEl.classList.add('hidden');
  }
}

// ── UI del Chat, Carpetas, Herramientas y Ajustes ──
let activeAIChatFolderFilter = 'all';
let _pendingNewChatFolderId = null;
let _editingChatFolderId = null;
let _assigningFolderChatId = null;
let _lockedFolderViewTargetId = null;

const AICHAT_FOLDER_EMOJIS = ['📁', '🚀', '💼', '🧠', '📊', '🛠️', '🎯', '📚', '💡', '🔬', '🏠', '⚡', '🗂️', '📌'];
const AICHAT_FOLDER_COLORS = [
  { hex: '#d97706', name: 'Ámbar' }, { hex: '#2563eb', name: 'Azul' }, { hex: '#059669', name: 'Esmeralda' },
  { hex: '#7c3aed', name: 'Violeta' }, { hex: '#e11d48', name: 'Carmesí' }, { hex: '#0891b2', name: 'Cian' },
  { hex: '#ea580c', name: 'Naranja' }, { hex: '#4f46e5', name: 'Índigo' }, { hex: '#65a30d', name: 'Lima' },
  { hex: '#57534e', name: 'Grafito' }
];
let _selectedChatFolderEmoji = AICHAT_FOLDER_EMOJIS[0];
let _selectedChatFolderColor = AICHAT_FOLDER_COLORS[0].hex;

const AI_CHAT_TOOLS_CATALOG = [
  { name: 'search_tasks', title: 'Búsqueda Avanzada de Tareas', icon: '🔍', mode: 'read', modeLabel: 'Lectura · Caché L3', desc: 'Explora todas tus tareas filtrando por texto, estado, prioridad, categoría o proyecto.', params: 'query, status, priority, category, projectId, limit', samplePrompt: 'Usa search_tasks para buscar mis tareas de prioridad alta pendientes y dime cuáles tienen más urgencia.' },
  { name: 'get_task_details', title: 'Inspección Profunda de Tarea', icon: '📄', mode: 'read', modeLabel: 'Lectura · Caché L3', desc: 'Recupera notas Markdown, subtareas, recurrencia e historial de fechas pospuestas.', params: 'taskId', samplePrompt: 'Inspecciona en detalle mi tarea pendiente más importante usando get_task_details.' },
  { name: 'get_project_tasks', title: 'Auditoría de Proyecto', icon: '◫', mode: 'read', modeLabel: 'Lectura · Caché L3', desc: 'Analiza tareas de un proyecto, su avance, pendientes críticos y completadas.', params: 'projectId o projectName', samplePrompt: 'Revisa mis proyectos actuales con get_project_tasks y dame un reporte de avance.' },
  { name: 'get_activity_history', title: 'Bitácora de Actividad', icon: '🕓', mode: 'read', modeLabel: 'Lectura · Caché L3', desc: 'Consulta eventos cronológicos en TareasDB en una ventana de días.', params: 'days, type, limit', samplePrompt: 'Consulta mi bitácora de los últimos 7 días con get_activity_history y resume mis avances.' },
  { name: 'get_productivity_metrics', title: 'Métricas de Productividad', icon: '📊', mode: 'read', modeLabel: 'Lectura · Caché L3', desc: 'Calcula Win Rate, Cycle Time, racha semanal y balance Maker vs Manager.', params: 'monthOffset', samplePrompt: 'Ejecuta get_productivity_metrics para analizar mi rendimiento y balance Maker vs Manager.' },
  { name: 'create_task', title: 'Creación Directa de Tarea', icon: '✨', mode: 'write', modeLabel: 'Escritura en TareasDB', desc: 'Crea una nueva tarea (y subtareas) directamente en tu planeador.', params: 'title, desc, pri, due, dueTime, cat, project, subtasks', samplePrompt: 'Crea una tarea de prioridad media para hoy llamada "Revisar planificación semanal" usando create_task.' },
  { name: 'update_task_status', title: 'Actualizar Tarea', icon: '⚡', mode: 'write', modeLabel: 'Escritura en TareasDB', desc: 'Marca como completada/pendiente, reprograma fecha o ajusta prioridad.', params: 'taskId, done, due, pri, title', samplePrompt: 'Revisa mis tareas vencidas y pregúntame cuáles quiero reprogramar usando update_task_status.' }
];

function getAIChatFolderById(folderId) {
  if (!folderId) return null;
  return aiChatFolders.find(f => String(f.id) === String(folderId)) || null;
}

function getAIChatCountForFolder(folderId) {
  if (folderId === 'all') return aiChats.length;
  if (folderId === 'none') return aiChats.filter(c => !c.folderId || !getAIChatFolderById(c.folderId)).length;
  return aiChats.filter(c => String(c.folderId) === String(folderId)).length;
}

async function updateAIChatModelBadge() {
  const labelEl = document.getElementById('aichat-model-label');
  const dotEl = document.getElementById('aichat-model-dot');
  if (!labelEl) return;
  try {
    const cfg = await getActiveAIProviderConfig();
    const provTag = cfg.provider === 'googleai' ? 'Gemini' : 'OpenRouter';
    labelEl.textContent = `${provTag} · ${cfg.shortModel}`;
    if (dotEl) dotEl.className = 'aichat-model-dot ' + (cfg.hasSession ? 'ok' : 'warn');
  } catch (e) {
    labelEl.textContent = 'Configurar IA';
  }
}

function updateAIChatGreeting() {
  const greetEl = document.getElementById('aichat-greeting');
  if (!greetEl) return;
  const h = new Date().getHours();
  const timeGreeting = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  greetEl.textContent = `${timeGreeting}, ¿en qué nos enfocamos hoy?`;
}

function updateAIChatTotalBadge() {
  const badge = document.getElementById('aichat-total-badge');
  if (badge) badge.textContent = String(aiChats.length);
}

function switchAIChatTab(tabName) {
  activeAIChatTab = tabName === 'chats' ? 'chats' : 'home';
  const viewHome = document.getElementById('aichat-view-home');
  const viewChats = document.getElementById('aichat-view-chats');
  const tabHome = document.getElementById('aichat-tab-home');
  const tabChats = document.getElementById('aichat-tab-chats');
  if (viewHome) {
    viewHome.classList.toggle('active', activeAIChatTab === 'home');
    viewHome.classList.toggle('hidden', activeAIChatTab !== 'home');
  }
  if (viewChats) {
    viewChats.classList.toggle('active', activeAIChatTab === 'chats');
    viewChats.classList.toggle('hidden', activeAIChatTab !== 'chats');
  }
  if (tabHome) tabHome.classList.toggle('active', activeAIChatTab === 'home');
  if (tabChats) tabChats.classList.toggle('active', activeAIChatTab === 'chats');
  if (activeAIChatTab === 'chats') {
    renderAIChatFoldersBar();
    renderAIChatsList();
  } else {
    renderActiveAIChatView();
  }
}

function startNewAIChat() {
  if (_isAIChatGenerating) return;
  currentAIChatId = null;
  _pendingNewChatFolderId = (activeAIChatTab === 'chats' && activeAIChatFolderFilter !== 'all' && activeAIChatFolderFilter !== 'none' && getAIChatFolderById(activeAIChatFolderFilter))
    ? activeAIChatFolderFilter : null;
  switchAIChatTab('home');
  renderActiveAIChatView();
  const input = document.getElementById('aichat-input');
  if (input) { input.value = ''; input.style.height = 'auto'; input.focus(); }
}

function selectAIChat(chatId) {
  const found = aiChats.find(c => String(c.id) === String(chatId));
  if (!found) return;
  currentAIChatId = found.id;
  _pendingNewChatFolderId = null;
  switchAIChatTab('home');
  renderActiveAIChatView(true);
}

function refreshAIChatUI(resetCurrent = false) {
  if (resetCurrent) { currentAIChatId = null; _pendingNewChatFolderId = null; }
  if (activeAIChatFolderFilter !== 'all' && activeAIChatFolderFilter !== 'none' && !getAIChatFolderById(activeAIChatFolderFilter)) {
    activeAIChatFolderFilter = 'all';
  }
  updateAIChatTotalBadge();
  renderActiveAIChatView();
  renderAIChatFoldersBar();
  renderAIChatsList();
}

function updateActiveChatHeaderFolderPill(activeChat) {
  const folderBtn = document.getElementById('aichat-active-folder-btn');
  const iconEl = document.getElementById('aichat-active-folder-icon');
  const labelEl = document.getElementById('aichat-active-folder-label');
  if (!folderBtn || !iconEl || !labelEl) return;

  if (!activeChat) {
    const pendingFolder = _pendingNewChatFolderId ? getAIChatFolderById(_pendingNewChatFolderId) : null;
    if (pendingFolder) {
      const hasCtx = Boolean(pendingFolder.contextPrompt && String(pendingFolder.contextPrompt).trim());
      folderBtn.classList.remove('hidden');
      iconEl.textContent = pendingFolder.icon || '📁';
      labelEl.textContent = hasCtx ? `${pendingFolder.name} · 🧠` : pendingFolder.name;
    } else {
      folderBtn.classList.add('hidden');
    }
    return;
  }

  folderBtn.classList.remove('hidden');
  const folder = activeChat.folderId ? getAIChatFolderById(activeChat.folderId) : null;
  if (folder) {
    const hasCtx = Boolean(folder.contextPrompt && String(folder.contextPrompt).trim());
    iconEl.textContent = folder.icon || '📁';
    labelEl.textContent = hasCtx ? `${folder.name} · 🧠` : folder.name;
  } else {
    iconEl.textContent = '📁';
    labelEl.textContent = 'Sin carpeta';
  }
}

function renderActiveAIChatView(scrollToBottom = false) {
  const welcomeEl = document.getElementById('aichat-welcome');
  const threadWrap = document.getElementById('aichat-thread-wrap');
  const headerTitle = document.getElementById('aichat-header-title');
  const renameTopBtn = document.getElementById('aichat-rename-active-btn');
  const activeChat = currentAIChatId ? aiChats.find(c => String(c.id) === String(currentAIChatId)) : null;

  updateActiveChatHeaderFolderPill(activeChat);

  if (!activeChat || !Array.isArray(activeChat.messages) || activeChat.messages.length === 0) {
    if (welcomeEl) welcomeEl.classList.remove('hidden');
    if (threadWrap) threadWrap.classList.add('hidden');
    if (headerTitle) headerTitle.textContent = 'Asistente IA';
    if (renameTopBtn) renameTopBtn.classList.add('hidden');
    return;
  }

  if (welcomeEl) welcomeEl.classList.add('hidden');
  if (threadWrap) threadWrap.classList.remove('hidden');
  if (headerTitle) headerTitle.textContent = activeChat.title || 'Nueva conversación';
  if (renameTopBtn) renameTopBtn.classList.remove('hidden');
  renderAIChatMessages(activeChat, scrollToBottom);
}

function formatChatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatChatCardDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const iso = formatISODateLocal(d);
  const today = todayISO();
  const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (iso === today) return `Hoy · ${timeStr}`;
  if (iso === addDays(today, -1)) return `Ayer · ${timeStr}`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ` · ${timeStr}`;
}

function renderAIChatMessages(chat, scrollToBottom = false) {
  const listEl = document.getElementById('aichat-messages-list');
  if (!listEl) return;

  listEl.innerHTML = (chat.messages || []).map((m, idx) => {
    const timeStr = formatChatTimestamp(m.ts);
    if (m.role === 'user') {
      return `
        <div class="aichat-msg aichat-msg-user">
          <div class="aichat-bubble aichat-bubble-user">
            <div>${escHtml(m.content).replace(/\n/g, '<br>')}</div>
            ${timeStr ? `<div class="aichat-msg-time">${timeStr}</div>` : ''}
          </div>
        </div>
      `;
    }
    const toolsHtml = Array.isArray(m.tools) && m.tools.length
      ? `<div class="aichat-tools-used">${m.tools.map(t => `<span class="aichat-tool-pill">${escHtml(t.badge || t.tool)}</span>`).join('')}</div>` : '';
    const modelBadge = m.model ? `<span class="aichat-msg-model">${escHtml(String(m.model).split('/').pop())}</span>` : '';
    return `
      <div class="aichat-msg aichat-msg-assistant">
        <div class="aichat-avatar-assistant" title="Asistente IA">✦</div>
        <div class="aichat-bubble aichat-bubble-assistant">
          ${toolsHtml}
          <div class="md-content">${typeof renderMd === 'function' ? renderMd(m.content) : escHtml(m.content)}</div>
          <div class="aichat-msg-footer">
            <div class="aichat-msg-meta">${modelBadge}${timeStr ? `<span>${timeStr}</span>` : ''}</div>
            <button type="button" class="aichat-copy-btn" data-copy-idx="${idx}" title="Copiar respuesta">📋 Copiar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-copy-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = chat.messages[Number(btn.dataset.copyIdx)];
      if (!msg || !msg.content) return;
      navigator.clipboard.writeText(msg.content).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copiado';
        setTimeout(() => { btn.innerHTML = orig; }, 1600);
      }).catch(() => showToast('No se pudo copiar'));
    });
  });

  if (scrollToBottom) {
    const wrap = document.getElementById('aichat-thread-wrap');
    if (wrap) {
      requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
    }
  }
}

function appendThinkingIndicator(statusText = 'Analizando y generando respuesta...') {
  const listEl = document.getElementById('aichat-messages-list');
  if (!listEl) return;
  let existing = document.getElementById('aichat-thinking-row');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'aichat-thinking-row';
    existing.className = 'aichat-msg aichat-msg-assistant';
    listEl.appendChild(existing);
  }
  existing.innerHTML = `
    <div class="aichat-avatar-assistant aichat-avatar-pulse">✦</div>
    <div class="aichat-bubble aichat-bubble-assistant aichat-bubble-thinking">
      <div class="aichat-dots"><span></span><span></span><span></span></div>
      <span class="aichat-thinking-label" id="aichat-thinking-label">${escHtml(statusText)}</span>
    </div>
  `;
  const wrap = document.getElementById('aichat-thread-wrap');
  if (wrap) {
    requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
  }
}

function removeThinkingIndicator() {
  const el = document.getElementById('aichat-thinking-row');
  if (el) el.remove();
}

async function sendAIChatMessage(prefilledText = null) {
  if (_isAIChatGenerating) return;
  const input = document.getElementById('aichat-input');
  const text = (prefilledText !== null ? String(prefilledText) : (input ? input.value : '')).trim();
  if (!text) return;

  if (input && prefilledText === null) { input.value = ''; input.style.height = 'auto'; }

  const sendBtn = document.getElementById('aichat-send-btn');
  _isAIChatGenerating = true;
  if (sendBtn) sendBtn.disabled = true;

  const nowTs = Date.now();
  let chat = currentAIChatId ? aiChats.find(c => String(c.id) === String(currentAIChatId)) : null;
  const isBrandNewChat = !chat;

  if (!chat) {
    const assignedFolder = (_pendingNewChatFolderId && getAIChatFolderById(_pendingNewChatFolderId)) ? _pendingNewChatFolderId : null;
    chat = {
      id: 'chat_' + nowTs + '_' + Math.floor(Math.random() * 1000),
      title: text.length > 42 ? text.slice(0, 39).trim() + '...' : text,
      titleGenerated: false, customTitle: false, folderId: assignedFolder,
      createdAt: nowTs, updatedAt: nowTs, messages: []
    };
    _pendingNewChatFolderId = null;
    aiChats.unshift(chat);
    currentAIChatId = chat.id;
  }

  chat.messages.push({ role: 'user', content: text, ts: nowTs });
  chat.updatedAt = Date.now();
  aiChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  await dbPutChat(chat);
  markDirty();
  updateAIChatTotalBadge();
  renderActiveAIChatView(true);
  renderAIChatFoldersBar();
  appendThinkingIndicator('Procesando con tu IA...');

  try {
    const turnResult = await runAIChatTurnWithTools(chat, (toolStatus) => {
      const lbl = document.getElementById('aichat-thinking-label');
      if (lbl) lbl.textContent = toolStatus;
    });
    removeThinkingIndicator();

    chat.messages.push({
      role: 'assistant', content: turnResult.replyText, ts: Date.now(),
      provider: turnResult.provider, model: turnResult.model, tools: turnResult.executedTools
    });
    chat.provider = turnResult.provider;
    chat.model = turnResult.model;
    chat.updatedAt = Date.now();
    await dbPutChat(chat);
    markDirty();
    renderActiveAIChatView(true);
    renderAIChatFoldersBar();
    renderAIChatsList();

    if ((isBrandNewChat || !chat.titleGenerated) && !chat.customTitle && chat.messages.length >= 2) {
      const firstUser = chat.messages.find(m => m.role === 'user')?.content || text;
      const generatedTitle = await generateShortChatTitle(firstUser, turnResult.replyText);
      const currentRef = aiChats.find(c => String(c.id) === String(chat.id));
      if (currentRef && !currentRef.customTitle && generatedTitle) {
        currentRef.title = generatedTitle;
        currentRef.titleGenerated = true;
        currentRef.updatedAt = Date.now();
        await dbPutChat(currentRef);
        markDirty();
        if (String(currentAIChatId) === String(currentRef.id)) {
          const headerTitle = document.getElementById('aichat-header-title');
          if (headerTitle) headerTitle.textContent = currentRef.title;
        }
        renderAIChatsList();
      }
    }
  } catch (err) {
    removeThinkingIndicator();
    chat.messages.push({ role: 'assistant', content: `⚠️ **No se pudo completar la respuesta:** ${err.message || 'Verifica tu conexión y Ajustes de IA.'}`, ts: Date.now() });
    chat.updatedAt = Date.now();
    await dbPutChat(chat);
    markDirty();
    renderActiveAIChatView(true);
  } finally {
    _isAIChatGenerating = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

function renderAIChatFoldersBar() {
  const barEl = document.getElementById('aichat-folders-bar');
  if (!barEl) return;

  let html = `
    <button type="button" class="aichat-folder-pill ${activeAIChatFolderFilter === 'all' ? 'active' : ''}" data-folder-filter="all">
      <span>🗂️</span><span>Todas</span><span class="aichat-folder-pill-count">${getAIChatCountForFolder('all')}</span>
    </button>
    <button type="button" class="aichat-folder-pill ${activeAIChatFolderFilter === 'none' ? 'active' : ''}" data-folder-filter="none">
      <span>💬</span><span>Sin carpeta</span><span class="aichat-folder-pill-count">${getAIChatCountForFolder('none')}</span>
    </button>
  `;

  for (const folder of aiChatFolders) {
    const count = getAIChatCountForFolder(folder.id);
    const isActive = String(activeAIChatFolderFilter) === String(folder.id);
    const hasCtx = Boolean(folder.contextPrompt && String(folder.contextPrompt).trim());
    html += `
      <button type="button" class="aichat-folder-pill ${isActive ? 'active' : ''}" data-folder-filter="${escHtml(String(folder.id))}">
        <span class="aichat-folder-pill-dot" style="background:${escHtml(folder.color || '#d97706')}"></span>
        <span>${escHtml(folder.icon || '📁')}</span>
        <span>${escHtml(folder.name)}</span>
        ${hasCtx ? '<span>🧠</span>' : ''}
        <span class="aichat-folder-pill-count">${count}</span>
      </button>
    `;
  }

  html += `<button type="button" class="aichat-folder-pill" id="aichat-quick-add-folder-pill"><span>＋</span><span>Nueva carpeta</span></button>`;
  barEl.innerHTML = html;

  barEl.querySelectorAll('[data-folder-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeAIChatFolderFilter = btn.dataset.folderFilter;
      renderAIChatFoldersBar();
      renderAIChatsList();
    });
  });
  const addPill = document.getElementById('aichat-quick-add-folder-pill');
  if (addPill) addPill.addEventListener('click', () => openAIChatFoldersModal(true));
}

function renderAIChatsList() {
  const listEl = document.getElementById('aichat-chats-list');
  if (!listEl) return;
  updateAIChatTotalBadge();

  const q = aiChatSearchQuery.trim().toLowerCase();
  let filtered = [...aiChats].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  if (activeAIChatFolderFilter === 'none') filtered = filtered.filter(c => !c.folderId || !getAIChatFolderById(c.folderId));
  else if (activeAIChatFolderFilter !== 'all') filtered = filtered.filter(c => String(c.folderId) === String(activeAIChatFolderFilter));

  if (q) {
    filtered = filtered.filter(c => {
      const folderObj = c.folderId ? getAIChatFolderById(c.folderId) : null;
      return (c.title || '').toLowerCase().includes(q)
        || (folderObj && (folderObj.name || '').toLowerCase().includes(q))
        || (Array.isArray(c.messages) && c.messages.some(m => (m.content || '').toLowerCase().includes(q)));
    });
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="aichat-empty-chats">
        <div class="aichat-empty-icon">💬</div>
        <div class="aichat-empty-title">${q ? 'Sin resultados para tu búsqueda' : 'No hay conversaciones en esta vista'}</div>
        <div class="aichat-empty-sub">${q ? 'Prueba otra palabra o cambia el filtro de carpeta.' : 'Inicia una nueva conversación desde Inicio / Chat.'}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const isCurrent = String(c.id) === String(currentAIChatId);
    const msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
    const lastMsg = msgCount > 0 ? c.messages[msgCount - 1] : null;
    const rawPreview = lastMsg ? String(lastMsg.content || '').replace(/[#*`>_~]/g, '').replace(/\s+/g, ' ').trim() : 'Sin mensajes';
    const preview = rawPreview.length > 110 ? rawPreview.slice(0, 107) + '...' : rawPreview;
    const folderObj = c.folderId ? getAIChatFolderById(c.folderId) : null;
    const hasFolderCtx = Boolean(folderObj && folderObj.contextPrompt && String(folderObj.contextPrompt).trim());
    const folderBadgeHtml = folderObj
      ? `<span class="aichat-card-folder-badge"><span>${escHtml(folderObj.icon || '📁')}</span><span>${escHtml(folderObj.name)}${hasFolderCtx ? ' · 🧠' : ''}</span></span>` : '';

    return `
      <div class="aichat-chat-card ${isCurrent ? 'active-chat' : ''}" data-chat-open="${escHtml(String(c.id))}">
        <div class="aichat-chat-card-main">
          <div class="aichat-chat-card-top">
            <span class="aichat-chat-card-title">${escHtml(c.title || 'Conversación sin título')}</span>
            ${folderBadgeHtml}
          </div>
          <div class="aichat-chat-card-preview">${escHtml(preview)}</div>
          <div class="aichat-chat-card-meta">
            <span>${formatChatCardDate(c.updatedAt || c.createdAt)}</span><span>·</span>
            <span>${msgCount} mensaje${msgCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="aichat-chat-card-actions">
          <button type="button" class="aichat-card-act-btn" data-chat-folder="${escHtml(String(c.id))}" title="Mover a carpeta">📁</button>
          <button type="button" class="aichat-card-act-btn" data-chat-rename="${escHtml(String(c.id))}" title="Renombrar">✎</button>
          <button type="button" class="aichat-card-act-btn" data-chat-delete="${escHtml(String(c.id))}" title="Eliminar">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-chat-open]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-chat-folder],[data-chat-rename],[data-chat-delete]')) return;
      selectAIChat(card.dataset.chatOpen);
    });
  });
  listEl.querySelectorAll('[data-chat-folder]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openAssignFolderModal(btn.dataset.chatFolder); }));
  listEl.querySelectorAll('[data-chat-rename]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openRenameChatModal(btn.dataset.chatRename); }));
  listEl.querySelectorAll('[data-chat-delete]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openDeleteChatModal(btn.dataset.chatDelete); }));
}

// ── Gestión de Carpetas ──
function updateFolderContextTokenMeter() {
  const ctxIn = document.getElementById('aichat-folder-context-input');
  const counterEl = document.getElementById('aichat-folder-context-counter');
  const fillEl = document.getElementById('aichat-folder-context-fill');
  if (!ctxIn) return 0;
  const tokens = estimateFolderContextTokens(ctxIn.value);
  const pct = Math.min(100, Math.round((tokens / FOLDER_CONTEXT_MAX_TOKENS) * 1000) / 10);
  if (counterEl) counterEl.textContent = `${tokens.toLocaleString('es-MX')} / ${FOLDER_CONTEXT_MAX_TOKENS.toLocaleString('es-MX')} tokens`;
  if (fillEl) fillEl.style.width = `${pct}%`;
  return tokens;
}

function handleFolderContextInput() {
  const ctxIn = document.getElementById('aichat-folder-context-input');
  if (!ctxIn) return;
  if (estimateFolderContextTokens(ctxIn.value) > FOLDER_CONTEXT_MAX_TOKENS) {
    ctxIn.value = truncateToMaxFolderTokens(ctxIn.value, FOLDER_CONTEXT_MAX_TOKENS).text;
    showFolderFormError(`Se alcanzó el límite máximo de ${FOLDER_CONTEXT_MAX_TOKENS.toLocaleString('es-MX')} tokens.`);
  } else {
    showFolderFormError('');
  }
  updateFolderContextTokenMeter();
  updateFolderFormPreview();
}

function updateFolderFormPreview() {
  const nameIn = document.getElementById('aichat-folder-name-input');
  const iconIn = document.getElementById('aichat-folder-icon-input');
  const ctxIn = document.getElementById('aichat-folder-context-input');
  const prevIcon = document.getElementById('aichat-folder-preview-icon');
  const prevName = document.getElementById('aichat-folder-preview-name');
  if (prevIcon) prevIcon.textContent = (iconIn ? iconIn.value.trim() : '') || _selectedChatFolderEmoji || '📁';
  if (prevName) prevName.textContent = ((nameIn ? nameIn.value.trim() : '') || 'Vista previa') + (ctxIn && ctxIn.value.trim() ? ' · 🧠' : '');
}

function showFolderFormError(msg) {
  const errEl = document.getElementById('aichat-folder-form-error');
  if (!errEl) return;
  errEl.textContent = msg || '';
  errEl.classList.toggle('hidden', !msg);
}

function hideFolderLockBanner() {
  _lockedFolderViewTargetId = null;
  const banner = document.getElementById('aichat-folder-lock-banner');
  if (banner) banner.classList.add('hidden');
}

function resetAIChatFolderForm() {
  _editingChatFolderId = null;
  _selectedChatFolderEmoji = AICHAT_FOLDER_EMOJIS[0];
  _selectedChatFolderColor = AICHAT_FOLDER_COLORS[0].hex;
  const titleEl = document.getElementById('aichat-folder-form-title');
  const nameIn = document.getElementById('aichat-folder-name-input');
  const iconIn = document.getElementById('aichat-folder-icon-input');
  const ctxIn = document.getElementById('aichat-folder-context-input');
  const saveBtn = document.getElementById('aichat-folder-save-btn');
  const cancelBtn = document.getElementById('aichat-folder-cancel-edit-btn');
  if (titleEl) titleEl.textContent = 'Nueva carpeta';
  if (nameIn) nameIn.value = '';
  if (iconIn) iconIn.value = _selectedChatFolderEmoji;
  if (ctxIn) ctxIn.value = '';
  if (saveBtn) saveBtn.textContent = 'Crear carpeta';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  showFolderFormError('');
  syncFolderPickersSelection();
  updateFolderContextTokenMeter();
  updateFolderFormPreview();
}

function syncFolderPickersSelection() {
  const emojiGrid = document.getElementById('aichat-folder-emoji-grid');
  const colorGrid = document.getElementById('aichat-folder-color-grid');
  if (emojiGrid) emojiGrid.querySelectorAll('[data-folder-emoji]').forEach(b => b.classList.toggle('selected', b.dataset.folderEmoji === _selectedChatFolderEmoji));
  if (colorGrid) colorGrid.querySelectorAll('[data-folder-color]').forEach(b => b.classList.toggle('selected', b.dataset.folderColor === _selectedChatFolderColor));
}

function startEditAIChatFolder(folderId) {
  const folder = getAIChatFolderById(folderId);
  if (!folder) return;
  hideFolderLockBanner();
  _editingChatFolderId = folder.id;
  _selectedChatFolderEmoji = folder.icon || '📁';
  _selectedChatFolderColor = folder.color || AICHAT_FOLDER_COLORS[0].hex;
  document.getElementById('aichat-folder-form-title').textContent = `Editando carpeta «${folder.name}»`;
  document.getElementById('aichat-folder-name-input').value = folder.name;
  document.getElementById('aichat-folder-icon-input').value = _selectedChatFolderEmoji;
  document.getElementById('aichat-folder-context-input').value = folder.contextPrompt || '';
  document.getElementById('aichat-folder-save-btn').textContent = 'Guardar cambios';
  document.getElementById('aichat-folder-cancel-edit-btn').classList.remove('hidden');
  showFolderFormError('');
  syncFolderPickersSelection();
  updateFolderContextTokenMeter();
  updateFolderFormPreview();
}

async function saveAIChatFolder() {
  const nameIn = document.getElementById('aichat-folder-name-input');
  const iconIn = document.getElementById('aichat-folder-icon-input');
  const ctxIn = document.getElementById('aichat-folder-context-input');
  const rawName = (nameIn ? nameIn.value : '').replace(/\s+/g, ' ').trim();
  const rawIcon = Array.from((iconIn ? iconIn.value.trim() : '') || _selectedChatFolderEmoji || '📁').slice(0, 2).join('') || '📁';
  const rawContext = (ctxIn ? ctxIn.value : '').trim();

  if (!rawName) { showFolderFormError('Escribe un nombre para la carpeta.'); return; }
  const norm = normalizeSearchText(rawName);
  if (['todas', 'sin carpeta', 'all', 'none'].includes(norm)) { showFolderFormError('Nombre reservado.'); return; }
  const duplicate = aiChatFolders.find(f => normalizeSearchText(f.name) === norm && (!_editingChatFolderId || String(f.id) !== String(_editingChatFolderId)));
  if (duplicate) { showFolderFormError(`Ya existe "${duplicate.name}".`); return; }

  const capped = rawContext ? truncateToMaxFolderTokens(rawContext, FOLDER_CONTEXT_MAX_TOKENS) : { text: '', tokens: 0 };
  const nowTs = Date.now();
  if (_editingChatFolderId) {
    const existing = getAIChatFolderById(_editingChatFolderId);
    if (existing) {
      Object.assign(existing, { name: rawName, icon: rawIcon, color: _selectedChatFolderColor, contextPrompt: capped.text, contextTokens: capped.tokens, updatedAt: nowTs });
      await dbPutChatFolder(existing);
      markDirty();
      showToast('✓ Carpeta actualizada');
    }
  } else {
    const newFolder = { id: 'folder_' + nowTs + '_' + Math.floor(Math.random() * 1000), name: rawName, icon: rawIcon, color: _selectedChatFolderColor, contextPrompt: capped.text, contextTokens: capped.tokens, createdAt: nowTs, updatedAt: nowTs };
    aiChatFolders.push(newFolder);
    await dbPutChatFolder(newFolder);
    markDirty();
    showToast(`✓ Carpeta "${rawName}" creada`);
  }
  resetAIChatFolderForm();
  renderAIChatFoldersManageList();
  refreshAIChatUI();
}

async function attemptDeleteAIChatFolder(folderId) {
  const folder = getAIChatFolderById(folderId);
  if (!folder) return;
  const chatsInFolder = aiChats.filter(c => String(c.folderId) === String(folder.id));
  if (chatsInFolder.length > 0) {
    _lockedFolderViewTargetId = folder.id;
    document.getElementById('aichat-folder-lock-title').textContent = `No se puede eliminar «${folder.name}»`;
    document.getElementById('aichat-folder-lock-desc').textContent = `Contiene ${chatsInFolder.length} conversación(es). Muévelas o elimínalas antes de borrar la carpeta.`;
    document.getElementById('aichat-folder-lock-banner').classList.remove('hidden');
    return;
  }
  hideFolderLockBanner();
  if (String(_editingChatFolderId) === String(folder.id)) resetAIChatFolderForm();
  aiChatFolders = aiChatFolders.filter(f => String(f.id) !== String(folder.id));
  await dbDeleteChatFolder(folder.id);
  markDirty();
  renderAIChatFoldersManageList();
  refreshAIChatUI();
  showToast(`🗑 Carpeta «${folder.name}» eliminada`);
}

function renderAIChatFoldersManageList() {
  const listEl = document.getElementById('aichat-folders-manage-list');
  const countLabel = document.getElementById('aichat-folders-count-label');
  if (!listEl) return;
  if (countLabel) countLabel.textContent = `${aiChatFolders.length} carpeta${aiChatFolders.length === 1 ? '' : 's'}`;
  if (aiChatFolders.length === 0) {
    listEl.innerHTML = '<div class="text-xs text-slate-500 text-center py-4">Aún no has creado carpetas personalizadas.</div>';
    return;
  }
  listEl.innerHTML = aiChatFolders.map(f => {
    const count = getAIChatCountForFolder(f.id);
    const hasCtx = Boolean(f.contextPrompt && String(f.contextPrompt).trim());
    const tok = hasCtx ? (f.contextTokens || estimateFolderContextTokens(f.contextPrompt)) : 0;
    return `
      <div class="aichat-folder-manage-item">
        <div class="aichat-fitem-left">
          <span class="aichat-fitem-swatch" style="background:${escHtml(f.color || '#d97706')}">${escHtml(f.icon || '📁')}</span>
          <div>
            <span class="aichat-fitem-name">${escHtml(f.name)}</span>
            <div class="aichat-fitem-badges-row">
              <span class="aichat-fitem-count">${count === 0 ? 'Vacía' : `🛡️ ${count} chat(s)`}</span>
              <span class="aichat-fitem-context-badge">${hasCtx ? `🧠 ${tok.toLocaleString('es-MX')} tok` : 'Sin contexto IA'}</span>
            </div>
          </div>
        </div>
        <div class="aichat-fitem-actions">
          <button type="button" class="aichat-card-act-btn" data-fmanage-edit="${escHtml(String(f.id))}" title="Editar">✎</button>
          <button type="button" class="aichat-card-act-btn" data-fmanage-del="${escHtml(String(f.id))}" title="Eliminar">${count > 0 ? '🔒' : '🗑'}</button>
        </div>
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('[data-fmanage-edit]').forEach(b => b.addEventListener('click', () => startEditAIChatFolder(b.dataset.fmanageEdit)));
  listEl.querySelectorAll('[data-fmanage-del]').forEach(b => b.addEventListener('click', () => attemptDeleteAIChatFolder(b.dataset.fmanageDel)));
}

function openAIChatFoldersModal(focusName = false) {
  hideFolderLockBanner();
  resetAIChatFolderForm();
  renderAIChatFoldersManageList();
  document.getElementById('aichat-folders-modal')?.classList.remove('hidden');
  if (focusName) setTimeout(() => document.getElementById('aichat-folder-name-input')?.focus(), 60);
}
function closeAIChatFoldersModal() {
  hideFolderLockBanner();
  document.getElementById('aichat-folders-modal')?.classList.add('hidden');
}

function openAssignFolderModal(chatId) {
  const chat = aiChats.find(c => String(c.id) === String(chatId));
  if (!chat) return;
  _assigningFolderChatId = chat.id;
  const listEl = document.getElementById('aichat-assign-folder-list');
  const currentFolderId = chat.folderId && getAIChatFolderById(chat.folderId) ? String(chat.folderId) : '';
  document.getElementById('aichat-assign-folder-subtitle').textContent = `Conversación: «${chat.title || 'Sin título'}»`;

  let html = `<button type="button" class="aichat-assign-option ${!currentFolderId ? 'selected' : ''}" data-assign-folder=""><span class="aichat-assign-opt-left"><span>💬</span><span>Sin carpeta (General)</span></span><span class="text-xs font-semibold">${!currentFolderId ? '✓ Actual' : ''}</span></button>`;
  for (const f of aiChatFolders) {
    const isSel = currentFolderId === String(f.id);
    html += `<button type="button" class="aichat-assign-option ${isSel ? 'selected' : ''}" data-assign-folder="${escHtml(String(f.id))}"><span class="aichat-assign-opt-left"><span>${escHtml(f.icon || '📁')}</span><span>${escHtml(f.name)}</span></span><span class="text-xs font-semibold">${isSel ? '✓ Actual' : ''}</span></button>`;
  }
  listEl.innerHTML = html;
  listEl.querySelectorAll('[data-assign-folder]').forEach(b => b.addEventListener('click', () => assignChatToFolder(_assigningFolderChatId, b.dataset.assignFolder || null)));
  document.getElementById('aichat-assign-folder-modal')?.classList.remove('hidden');
}
function closeAssignFolderModal() {
  _assigningFolderChatId = null;
  document.getElementById('aichat-assign-folder-modal')?.classList.add('hidden');
}
async function assignChatToFolder(chatId, folderId) {
  const chat = aiChats.find(c => String(c.id) === String(chatId));
  if (!chat) return;
  const validFolder = folderId ? getAIChatFolderById(folderId) : null;
  chat.folderId = validFolder ? validFolder.id : null;
  chat.updatedAt = Date.now();
  await dbPutChat(chat);
  markDirty();
  closeAssignFolderModal();
  refreshAIChatUI();
  showToast(validFolder ? `📁 Movido a «${validFolder.name}»` : '💬 Movido a Sin carpeta');
}

function openAIChatToolsModal() {
  const bannerEl = document.getElementById('aichat-tools-cache-banner');
  const gridEl = document.getElementById('aichat-tools-catalog-list');
  if (bannerEl) {
    const totalTasksCount = tasks.filter(t => !t.parentId).length;
    bannerEl.innerHTML = `
      <div class="aichat-tcache-item"><span class="aichat-tcache-dot ${_aiContextCache ? 'ok' : ''}"></span><div><div class="aichat-tcache-label">Extracto Base (TareasDB)</div><div class="aichat-tcache-val">${totalTasksCount} tareas cargadas</div></div></div>
      <div class="aichat-tcache-item"><span class="aichat-tcache-dot ok"></span><div><div class="aichat-tcache-label">Memoria Deslizante</div><div class="aichat-tcache-val">Ventana de ${AI_HISTORY_WINDOW_MAX} mensajes</div></div></div>
      <div class="aichat-tcache-item"><span class="aichat-tcache-dot ok"></span><div><div class="aichat-tcache-label">Caché de Consultas DB</div><div class="aichat-tcache-val">${_aiToolQueryCache.size} en memoria · máx. 3 rondas</div></div></div>
    `;
  }
  if (gridEl) {
    gridEl.innerHTML = AI_CHAT_TOOLS_CATALOG.map((tool, idx) => `
      <div class="aichat-tool-spec-card">
        <div class="aichat-tool-spec-top">
          <div class="aichat-tool-spec-id"><span class="aichat-tool-spec-icon">${tool.icon}</span><div><div class="aichat-tool-spec-title">${escHtml(tool.title)}</div><code class="aichat-tool-spec-code">${escHtml(tool.name)}</code></div></div>
          <span class="aichat-tool-spec-badge ${tool.mode}">${escHtml(tool.modeLabel)}</span>
        </div>
        <p class="aichat-tool-spec-desc">${escHtml(tool.desc)}</p>
        <div class="aichat-tool-spec-params"><strong>Parámetros:</strong> <code>${escHtml(tool.params)}</code></div>
        <div><button type="button" class="aichat-tool-try-btn" data-try-tool-idx="${idx}">⚡ Probar habilidad</button></div>
      </div>
    `).join('');
    gridEl.querySelectorAll('[data-try-tool-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const spec = AI_CHAT_TOOLS_CATALOG[Number(btn.dataset.tryToolIdx)];
        if (!spec) return;
        closeAIChatToolsModal();
        switchAIChatTab('home');
        const input = document.getElementById('aichat-input');
        if (input) { input.value = spec.samplePrompt; input.focus(); }
      });
    });
  }
  document.getElementById('aichat-tools-modal')?.classList.remove('hidden');
}
function closeAIChatToolsModal() {
  document.getElementById('aichat-tools-modal')?.classList.add('hidden');
}

function openRenameChatModal(chatId) {
  const chat = aiChats.find(c => String(c.id) === String(chatId));
  if (!chat) return;
  _renamingChatId = chat.id;
  const input = document.getElementById('aichat-rename-input');
  if (input) input.value = chat.title || '';
  document.getElementById('aichat-rename-modal')?.classList.remove('hidden');
  setTimeout(() => { input?.focus(); input?.select(); }, 60);
}
function closeRenameChatModal() {
  _renamingChatId = null;
  document.getElementById('aichat-rename-modal')?.classList.add('hidden');
}
async function confirmRenameChat() {
  if (!_renamingChatId) return;
  const newTitle = (document.getElementById('aichat-rename-input')?.value || '').trim();
  if (!newTitle) return;
  const chat = aiChats.find(c => String(c.id) === String(_renamingChatId));
  if (chat) {
    chat.title = newTitle;
    chat.customTitle = true;
    chat.updatedAt = Date.now();
    await dbPutChat(chat);
    markDirty();
    renderActiveAIChatView();
    renderAIChatsList();
    showToast('✓ Conversación renombrada');
  }
  closeRenameChatModal();
}

function openDeleteChatModal(chatId) {
  const chat = aiChats.find(c => String(c.id) === String(chatId));
  if (!chat) return;
  _deletingChatId = chat.id;
  document.getElementById('aichat-delete-modal-desc').textContent = `¿Seguro que deseas eliminar "${chat.title || 'Sin título'}"?`;
  document.getElementById('aichat-delete-modal')?.classList.remove('hidden');
}
function closeDeleteChatModal() {
  _deletingChatId = null;
  document.getElementById('aichat-delete-modal')?.classList.add('hidden');
}
async function confirmDeleteChat() {
  if (!_deletingChatId) return;
  const targetId = _deletingChatId;
  closeDeleteChatModal();
  aiChats = aiChats.filter(c => String(c.id) !== String(targetId));
  await dbDeleteChat(targetId);
  if (String(currentAIChatId) === String(targetId)) currentAIChatId = null;
  markDirty();
  refreshAIChatUI();
  showToast('🗑 Conversación eliminada');
}

// ── Modal de Ajustes Centralizados de IA ──
function updateSessionBadgeUI() {
  const badge = document.getElementById('ia-session-badge');
  const form = document.getElementById('ia-auth-form');
  const manualBtn = document.getElementById('ia-manual-sync-btn');
  const hasPass = Boolean(sessionStorage.getItem('github_sync_pass'));
  const hasEnc = Boolean(sessionStorage.getItem('github_enc_key'));
  const fullyConnected = hasPass && hasEnc;

  if (badge) {
    badge.textContent = fullyConnected ? 'Conectado' : (hasPass ? 'Falta clave de cifrado' : 'Sin conectar');
    badge.className = fullyConnected
      ? 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
      : 'text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  }
  if (form) {
    form.classList.toggle('hidden', fullyConnected);
    const passIn = document.getElementById('ia-sync-pass-input');
    if (passIn && hasPass && !passIn.value) passIn.value = sessionStorage.getItem('github_sync_pass');
  }
  if (manualBtn) {
    manualBtn.classList.toggle('hidden', !fullyConnected);
  }
}

function updateAIProviderUI(activeProvider) {
  const isGoogle = activeProvider === 'googleai';
  document.getElementById('ai-provider-openrouter-btn')?.classList.toggle('active', !isGoogle);
  document.getElementById('ai-provider-googleai-btn')?.classList.toggle('active', isGoogle);
  document.getElementById('ai-badge-openrouter')?.classList.toggle('hidden', isGoogle);
  document.getElementById('ai-badge-googleai')?.classList.toggle('hidden', !isGoogle);
  updateAIChatModelBadge();
}

async function openAISettingsModal() {
  const [orModel, gModel, aiProv] = await Promise.all([
    dbGetMeta('openRouterModel'),
    dbGetMeta('googleAIModel'),
    dbGetMeta('aiProvider')
  ]);
  const orIn = document.getElementById('openrouter-model');
  const gIn = document.getElementById('googleai-model');
  if (orIn) orIn.value = orModel || '';
  if (gIn) gIn.value = gModel || '';
  updateAIProviderUI(aiProv || 'openrouter');
  updateSessionBadgeUI();
  document.getElementById('aichat-settings-modal')?.classList.remove('hidden');
}
function closeAISettingsModal() {
  document.getElementById('aichat-settings-modal')?.classList.add('hidden');
}

function wireAISettingsModal() {
  const modal = document.getElementById('aichat-settings-modal');
  document.getElementById('aichat-open-settings-btn')?.addEventListener('click', openAISettingsModal);
  document.getElementById('aichat-model-pill')?.addEventListener('click', openAISettingsModal);
  document.getElementById('aichat-settings-close')?.addEventListener('click', closeAISettingsModal);
  document.getElementById('aichat-settings-done')?.addEventListener('click', closeAISettingsModal);
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeAISettingsModal(); });

  document.getElementById('ai-provider-openrouter-btn')?.addEventListener('click', async () => {
    await dbSetMeta('aiProvider', 'openrouter');
    updateAIProviderUI('openrouter');
    markDirty();
    showToast('✓ Proveedor activo: OpenRouter');
  });
  document.getElementById('ai-provider-googleai-btn')?.addEventListener('click', async () => {
    await dbSetMeta('aiProvider', 'googleai');
    updateAIProviderUI('googleai');
    markDirty();
    showToast('✓ Proveedor activo: Google AI Studio');
  });

  document.getElementById('ia-manual-sync-btn')?.addEventListener('click', async () => {
    try {
      await executeIACloudBackup({ silent: false, isAuto: false });
    } catch (e) {}
  });

  document.getElementById('ia-sync-connect-btn')?.addEventListener('click', async () => {
    const passIn = document.getElementById('ia-sync-pass-input');
    const encIn = document.getElementById('ia-enc-key-input');
    const password = passIn ? passIn.value : '';
    const encKey = encIn ? encIn.value : '';
    if (!password) { showToast('Ingresa tu contraseña de sincronización'); return; }
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, action: 'auth' })
      });
      if (!res.ok) throw new Error('Contraseña incorrecta');
      sessionStorage.setItem('github_sync_pass', password);
      localStorage.setItem('github_sync_pass', password);
      localStorage.setItem('github_sync_pass_saved_at', Date.now().toString());
      if (encKey) {
        sessionStorage.setItem('github_enc_key', encKey);
        localStorage.setItem('github_enc_key', encKey);
      }
      updateSessionBadgeUI();
      updateAIChatModelBadge();
      showToast(encKey || sessionStorage.getItem('github_enc_key') ? '✓ Sesión y cifrado conectados' : '✓ Sesión conectada (agrega tu clave de cifrado para respaldar)');
    } catch (e) {
      showToast('✗ ' + (e.message || 'Error al conectar'));
    }
  });

  document.getElementById('openrouter-save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('openrouter-save-btn');
    const msg = document.getElementById('openrouter-status-msg');
    const model = (document.getElementById('openrouter-model')?.value || '').trim() || 'mistralai/mistral-small-2603';
    btn.disabled = true;
    if (msg) msg.textContent = 'Validando...';
    try {
      await callAIProxy({ provider: 'openrouter', model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 5 });
      await dbSetMeta('openRouterModel', model);
      markDirty();
      updateAIChatModelBadge();
      if (msg) msg.textContent = '✓ Guardado y validado';
      showToast('✓ OpenRouter validado');
    } catch (err) {
      if (msg) msg.textContent = `✗ ${err.message}`;
      showToast(`✗ ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('googleai-save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('googleai-save-btn');
    const msg = document.getElementById('googleai-status-msg');
    const modelRaw = (document.getElementById('googleai-model')?.value || '').trim() || 'gemini-2.5-flash';
    btn.disabled = true;
    if (msg) msg.textContent = 'Validando...';
    try {
      await callAIProxy({ provider: 'googleai', model: modelRaw, messages: [{ role: 'user', content: 'ping' }], maxTokens: 5 });
      await dbSetMeta('googleAIModel', modelRaw);
      markDirty();
      updateAIChatModelBadge();
      if (msg) msg.textContent = '✓ Guardado y validado';
      showToast('✓ Google AI Studio validado');
    } catch (err) {
      if (msg) msg.textContent = `✗ ${err.message}`;
      showToast(`✗ ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Inicialización ──
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getThemeMode());
  await restoreSessionFromLocalStorage();

  await dbInit();
  await loadCustomCats();
  await loadProjects();
  tasks = await dbGetAll();
  await loadAIChats();
  await loadAIChatFolders();
  await sanitizeAIChatFolderReferences();

  // Limpiar claves heredadas si existían
  await dbSetMeta('openRouterKey', null).catch(() => {});
  await dbSetMeta('googleAIKey', null).catch(() => {});

  // Sincronización continua compartida con Tareas (cloudAutoSync)
  const savedAutoSync = await dbGetMeta('cloudAutoSync').catch(() => false);
  _cloudAutoSyncEnabled = savedAutoSync === true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _cloudAutoSyncEnabled && _dataDirty) {
      if (_autoSyncTimer) { clearTimeout(_autoSyncTimer); _autoSyncTimer = null; }
      runAutoSync();
    }
  });
  window.addEventListener('pagehide', () => {
    if (_cloudAutoSyncEnabled && _dataDirty) {
      if (_autoSyncTimer) { clearTimeout(_autoSyncTimer); _autoSyncTimer = null; }
      runAutoSync();
    }
  });
  window.addEventListener('online', () => {
    if (_cloudAutoSyncEnabled && _dataDirty) {
      showToast('Conexión restablecida: sincronizando...');
      runAutoSync();
    }
  });

  updateAIChatGreeting();
  updateAIChatModelBadge();
  updateAIChatTotalBadge();
  switchAIChatTab('home');
  buildAISystemContext().catch(() => {});

  // Wire eventos principales
  document.getElementById('aichat-open-tools-btn')?.addEventListener('click', openAIChatToolsModal);
  document.getElementById('aichat-welcome-tools-btn')?.addEventListener('click', openAIChatToolsModal);
  document.getElementById('aichat-composer-tools-btn')?.addEventListener('click', openAIChatToolsModal);
  document.getElementById('aichat-tools-modal-close')?.addEventListener('click', closeAIChatToolsModal);
  document.getElementById('aichat-tools-modal-done')?.addEventListener('click', closeAIChatToolsModal);
  const toolsModal = document.getElementById('aichat-tools-modal');
  if (toolsModal) toolsModal.addEventListener('click', e => { if (e.target === toolsModal) closeAIChatToolsModal(); });

  document.getElementById('aichat-new-chat-btn')?.addEventListener('click', startNewAIChat);
  document.getElementById('aichat-new-from-list-btn')?.addEventListener('click', startNewAIChat);
  document.getElementById('aichat-rename-active-btn')?.addEventListener('click', () => { if (currentAIChatId) openRenameChatModal(currentAIChatId); });
  document.getElementById('aichat-active-folder-btn')?.addEventListener('click', () => {
    if (currentAIChatId) openAssignFolderModal(currentAIChatId);
    else openAIChatFoldersModal(false);
  });

  // Pickers de carpetas
  const emojiGrid = document.getElementById('aichat-folder-emoji-grid');
  const colorGrid = document.getElementById('aichat-folder-color-grid');
  const folderIconIn = document.getElementById('aichat-folder-icon-input');
  if (emojiGrid) {
    emojiGrid.innerHTML = AICHAT_FOLDER_EMOJIS.map(em => `<button type="button" class="aichat-picker-emoji-btn ${em === _selectedChatFolderEmoji ? 'selected' : ''}" data-folder-emoji="${em}">${em}</button>`).join('');
    emojiGrid.addEventListener('click', e => {
      const b = e.target.closest('[data-folder-emoji]');
      if (!b) return;
      _selectedChatFolderEmoji = b.dataset.folderEmoji;
      if (folderIconIn) folderIconIn.value = _selectedChatFolderEmoji;
      syncFolderPickersSelection();
      updateFolderFormPreview();
    });
  }
  if (colorGrid) {
    colorGrid.innerHTML = AICHAT_FOLDER_COLORS.map(c => `<button type="button" class="aichat-picker-color-btn ${c.hex === _selectedChatFolderColor ? 'selected' : ''}" data-folder-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>`).join('');
    colorGrid.addEventListener('click', e => {
      const b = e.target.closest('[data-folder-color]');
      if (!b) return;
      _selectedChatFolderColor = b.dataset.folderColor;
      syncFolderPickersSelection();
      updateFolderFormPreview();
    });
  }
  document.getElementById('aichat-folder-name-input')?.addEventListener('input', () => { showFolderFormError(''); updateFolderFormPreview(); });
  document.getElementById('aichat-folder-context-input')?.addEventListener('input', handleFolderContextInput);
  document.getElementById('aichat-manage-folders-btn')?.addEventListener('click', () => openAIChatFoldersModal(false));
  document.getElementById('aichat-folders-modal-close')?.addEventListener('click', closeAIChatFoldersModal);
  document.getElementById('aichat-folders-modal-done')?.addEventListener('click', closeAIChatFoldersModal);
  const foldersModalEl = document.getElementById('aichat-folders-modal');
  if (foldersModalEl) foldersModalEl.addEventListener('click', e => { if (e.target === foldersModalEl) closeAIChatFoldersModal(); });
  document.getElementById('aichat-folder-save-btn')?.addEventListener('click', saveAIChatFolder);
  document.getElementById('aichat-folder-cancel-edit-btn')?.addEventListener('click', resetAIChatFolderForm);
  document.getElementById('aichat-folder-lock-dismiss-btn')?.addEventListener('click', hideFolderLockBanner);
  document.getElementById('aichat-folder-lock-view-btn')?.addEventListener('click', () => {
    const targetId = _lockedFolderViewTargetId;
    closeAIChatFoldersModal();
    if (targetId && getAIChatFolderById(targetId)) {
      activeAIChatFolderFilter = targetId;
      switchAIChatTab('chats');
    }
  });

  document.getElementById('aichat-assign-folder-close')?.addEventListener('click', closeAssignFolderModal);
  document.getElementById('aichat-assign-folder-cancel')?.addEventListener('click', closeAssignFolderModal);
  const assignModalEl = document.getElementById('aichat-assign-folder-modal');
  if (assignModalEl) assignModalEl.addEventListener('click', e => { if (e.target === assignModalEl) closeAssignFolderModal(); });
  document.getElementById('aichat-assign-new-folder-btn')?.addEventListener('click', () => { closeAssignFolderModal(); openAIChatFoldersModal(true); });

  document.querySelectorAll('.aichat-starter-card[data-starter]').forEach(card => {
    card.addEventListener('click', () => { if (card.dataset.starter) sendAIChatMessage(card.dataset.starter); });
  });

  const input = document.getElementById('aichat-input');
  if (input) {
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(150, input.scrollHeight) + 'px'; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIChatMessage(); } });
  }
  document.getElementById('aichat-send-btn')?.addEventListener('click', () => sendAIChatMessage());
  document.querySelectorAll('.aichat-bnav-tab[data-aichat-tab]').forEach(tab => tab.addEventListener('click', () => switchAIChatTab(tab.dataset.aichatTab)));

  const searchIn = document.getElementById('aichat-search-input');
  const searchClear = document.getElementById('aichat-search-clear');
  if (searchIn) {
    searchIn.addEventListener('input', () => {
      aiChatSearchQuery = searchIn.value;
      searchClear?.classList.toggle('hidden', !aiChatSearchQuery);
      renderAIChatsList();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      aiChatSearchQuery = '';
      if (searchIn) searchIn.value = '';
      searchClear.classList.add('hidden');
      renderAIChatsList();
    });
  }

  document.getElementById('aichat-rename-cancel')?.addEventListener('click', closeRenameChatModal);
  document.getElementById('aichat-rename-save')?.addEventListener('click', confirmRenameChat);
  const renameModalEl = document.getElementById('aichat-rename-modal');
  if (renameModalEl) renameModalEl.addEventListener('click', e => { if (e.target === renameModalEl) closeRenameChatModal(); });
  document.getElementById('aichat-rename-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmRenameChat(); }
    if (e.key === 'Escape') closeRenameChatModal();
  });
  document.getElementById('aichat-delete-cancel')?.addEventListener('click', closeDeleteChatModal);
  document.getElementById('aichat-delete-confirm')?.addEventListener('click', confirmDeleteChat);
  const deleteModalEl = document.getElementById('aichat-delete-modal');
  if (deleteModalEl) deleteModalEl.addEventListener('click', e => { if (e.target === deleteModalEl) closeDeleteChatModal(); });

  wireAISettingsModal();
});
