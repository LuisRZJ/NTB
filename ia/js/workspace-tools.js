// ia/js/workspace-tools.js — Capa transversal de herramientas flexibles para Tareas, Notas, Blog y Chats

(function (root) {
  'use strict';

  const MAX_TOOL_OUTPUT_CHARS = 14000;
  const CACHE_TTL_MS = 45000;
  const ALLOWED_COLLECTIONS = [
    'tasks',
    'projects',
    'categories',
    'history',
    'notes',
    'note_labels',
    'posts',
    'blog_labels',
    'blog_databases',
    'ai_chats',
    'ai_chat_folders'
  ];

  const _cache = new Map();
  let _adapters = {
    readNotesDB: null,
    readBlogDB: null,
    getTareasContext: null,
    executeWriteTool: null
  };

  function setDataAdapters(adapters = {}) {
    _adapters = { ..._adapters, ...adapters };
  }

  function invalidateCache() {
    _cache.clear();
  }

  function getCacheSize() {
    const now = Date.now();
    for (const [k, entry] of _cache.entries()) {
      if ((now - entry.ts) >= CACHE_TTL_MS) _cache.delete(k);
    }
    return _cache.size;
  }

  // ── Utilidades de normalización y sanitización ──
  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function htmlToCleanText(html) {
    const raw = String(html || '');
    if (!raw.trim()) return '';

    if (typeof DOMParser === 'function') {
      try {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        doc.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove());
        doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
        doc.querySelectorAll('li').forEach(el => el.prepend(doc.createTextNode('• ')));
        doc.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre').forEach(el => {
          el.appendChild(doc.createTextNode('\n'));
        });
        const text = (doc.body && doc.body.textContent) ? doc.body.textContent : '';
        return text
          .replace(/\r/g, '')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      } catch (e) {}
    }

    // Fallback seguro (entorno Node o sin DOMParser)
    return raw
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function buildSnippet(text, maxLen = 180) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > maxLen ? clean.slice(0, maxLen - 3) + '...' : clean;
  }

  function toIsoDate(val) {
    if (!val) return '';
    if (typeof val === 'number') {
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? String(val) : d.toISOString();
  }

  // ── Presupuesto de payload ──
  function enforcePayloadBudget(data, maxChars = MAX_TOOL_OUTPUT_CHARS) {
    if (!data || typeof data !== 'object') return data;
    let json = JSON.stringify(data);
    if (json.length <= maxChars) return data;

    const cloned = JSON.parse(json);
    const arrayKeys = ['results', 'items', 'tasks', 'events', 'messages', 'history', 'projects'];

    // 1. Recortar campos largos de texto
    if (typeof cloned.content === 'string' && cloned.content.length > 3500) {
      cloned.content = cloned.content.slice(0, 3500) + '\n...[recortado por presupuesto]';
      cloned.truncated = true;
    }
    if (typeof cloned.descriptionMarkdown === 'string' && cloned.descriptionMarkdown.length > 2500) {
      cloned.descriptionMarkdown = cloned.descriptionMarkdown.slice(0, 2500) + '\n...[recortado]';
      cloned.truncated = true;
    }

    // 2. Recortar arrays progresivamente hasta ajustar al presupuesto
    for (const key of arrayKeys) {
      if (Array.isArray(cloned[key]) && cloned[key].length > 1) {
        while (cloned[key].length > 1 && JSON.stringify(cloned).length > maxChars) {
          cloned[key].pop();
          cloned.truncated = true;
        }
      }
    }

    // 3. Recorte final si aún excede
    if (JSON.stringify(cloned).length > maxChars && typeof cloned.content === 'string') {
      const excess = JSON.stringify(cloned).length - maxChars + 80;
      cloned.content = cloned.content.slice(0, Math.max(200, cloned.content.length - excess)) + '...[recortado]';
      cloned.truncated = true;
    }

    if (cloned.truncated) {
      cloned.budgetNote = `Salida acotada a <= ${maxChars} caracteres para proteger la ventana de contexto.`;
    }
    return cloned;
  }

  // ── Adaptador seguro Read-Only de IndexedDB ──
  function openReadOnlyDBIfExists(dbName) {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      let abortedForNew = false;
      try {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = (e) => {
          // Si la base no existía, abortar inmediatamente para no crear una base vacía
          abortedForNew = true;
          try { e.target.transaction.abort(); } catch (err) {}
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (abortedForNew) {
            try { db.close(); } catch (err) {}
            resolve(null);
            return;
          }
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function readExternalStores(dbName, storeNames) {
    const db = await openReadOnlyDBIfExists(dbName);
    if (!db) {
      return { initialized: false, stores: {} };
    }

    const stores = {};
    const available = storeNames.filter(name => db.objectStoreNames.contains(name));
    if (available.length === 0) {
      try { db.close(); } catch (e) {}
      return { initialized: true, stores };
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(available, 'readonly');
        available.forEach(name => {
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => { stores[name] = Array.isArray(req.result) ? req.result : []; };
          req.onerror = () => { stores[name] = []; };
        });
        tx.oncomplete = () => {
          try { db.close(); } catch (e) {}
          resolve({ initialized: true, stores });
        };
        tx.onerror = () => {
          try { db.close(); } catch (e) {}
          resolve({ initialized: true, stores });
        };
      } catch (e) {
        try { db.close(); } catch (err) {}
        resolve({ initialized: true, stores });
      }
    });
  }

  async function getNotesData() {
    if (typeof _adapters.readNotesDB === 'function') {
      return await _adapters.readNotesDB();
    }
    const res = await readExternalStores('GoogleKeepNotesDB', ['notes', 'labels']);
    return {
      initialized: res.initialized,
      notes: res.stores.notes || [],
      labels: res.stores.labels || []
    };
  }

  async function getBlogData() {
    if (typeof _adapters.readBlogDB === 'function') {
      return await _adapters.readBlogDB();
    }
    const res = await readExternalStores('BlogEditorDB', ['posts', 'labels']);
    return {
      initialized: res.initialized,
      posts: res.stores.posts || [],
      labels: res.stores.labels || []
    };
  }

  function getTareasCtx() {
    if (typeof _adapters.getTareasContext === 'function') {
      return _adapters.getTareasContext();
    }
    return {
      tasks: [],
      CATS: {},
      PROJECTS: [],
      aiChats: [],
      aiChatFolders: [],
      dbGetHistory: async () => [],
      dbGetMeta: async () => null,
      helpers: {}
    };
  }

  function resolveBlogLabels(post, blogLabels) {
    if (!Array.isArray(post.labels) || !post.labels.length) return [];
    const map = new Map((blogLabels || []).map(l => [String(l.id), l.name || String(l.id)]));
    return post.labels.map(lid => map.get(String(lid)) || String(lid));
  }

  function extractBlogDatabasesSummary(post) {
    if (!post || !post.databases || typeof post.databases !== 'object') return [];
    return Object.entries(post.databases).map(([dbId, dbObj]) => {
      const cols = Array.isArray(dbObj?.columns) ? dbObj.columns : [];
      const rows = Array.isArray(dbObj?.rows) ? dbObj.rows : [];
      return {
        postId: post.id,
        postTitle: post.title || 'Sin título',
        dbId,
        name: dbObj?.name || dbObj?.title || `Base ${dbId}`,
        columnsCount: cols.length,
        rowsCount: rows.length,
        columns: cols.map(c => c.name || c.title || c.id || ''),
        rows: rows.slice(0, 25)
      };
    });
  }

  // ── Resumen rápido para System Prompt ──
  async function getQuickWorkspaceSummary() {
    const [notesRes, blogRes] = await Promise.all([getNotesData(), getBlogData()]);
    const activeNotes = (notesRes.notes || []).filter(n => !n.isTrash && !n.isArchived);
    const activePosts = (blogRes.posts || []).filter(p => !p.trashed && !p.archived);
    return {
      notas: {
        initialized: notesRes.initialized,
        activeCount: activeNotes.length,
        labels: (notesRes.labels || []).map(l => l.name)
      },
      blog: {
        initialized: blogRes.initialized,
        activeCount: activePosts.length,
        labels: (blogRes.labels || []).map(l => l.name)
      }
    };
  }

  // ── Herramienta 1: workspace_overview ──
  async function toolWorkspaceOverview() {
    const tCtx = getTareasCtx();
    const [notesRes, blogRes] = await Promise.all([getNotesData(), getBlogData()]);

    const allTasks = tCtx.tasks || [];
    const topTasks = allTasks.filter(t => !t.parentId);
    const pendingTasks = topTasks.filter(t => !t.done);
    const isOverdue = tCtx.helpers?.isTaskOverdue || (() => false);
    const today = tCtx.helpers?.todayISO ? tCtx.helpers.todayISO() : new Date().toISOString().slice(0, 10);

    const allNotes = notesRes.notes || [];
    const activeNotes = allNotes.filter(n => !n.isTrash && !n.isArchived);

    const allPosts = blogRes.posts || [];
    const activePosts = allPosts.filter(p => !p.trashed && !p.archived);
    const postsWithDb = activePosts.filter(p => p.databases && Object.keys(p.databases).length > 0);

    return {
      badgeLabel: '🌐 Panorama completo del workspace consultado',
      data: {
        tareas: {
          initialized: true,
          pendingCount: pendingTasks.length,
          overdueCount: pendingTasks.filter(isOverdue).length,
          completedTodayCount: topTasks.filter(t => t.done && t.doneAt === today).length,
          projects: (tCtx.PROJECTS || []).map(p => ({ id: p.id, name: p.name })),
          categories: Object.entries(tCtx.CATS || {}).map(([k, v]) => ({ key: k, label: v.label })),
          recentPending: pendingTasks.slice(0, 5).map(t => ({ id: t.id, title: t.text, pri: t.pri || 'mid', due: t.due || null }))
        },
        notas: {
          initialized: notesRes.initialized,
          activeCount: activeNotes.length,
          pinnedCount: activeNotes.filter(n => n.isPinned).length,
          archivedCount: allNotes.filter(n => !n.isTrash && n.isArchived).length,
          labels: (notesRes.labels || []).map(l => l.name),
          recent: [...activeNotes]
            .sort((a, b) => (Number(b.updatedAt || b.createdAt) || 0) - (Number(a.updatedAt || a.createdAt) || 0))
            .slice(0, 5)
            .map(n => ({ id: n.id, title: n.title || 'Sin título', tags: n.tags || [], isPinned: !!n.isPinned }))
        },
        blog: {
          initialized: blogRes.initialized,
          activeCount: activePosts.length,
          pinnedCount: activePosts.filter(p => p.pinned).length,
          archivedCount: allPosts.filter(p => !p.trashed && p.archived).length,
          postsWithEmbeddedDatabases: postsWithDb.length,
          labels: (blogRes.labels || []).map(l => l.name),
          recent: [...activePosts]
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
            .slice(0, 5)
            .map(p => ({ id: p.id, title: p.title || 'Sin título', labels: resolveBlogLabels(p, blogRes.labels), pinned: !!p.pinned }))
        },
        chats: {
          totalChats: (tCtx.aiChats || []).length,
          totalFolders: (tCtx.aiChatFolders || []).length,
          folders: (tCtx.aiChatFolders || []).map(f => ({ id: f.id, name: f.name, hasContext: Boolean(f.contextPrompt) })),
          recent: (tCtx.aiChats || []).slice(0, 5).map(c => ({ id: c.id, title: c.title, messagesCount: (c.messages || []).length }))
        }
      }
    };
  }

  // ── Herramienta 2: search_workspace ──
  async function toolSearchWorkspace(args = {}) {
    const validModules = ['tareas', 'notas', 'blog', 'chats'];
    const reqModules = Array.isArray(args.modules) && args.modules.length
      ? args.modules.map(m => String(m).toLowerCase()).filter(m => validModules.includes(m))
      : validModules;
    const modules = reqModules.length ? reqModules : validModules;

    const q = normalizeText(args.query || '').trim();
    const labelFilter = Array.isArray(args.labels)
      ? args.labels.map(normalizeText).filter(Boolean)
      : (args.labels ? [normalizeText(args.labels)] : []);
    const status = args.status ? String(args.status).toLowerCase() : 'all';
    const pri = args.priority ? String(args.priority).toLowerCase() : '';
    const projFilter = args.projectId !== undefined && args.projectId !== null ? String(args.projectId) : '';
    const dateFrom = args.dateFrom ? String(args.dateFrom) : '';
    const dateTo = args.dateTo ? String(args.dateTo) : '';
    const includeArchived = Boolean(args.includeArchived);
    const includeTrash = Boolean(args.includeTrash);
    const limit = Math.min(60, Math.max(1, Number(args.limit) || 20));

    const tCtx = getTareasCtx();
    const needNotes = modules.includes('notas');
    const needBlog = modules.includes('blog');
    const [notesRes, blogRes] = await Promise.all([
      needNotes ? getNotesData() : Promise.resolve({ initialized: true, notes: [], labels: [] }),
      needBlog ? getBlogData() : Promise.resolve({ initialized: true, posts: [], labels: [] })
    ]);

    const hits = [];

    // 1. Tareas
    if (modules.includes('tareas')) {
      const isOverdue = tCtx.helpers?.isTaskOverdue || (() => false);
      const getTaskCats = tCtx.helpers?.getTaskCats || (t => Array.isArray(t.cats) ? t.cats : (t.cat ? [t.cat] : []));
      const getProjectById = tCtx.helpers?.getProjectById || (() => null);

      for (const t of (tCtx.tasks || [])) {
        if (!args.includeSubtasks && t.parentId) continue;
        if (status === 'pending' && t.done) continue;
        if (status === 'done' && !t.done) continue;
        if (status === 'overdue' && !isOverdue(t)) continue;
        if (pri && (t.pri || 'mid') !== pri) continue;
        if (projFilter) {
          const pObj = getProjectById(Number(t.project));
          const matchProj = String(t.project) === projFilter || (pObj && normalizeText(pObj.name).includes(normalizeText(projFilter)));
          if (!matchProj) continue;
        }
        const taskDate = t.due || t.doneAt || '';
        if (dateFrom && taskDate && taskDate < dateFrom) continue;
        if (dateTo && taskDate && taskDate > dateTo) continue;

        const catLabels = getTaskCats(t).map(k => tCtx.CATS?.[k]?.label || k);
        if (labelFilter.length && !labelFilter.some(lf => catLabels.some(cl => normalizeText(cl).includes(lf)))) continue;

        const normTitle = normalizeText(t.text);
        const normBody = normalizeText(t.desc);
        const normTags = normalizeText(catLabels.join(' '));
        let score = 0;
        if (q) {
          if (normTitle.includes(q)) score += 10;
          if (normTags.includes(q)) score += 5;
          if (normBody.includes(q)) score += 3;
          if (score === 0) continue;
        } else {
          score = t.done ? 1 : 2;
        }

        hits.push({
          score,
          module: 'tareas',
          id: t.id,
          title: t.text,
          snippet: buildSnippet(t.desc || `Prioridad: ${t.pri || 'mid'}${t.due ? ' · Fecha: ' + t.due : ''}`),
          status: t.done ? 'done' : (isOverdue(t) ? 'overdue' : 'pending'),
          tags: catLabels,
          updatedAt: t.doneAt || t.due || toIsoDate(t.id)
        });
      }
    }

    // 2. Notas
    if (modules.includes('notas')) {
      for (const n of (notesRes.notes || [])) {
        if (n.isTrash && !includeTrash) continue;
        if (n.isArchived && !includeArchived) continue;
        if (status === 'pinned' && !n.isPinned) continue;
        const noteTags = Array.isArray(n.tags) ? n.tags : [];
        if (labelFilter.length && !labelFilter.some(lf => noteTags.some(nt => normalizeText(nt).includes(lf)))) continue;

        const isoDate = toIsoDate(n.updatedAt || n.createdAt);
        if (dateFrom && isoDate && isoDate.slice(0, 10) < dateFrom) continue;
        if (dateTo && isoDate && isoDate.slice(0, 10) > dateTo) continue;

        const normTitle = normalizeText(n.title);
        const normBody = normalizeText(n.content);
        const normTags = normalizeText(noteTags.join(' '));
        let score = 0;
        if (q) {
          if (normTitle.includes(q)) score += 10;
          if (normTags.includes(q)) score += 5;
          if (normBody.includes(q)) score += 3;
          if (score === 0) continue;
        } else {
          score = n.isPinned ? 3 : 2;
        }

        hits.push({
          score,
          module: 'notas',
          id: n.id,
          title: n.title || 'Nota sin título',
          snippet: buildSnippet(n.content),
          status: n.isTrash ? 'trash' : (n.isArchived ? 'archived' : (n.isPinned ? 'pinned' : 'active')),
          tags: noteTags,
          updatedAt: isoDate
        });
      }
    }

    // 3. Blog
    if (modules.includes('blog')) {
      for (const p of (blogRes.posts || [])) {
        if (p.trashed && !includeTrash) continue;
        if (p.archived && !includeArchived) continue;
        if (status === 'pinned' && !p.pinned) continue;
        const postLabels = resolveBlogLabels(p, blogRes.labels);
        if (labelFilter.length && !labelFilter.some(lf => postLabels.some(pl => normalizeText(pl).includes(lf)))) continue;

        const isoDate = toIsoDate(p.updatedAt || p.createdAt);
        if (dateFrom && isoDate && isoDate.slice(0, 10) < dateFrom) continue;
        if (dateTo && isoDate && isoDate.slice(0, 10) > dateTo) continue;

        const cleanBody = htmlToCleanText(p.content);
        const normTitle = normalizeText(p.title);
        const normBody = normalizeText(cleanBody);
        const normTags = normalizeText(postLabels.join(' '));
        let score = 0;
        if (q) {
          if (normTitle.includes(q)) score += 10;
          if (normTags.includes(q)) score += 5;
          if (normBody.includes(q)) score += 3;
          if (score === 0) continue;
        } else {
          score = p.pinned ? 3 : 2;
        }

        hits.push({
          score,
          module: 'blog',
          id: p.id,
          title: p.title || 'Entrada sin título',
          snippet: buildSnippet(cleanBody),
          status: p.trashed ? 'trash' : (p.archived ? 'archived' : (p.pinned ? 'pinned' : 'active')),
          tags: postLabels,
          updatedAt: isoDate
        });
      }
    }

    // 4. Chats previos
    if (modules.includes('chats')) {
      const folderMap = new Map((tCtx.aiChatFolders || []).map(f => [String(f.id), f.name]));
      for (const c of (tCtx.aiChats || [])) {
        const folderName = c.folderId ? (folderMap.get(String(c.folderId)) || '') : '';
        if (labelFilter.length && !labelFilter.some(lf => normalizeText(folderName).includes(lf))) continue;

        const msgText = (c.messages || []).map(m => m.content || '').join(' ');
        const normTitle = normalizeText(c.title);
        const normBody = normalizeText(msgText);
        let score = 0;
        if (q) {
          if (normTitle.includes(q)) score += 10;
          if (normalizeText(folderName).includes(q)) score += 5;
          if (normBody.includes(q)) score += 3;
          if (score === 0) continue;
        } else {
          score = 1;
        }

        hits.push({
          score,
          module: 'chats',
          id: c.id,
          title: c.title || 'Conversación sin título',
          snippet: buildSnippet(msgText),
          status: 'active',
          tags: folderName ? [folderName] : [],
          updatedAt: toIsoDate(c.updatedAt || c.createdAt)
        });
      }
    }

    hits.sort((a, b) => (b.score - a.score) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const sliced = hits.slice(0, limit).map(({ score, ...rest }) => rest);

    return {
      badgeLabel: `🔍 Búsqueda (${modules.join(', ')}): ${sliced.length} resultado(s)`,
      data: {
        modulesSearched: modules,
        totalMatched: hits.length,
        returned: sliced.length,
        results: sliced
      }
    };
  }

  // ── Herramienta 3: get_item_details ──
  async function toolGetItemDetails(args = {}) {
    const mod = String(args.module || 'tareas').toLowerCase();
    const id = args.id !== undefined ? args.id : args.taskId;
    const includeHistory = Boolean(args.includeHistory);
    const includeDatabases = args.includeDatabases !== false;
    const includeSubtasks = args.includeSubtasks !== false;
    const maxChars = Math.min(10000, Math.max(500, Number(args.maxContentChars) || 8000));

    if (id === undefined || id === null || id === '') {
      return { badgeLabel: '⚠️ Falta ID', data: { error: 'El parámetro id es obligatorio.' } };
    }

    const tCtx = getTareasCtx();

    if (mod === 'tareas') {
      const t = (tCtx.tasks || []).find(x => String(x.id) === String(id));
      if (!t) return { badgeLabel: `🔍 Tarea #${id}: no encontrada`, data: { error: `No existe tarea con ID ${id}` } };
      const getTaskCats = tCtx.helpers?.getTaskCats || (x => Array.isArray(x.cats) ? x.cats : []);
      const getProjectById = tCtx.helpers?.getProjectById || (() => null);
      const getSubtasks = tCtx.helpers?.getSubtasks || (() => []);
      const formatRepeat = tCtx.helpers?.formatRepeat || (r => r);

      return {
        badgeLabel: `📄 Tarea: "${(t.text || '').slice(0, 30)}"`,
        data: {
          module: 'tareas',
          id: t.id,
          title: t.text,
          descriptionMarkdown: String(t.desc || '(Sin descripción)').slice(0, maxChars),
          done: !!t.done,
          doneAt: t.doneAt || null,
          priority: t.pri || 'mid',
          due: t.due || null,
          dueTime: t.dueTime || null,
          repeat: t.repeat ? formatRepeat(t.repeat) : null,
          categories: getTaskCats(t).map(k => tCtx.CATS?.[k]?.label || k),
          project: t.project ? (getProjectById(Number(t.project))?.name || t.project) : null,
          snoozedDates: t.snoozedDates || [],
          subtasks: includeSubtasks
            ? getSubtasks(t.id).map(s => ({ id: s.id, title: s.text, done: !!s.done, priority: s.pri || 'mid' }))
            : undefined
        }
      };
    }

    if (mod === 'notas') {
      const notesRes = await getNotesData();
      if (!notesRes.initialized) return { badgeLabel: '⚠️ Notas no inicializado', data: { status: 'not_initialized', error: 'Aún no se ha abierto Notas en este navegador.' } };
      const note = (notesRes.notes || []).find(n => String(n.id) === String(id));
      if (!note) return { badgeLabel: `🔍 Nota #${id}: no encontrada`, data: { error: `No existe nota con ID ${id}` } };

      return {
        badgeLabel: `📝 Nota: "${(note.title || 'Sin título').slice(0, 30)}"`,
        data: {
          module: 'notas',
          id: note.id,
          title: note.title || 'Nota sin título',
          content: String(note.content || '').slice(0, maxChars),
          tags: note.tags || [],
          color: note.color || 'default',
          isPinned: !!note.isPinned,
          isArchived: !!note.isArchived,
          isTrash: !!note.isTrash,
          createdAt: toIsoDate(note.createdAt),
          updatedAt: toIsoDate(note.updatedAt),
          history: includeHistory ? (note.history || []).slice(-10) : undefined
        }
      };
    }

    if (mod === 'blog') {
      const blogRes = await getBlogData();
      if (!blogRes.initialized) return { badgeLabel: '⚠️ Blog no inicializado', data: { status: 'not_initialized', error: 'Aún no se ha abierto Blog en este navegador.' } };
      const post = (blogRes.posts || []).find(p => String(p.id) === String(id));
      if (!post) return { badgeLabel: `🔍 Entrada #${id}: no encontrada`, data: { error: `No existe entrada de blog con ID ${id}` } };

      const cleanContent = htmlToCleanText(post.content);
      return {
        badgeLabel: `📰 Blog: "${(post.title || 'Sin título').slice(0, 30)}"`,
        data: {
          module: 'blog',
          id: post.id,
          icon: post.icon || '📄',
          title: post.title || 'Entrada sin título',
          content: cleanContent.slice(0, maxChars),
          labels: resolveBlogLabels(post, blogRes.labels),
          pinned: !!post.pinned,
          archived: !!post.archived,
          trashed: !!post.trashed,
          createdAt: toIsoDate(post.createdAt),
          updatedAt: toIsoDate(post.updatedAt),
          databases: includeDatabases ? extractBlogDatabasesSummary(post) : undefined,
          history: includeHistory ? (post.history || []).slice(-10) : undefined
        }
      };
    }

    if (mod === 'chats') {
      const chat = (tCtx.aiChats || []).find(c => String(c.id) === String(id));
      if (!chat) return { badgeLabel: `🔍 Chat #${id}: no encontrado`, data: { error: `No existe chat con ID ${id}` } };
      return {
        badgeLabel: `💬 Chat: "${(chat.title || 'Sin título').slice(0, 30)}"`,
        data: {
          module: 'chats',
          id: chat.id,
          title: chat.title,
          folderId: chat.folderId || null,
          updatedAt: toIsoDate(chat.updatedAt || chat.createdAt),
          messages: (chat.messages || []).slice(-20).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 1200), ts: toIsoDate(m.ts) }))
        }
      };
    }

    return { badgeLabel: '⚠️ Módulo inválido', data: { error: `Módulo "${mod}" no soportado. Usa: tareas, notas, blog o chats.` } };
  }

  // ── Herramienta 4: query_collection ──
  function matchesFilter(record, filters) {
    if (!filters || typeof filters !== 'object') return true;
    for (const [field, cond] of Object.entries(filters)) {
      const val = record[field];
      if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
        if ('eq' in cond && val !== cond.eq) return false;
        if ('neq' in cond && val === cond.neq) return false;
        if ('contains' in cond) {
          const needle = normalizeText(cond.contains);
          if (Array.isArray(val)) {
            if (!val.some(v => normalizeText(v).includes(needle))) return false;
          } else if (!normalizeText(val).includes(needle)) {
            return false;
          }
        }
        if ('in' in cond && Array.isArray(cond.in)) {
          if (!cond.in.includes(val)) return false;
        }
        if ('gte' in cond && (val === undefined || val === null || String(val) < String(cond.gte))) return false;
        if ('lte' in cond && (val === undefined || val === null || String(val) > String(cond.lte))) return false;
      } else {
        if (Array.isArray(val)) {
          if (!val.some(v => normalizeText(v) === normalizeText(cond))) return false;
        } else if (val !== cond) {
          return false;
        }
      }
    }
    return true;
  }

  async function toolQueryCollection(args = {}) {
    const col = String(args.collection || '').trim();
    if (!ALLOWED_COLLECTIONS.includes(col)) {
      return {
        badgeLabel: `⚠️ Colección inválida: ${col}`,
        data: { error: `Colección no permitida. Usa una de: ${ALLOWED_COLLECTIONS.join(', ')}` }
      };
    }

    const tCtx = getTareasCtx();
    let records = [];

    if (col === 'tasks') {
      const isOverdue = tCtx.helpers?.isTaskOverdue || (() => false);
      const getTaskCats = tCtx.helpers?.getTaskCats || (t => Array.isArray(t.cats) ? t.cats : []);
      records = (tCtx.tasks || []).map(t => ({
        id: t.id, title: t.text, done: !!t.done, overdue: isOverdue(t), priority: t.pri || 'mid',
        due: t.due || null, doneAt: t.doneAt || null, project: t.project || null,
        categories: getTaskCats(t), parentId: t.parentId || null,
        snoozeCount: Array.isArray(t.snoozedDates) ? t.snoozedDates.length : 0
      }));
    } else if (col === 'projects') {
      records = (tCtx.PROJECTS || []).map(p => {
        const pTasks = (tCtx.tasks || []).filter(t => !t.parentId && String(t.project) === String(p.id));
        return {
          id: p.id, name: p.name, desc: p.desc || '',
          totalTasks: pTasks.length, pendingCount: pTasks.filter(t => !t.done).length, completedCount: pTasks.filter(t => t.done).length
        };
      });
    } else if (col === 'categories') {
      records = Object.entries(tCtx.CATS || {}).map(([key, c]) => ({ key, label: c.label, color: c.color || null }));
    } else if (col === 'history') {
      const hist = await tCtx.dbGetHistory();
      records = (hist || []).map(h => ({ id: h.id, type: h.type, taskId: h.taskId, taskText: h.taskText, priority: h.taskPri || 'mid', ts: h.ts }));
    } else if (col === 'notes') {
      const notesRes = await getNotesData();
      records = (notesRes.notes || []).map(n => ({
        id: n.id, title: n.title || 'Sin título', tags: n.tags || [], color: n.color || 'default',
        isPinned: !!n.isPinned, isArchived: !!n.isArchived, isTrash: !!n.isTrash,
        snippet: buildSnippet(n.content, 120), updatedAt: toIsoDate(n.updatedAt || n.createdAt)
      }));
    } else if (col === 'note_labels') {
      const notesRes = await getNotesData();
      records = (notesRes.labels || []).map(l => ({ name: l.name, color: l.color || null }));
    } else if (col === 'posts') {
      const blogRes = await getBlogData();
      records = (blogRes.posts || []).map(p => ({
        id: p.id, title: p.title || 'Sin título', labels: resolveBlogLabels(p, blogRes.labels),
        pinned: !!p.pinned, archived: !!p.archived, trashed: !!p.trashed,
        hasDatabases: Boolean(p.databases && Object.keys(p.databases).length > 0),
        updatedAt: toIsoDate(p.updatedAt || p.createdAt)
      }));
    } else if (col === 'blog_labels') {
      const blogRes = await getBlogData();
      records = (blogRes.labels || []).map(l => ({ id: l.id, name: l.name, color: l.color || null }));
    } else if (col === 'blog_databases') {
      const blogRes = await getBlogData();
      records = [];
      for (const p of (blogRes.posts || [])) {
        if (p.trashed) continue;
        records.push(...extractBlogDatabasesSummary(p));
      }
    } else if (col === 'ai_chats') {
      records = (tCtx.aiChats || []).map(c => ({
        id: c.id, title: c.title, folderId: c.folderId || null,
        messagesCount: (c.messages || []).length, updatedAt: toIsoDate(c.updatedAt || c.createdAt)
      }));
    } else if (col === 'ai_chat_folders') {
      records = (tCtx.aiChatFolders || []).map(f => ({
        id: f.id, name: f.name, icon: f.icon || '📁', hasContext: Boolean(f.contextPrompt),
        contextTokens: f.contextTokens || 0
      }));
    }

    let filtered = records.filter(r => matchesFilter(r, args.filters));

    if (args.sortBy) {
      const field = String(args.sortBy);
      const dir = String(args.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        const va = a[field] ?? '';
        const vb = b[field] ?? '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      });
    }

    let groups = undefined;
    if (args.groupBy) {
      const gField = String(args.groupBy);
      const counts = {};
      for (const item of filtered) {
        const val = item[gField];
        if (Array.isArray(val)) {
          if (val.length === 0) counts['(sin valor)'] = (counts['(sin valor)'] || 0) + 1;
          else val.forEach(v => { counts[String(v)] = (counts[String(v)] || 0) + 1; });
        } else {
          const key = (val === undefined || val === null || val === '') ? '(sin valor)' : String(val);
          counts[key] = (counts[key] || 0) + 1;
        }
      }
      groups = counts;
    }

    const offset = Math.max(0, Number(args.offset) || 0);
    const limit = Math.min(60, Math.max(1, Number(args.limit) || 25));
    const items = args.summaryOnly ? [] : filtered.slice(offset, offset + limit);

    return {
      badgeLabel: `🗂️ Consulta «${col}»: ${filtered.length} registro(s)`,
      data: {
        collection: col,
        totalMatched: filtered.length,
        returned: items.length,
        groups,
        items
      }
    };
  }

  // ── Herramienta 5: get_productivity_metrics ──
  async function toolProductivityMetrics(args = {}) {
    const tCtx = getTareasCtx();
    const h = tCtx.helpers || {};
    const offset = Number(args.monthOffset) || 0;
    const nowD = new Date();
    const viewYear = nowD.getFullYear() + Math.floor((nowD.getMonth() + offset) / 12);
    const viewMonth = ((nowD.getMonth() + offset) % 12 + 12) % 12;
    const done = (tCtx.tasks || []).filter(t => t.done);
    const makerCats = (await tCtx.dbGetMeta('makerCategories').catch(() => null)) || [];

    return {
      badgeLabel: '📊 Métricas de Tareas analizadas',
      data: {
        month: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`,
        winRatePercent: h.calcWinRate ? h.calcWinRate(tCtx.tasks, viewYear, viewMonth) : null,
        avgCycleTimeDays: h.calcCycleTime ? h.calcCycleTime(done) : null,
        weeklyStreak: h.calcWeekStreak ? h.calcWeekStreak(done).count : null,
        makerImpactFactor: h.calcImpactFactor ? h.calcImpactFactor(done, makerCats) : null
      }
    };
  }

  // ── Dispatcher principal con Caché L3 y Aliases ──
  async function executeTool(toolName, rawArgs = {}, revision = 0) {
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

    // Escritura (sin caché)
    if (toolName === 'create_task' || toolName === 'update_task_status') {
      if (typeof _adapters.executeWriteTool !== 'function') {
        return { badgeLabel: '⚠️ Escritura no disponible', data: { error: 'Adaptador de escritura no inicializado.' } };
      }
      const res = await _adapters.executeWriteTool(toolName, args);
      invalidateCache();
      return res;
    }

    const sortedArgsKey = JSON.stringify(args, Object.keys(args).sort());
    const cacheKey = `${revision}:${toolName}:${sortedArgsKey}`;
    const cached = _cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return cached.result;
    }

    let result;
    try {
      if (toolName === 'workspace_overview') {
        result = await toolWorkspaceOverview();
      } else if (toolName === 'search_workspace') {
        result = await toolSearchWorkspace(args);
      } else if (toolName === 'get_item_details') {
        result = await toolGetItemDetails(args);
      } else if (toolName === 'query_collection') {
        result = await toolQueryCollection(args);
      } else if (toolName === 'get_productivity_metrics') {
        result = await toolProductivityMetrics(args);
      }
      // Aliases retrocompatibles para chats anteriores
      else if (toolName === 'search_tasks') {
        result = await toolSearchWorkspace({ ...args, modules: ['tareas'] });
      } else if (toolName === 'get_task_details') {
        result = await toolGetItemDetails({ module: 'tareas', id: args.taskId });
      } else if (toolName === 'get_project_tasks') {
        if (args.projectId || args.projectName) {
          result = await toolSearchWorkspace({ modules: ['tareas'], projectId: args.projectId || args.projectName, limit: 40 });
        } else {
          result = await toolQueryCollection({ collection: 'projects', limit: 40 });
        }
      } else if (toolName === 'get_activity_history') {
        const days = Math.min(90, Math.max(1, Number(args.days) || 14));
        const cutoff = new Date(Date.now() - days * 86400000).toISOString();
        const filters = { ts: { gte: cutoff } };
        if (args.type && args.type !== 'all') filters.type = args.type;
        result = await toolQueryCollection({ collection: 'history', filters, sortBy: 'ts', order: 'desc', limit: args.limit || 40 });
      } else {
        result = {
          badgeLabel: `⚠️ Habilidad desconocida: ${toolName}`,
          data: { error: `La herramienta "${toolName}" no existe.` }
        };
      }
    } catch (err) {
      result = {
        badgeLabel: `⚠️ Error en ${toolName}`,
        data: { error: err.message || 'Error interno al consultar IndexedDB' }
      };
    }

    result.data = enforcePayloadBudget(result.data, MAX_TOOL_OUTPUT_CHARS);
    _cache.set(cacheKey, { ts: Date.now(), result });
    return result;
  }

  const TOOLS_CATALOG = [
    {
      name: 'workspace_overview',
      title: 'Panorama del Workspace',
      icon: '🌐',
      mode: 'read',
      modeLabel: 'Multi-Módulo · Caché L3',
      desc: 'Resumen ejecutivo de Tareas, Notas, Blog y Chats: conteos, etiquetas, proyectos y los elementos más recientes de cada módulo.',
      params: 'Sin parámetros requeridos',
      samplePrompt: 'Usa workspace_overview para darme un resumen general de mis tareas, notas, entradas de blog y conversaciones.'
    },
    {
      name: 'search_workspace',
      title: 'Búsqueda Universal Multi-Módulo',
      icon: '🔍',
      mode: 'read',
      modeLabel: 'Multi-Módulo · Caché L3',
      desc: 'Busca por texto, etiquetas, estado, prioridad o rango de fechas en uno o varios módulos a la vez (tareas, notas, blog, chats).',
      params: 'modules[], query, labels, status, priority, projectId, dateFrom, dateTo, includeArchived, limit',
      samplePrompt: 'Usa search_workspace para buscar en todos mis módulos cualquier nota, blog o tarea relacionada con planificación o proyectos.'
    },
    {
      name: 'get_item_details',
      title: 'Inspección Profunda de Elemento',
      icon: '📄',
      mode: 'read',
      modeLabel: 'Multi-Módulo · Caché L3',
      desc: 'Lee el contenido completo de una tarea, nota, entrada de blog (incluyendo sus bases de datos embebidas e historial) o chat anterior.',
      params: 'module ("tareas"|"notas"|"blog"|"chats"), id, includeHistory, includeDatabases, includeSubtasks',
      samplePrompt: 'Busca mi entrada de blog o nota más reciente y léela completa con get_item_details para resumirla.'
    },
    {
      name: 'query_collection',
      title: 'Consultas Flexibles a Colecciones',
      icon: '🗂️',
      mode: 'read',
      modeLabel: 'Motor Declarativo · Caché L3',
      desc: 'Filtra, ordena, agrupa y cuenta registros de cualquier colección: tasks, projects, history, notes, posts, blog_databases, ai_chats, etc.',
      params: 'collection, filters, sortBy, order, groupBy, summaryOnly, limit, offset',
      samplePrompt: 'Usa query_collection sobre "notes" agrupando por "tags" (o sobre "blog_databases") para mostrarme qué información tengo organizada.'
    },
    {
      name: 'get_productivity_metrics',
      title: 'Métricas de Productividad (Tareas)',
      icon: '📊',
      mode: 'read',
      modeLabel: 'Lectura · Caché L3',
      desc: 'Calcula Win Rate, Cycle Time promedio, racha semanal y balance Maker vs Manager en Tareas.',
      params: 'monthOffset (0 = mes actual)',
      samplePrompt: 'Ejecuta get_productivity_metrics para analizar mi rendimiento del mes actual.'
    },
    {
      name: 'create_task',
      title: 'Creación Directa de Tarea',
      icon: '✨',
      mode: 'write',
      modeLabel: 'Escritura en TareasDB + Sync',
      desc: 'Crea una nueva tarea (y subtareas opcionales) directamente en tu planeador y dispara el respaldo automático.',
      params: 'title, desc, pri, due, dueTime, cat, project, subtasks',
      samplePrompt: 'Crea una tarea de prioridad media para hoy llamada "Revisar notas pendientes" usando create_task.'
    },
    {
      name: 'update_task_status',
      title: 'Actualizar Estado o Prioridad de Tarea',
      icon: '⚡',
      mode: 'write',
      modeLabel: 'Escritura en TareasDB + Sync',
      desc: 'Marca una tarea como completada/pendiente, reprograma fecha o ajusta prioridad.',
      params: 'taskId, done, due, dueTime, pri, title',
      samplePrompt: 'Revisa mis tareas vencidas y pregúntame cuáles quiero reprogramar usando update_task_status.'
    }
  ];

  const api = {
    MAX_TOOL_OUTPUT_CHARS,
    CACHE_TTL_MS,
    ALLOWED_COLLECTIONS,
    TOOLS_CATALOG,
    setDataAdapters,
    invalidateCache,
    getCacheSize,
    normalizeText,
    htmlToCleanText,
    enforcePayloadBudget,
    openReadOnlyDBIfExists,
    readExternalStores,
    getQuickWorkspaceSummary,
    executeTool
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WorkspaceTools = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
