function now() { return Date.now(); }

function today() {
  const d = new Date();
  return d.toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Cada panel conserva su página mientras se actualiza la misma vista.
const taskPageStates = new WeakMap();
const TASK_PAGE_SIZE = 16;

function taskPage(container, view, records) {
  let state = taskPageStates.get(container);
  if (!state || state.view !== view) {
    state = { view, index: 0 };
    taskPageStates.set(container, state);
  }
  const total = typeof records === 'number' ? records : records.length;
  const pages = Math.ceil(total / TASK_PAGE_SIZE);
  state.index = Math.max(0, Math.min(state.index, pages - 1));
  const start = state.index * TASK_PAGE_SIZE;
  return {
    start,
    items: Array.isArray(records) ? records.slice(start, start + TASK_PAGE_SIZE) : [],
    mount(refresh) {
      const old = container.querySelector(':scope > .task-pagination');
      if (pages <= 1) { old?.remove(); return; }
      const nav = old || document.createElement('nav');
      if (!old) {
        nav.className = 'task-pagination';
        nav.setAttribute('aria-label', 'Paginación');
        nav.innerHTML = '<button type="button" class="search-load-more-btn" aria-label="Página anterior">Anterior</button><span aria-live="polite"></span><label>Página <input type="number" min="1" step="1" inputmode="numeric" class="task-page-number"></label><button type="button" class="search-load-more-btn" aria-label="Página siguiente">Siguiente</button>';
        container.append(nav);
      }
      const [prev, label, jump, next] = nav.children;
      label.textContent = (start + 1) + '–' + Math.min(start + TASK_PAGE_SIZE, total) + ' de ' + total;
      prev.disabled = state.index === 0;
      next.disabled = state.index + 1 >= pages;
      const move = delta => {
        const target = Math.max(0, Math.min(state.index + delta, pages - 1));
        if (target === state.index) return;
        state.index = target;
        refresh();
        container.scrollTop = 0;
        if (container.getBoundingClientRect().top < 0) container.scrollIntoView({ block: 'start' });
      };
      const number = jump.firstElementChild;
      number.value = state.index + 1;
      number.max = pages;
      number.onchange = () => {
        const requested = number.valueAsNumber;
        if (Number.isInteger(requested)) move(requested - 1 - state.index);
        number.value = state.index + 1;
      };
      number.onkeydown = e => { if (e.key === 'Enter') number.blur(); };
      prev.onclick = () => move(-1);
      next.onclick = () => move(1);
    }
  };
}

const taskDates = {
  time: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }),
  short: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
  long: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
  weekday: new Intl.DateTimeFormat('es-ES', { weekday: 'long' })
};
