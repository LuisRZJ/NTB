document.getElementById('filters-mount').innerHTML = `
  <!-- Segmented Priority Control -->
  <div class="pri-segmented-bar">
    <div class="pri-tabs" role="tablist" aria-label="Filtrar por prioridad">
      <button class="pri-tab" data-pri="suggestions" role="tab" aria-selected="false">
        <span class="pri-indicator pri-indicator-suggestions">✦</span>
        <span class="pri-tab-text">Sugerencias</span>
        <span class="pri-count-badge" id="countSugerencias">0</span>
      </button>
      <button class="pri-tab active" data-pri="high" role="tab" aria-selected="true">
        <span class="pri-indicator pri-indicator-high"></span>
        <span class="pri-tab-text">Alta</span>
        <span class="pri-count-badge" id="countAlta">0</span>
      </button>
      <button class="pri-tab" data-pri="mid" role="tab" aria-selected="false">
        <span class="pri-indicator pri-indicator-mid"></span>
        <span class="pri-tab-text">Media</span>
        <span class="pri-count-badge" id="countMedia">0</span>
      </button>
      <button class="pri-tab" data-pri="low" role="tab" aria-selected="false">
        <span class="pri-indicator pri-indicator-low"></span>
        <span class="pri-tab-text">Baja</span>
        <span class="pri-count-badge" id="countBaja">0</span>
      </button>
    </div>
  </div>

  <!-- Search Input with Keyboard Shortcut hint -->
  <div class="task-search-wrap">
    <div class="task-search-icon">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
      </svg>
    </div>
    <input type="search" id="task-search-input" class="task-search-input" placeholder="Buscar por título, nota, proyecto o categoría..." autocomplete="off" />
    <div class="task-search-right">
      <kbd class="search-kbd-hint" id="search-kbd-hint">ESC</kbd>
      <button type="button" id="task-search-clear" class="task-search-clear" title="Limpiar búsqueda">✕</button>
    </div>
  </div>

  <!-- Scope & Filter Controls + Primary Action Button -->
  <div class="controls-action-row">
    <div class="controls-left-group">
      <!-- Scope Selector -->
      <div class="scope-wrapper">
        <button class="scope-toggle" id="scope-toggle" aria-expanded="false" title="Cambiar alcance de fecha">
          <span class="scope-toggle-icon">◈</span>
          <span id="scope-toggle-label">Hoy</span>
          <span class="scope-toggle-arrow">▾</span>
        </button>
        <div class="scope-panel" id="scope-panel">
          <button class="scope-btn active" data-scope="today">Hoy</button>
          <button class="scope-btn" data-scope="tomorrow">Mañana</button>
          <button class="scope-btn" data-scope="dayafter">Pasadomañana</button>
          <button class="scope-btn" data-scope="week">Esta semana</button>
          <button class="scope-btn" data-scope="month">Este mes</button>
          <button class="scope-btn" data-scope="nodate">Sin fecha</button>
          <button class="scope-btn" data-scope="all">Todo</button>
        </div>
      </div>

      <!-- Filters & Sorting Selector -->
      <div class="filters-wrapper">
        <button class="filters-toggle" id="filters-toggle" aria-expanded="false" title="Filtros de estado">
          <span class="filters-toggle-icon">⇅</span>
          <span id="filter-toggle-label">Filtros</span>
          <span class="filter-active-dot" id="filter-active-dot"></span>
          <span class="filters-toggle-arrow">▾</span>
        </button>
        <div class="filters" id="filters-panel">
          <button class="filter-btn active" data-filter="all">Todas</button>
          <button class="filter-btn" data-filter="pending">Pendientes</button>
          <button class="filter-btn" data-filter="done">Completadas</button>
        </div>
      </div>
    </div>

    <!-- Quick New Task Action Button -->
    <div class="controls-right-group">
      <button type="button" class="btn-new-task-main" id="btn-new-task-main" title="Crear nueva tarea">
        <span class="btn-new-task-icon">+</span>
        <span class="btn-new-task-text">Nueva tarea</span>
      </button>
    </div>
  </div>
`;