// Plataforma de Chat con IA a Pantalla Completa (SPA Fullscreen View)
document.getElementById('ai-chat-mount').innerHTML = `
  <div class="ai-chat-fullscreen" id="ai-chat-screen" aria-hidden="true">

    <!-- Barra Superior -->
    <header class="aichat-header">
      <button type="button" class="aichat-back-btn" id="aichat-back-btn" title="Volver al módulo de Tareas">
        <span class="aichat-back-arrow">←</span>
        <span class="aichat-back-label">Tareas</span>
      </button>

      <div class="aichat-header-center">
        <div class="aichat-title-row">
          <span class="aichat-header-title" id="aichat-header-title">Asistente IA</span>
          <button type="button" class="aichat-rename-top-btn hidden" id="aichat-rename-active-btn" title="Cambiar nombre de la conversación">✎</button>
          <button type="button" class="aichat-active-folder-pill hidden" id="aichat-active-folder-btn" title="Asignar o cambiar carpeta de esta conversación">
            <span id="aichat-active-folder-icon">📁</span>
            <span id="aichat-active-folder-label">Sin carpeta</span>
          </button>
        </div>
        <button type="button" class="aichat-model-pill" id="aichat-model-pill" title="Proveedor de IA activo (Clic para configurar en Ajustes)">
          <span class="aichat-model-dot" id="aichat-model-dot"></span>
          <span id="aichat-model-label">Cargando modelo...</span>
        </button>
      </div>

      <div class="aichat-header-right">
        <button type="button" class="aichat-tools-top-btn" id="aichat-open-tools-btn" title="Ver las 7 herramientas de base de datos que la IA puede utilizar">
          <span class="aichat-tools-top-icon">🛠️</span>
          <span class="aichat-tools-top-text">7 Habilidades</span>
        </button>
        <button type="button" class="aichat-new-btn" id="aichat-new-chat-btn" title="Iniciar nueva conversación">
          <span>＋</span>
          <span class="aichat-new-btn-text">Nuevo chat</span>
        </button>
      </div>
    </header>

    <!-- Área Central Conmutable -->
    <main class="aichat-main">

      <!-- VISTA 1: Pantalla de Inicio + Conversación Activa -->
      <section class="aichat-view active" id="aichat-view-home">

        <!-- Pantalla de Inicio (Bienvenida cuando no hay mensajes en el chat actual) -->
        <div class="aichat-welcome" id="aichat-welcome">
          <div class="aichat-welcome-inner">
            <div class="aichat-emblem">
              <span class="aichat-emblem-icon">✦</span>
            </div>
            <h2 class="aichat-welcome-title" id="aichat-greeting">¿En qué nos enfocamos hoy?</h2>
            <p class="aichat-welcome-sub">
              Tu asistente inteligente conectado en tiempo real a tus tareas, proyectos, métricas e historial de actividad.
            </p>

            <div class="aichat-welcome-pills-row">
              <div class="aichat-context-pill" id="aichat-context-summary-pill">
                <span class="aichat-context-pill-dot"></span>
                <span id="aichat-context-pill-text">Contexto sincronizado · Habilidades listas</span>
              </div>
              <button type="button" class="aichat-welcome-tools-pill" id="aichat-welcome-tools-btn">
                <span>🛠️</span> Explorar las 7 herramientas de la IA →
              </button>
            </div>

            <div class="aichat-starters-grid" id="aichat-starters-grid">
              <button type="button" class="aichat-starter-card" data-starter="Analiza mis tareas pendientes y vencidas de hoy, dime por cuál empezar y propón un plan de ataque realista.">
                <div class="aichat-starter-top">
                  <span class="aichat-starter-icon">⚡</span>
                  <span class="aichat-starter-tag">Priorización</span>
                </div>
                <div class="aichat-starter-title">Plan de ataque para hoy</div>
                <div class="aichat-starter-desc">Ordena mis pendientes actuales según urgencia, impacto y vencimiento.</div>
              </button>

              <button type="button" class="aichat-starter-card" data-starter="Revisa las tareas que más he pospuesto o que llevan más tiempo estancadas en mi base de datos y ayúdame a destrabarlas o dividirlas.">
                <div class="aichat-starter-top">
                  <span class="aichat-starter-icon">🔓</span>
                  <span class="aichat-starter-tag">Antiprocrastinación</span>
                </div>
                <div class="aichat-starter-title">Destrabar tareas pospuestas</div>
                <div class="aichat-starter-desc">Detecta cuellos de botella crónicos y divídelos en pasos simples.</div>
              </button>

              <button type="button" class="aichat-starter-card" data-starter="Consulta mis proyectos activos y mis métricas de rendimiento para darme un diagnóstico de avance y balance Maker vs Manager.">
                <div class="aichat-starter-top">
                  <span class="aichat-starter-icon">◫</span>
                  <span class="aichat-starter-tag">Proyectos y Métricas</span>
                </div>
                <div class="aichat-starter-title">Auditoría de proyectos y ritmo</div>
                <div class="aichat-starter-desc">Evalúa la carga de mis proyectos y mi porcentaje de trabajo profundo.</div>
              </button>

              <button type="button" class="aichat-starter-card" data-starter="Ayúdame a planificar un nuevo objetivo y estructurarlo en tareas accionables dentro de mi planeador.">
                <div class="aichat-starter-top">
                  <span class="aichat-starter-icon">🪄</span>
                  <span class="aichat-starter-tag">Acción Directa</span>
                </div>
                <div class="aichat-starter-title">Planificar y crear tareas</div>
                <div class="aichat-starter-desc">Diseña un plan paso a paso y regístralo directamente en tu lista.</div>
              </button>
            </div>
          </div>
        </div>

        <!-- Hilo de Mensajes de la Conversación Activa -->
        <div class="aichat-thread-wrap hidden" id="aichat-thread-wrap">
          <div class="aichat-messages" id="aichat-messages-list"></div>
        </div>

        <!-- Composer Inferior Fijo en la Vista de Chat -->
        <div class="aichat-composer-zone">
          <div class="aichat-composer-status-row">
            <button type="button" class="aichat-composer-cap-btn" id="aichat-composer-tools-btn" title="Haz clic para inspeccionar las 7 herramientas de base de datos y el sistema de caché de la IA">
              <span>◈</span> Memoria + Extracto en Caché · <strong class="aichat-cap-link">🛠️ Ver 7 Habilidades DB</strong>
            </button>
            <span class="aichat-title-gen-status hidden" id="aichat-title-gen-status">
              <span class="aichat-spin">✦</span> Generando título...
            </span>
          </div>

          <div class="aichat-composer-box">
            <textarea
              id="aichat-input"
              class="aichat-textarea"
              rows="1"
              placeholder="Pregunta sobre tus tareas, pide un análisis o conversa con tu IA..."
              autocomplete="off"
            ></textarea>
            <button type="button" class="aichat-send-btn" id="aichat-send-btn" title="Enviar mensaje (Enter)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </button>
          </div>
        </div>

      </section>

      <!-- VISTA 2: Pestaña de Historial de Conversaciones y Carpetas (Chats) -->
      <section class="aichat-view" id="aichat-view-chats">
        <div class="aichat-chats-container">

          <div class="aichat-chats-header">
            <div>
              <h2 class="aichat-chats-title">Mis Conversaciones</h2>
              <p class="aichat-chats-subtitle">Organiza tus chats en carpetas personalizadas. Todo se respalda en la nube y en tus exportaciones JSON.</p>
            </div>
            <div class="aichat-chats-header-actions">
              <button type="button" class="aichat-btn-folders-manage" id="aichat-manage-folders-btn" title="Crear, editar o eliminar carpetas">
                <span>📁</span> Carpetas
              </button>
              <button type="button" class="aichat-btn-new-primary" id="aichat-new-from-list-btn">
                <span>＋</span> Nueva conversación
              </button>
            </div>
          </div>

          <!-- Barra de Filtrado por Carpetas -->
          <div class="aichat-folders-bar-wrap">
            <div class="aichat-folders-bar" id="aichat-folders-bar" role="tablist" aria-label="Filtrar conversaciones por carpeta">
              <!-- Relleno dinámico por JS -->
            </div>
          </div>

          <div class="aichat-chats-search-wrap">
            <span class="aichat-chats-search-icon">🔍</span>
            <input
              type="search"
              id="aichat-search-input"
              class="aichat-chats-search-input"
              placeholder="Buscar chat por título, carpeta o contenido..."
              autocomplete="off"
            />
            <button type="button" class="aichat-chats-search-clear hidden" id="aichat-search-clear" title="Limpiar búsqueda">✕</button>
          </div>

          <div class="aichat-chats-list" id="aichat-chats-list">
            <!-- Relleno dinámico por JS -->
          </div>

        </div>
      </section>

    </main>

    <!-- Barra de Navegación Inferior de la Plataforma de Chat IA -->
    <nav class="aichat-bottom-nav" aria-label="Navegación del Chat con IA">
      <div class="aichat-bottom-nav-inner">
        <button type="button" class="aichat-bnav-tab active" data-aichat-tab="home" id="aichat-tab-home">
          <span class="aichat-bnav-icon">✦</span>
          <span class="aichat-bnav-label">Inicio / Chat</span>
        </button>
        <button type="button" class="aichat-bnav-tab" data-aichat-tab="chats" id="aichat-tab-chats">
          <span class="aichat-bnav-icon">💬</span>
          <span class="aichat-bnav-label">Chats</span>
          <span class="aichat-bnav-badge" id="aichat-total-badge">0</span>
        </button>
      </div>
    </nav>

    <!-- Modal ligero para Renombrar Conversación -->
    <div class="aichat-modal-overlay hidden" id="aichat-rename-modal" role="dialog" aria-modal="true">
      <div class="aichat-modal-box">
        <h3 class="aichat-modal-title">Renombrar conversación</h3>
        <p class="aichat-modal-desc">Escribe un nuevo título para identificar este chat.</p>
        <input type="text" id="aichat-rename-input" class="settings-input" maxlength="80" placeholder="Título de la conversación..." autocomplete="off" />
        <div class="aichat-modal-actions">
          <button type="button" class="settings-btn-secondary" id="aichat-rename-cancel">Cancelar</button>
          <button type="button" class="settings-btn-primary" id="aichat-rename-save">Guardar nombre</button>
        </div>
      </div>
    </div>

    <!-- Modal ligero para Confirmar Eliminación de Conversación -->
    <div class="aichat-modal-overlay hidden" id="aichat-delete-modal" role="dialog" aria-modal="true">
      <div class="aichat-modal-box">
        <h3 class="aichat-modal-title">¿Eliminar conversación?</h3>
        <p class="aichat-modal-desc" id="aichat-delete-modal-desc">Esta conversación se eliminará permanentemente de tu dispositivo y del próximo respaldo.</p>
        <div class="aichat-modal-actions">
          <button type="button" class="settings-btn-secondary" id="aichat-delete-cancel">Cancelar</button>
          <button type="button" class="settings-btn-primary aichat-btn-danger" id="aichat-delete-confirm">Eliminar chat</button>
        </div>
      </div>
    </div>

    <!-- Modal para Asignar / Mover Conversación a una Carpeta -->
    <div class="aichat-modal-overlay hidden" id="aichat-assign-folder-modal" role="dialog" aria-modal="true">
      <div class="aichat-modal-box aichat-modal-box-md">
        <div class="aichat-modal-head-row">
          <div>
            <h3 class="aichat-modal-title">Mover a carpeta</h3>
            <p class="aichat-modal-desc" id="aichat-assign-folder-subtitle">Selecciona la carpeta para clasificar esta conversación.</p>
          </div>
          <button type="button" class="aichat-modal-close-x" id="aichat-assign-folder-close" title="Cerrar">✕</button>
        </div>

        <div class="aichat-assign-folder-list" id="aichat-assign-folder-list">
          <!-- Relleno dinámico por JS -->
        </div>

        <div class="aichat-modal-footer-split">
          <button type="button" class="settings-btn-secondary" id="aichat-assign-new-folder-btn">
            ＋ Crear nueva carpeta
          </button>
          <button type="button" class="settings-btn-secondary" id="aichat-assign-folder-cancel">
            Cerrar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Gestor Completo de Carpetas (Crear, Editar, Eliminar con Protección de Casos Límite) -->
    <div class="aichat-modal-overlay hidden" id="aichat-folders-modal" role="dialog" aria-modal="true">
      <div class="aichat-modal-box aichat-modal-box-lg">
        <div class="aichat-modal-head-row">
          <div>
            <h3 class="aichat-modal-title">Gestión de Carpetas de Chat</h3>
            <p class="aichat-modal-desc">Personaliza tus carpetas con íconos y colores. Las carpetas con chats activos están protegidas contra borrado accidental.</p>
          </div>
          <button type="button" class="aichat-modal-close-x" id="aichat-folders-modal-close" title="Cerrar">✕</button>
        </div>

        <!-- Banner de Bloqueo de Caso Límite (Intento de borrar carpeta que contiene chats) -->
        <div class="aichat-folder-lock-alert hidden" id="aichat-folder-lock-banner" role="alert">
          <div class="aichat-folder-lock-top">
            <span class="aichat-folder-lock-icon">🛡️</span>
            <div class="aichat-folder-lock-texts">
              <strong class="aichat-folder-lock-title" id="aichat-folder-lock-title">Borrado bloqueado: la carpeta contiene conversaciones</strong>
              <p class="aichat-folder-lock-desc" id="aichat-folder-lock-desc"></p>
            </div>
          </div>
          <div class="aichat-folder-lock-actions">
            <button type="button" class="settings-btn-primary aichat-btn-sm" id="aichat-folder-lock-view-btn">
              Ver chats de esta carpeta
            </button>
            <button type="button" class="settings-btn-secondary aichat-btn-sm" id="aichat-folder-lock-dismiss-btn">
              Entendido
            </button>
          </div>
        </div>

        <!-- Formulario Crear / Editar Carpeta -->
        <div class="aichat-folder-form-card" id="aichat-folder-form-card">
          <div class="aichat-folder-form-header">
            <span class="aichat-folder-form-title" id="aichat-folder-form-title">Nueva carpeta</span>
            <span class="aichat-folder-preview-pill" id="aichat-folder-preview-pill">
              <span id="aichat-folder-preview-icon">📁</span>
              <span id="aichat-folder-preview-name">Vista previa</span>
            </span>
          </div>

          <div class="aichat-folder-form-grid">
            <div class="aichat-folder-field-icon">
              <label class="aichat-folder-label" for="aichat-folder-icon-input">Ícono</label>
              <input type="text" id="aichat-folder-icon-input" class="settings-input aichat-icon-input" maxlength="4" value="📁" autocomplete="off" />
            </div>
            <div class="aichat-folder-field-name">
              <label class="aichat-folder-label" for="aichat-folder-name-input">Nombre de la carpeta</label>
              <input type="text" id="aichat-folder-name-input" class="settings-input" maxlength="40" placeholder="Ej. Estrategia, Clientes, Ideas..." autocomplete="off" />
            </div>
          </div>

          <div class="aichat-folder-QuickPickers">
            <div class="aichat-folder-picker-block">
              <span class="aichat-folder-label">Emojis sugeridos</span>
              <div class="aichat-folder-emojis" id="aichat-folder-emoji-grid"></div>
            </div>
            <div class="aichat-folder-picker-block">
              <span class="aichat-folder-label">Color de etiqueta</span>
              <div class="aichat-folder-colors" id="aichat-folder-color-grid"></div>
            </div>
          </div>

          <!-- Contexto Adicional Precargado por Carpeta / Proyecto (Máx. 5,000 Tokens) -->
          <div class="aichat-folder-context-wrap">
            <div class="aichat-folder-context-head">
              <label class="aichat-folder-label" for="aichat-folder-context-input">
                🧠 Contexto adicional para la IA (Opcional · Por carpeta)
              </label>
              <span class="aichat-folder-context-counter" id="aichat-folder-context-counter">0 / 5,000 tokens</span>
            </div>
            <div class="aichat-folder-context-bar" aria-hidden="true">
              <div class="aichat-folder-context-fill" id="aichat-folder-context-fill" style="width: 0%"></div>
            </div>
            <textarea
              id="aichat-folder-context-input"
              class="settings-input aichat-folder-context-textarea"
              rows="4"
              placeholder="Escribe antecedentes, reglas, estilo de respuesta, detalles del proyecto o datos clave que la IA debe saber de antemano en todos los chats de esta carpeta (máx. 5,000 tokens)..."
            ></textarea>
            <span class="aichat-folder-context-hint">
              La IA recibirá este contexto automáticamente en cada conversación asignada a esta carpeta sin que tengas que repetírselo. Se incluye en tus respaldos a la nube y exportaciones JSON.
            </span>
          </div>

          <div class="aichat-folder-form-error hidden" id="aichat-folder-form-error"></div>

          <div class="aichat-folder-form-actions">
            <button type="button" class="settings-btn-secondary hidden" id="aichat-folder-cancel-edit-btn">Cancelar edición</button>
            <button type="button" class="settings-btn-primary" id="aichat-folder-save-btn">Crear carpeta</button>
          </div>
        </div>

        <!-- Lista de Carpetas Existentes -->
        <div class="aichat-folders-manage-section">
          <div class="aichat-folders-manage-head">
            <span>Carpetas creadas</span>
            <span id="aichat-folders-count-label">0 carpetas</span>
          </div>
          <div class="aichat-folders-manage-list" id="aichat-folders-manage-list">
            <!-- Relleno dinámico por JS -->
          </div>
        </div>

        <div class="aichat-modal-actions">
          <button type="button" class="settings-btn-secondary" id="aichat-folders-modal-done">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- Modal Inspector de las 7 Herramientas (Habilidades DB) y Arquitectura de Contexto -->
    <div class="aichat-modal-overlay hidden" id="aichat-tools-modal" role="dialog" aria-modal="true">
      <div class="aichat-modal-box aichat-modal-box-xl">
        <div class="aichat-modal-head-row">
          <div>
            <div class="aichat-tools-modal-eyebrow">ARQUITECTURA AGÉNTICA · 7 HABILIDADES DB</div>
            <h3 class="aichat-modal-title">Herramientas y Contexto de tu IA</h3>
            <p class="aichat-modal-desc">
              Tu asistente puede invocar autónomamente hasta 3 rondas de herramientas por mensaje para consultar o actualizar tu base de datos IndexedDB en tiempo real.
            </p>
          </div>
          <button type="button" class="aichat-modal-close-x" id="aichat-tools-modal-close" title="Cerrar">✕</button>
        </div>

        <!-- Estado en Vivo del Sistema de Contexto y Caché -->
        <div class="aichat-tools-cache-banner" id="aichat-tools-cache-banner">
          <!-- Relleno dinámico por JS -->
        </div>

        <!-- Catálogo de las 7 Herramientas -->
        <div class="aichat-tools-grid" id="aichat-tools-catalog-list">
          <!-- Relleno dinámico por JS -->
        </div>

        <div class="aichat-modal-actions">
          <button type="button" class="settings-btn-primary" id="aichat-tools-modal-done">Listo</button>
        </div>
      </div>
    </div>

  </div>
`;
