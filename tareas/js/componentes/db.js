/**
 * db.js — Capa de persistencia con IndexedDB para tareas y categorías.
 *
 * API:
 *   dbInit()                → Promise
 *   dbGetAll()              → Promise<Task[]>
 *   dbPut(task)             → Promise
 *   dbDelete(id)            → Promise
 *   dbClear()               → Promise
 *   dbGetAllCats()          → Promise<CustomCat[]>
 *   dbPutCat(cat)           → Promise
 *   dbDeleteCat(key)        → Promise
 *   dbGetAllProjects()      → Promise<Project[]>
 *   dbPutProject(proj)      → Promise
 *   dbDeleteProject(id)     → Promise
 *   dbAddHistory(entry)     → Promise
 *   dbGetHistory()          → Promise<HistoryEntry[]>
 *   dbClearHistory()        → Promise
 */

const DB_NAME    = 'TareasDB';
const DB_VERSION = 7;
const STORE      = 'tasks';
const CAT_STORE  = 'categories';
const PROJ_STORE = 'projects';
const META_STORE = 'meta';
const HIST_STORE = 'history';
const CHAT_STORE = 'ai_chats';
const CHAT_FOLDER_STORE = 'ai_chat_folders';
let _db = null;

function dbInit() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CAT_STORE)) {
        db.createObjectStore(CAT_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(PROJ_STORE)) {
        db.createObjectStore(PROJ_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(HIST_STORE)) {
        const hs = db.createObjectStore(HIST_STORE, { keyPath: 'id' });
        hs.createIndex('by_ts', 'ts', { unique: false });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CHAT_FOLDER_STORE)) {
        db.createObjectStore(CHAT_FOLDER_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function _store(mode) {
  return _db.transaction(STORE, mode).objectStore(STORE);
}
function _catStore(mode) {
  return _db.transaction(CAT_STORE, mode).objectStore(CAT_STORE);
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const req = _store('readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(task) {
  return new Promise((resolve, reject) => {
    const req = _store('readwrite').put(task);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const req = _store('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbClear() {
  return new Promise((resolve, reject) => {
    const req = _store('readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Categorías personalizadas ──
function dbGetAllCats() {
  return new Promise((resolve, reject) => {
    const req = _catStore('readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPutCat(cat) {
  return new Promise((resolve, reject) => {
    const req = _catStore('readwrite').put(cat);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteCat(key) {
  return new Promise((resolve, reject) => {
    const req = _catStore('readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Proyectos ──
function _projStore(mode) {
  return _db.transaction(PROJ_STORE, mode).objectStore(PROJ_STORE);
}

function dbGetAllProjects() {
  return new Promise((resolve, reject) => {
    const req = _projStore('readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPutProject(proj) {
  return new Promise((resolve, reject) => {
    const req = _projStore('readwrite').put(proj);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteProject(id) {
  return new Promise((resolve, reject) => {
    const req = _projStore('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Meta / Sync ──
function _metaStore(mode) {
  return _db.transaction(META_STORE, mode).objectStore(META_STORE);
}

function dbGetMeta(key) {
  return new Promise((resolve, reject) => {
    const req = _metaStore('readonly').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbSetMeta(key, value) {
  return new Promise((resolve, reject) => {
    const req = _metaStore('readwrite').put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Historial de actividad ──
function _histStore(mode) {
  return _db.transaction(HIST_STORE, mode).objectStore(HIST_STORE);
}

function dbAddHistory(entry) {
  return new Promise((resolve, reject) => {
    const req = _histStore('readwrite').put(entry);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbGetHistory() {
  return new Promise((resolve, reject) => {
    const req = _histStore('readonly').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbClearHistory() {
  return new Promise((resolve, reject) => {
    const req = _histStore('readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Conversaciones de Chat con IA ──
function _chatStore(mode) {
  return _db.transaction(CHAT_STORE, mode).objectStore(CHAT_STORE);
}

function dbGetAllChats() {
  return new Promise((resolve, reject) => {
    const req = _chatStore('readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPutChat(chat) {
  return new Promise((resolve, reject) => {
    const req = _chatStore('readwrite').put(chat);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteChat(id) {
  return new Promise((resolve, reject) => {
    const req = _chatStore('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbClearChats() {
  return new Promise((resolve, reject) => {
    const req = _chatStore('readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Carpetas de Chat con IA ──
function _chatFolderStore(mode) {
  return _db.transaction(CHAT_FOLDER_STORE, mode).objectStore(CHAT_FOLDER_STORE);
}

function dbGetAllChatFolders() {
  return new Promise((resolve, reject) => {
    const req = _chatFolderStore('readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPutChatFolder(folder) {
  return new Promise((resolve, reject) => {
    const req = _chatFolderStore('readwrite').put(folder);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDeleteChatFolder(id) {
  return new Promise((resolve, reject) => {
    const req = _chatFolderStore('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

function dbClearChatFolders() {
  return new Promise((resolve, reject) => {
    const req = _chatFolderStore('readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}