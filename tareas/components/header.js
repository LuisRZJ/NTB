document.getElementById('header-mount').innerHTML = `
  <header class="header">
    <div class="header-left">
      <div class="header-title-row">
        <a href="index.html" class="header-home" title="Ir al inicio">
          <h1>Mis <em>Tareas</em></h1>
        </a>
        <span class="header-version-badge">v2.0</span>
      </div>
      <div class="header-subrow">
        <span class="header-live-dot" title="En vivo"></span>
        <span class="date" id="date-label"></span>
        <span class="header-subrow-sep">·</span>
        <span class="header-clock" id="header-clock">--:--</span>
        <div class="header-cloud-sync" id="header-cloud-sync" style="display:none;" title="Estado de sincronización en la nube (Clic para ver ajustes)">
          <span class="header-cloud-dot" id="header-cloud-dot"></span>
          <span class="header-cloud-text" id="header-cloud-text">Sincronizado</span>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="progress-ring header-ring-item" id="header-ring-day" data-tip="Tiempo transcurrido del día actual" data-tip-dir="left">
        <div class="ring-wrap">
          <svg viewBox="0 0 36 36">
            <circle class="ring-bg" cx="18" cy="18" r="15.9155" />
            <circle class="ring-fill ring-fill-day" id="day-fill" cx="18" cy="18" r="15.9155" />
          </svg>
          <span class="ring-percent ring-percent-day" id="day-pct">0%</span>
        </div>
        <div class="ring-text-meta">
          <span class="ring-meta-tag">Día</span>
          <span class="ring-meta-sub">Tiempo</span>
        </div>
      </div>

      <div class="progress-ring header-ring-item" id="header-ring-task" data-tip="Progreso de tareas de hoy" data-tip-dir="left">
        <div class="ring-wrap">
          <svg viewBox="0 0 36 36">
            <circle class="ring-bg" cx="18" cy="18" r="15.9155" />
            <circle class="ring-fill" id="ring-fill" cx="18" cy="18" r="15.9155" />
          </svg>
          <span class="ring-percent" id="ring-pct">0%</span>
        </div>
        <div class="ring-text-meta">
          <span class="ring-meta-tag">Progreso</span>
          <span class="ring-meta-sub" id="ring-fraction">0 de 0</span>
        </div>
        <div class="ring-tooltip" id="ring-tip"></div>
      </div>

      <button class="header-theme-toggle" id="header-theme-toggle" title="Cambiar tema claro / oscuro" aria-label="Cambiar tema">
        <span class="theme-icon-light">☀</span>
        <span class="theme-icon-dark">☾</span>
      </button>
    </div>
  </header>
`;