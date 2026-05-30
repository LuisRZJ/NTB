// ── Historial de Actividad ──
// Monta el overlay en #history-mount y expone: openHistory(), closeHistory(), addHistoryEntry()

(function () {

  // ── Montar HTML del overlay ──
  document.getElementById('history-mount').innerHTML = `
    <div class="history-overlay" id="history-overlay" aria-hidden="true">
      <div class="history-panel" id="history-panel">

        <!-- Header -->
        <div class="history-header">
          <span class="history-header-icon">◷</span>
          <div style="flex:1;min-width:0;">
            <div class="history-header-title">Historial</div>
            <div class="history-header-sub" id="history-header-sub">Actividad cronológica</div>
          </div>
          <button class="history-close" id="history-close" title="Cerrar">✕</button>
        </div>

        <!-- Stats bar -->
        <div class="history-stats-bar">
          <div class="history-stat">
            <span class="history-stat-value" id="hstat-total">0</span>
            <span class="history-stat-label">Eventos</span>
          </div>
          <div class="history-stat">
            <span class="history-stat-value" id="hstat-created">0</span>
            <span class="history-stat-label">Creadas</span>
          </div>
          <div class="history-stat">
            <span class="history-stat-value" id="hstat-done">0</span>
            <span class="history-stat-label">Completadas</span>
          </div>
          <div class="history-stat">
            <span class="history-stat-value" id="hstat-deleted">0</span>
            <span class="history-stat-label">Eliminadas</span>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="history-filter-bar" id="history-filter-bar">
          <button class="history-filter-btn active" data-hfilter="all">Todos</button>
          <button class="history-filter-btn" data-hfilter="created">✦ Creadas</button>
          <button class="history-filter-btn" data-hfilter="completed">✓ Completadas</button>
          <button class="history-filter-btn" data-hfilter="edited">✎ Editadas</button>
          <button class="history-filter-btn" data-hfilter="deleted">🗑 Eliminadas</button>
          <button class="history-filter-btn" data-hfilter="reopened">↩ Reabiertas</button>
        </div>

        <!-- Body -->
        <div class="history-body" id="history-body">
        </div>

      </div>
    </div>
  `;

  // ── Referencias ──
  const overlay   = document.getElementById('history-overlay');
  const body      = document.getElementById('history-body');
  const closeBtn  = document.getElementById('history-close');
  const filterBar = document.getElementById('history-filter-bar');

  let _historyEntries = [];
  let _activeFilter   = 'all';

  // ── Helpers de fecha ──
  function _isoDate(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function _dayLabel(dateStr) {
    const today     = _isoDate(Date.now());
    const yesterday = _isoDate(Date.now() - 86400000);
    if (dateStr === today)     return 'Hoy';
    if (dateStr === yesterday) return 'Ayer';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function _timeStr(ms) {
    const d = new Date(ms);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Íconos y etiquetas por tipo ──
  const TYPE_CONFIG = {
    created:   { icon: '✦', cls: 'history-icon-created',   label: 'Creada',     actionCls: 'type-created'   },
    completed: { icon: '✓', cls: 'history-icon-completed',  label: 'Completada', actionCls: 'type-completed' },
    reopened:  { icon: '↩', cls: 'history-icon-reopened',   label: 'Reabierta',  actionCls: 'type-reopened'  },
    edited:    { icon: '✎', cls: 'history-icon-edited',     label: 'Editada',    actionCls: 'type-edited'    },
    deleted:   { icon: '🗑', cls: 'history-icon-deleted',  label: 'Eliminada',  actionCls: 'type-deleted'   },
    migrated:  { icon: '◌', cls: 'history-icon-migrated',   label: 'Importada',  actionCls: ''               },
  };

  function _escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _priLabel(pri) {
    if (pri === 'high') return '<span class="priority-badge priority-high">Alta</span>';
    if (pri === 'mid')  return '<span class="priority-badge priority-mid">Media</span>';
    if (pri === 'low')  return '<span class="priority-badge priority-low">Baja</span>';
    return '';
  }

  function _catBadges(cats) {
    if (!cats || !cats.length) return '';
    if (typeof CATS === 'undefined') return '';
    return cats.map(k => {
      const c = CATS[k];
      if (!c) return '';
      return `<span class="tag"><span class="tag-dot" style="background:${c.color}"></span>${_escHtml(c.label)}</span>`;
    }).join('');
  }

  // ── Renderizado principal ──
  function renderHistory() {
    const filtered = _activeFilter === 'all'
      ? _historyEntries
      : _historyEntries.filter(e => e.type === _activeFilter);

    // Stats
    document.getElementById('hstat-total').textContent   = _historyEntries.length;
    document.getElementById('hstat-created').textContent = _historyEntries.filter(e => e.type === 'created' || e.type === 'migrated').length;
    document.getElementById('hstat-done').textContent    = _historyEntries.filter(e => e.type === 'completed').length;
    document.getElementById('hstat-deleted').textContent = _historyEntries.filter(e => e.type === 'deleted').length;

    // Sub-label en el header
    const sub = document.getElementById('history-header-sub');
    if (sub) {
      sub.textContent = filtered.length === _historyEntries.length
        ? `${_historyEntries.length} evento${_historyEntries.length !== 1 ? 's' : ''} registrado${_historyEntries.length !== 1 ? 's' : ''}`
        : `${filtered.length} de ${_historyEntries.length} evento${_historyEntries.length !== 1 ? 's' : ''}`;
    }

    // Estado vacío
    if (filtered.length === 0) {
      body.innerHTML = `
        <div class="history-empty">
          <div class="history-empty-icon">◷</div>
          <div class="history-empty-title">Sin eventos</div>
          <div class="history-empty-sub">${
            _activeFilter === 'all'
              ? 'Aquí aparecerán las acciones que realices sobre tus tareas.'
              : 'No hay eventos de este tipo en el historial.'
          }</div>
        </div>`;
      return;
    }

    // Agrupar por fecha (más reciente primero)
    const sorted = [...filtered].sort((a, b) => b.id - a.id);
    const byDay  = new Map();
    for (const e of sorted) {
      const day = _isoDate(e.id);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(e);
    }

    let html = '';
    for (const [day, entries] of byDay) {
      const label = _dayLabel(day);
      const count = entries.length;
      html += `
        <div class="history-day-group">
          <div class="history-day-header">
            <span class="history-day-label">${_escHtml(label)}</span>
            <span class="history-day-line"></span>
            <span class="history-day-count">${count} evento${count !== 1 ? 's' : ''}</span>
          </div>`;

      for (const e of entries) {
        const cfg       = TYPE_CONFIG[e.type] || TYPE_CONFIG.migrated;
        const isDeleted = e.type === 'deleted';
        const metaHtml  = [_catBadges(e.cats), _priLabel(e.pri)].filter(Boolean).join('');

        html += `
          <div class="history-entry">
            <div class="history-entry-icon ${cfg.cls}">${cfg.icon}</div>
            <div class="history-entry-body">
              <div class="history-entry-action ${cfg.actionCls}">${cfg.label}</div>
              <div class="history-entry-title${isDeleted ? ' deleted-title' : ''}">${_escHtml(e.taskText || '—')}</div>
              ${metaHtml ? `<div class="history-entry-meta">${metaHtml}</div>` : ''}
            </div>
            <span class="history-entry-time">${_timeStr(e.id)}</span>
          </div>`;
      }
      html += `</div>`;
    }
    body.innerHTML = html;
  }

  // ── Filtros ──
  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.history-filter-btn');
    if (!btn) return;
    filterBar.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeFilter = btn.dataset.hfilter;
    renderHistory();
  });

  // ── Abrir ──
  window.openHistory = async function () {
    _historyEntries = await dbGetHistory();
    _historyEntries.sort((a, b) => b.id - a.id);
    _activeFilter = 'all';
    filterBar.querySelectorAll('.history-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.hfilter === 'all');
    });
    renderHistory();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  };

  // ── Cerrar ──
  window.closeHistory = function () {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  };

  // ── Registrar evento (llamado desde app.js) ──
  window.addHistoryEntry = async function (type, task, overrides) {
    const entry = {
      id:       Date.now() + Math.floor(Math.random() * 100),
      type,
      taskId:   task ? task.id   : null,
      taskText: task ? (task.text || '') : (overrides && overrides.taskText ? overrides.taskText : ''),
      taskPri:  task ? (task.pri  || '') : '',
      cats:     task ? (Array.isArray(task.cats) ? task.cats : [task.cat].filter(Boolean)) : [],
      ts:       new Date().toISOString(),
      ...(overrides || {}),
    };
    await dbAddHistory(entry);
  };

  // ── Eventos de cierre ──
  closeBtn.addEventListener('click', window.closeHistory);
  overlay.addEventListener('click', e => { if (e.target === overlay) window.closeHistory(); });

})();