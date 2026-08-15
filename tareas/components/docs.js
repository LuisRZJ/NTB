// Panel de Documentación de API REST (SPA overlay para el módulo de Tareas)
document.getElementById('docs-mount').innerHTML = `
  <div class="docs-overlay" id="docs-overlay" aria-hidden="true">
    <div class="docs-panel">

      <!-- Header del Panel -->
      <div class="docs-header">
        <div class="docs-header-info">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="docs-header-badge">API REST</span>
            <span class="docs-header-title">Documentación & Integración</span>
          </div>
          <p class="docs-header-sub">Consulta las tareas del día ordenadas por prioridad desde cualquier backend, script o página web.</p>
        </div>
        <button class="docs-close" id="docs-close" title="Cerrar">✕</button>
      </div>

      <!-- Cuerpo deslizable -->
      <div class="docs-body">

        <!-- Fila de Chips Informativos -->
        <div class="docs-chips-row">
          <span class="docs-chip docs-chip-emerald">⚡ GET /api/tareas</span>
          <span class="docs-chip docs-chip-blue">⏱ 30 req / min</span>
          <span class="docs-chip docs-chip-purple">🌐 CORS Habilitado</span>
          <span class="docs-chip docs-chip-gold">🔒 Token / API Key</span>
        </div>

        <!-- 1. Probador Interactivo (Playground) -->
        <section class="docs-section">
          <div class="docs-section-head">
            <span class="docs-section-icon">▶</span>
            <h2 class="docs-section-title">Probador de API en Vivo (Playground)</h2>
          </div>
          <p class="docs-section-desc">Prueba tus credenciales y consulta tus tareas en tiempo real directamente desde este panel.</p>

          <div class="docs-playground-box">
            <div class="docs-grid-2">
              <div class="settings-field">
                <label class="settings-label">Ruta del Endpoint</label>
                <select class="settings-input" id="docs-test-endpoint">
                  <option value="/api/tareas">/api/tareas (Principal)</option>
                  <option value="/api/tasks">/api/tasks (Alias)</option>
                </select>
              </div>

              <div class="settings-field">
                <label class="settings-label">Método de Autenticación</label>
                <select class="settings-input" id="docs-test-authmode">
                  <option value="bearer">Header: Authorization: Bearer &lt;token&gt;</option>
                  <option value="header">Header: x-api-key: &lt;token&gt;</option>
                  <option value="query">URL Param: ?token=&lt;token&gt;</option>
                </select>
              </div>
            </div>

            <div class="settings-field" style="margin-top: 10px;">
              <label class="settings-label">Token de API / Contraseña de Sincronización</label>
              <div style="position: relative; width: 100%;">
                <input class="settings-input" id="docs-test-token" type="password" placeholder="TASKS_API_KEY o contraseña de sincronización..." style="padding-right: 40px;" />
                <button type="button" id="docs-token-toggle-btn" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text3); display: flex; align-items: center;">
                  <span class="material-symbols-outlined" style="font-size: 18px;">visibility</span>
                </button>
              </div>
            </div>

            <div class="docs-grid-2" style="margin-top: 10px;">
              <div class="settings-field">
                <label class="settings-label">Fecha (Opcional, por defecto Hoy)</label>
                <input class="settings-input" id="docs-test-date" type="date" />
              </div>

              <div class="settings-field">
                <label class="settings-label">Zona Horaria (IANA)</label>
                <input class="settings-input" id="docs-test-tz" type="text" placeholder="America/Mexico_City" value="America/Mexico_City" />
              </div>
            </div>

            <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="docs-test-overdue" style="accent-color: var(--gold); cursor: pointer;" />
              <label for="docs-test-overdue" style="font-size: 12px; color: var(--text2); cursor: pointer;">
                Incluir tareas atrasadas no completadas de días anteriores (<code>?include_overdue=true</code>)
              </label>
            </div>

            <div style="margin-top: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
              <button class="settings-btn-primary" id="btn-docs-execute" style="display: flex; align-items: center; gap: 6px;">
                <span>▶</span> Ejecutar Consulta
              </button>
              <div id="docs-test-loading" class="docs-loading-text hidden">
                <span class="docs-spin">↻</span> Consultando API...
              </div>
            </div>

            <!-- Resultado JSON -->
            <div id="docs-test-output-wrap" class="docs-output-wrap hidden">
              <div class="docs-output-bar">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="docs-res-badge" id="docs-res-status-badge">200 OK</span>
                  <span class="docs-res-meta" id="docs-res-time">0ms</span>
                  <span class="docs-res-meta" id="docs-res-ratelimit">30/30 req</span>
                </div>
                <button class="docs-copy-btn" id="btn-docs-copy-json">📋 Copiar JSON</button>
              </div>
              <pre class="docs-json-pre" id="docs-test-output"></pre>
            </div>
          </div>
        </section>

        <!-- 2. Endpoints Disponibles -->
        <section class="docs-section">
          <div class="docs-section-head">
            <span class="docs-section-icon">◫</span>
            <h2 class="docs-section-title">Endpoints Disponibles</h2>
          </div>
          <div class="docs-table-wrap">
            <table class="docs-table">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Ruta</th>
                  <th>Descripción</th>
                  <th>Permisos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="docs-method-get">GET</span></td>
                  <td><code>/api/tareas</code></td>
                  <td>Obtiene las tareas pendientes del día ordenadas por prioridad (Alta &gt; Media &gt; Baja &gt; Hora).</td>
                  <td>Solo Lectura</td>
                </tr>
                <tr>
                  <td><span class="docs-method-get">GET</span></td>
                  <td><code>/api/tasks</code></td>
                  <td>Alias en inglés idéntico para scripts y automatizaciones internacionales.</td>
                  <td>Solo Lectura</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3. Parámetros de Consulta (Query String) -->
        <section class="docs-section">
          <div class="docs-section-head">
            <span class="docs-section-icon">⚙</span>
            <h2 class="docs-section-title">Parámetros de Consulta (Query String)</h2>
          </div>
          <div class="docs-table-wrap">
            <table class="docs-table">
              <thead>
                <tr>
                  <th>Parámetro</th>
                  <th>Tipo</th>
                  <th>Default</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>date</code></td>
                  <td>string (YYYY-MM-DD)</td>
                  <td>Hoy</td>
                  <td>Consulta las tareas programadas para una fecha específica (ej: <code>2026-08-16</code>).</td>
                </tr>
                <tr>
                  <td><code>tz</code></td>
                  <td>string (IANA)</td>
                  <td>America/Mexico_City</td>
                  <td>Zona horaria para calcular con precisión el día local (ej: <code>America/Bogota</code>, <code>Europe/Madrid</code>).</td>
                </tr>
                <tr>
                  <td><code>include_overdue</code></td>
                  <td>boolean (true/false)</td>
                  <td>false</td>
                  <td>Si es <code>true</code>, incluye las tareas atrasadas sin completar de días anteriores.</td>
                </tr>
                <tr>
                  <td><code>token</code> / <code>key</code></td>
                  <td>string</td>
                  <td>—</td>
                  <td>Pasa la clave de autenticación directamente en la URL (ideal para Atajos de iOS / widgets).</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 4. Seguridad, Autenticación y Rate Limiting -->
        <section class="docs-section">
          <div class="docs-grid-2">
            <div class="docs-card-box">
              <div class="docs-card-box-head">
                <span style="color: var(--gold);">🔒</span>
                <span class="docs-card-box-title">Autenticación & Variables</span>
              </div>
              <p class="docs-card-box-desc">
                Configura tu clave en Vercel con la variable <code class="docs-code-inline">TASKS_API_KEY</code> o <code class="docs-code-inline">SYNC_PASSWORD</code>.
              </p>
              <ul class="docs-card-box-list">
                <li>• Header: <code>Authorization: Bearer &lt;token&gt;</code></li>
                <li>• Header: <code>x-api-key: &lt;token&gt;</code></li>
                <li>• URL Query: <code>?token=&lt;token&gt;</code></li>
              </ul>
            </div>

            <div class="docs-card-box">
              <div class="docs-card-box-head">
                <span style="color: #60a5fa;">⏱</span>
                <span class="docs-card-box-title">Rate Limiting (30 req/min) & CORS</span>
              </div>
              <p class="docs-card-box-desc">
                • Límite de <strong>30 peticiones por minuto por IP</strong>. Si se excede, retorna <code class="docs-code-inline" style="color:#ef4444;">HTTP 429</code> con <code class="docs-code-inline">Retry-After: 60</code>.
              </p>
              <p class="docs-card-box-desc" style="margin-top:6px;">
                • Cabeceras <code class="docs-code-inline">Access-Control-Allow-Origin: *</code> habilitadas para consultar desde sitios web estáticos.
              </p>
            </div>
          </div>
        </section>

        <!-- 5. Ejemplos de Integración (Snippets) -->
        <section class="docs-section">
          <div class="docs-section-head">
            <span class="docs-section-icon">⌘</span>
            <h2 class="docs-section-title">Ejemplos de Integración</h2>
          </div>

          <!-- Selector de Pestañas -->
          <div class="docs-snippet-nav">
            <button class="docs-snippet-tab active" data-snippet="curl">cURL</button>
            <button class="docs-snippet-tab" data-snippet="js">JavaScript / Fetch</button>
            <button class="docs-snippet-tab" data-snippet="python">Python</button>
            <button class="docs-snippet-tab" data-snippet="ios">Atajos de iOS</button>
            <button class="docs-snippet-tab" data-snippet="ha">Home Assistant</button>
          </div>

          <!-- Snippet cURL -->
          <div class="docs-snippet-pane active" id="pane-curl">
            <pre class="docs-code-pre"><code>curl -X GET "https://tu-dominio.vercel.app/api/tareas?tz=America/Mexico_City" \\
     -H "Authorization: Bearer TU_TOKEN_AQUI"</code></pre>
            <button class="docs-copy-snippet-btn" data-target="pane-curl">📋 Copiar comando</button>
          </div>

          <!-- Snippet JS -->
          <div class="docs-snippet-pane" id="pane-js">
            <pre class="docs-code-pre"><code>async function obtenerTareasDeHoy() {
  const res = await fetch('https://tu-dominio.vercel.app/api/tareas?tz=America/Mexico_City', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer TU_TOKEN_AQUI'
    }
  });

  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const data = await res.json();
  console.log(\`Tienes \${data.total_pendientes} tareas pendientes:\`, data.tareas);
  return data;
}</code></pre>
            <button class="docs-copy-snippet-btn" data-target="pane-js">📋 Copiar código</button>
          </div>

          <!-- Snippet Python -->
          <div class="docs-snippet-pane" id="pane-python">
            <pre class="docs-code-pre"><code>import requests

url = "https://tu-dominio.vercel.app/api/tareas"
headers = {"Authorization": "Bearer TU_TOKEN_AQUI"}
params = {"tz": "America/Mexico_City", "include_overdue": "false"}

response = requests.get(url, headers=headers, params=params)
if response.status_code == 200:
    data = response.json()
    print(f"Total pendientes: {data['total_pendientes']}")
    for t in data["tareas"]:
        print(f"[{t['prioridad_texto']}] {t['titulo']} - {t['hora_vencimiento'] or 'Todo el día'}")
else:
    print(f"Error {response.status_code}: {response.text}")</code></pre>
            <button class="docs-copy-snippet-btn" data-target="pane-python">📋 Copiar código</button>
          </div>

          <!-- Snippet iOS -->
          <div class="docs-snippet-pane" id="pane-ios">
            <div class="docs-ios-guide">
              <strong style="color: var(--gold); display: block; margin-bottom: 6px;">Configuración en la app Atajos de Apple (iOS / macOS):</strong>
              <ol style="padding-left: 18px; line-height: 1.7; font-size: 12px; color: var(--text2);">
                <li>Añade la acción <strong>Obtener contenido de URL</strong>.</li>
                <li>URL: <code class="docs-code-inline">https://tu-dominio.vercel.app/api/tareas?token=TU_TOKEN_AQUI</code></li>
                <li>Método: <strong>GET</strong>.</li>
                <li>Añade la acción <strong>Obtener diccionario a partir de entrada</strong>.</li>
                <li>Extrae la clave <code class="docs-code-inline">total_pendientes</code> o itera sobre <code class="docs-code-inline">tareas</code> para crear widgets o notificaciones.</li>
              </ol>
            </div>
          </div>

          <!-- Snippet Home Assistant -->
          <div class="docs-snippet-pane" id="pane-ha">
            <pre class="docs-code-pre"><code># configuration.yaml (Home Assistant Sensor REST)
sensor:
  - platform: rest
    name: "Tareas Pendientes de Hoy"
    resource: "https://tu-dominio.vercel.app/api/tareas?tz=America/Mexico_City"
    headers:
      Authorization: "Bearer TU_TOKEN_AQUI"
    value_template: "{{ value_json.total_pendientes }}"
    json_attributes:
      - resumen_prioridad
      - tareas
    scan_interval: 900 # Consulta cada 15 minutos (respeta el Rate Limit)</code></pre>
            <button class="docs-copy-snippet-btn" data-target="pane-ha">📋 Copiar configuración YAML</button>
          </div>

        </section>

      </div>
    </div>
  </div>
`;
