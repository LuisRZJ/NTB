// Panel de ajustes (SPA overlay)
document.getElementById('settings-mount').innerHTML = `
  <div class="settings-overlay" id="settings-overlay" aria-hidden="true">
    <div class="settings-panel">

      <div class="settings-header">
        <span class="settings-title">Ajustes</span>
        <button class="settings-close" id="settings-close" title="Cerrar">✕</button>
      </div>

      <div class="settings-body">

        <!-- Sección: Categorías -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">◈</span>
            <h2 class="settings-section-title">Categorías</h2>
          </div>
          <p class="settings-section-desc">Crea categorías personalizadas para organizar tus tareas.</p>

          <!-- Lista de categorías predeterminadas -->
          <div class="settings-cats-group">
            <div class="settings-cats-group-label">Predeterminadas</div>
            <div class="settings-cats-default" id="settings-cats-default"></div>
          </div>

          <!-- Lista de categorías personalizadas -->
          <div class="settings-cats-group" id="settings-custom-group">
            <div class="settings-cats-group-label">Personalizadas</div>
            <div class="settings-cats-custom" id="settings-cats-custom"></div>
          </div>

          <!-- Formulario de nueva categoría -->
          <div class="settings-cat-form" id="settings-cat-form">
            <div class="settings-cat-form-title" id="settings-cat-form-title">Nueva categoría</div>

            <!-- Nombre -->
            <div class="settings-field">
              <label class="settings-label">Nombre</label>
              <input class="settings-input" id="cat-name" type="text" maxlength="20" placeholder="Ej. Viajes" autocomplete="off"/>
            </div>

            <!-- Icono (emoji) -->
            <div class="settings-field">
              <label class="settings-label">Icono</label>
              <div class="settings-emoji-grid" id="settings-emoji-grid">
                <!-- Relleno por JS -->
              </div>
              <input class="settings-input settings-emoji-custom" id="cat-icon" type="text" maxlength="4" placeholder="✈ o pega cualquier emoji"/>
            </div>

            <!-- Color -->
            <div class="settings-field">
              <label class="settings-label">Color</label>
              <div class="settings-palette" id="settings-palette"></div>
            </div>

            <!-- Preview -->
            <div class="settings-cat-preview" id="settings-cat-preview">
              <span class="tag">
                <span class="tag-dot" id="preview-dot" style="background:#1a3c6e"></span>
                <span id="preview-label">👤 Vista previa</span>
              </span>
            </div>

            <!-- Botones -->
            <div class="settings-cat-actions">
              <button class="settings-btn-secondary" id="cat-cancel">Cancelar</button>
              <button class="settings-btn-primary" id="cat-save">Guardar categoría</button>
            </div>
          </div>

          <button class="settings-add-cat-btn" id="settings-add-cat-btn">
            <span>＋</span> Añadir categoría
          </button>
        </section>

        <!-- Sección: Apariencia -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">🎨</span>
            <h2 class="settings-section-title">Apariencia</h2>
          </div>
          <p class="settings-section-desc">Elige tu tema visual preferido para personalizar la interfaz de la aplicación.</p>

          <div class="settings-field">
            <label class="settings-label" for="app-theme-select">Tema de la app</label>
            <select class="settings-input" id="app-theme-select" style="width: 100%; height: 38px; padding: 8px 12px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); border-radius: 6px; font-family: var(--font-sans); font-size: 13px; appearance: auto;">
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
              <option value="auto">Automático</option>
            </select>
          </div>

          <div id="theme-auto-options" style="display:none; margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 12px; gap: 12px; flex-direction: column;">
            <div class="settings-field">
              <label class="settings-label" for="theme-auto-type">Criterio de automatización</label>
              <select class="settings-input" id="theme-auto-type" style="width: 100%; height: 38px; padding: 8px 12px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); border-radius: 6px; font-family: var(--font-sans); font-size: 13px; appearance: auto;">
                <option value="system">Preferencia del sistema</option>
                <option value="battery">Nivel de batería</option>
                <option value="schedule">Por horarios</option>
              </select>
            </div>

            <!-- Opción: Carga de batería -->
            <div id="theme-opt-battery" style="display:none; flex-direction:column; gap: 8px;">
              <div class="settings-field">
                <label class="settings-label" for="theme-battery-thresh">Umbral de activación (%)</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="number" id="theme-battery-thresh" min="5" max="95" step="5" class="settings-input" style="width: 80px; text-align: center; height: 38px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); border-radius: 6px;">
                  <span style="font-size: 13px; color: var(--text2);">Activar modo oscuro por debajo de este nivel</span>
                </div>
              </div>
            </div>

            <!-- Opción: Por horarios -->
            <div id="theme-opt-schedule" style="display:none; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="settings-field">
                <label class="settings-label" for="theme-sched-light">Tema Claro desde</label>
                <input type="time" id="theme-sched-light" class="settings-input" style="width: 100%; height: 38px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); border-radius: 6px; padding: 4px 8px;">
              </div>
              <div class="settings-field">
                <label class="settings-label" for="theme-sched-dark">Tema Oscuro desde</label>
                <input type="time" id="theme-sched-dark" class="settings-input" style="width: 100%; height: 38px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); border-radius: 6px; padding: 4px 8px;">
              </div>
            </div>
          </div>
        </section>

        <!-- Sección: Gestión de datos -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">⇅</span>
            <h2 class="settings-section-title">Gestión de datos</h2>
          </div>
          <p class="settings-section-desc">Exporta una copia de seguridad o restaura tus datos desde un archivo JSON.</p>

          <div class="settings-data-actions">
            <button class="settings-data-btn" id="data-export">↓ Exportar datos</button>
            <label class="settings-data-btn settings-data-import-label" for="data-import-file">
              ↑ Importar datos
              <input type="file" id="data-import-file" accept=".json" style="display:none">
            </label>
          </div>
          <button class="settings-data-btn settings-data-btn-danger" id="data-clear">⊘ Borrar todos los datos</button>
          <div class="settings-data-status" id="data-import-status"></div>

          <!-- Uso de almacenamiento -->
          <div class="storage-usage" id="storage-usage">
            <div class="storage-usage-header">
              <span class="storage-usage-label">Uso estimado de almacenamiento</span>
              <span class="storage-usage-value" id="storage-usage-value">…</span>
            </div>
            <div class="storage-usage-bar-track">
              <div class="storage-usage-bar-fill" id="storage-usage-fill"></div>
            </div>
            <div class="storage-usage-detail" id="storage-usage-detail"></div>
          </div>

          <!-- Confirmación de borrado -->
          <div class="settings-data-confirm" id="data-clear-confirm" style="display:none">
            <p class="settings-data-confirm-msg">¿Borrar todas las tareas, categorías y proyectos? Esta acción no se puede deshacer.</p>
            <div class="settings-data-confirm-actions">
              <button class="settings-data-confirm-cancel" id="data-clear-cancel">Cancelar</button>
              <button class="settings-data-confirm-ok" id="data-clear-ok">Sí, borrar todo</button>
            </div>
          </div>
        </section>

        <!-- Sección: Sincronización en la nube (Vercel Serverless) -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">☁</span>
            <h2 class="settings-section-title">Sincronización en la Nube (Vercel Serverless)</h2>
          </div>
          <p class="settings-section-desc">Guarda tus tareas de forma segura en la nube. Las credenciales de GitHub se gestionan de forma segura en el servidor de Vercel. Solo necesitas tu contraseña de sincronización.</p>

          <div class="settings-field">
            <label class="settings-label" for="github-pass-input">Contraseña de Sincronización</label>
            <div class="relative" style="position: relative; width: 100%; box-sizing: border-box;">
              <input class="settings-input" id="github-pass-input" type="password" placeholder="Ingresa tu contraseña de sincronización" autocomplete="off" style="width: 100%; padding-right: 36px; box-sizing: border-box;"/>
              <button type="button" onclick="toggleFieldVisibility('github-pass-input', this)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); border: none; background: none; cursor: pointer; color: var(--text2); display: flex; align-items: center; justify-content: center; padding: 0;">
                <span class="material-symbols-outlined" style="font-size: 20px;">visibility</span>
              </button>
            </div>
          </div>

          <div class="cloud-status-row" style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="cloud-status-dot" id="github-status-dot"></span>
              <span class="cloud-status" id="github-status">Sin conectar</span>
            </div>
            <button class="settings-data-btn" id="github-save-settings" style="flex: unset; min-width: 140px; padding: 8px 12px;">Conectar</button>
          </div>

          <div class="settings-data-actions" id="github-actions-container" style="display: none; margin-top: 10px; gap: 10px;">
            <button class="settings-data-btn" id="github-push">☁ Respaldar en la Nube</button>
            <button class="settings-data-btn" id="github-pull">↓ Restaurar desde la Nube</button>
          </div>

          <!-- Modo: Sincronización continua automática -->
          <div class="cloud-autosync-card" id="cloud-autosync-container" style="display: none; margin-top: 14px;">
            <div class="cloud-autosync-header">
              <div class="cloud-autosync-title-wrap">
                <span class="cloud-autosync-icon">🔄</span>
                <div>
                  <div class="cloud-autosync-title-row">
                    <span class="cloud-autosync-title">Sincronización continua en la nube</span>
                    <span class="cloud-autosync-badge" id="cloud-autosync-badge">Desactivado</span>
                  </div>
                  <div class="cloud-autosync-desc">
                    Guarda automáticamente tus tareas en la nube al crearlas, editarlas o completarlas, sin tener que presionar el botón de respaldo.
                  </div>
                </div>
              </div>
              <label class="cloud-switch" for="cloud-autosync-toggle" title="Activar/desactivar sincronización continua">
                <input type="checkbox" id="cloud-autosync-toggle">
                <span class="cloud-slider"></span>
              </label>
            </div>
            <div class="cloud-autosync-footer">
              <span class="cloud-autosync-subhint" id="cloud-autosync-subhint">Debounce de 3.5s y respaldo inmediato al cambiar o cerrar pestaña.</span>
            </div>
          </div>
        </section>

        <!-- Sección: Métricas -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">◑</span>
            <h2 class="settings-section-title">Métricas de rendimiento</h2>
          </div>
          <p class="settings-section-desc">Marca qué categorías representan trabajo profundo (Maker). Las demás se considerarán operativas (Manager). Esto activa el Factor de Impacto en Estadística.</p>
          <div class="settings-field">
            <label class="settings-label">Categorías Maker (trabajo profundo)</label>
            <div class="maker-cats-grid" id="maker-cats-grid">
              <!-- Relleno por JS -->
            </div>
          </div>
          <div class="settings-data-actions" style="margin-top:10px">
            <button class="settings-data-btn" id="maker-cats-save">✓ Guardar configuración</button>
          </div>
        </section>

        <!-- Sección: Inteligencia Artificial -->
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">✨</span>
            <h2 class="settings-section-title">Inteligencia Artificial</h2>
          </div>
          <p class="settings-section-desc">Configura tus claves de API y modelos preferidos para habilitar funciones inteligentes como desglose de tareas y captura mágica.</p>

          <!-- Selector de Proveedor Activo -->
          <div class="ai-provider-selector-wrap">
            <label class="settings-label">Proveedor Activo para Tareas Inteligentes</label>
            <div class="ai-provider-toggle-group" id="ai-provider-group">
              <button type="button" class="ai-provider-pill active" id="ai-provider-openrouter-btn" data-provider="openrouter">
                <div class="ai-provider-pill-left">
                  <span class="ai-provider-pill-icon">⚡</span>
                  <span class="ai-provider-pill-title">OpenRouter</span>
                </div>
                <span class="ai-provider-pill-check">●</span>
              </button>
              <button type="button" class="ai-provider-pill" id="ai-provider-googleai-btn" data-provider="googleai">
                <div class="ai-provider-pill-left">
                  <span class="ai-provider-pill-icon" style="color: #60a5fa;">✦</span>
                  <span class="ai-provider-pill-title">Google AI Studio</span>
                </div>
                <span class="ai-provider-pill-check">●</span>
              </button>
            </div>
          </div>

          <!-- Tarjetas de Proveedores -->
          <div class="ai-cards-container">

            <!-- Tarjeta 1: OpenRouter -->
            <div class="ai-card active-provider" id="ai-card-openrouter">
              <div class="ai-card-header">
                <div class="ai-card-header-left">
                  <span class="ai-card-icon">⚡</span>
                  <div>
                    <h3 class="ai-card-title">OpenRouter</h3>
                    <span class="ai-card-subtitle">Acceso multimodelo (Claude, DeepSeek, Llama, Mistral...)</span>
                  </div>
                </div>
                <span class="ai-active-badge" id="ai-badge-openrouter">ACTIVO</span>
              </div>

              <!-- API Key de OpenRouter -->
              <div class="settings-field" style="margin-top: 14px;">
                <label class="settings-label" for="openrouter-key">API Key de OpenRouter</label>
                <div class="ai-key-input-wrap">
                  <input class="settings-input" id="openrouter-key" type="password" placeholder="sk-or-v1-..." autocomplete="off"/>
                  <div class="ai-key-actions">
                    <button type="button" class="ai-icon-btn" id="openrouter-key-reveal" title="Mostrar/ocultar clave">
                      <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button type="button" class="ai-icon-btn" id="openrouter-key-copy" title="Copiar al portapapeles">
                      <span class="material-symbols-outlined">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Modelo Preferido de OpenRouter -->
              <div class="settings-field" style="margin-top: 10px;">
                <label class="settings-label" for="openrouter-model">Modelo Preferido (ID)</label>
                <input class="settings-input" id="openrouter-model" type="text" placeholder="Ej: mistralai/mistral-small-2603, anthropic/claude-3.5-sonnet" autocomplete="off"/>
                <span class="ai-field-hint">Escribe el ID exacto del modelo disponible en OpenRouter.</span>
              </div>

              <!-- Botón Guardar y Validar OpenRouter -->
              <div class="ai-card-footer">
                <button type="button" class="settings-btn-primary ai-save-validate-btn" id="openrouter-save-btn">
                  <span class="ai-save-btn-icon">✓</span>
                  <span class="ai-save-btn-text">Guardar y Validar</span>
                </button>
                <div class="ai-status-msg" id="openrouter-status-msg"></div>
              </div>
            </div>

            <!-- Tarjeta 2: Google AI Studio (Gemini) -->
            <div class="ai-card" id="ai-card-googleai" style="margin-top: 16px;">
              <div class="ai-card-header">
                <div class="ai-card-header-left">
                  <span class="ai-card-icon" style="color: #60a5fa;">✦</span>
                  <div>
                    <h3 class="ai-card-title">Google AI Studio</h3>
                    <span class="ai-card-subtitle">Modelos Gemini rápidos de Google</span>
                  </div>
                </div>
                <span class="ai-active-badge" id="ai-badge-googleai" style="display:none;">ACTIVO</span>
              </div>

              <!-- API Key de Google AI Studio -->
              <div class="settings-field" style="margin-top: 14px;">
                <label class="settings-label" for="googleai-key">API Key de Google AI Studio</label>
                <div class="ai-key-input-wrap">
                  <input class="settings-input" id="googleai-key" type="password" placeholder="AIzaSy..." autocomplete="off"/>
                  <div class="ai-key-actions">
                    <button type="button" class="ai-icon-btn" id="googleai-key-reveal" title="Mostrar/ocultar clave">
                      <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button type="button" class="ai-icon-btn" id="googleai-key-copy" title="Copiar al portapapeles">
                      <span class="material-symbols-outlined">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Modelo Preferido de Google AI Studio -->
              <div class="settings-field" style="margin-top: 10px;">
                <label class="settings-label" for="googleai-model">Modelo Preferido (ID)</label>
                <input class="settings-input" id="googleai-model" type="text" placeholder="Ej: gemini-2.5-flash, gemini-1.5-flash, gemini-2.5-pro" autocomplete="off"/>
                <span class="ai-field-hint">Escribe el identificador del modelo Gemini (sin selector).</span>
              </div>

              <!-- Botón Guardar y Validar Google AI Studio -->
              <div class="ai-card-footer">
                <button type="button" class="settings-btn-primary ai-save-validate-btn" id="googleai-save-btn">
                  <span class="ai-save-btn-icon">✓</span>
                  <span class="ai-save-btn-text">Guardar y Validar</span>
                </button>
                <div class="ai-status-msg" id="googleai-status-msg"></div>
              </div>
            </div>

          </div>

          <span class="settings-section-desc" style="margin-top:14px; font-size: 11px;">
            🔒 Tus claves se guardan solo en tu dispositivo y se sincronizan cifradas en tu backup.
          </span>
        </section>

      </div>
    </div>

    <!-- Overlay drag-and-drop de respaldo -->
    <div class="settings-drop-overlay" id="settings-drop-overlay">
      <div class="settings-drop-box">
        <div class="settings-drop-icon">📂</div>
        <div class="settings-drop-label">Suelta el archivo para restaurar el respaldo</div>
        <div class="settings-drop-hint">Archivo JSON de Daily Planner</div>
      </div>
    </div>
  </div>
`;