// Botón flotante de navegación + panel modal minimalista
document.getElementById('form-mount').innerHTML = `
  <!-- Menú de navegación flotante minimalista (Ajustes y Documentación) -->
  <div class="nav-fab-wrap" id="nav-fab-wrap">
    <div class="nav-fab-menu" id="nav-fab-menu" aria-hidden="true">
      <button class="nav-fab-item" data-nav="docs" title="Documentación y API REST">
        <span class="nav-fab-item-icon">⚡</span>
        <span class="nav-fab-item-label">API REST</span>
      </button>
      <button class="nav-fab-item" data-nav="ajustes" title="Ajustes y configuración">
        <span class="nav-fab-item-icon">⊙</span>
        <span class="nav-fab-item-label">Ajustes</span>
      </button>
    </div>
    <button class="fab" id="fab-add" title="Menú de ajustes y opciones" aria-expanded="false">
      <span class="fab-icon" id="fab-icon">≡</span>
    </button>
  </div>

  <!-- Barra de navegación inferior fija estilo App móvil -->
  <nav class="bottom-nav" id="bottom-nav" aria-label="Navegación principal">
    <div class="bottom-nav-inner">
      <button type="button" class="bottom-nav-item" id="bnav-new-task" title="Crear nueva tarea">
        <span class="bottom-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </span>
        <span class="bottom-nav-label">Nueva tarea</span>
      </button>
      <button type="button" class="bottom-nav-item" id="bnav-projects" title="Ver proyectos">
        <span class="bottom-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
          </svg>
        </span>
        <span class="bottom-nav-label">Proyectos</span>
      </button>
      <button type="button" class="bottom-nav-item" id="bnav-stats" title="Estadísticas de productividad">
        <span class="bottom-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </span>
        <span class="bottom-nav-label">Estadística</span>
      </button>
      <button type="button" class="bottom-nav-item" id="bnav-history" title="Historial de tareas completadas">
        <span class="bottom-nav-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </span>
        <span class="bottom-nav-label">Historial</span>
      </button>
    </div>
  </nav>

  <!-- Modal de creación y edición de tareas -->
  <div class="form-overlay" id="form-overlay">
    <div class="form-modal" role="dialog" aria-modal="true" aria-labelledby="form-modal-title">
      <div class="form-modal-header">
        <div class="form-modal-title-wrap">
          <h2 class="form-modal-title" id="form-modal-title">Nueva Tarea</h2>
          <span class="form-modal-subtitle">Organiza tus pendientes del día</span>
        </div>
        <div class="form-modal-header-actions">
          <button type="button" id="btn-toggle-magic" class="btn-toggle-magic" title="Abrir asistente de lenguaje natural con IA">
            <span class="magic-sparkle">✨</span> IA
          </button>
          <button type="button" class="form-modal-close" id="form-close" title="Cerrar modal">✕</button>
        </div>
      </div>

      <div class="form-card">
        <!-- Magic Input IA -->
        <div class="form-magic-input-wrap hidden" id="magic-input-wrap">
          <div class="magic-input-inner">
            <textarea id="magic-input-text" placeholder="Escribe en lenguaje natural (ej. 'Comprar despensa hoy a las 5pm con prioridad alta')" rows="2"></textarea>
            <div class="form-magic-actions">
              <button type="button" id="btn-magic-generate" class="btn-magic" title="Completar datos usando IA">
                Generar 🪄
              </button>
              <span class="magic-loading" id="magic-loading" style="display:none;">⏳ Procesando...</span>
            </div>
          </div>
        </div>

        <!-- Título principal -->
        <div class="form-field-group">
          <label class="form-input-label" for="new-task">Título</label>
          <div class="form-input-pill-wrap">
            <input type="text" id="new-task" class="form-title-input" placeholder="¿Qué necesitas hacer hoy?" autocomplete="off" />
          </div>
        </div>

        <!-- Descripción en Markdown -->
        <div class="form-field-group">
          <label class="form-input-label" for="new-desc">Descripción <span class="label-opt">(soporta Markdown)</span></label>
          <div class="form-desc">
            <textarea id="new-desc" placeholder="Detalles, enlaces, notas adicionales..." rows="3"></textarea>
          </div>
        </div>

        <!-- Selector Segmentado de Prioridad en el Formulario -->
        <div class="form-field-group">
          <label class="form-input-label">Prioridad</label>
          <div class="modal-pri-segmented">
            <label class="modal-pri-option modal-pri-high">
              <input type="radio" name="modal-pri-radio" value="high">
              <span class="modal-pri-pill">
                <span class="pri-indicator pri-indicator-high"></span>
                Alta
              </span>
            </label>
            <label class="modal-pri-option modal-pri-mid">
              <input type="radio" name="modal-pri-radio" value="mid" checked>
              <span class="modal-pri-pill">
                <span class="pri-indicator pri-indicator-mid"></span>
                Media
              </span>
            </label>
            <label class="modal-pri-option modal-pri-low">
              <input type="radio" name="modal-pri-radio" value="low">
              <span class="modal-pri-pill">
                <span class="pri-indicator pri-indicator-low"></span>
                Baja
              </span>
            </label>
            <!-- Select oculto nativo para mantener compatibilidad total con app.js -->
            <select id="sel-pri" style="display:none;">
              <option value="high">Alta</option>
              <option value="mid" selected>Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
        </div>

        <!-- Vencimiento, Hora y Recurrencia -->
        <div class="form-extra">
          <div class="form-field">
            <label for="sel-due">Fecha</label>
            <input type="date" id="sel-due" />
          </div>
          <div class="form-field">
            <label for="sel-time">Hora</label>
            <input type="time" id="sel-time" />
          </div>
          <div class="form-field form-field-repeat">
            <label>Repetir</label>
            <div class="repeat-inputs">
              <input type="number" id="sel-repeat-n" min="1" max="999" placeholder="—" />
              <select id="sel-repeat-unit">
                <option value="">No repetir</option>
                <option value="h">cada N horas</option>
                <option value="d">cada N días</option>
                <option value="w">cada N semanas</option>
                <option value="m">cada N meses</option>
                <option value="y">cada N años</option>
                <option value="dw">días de la semana</option>
              </select>
            </div>
            <div class="repeat-days-picker hidden" id="repeat-days-picker">
              <button type="button" class="day-btn" data-day="1">L</button>
              <button type="button" class="day-btn" data-day="2">M</button>
              <button type="button" class="day-btn" data-day="3">X</button>
              <button type="button" class="day-btn" data-day="4">J</button>
              <button type="button" class="day-btn" data-day="5">V</button>
              <button type="button" class="day-btn" data-day="6">S</button>
              <button type="button" class="day-btn" data-day="0">D</button>
            </div>
          </div>
        </div>

        <!-- Proyecto y Categoría -->
        <div class="form-meta-row">
          <div class="form-field-meta">
            <label>Proyecto</label>
            <div class="cat-multi-wrap" id="proj-select-wrap">
              <button type="button" class="cat-multi-trigger" id="proj-select-trigger">— Sin proyecto</button>
              <div class="cat-multi-dropdown" id="proj-select-dropdown"></div>
            </div>
          </div>
          <div class="form-field-meta">
            <label>Categoría</label>
            <div class="cat-multi-wrap" id="cat-multi-wrap">
              <button type="button" class="cat-multi-trigger" id="cat-multi-trigger">— Sin categoría</button>
              <div class="cat-multi-dropdown" id="cat-multi-dropdown"></div>
            </div>
          </div>
        </div>

        <!-- Acciones del Modal -->
        <div class="form-actions-footer">
          <button type="button" class="btn-modal-cancel" id="form-cancel-btn">Cancelar</button>
          <button type="button" class="btn-add" id="btn-submit-task" onclick="addTask()">Guardar Tarea</button>
        </div>
      </div>
    </div>
  </div>
`;