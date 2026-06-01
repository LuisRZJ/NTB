// ============================================================
// sidebar.js — Renderizado del sidebar, árbol de archivos y navegación
// ============================================================

import { 
    posts, 
    labels, 
    currentPostId, 
    currentSection, 
    currentLabelFilter, 
    currentSearchQuery, 
    sidebarExpanded,
    setCurrentSection, 
    setCurrentPostId, 
    setCurrentLabelFilter,
    setSidebarExpanded
} from './state.js';
import { savePostsToStorage } from './storage.js';

// Conjunto de IDs de etiquetas que están expandidas
const expandedLabels = new Set();

// ── Utilidades de filtro ─────────────────────────────────────

/**
 * Devuelve los posts filtrados y ordenados según la sección/etiqueta activa.
 */
function getFilteredPosts() {
    let filtered = posts.filter(post => {
        if (currentSection === 'all') {
            if (post.trashed || post.archived) return false;
        } else if (currentSection === 'favorites') {
            if (!post.pinned || post.trashed) return false;
        } else if (currentSection === 'archive') {
            if (!post.archived || post.trashed) return false;
        } else if (currentSection === 'trash') {
            if (!post.trashed) return false;
        } else if (currentSection === 'label') {
            if (post.trashed || post.archived) return false;
            if (!post.labels || !post.labels.includes(currentLabelFilter)) return false;
        }

        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            return (post.title || '').toLowerCase().includes(q) ||
                   (post.content || '').toLowerCase().includes(q);
        }
        return true;
    });

    filtered.sort((a, b) => {
        if (currentSection === 'all') {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
        }
        const titleA = a.title || '';
        const titleB = b.title || '';
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return filtered;
}

// ── Modo del sidebar ─────────────────────────────────────────

/**
 * Aplica o quita el modo pantalla completa del sidebar.
 * @param {boolean} expanded
 */
export function setSidebarMode(expanded) {
    setSidebarExpanded(expanded);

    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main-workspace');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const innerToggleBtn = document.getElementById('sidebar-inner-toggle-btn');
    const innerToggleIcon = innerToggleBtn ? innerToggleBtn.querySelector('.inner-toggle-icon') : null;
    const collapsedTree = document.getElementById('collapsed-file-tree-section');
    const expandedList = document.getElementById('expanded-post-list');

    if (expanded) {
        // Pantalla completa
        if (sidebar) sidebar.classList.add('sidebar-expanded');
        if (main) main.classList.add('sidebar-expanded-hide');
        if (toggleBtn) toggleBtn.classList.remove('sidebar-is-expanded');
        if (collapsedTree) collapsedTree.classList.add('hidden');
        if (expandedList) expandedList.classList.remove('hidden');
        // Botón interior: ícono de colapsar
        if (innerToggleIcon) innerToggleIcon.textContent = 'left_panel_close';
        if (innerToggleBtn) innerToggleBtn.title = 'Contraer panel';
    } else {
        // Modo lateral
        if (sidebar) sidebar.classList.remove('sidebar-expanded');
        if (main) main.classList.remove('sidebar-expanded-hide');
        if (toggleBtn) toggleBtn.classList.add('sidebar-is-expanded');
        if (collapsedTree) collapsedTree.classList.remove('hidden');
        if (expandedList) expandedList.classList.add('hidden');
        // Botón interior: ícono de expandir
        if (innerToggleIcon) innerToggleIcon.textContent = 'left_panel_open';
        if (innerToggleBtn) innerToggleBtn.title = 'Expandir panel';
    }
}

/**
 * Conmuta el modo del sidebar (llamado por el botón toggle).
 */
export function toggleSidebarExpanded() {
    if (sidebarExpanded) {
        // Colapsar el sidebar
        setSidebarMode(false);
        // Si no hay post cargado, mostrar estado vacío en el editor
        if (!currentPostId) {
            if (typeof window.showEmptyState === 'function') window.showEmptyState();
            // Asegurar que el editor y actions son visibles
            const editorView = document.getElementById('editor-view');
            const breadcrumb = document.getElementById('editor-breadcrumb');
            const actions = document.getElementById('editor-actions');
            const settingsView = document.getElementById('settings-view');
            if (settingsView) settingsView.classList.add('hidden');
            if (editorView) editorView.classList.add('hidden');
            if (breadcrumb) { breadcrumb.classList.remove('hidden'); breadcrumb.classList.add('sm:flex'); }
            if (actions) actions.classList.remove('hidden');
        }
    } else {
        // Expandir el sidebar
        setSidebarMode(true);
        renderExpandedPostList();
    }
}

// ── Renderizado de listas ─────────────────────────────────────

/**
 * Renderiza el árbol de archivos compacto para el sidebar lateral (#file-tree).
 */
export function renderFileTree() {
    const fileTree = document.getElementById('file-tree');
    const mobFileTree = document.getElementById('mob-file-tree');

    if (!fileTree) return;

    const filteredPosts = getFilteredPosts();

    const generateHTML = (postList) => {
        if (postList.length === 0) {
            return `<div class="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
                No hay entradas
            </div>`;
        }

        return postList.map(post => {
            const isActive = post.id === currentPostId;
            const activeClass = isActive ? 'active' : '';
            const titleText = post.title.trim() || 'Sin Título';
            const icon = post.icon || '📄';
            const isPinnedBadge = (post.pinned && currentSection !== 'favorites') 
                ? '<span class="material-symbols-outlined text-xs text-amber-500 shrink-0 ml-auto font-variation-fill">star</span>' 
                : '';

            return `
                <button class="file-tree-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm truncate hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-all ${activeClass}" 
                        onclick="loadPost('${post.id}')"
                        id="btn-post-${post.id}">
                    <span class="text-base shrink-0 select-none">${icon}</span>
                    <span class="truncate pr-1 text-slate-700 dark:text-slate-200">${titleText}</span>
                    ${isPinnedBadge}
                </button>
            `;
        }).join('');
    };

    const htmlContent = generateHTML(filteredPosts);
    fileTree.innerHTML = htmlContent;
    if (mobFileTree) mobFileTree.innerHTML = htmlContent;
}

/**
 * Renderiza la lista de entradas en el panel expandido (#expanded-file-tree).
 * Muestra tarjetas con ícono y título.
 */
export function renderExpandedPostList() {
    const container = document.getElementById('expanded-file-tree');
    const titleEl = document.getElementById('expanded-section-title');
    const countEl = document.getElementById('expanded-section-count');

    if (!container) return;

    const filteredPosts = getFilteredPosts();

    // Actualizar cabecera
    const sectionNames = {
        all: 'Todas las entradas',
        favorites: 'Favoritas',
        archive: 'Archivadas',
        trash: 'Papelera',
        label: (() => {
            const lbl = labels.find(l => l.id === currentLabelFilter);
            return lbl ? `Etiqueta: ${lbl.name}` : 'Etiqueta';
        })(),
        settings: 'Ajustes de Datos'
    };
    if (titleEl) titleEl.textContent = sectionNames[currentSection] || 'Entradas';
    if (countEl) countEl.textContent = filteredPosts.length;

    if (filteredPosts.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-center">
                <div class="w-16 h-16 rounded-full bg-slate-200/50 dark:bg-slate-800/40 flex items-center justify-center text-slate-400 dark:text-slate-600 mb-3">
                    <span class="material-symbols-outlined text-3xl">note_alt</span>
                </div>
                <p class="text-sm font-medium text-slate-500 dark:text-slate-400">No hay entradas aquí</p>
            </div>`;
        return;
    }

    container.innerHTML = filteredPosts.map(post => {
        const isActive = post.id === currentPostId;
        const activeClass = isActive 
            ? 'bg-google-sidebarActive dark:bg-google-sidebarActiveDark text-[#001d35] dark:text-[#c2e7ff]' 
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/60';
        const titleText = post.title.trim() || 'Sin Título';
        const icon = post.icon || '📄';
        const isPinnedBadge = post.pinned
            ? '<span class="material-symbols-outlined text-sm text-amber-500 shrink-0" style="font-variation-settings:\'FILL\' 1">star</span>'
            : '';

        return `
            <button class="expanded-post-card w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm hover:shadow-sm ${activeClass}" 
                    onclick="loadPost('${post.id}')"
                    id="exp-btn-post-${post.id}">
                <span class="text-xl shrink-0 select-none">${icon}</span>
                <span class="truncate flex-1 font-medium text-left">${titleText}</span>
                ${isPinnedBadge}
                <span class="material-symbols-outlined text-base text-slate-400 dark:text-slate-500 shrink-0 ml-1">chevron_right</span>
            </button>
        `;
    }).join('');
}

// ── Navegación de secciones ──────────────────────────────────

/**
 * Cambia la sección activa de la aplicación.
 * En modo expandido: actualiza la lista de posts sin colapsar.
 * En modo colapsado: comportamiento estándar.
 * 
 * @param {'all'|'favorites'|'archive'|'trash'|'settings'|'label'} sectionName
 */
export function switchSection(sectionName) {
    closeMobileSidebar();
    setCurrentSection(sectionName);

    if (sectionName !== 'label') {
        setCurrentLabelFilter(null);
    }

    // Actualizar tabs visuales (escritorio)
    document.querySelectorAll('.section-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`section-${sectionName}-btn`);
    if (activeBtn) activeBtn.classList.add('active');

    // Actualizar tabs móvil
    document.querySelectorAll('.mob-section-tab').forEach(btn => {
        btn.classList.remove('active', 'bg-google-sidebarActive', 'dark:bg-google-sidebarActiveDark', 'text-[#001d35]', 'dark:text-[#c2e7ff]');
        if (btn.dataset.section === sectionName) {
            btn.classList.add('active', 'bg-google-sidebarActive', 'dark:bg-google-sidebarActiveDark', 'text-[#001d35]', 'dark:text-[#c2e7ff]');
        }
    });

    const editorView = document.getElementById('editor-view');
    const settingsView = document.getElementById('settings-view');
    const breadcrumb = document.getElementById('editor-breadcrumb');
    const actions = document.getElementById('editor-actions');

    if (sectionName === 'settings') {
        // Ajustes: siempre colapsar el sidebar y mostrar la vista de ajustes
        setSidebarMode(false);

        if (editorView) editorView.classList.add('hidden');
        if (settingsView) settingsView.classList.remove('hidden');
        if (breadcrumb) {
            breadcrumb.classList.add('hidden');
            breadcrumb.classList.remove('sm:flex');
        }
        if (actions) actions.classList.add('hidden');
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.add('hidden');

        if (typeof window.updateSettingsStats === 'function') {
            window.updateSettingsStats();
        }
    } else if (sidebarExpanded) {
        // Modo pantalla completa: mostrar la lista de posts en el panel expandido
        if (settingsView) settingsView.classList.add('hidden');
        renderExpandedPostList();
    } else {
        // Modo lateral: comportamiento estándar, seleccionar post
        if (settingsView) settingsView.classList.add('hidden');
        if (editorView) editorView.classList.remove('hidden');
        if (breadcrumb) {
            breadcrumb.classList.remove('hidden');
            breadcrumb.classList.add('sm:flex');
        }
        if (actions) actions.classList.remove('hidden');
        autoSelectPostForSection();
    }

    renderFileTree();
    renderSidebarLabels();
    updateSectionCounts();
}

/**
 * Selecciona automáticamente la primera entrada disponible en la sección actual
 * (solo en modo lateral).
 */
function autoSelectPostForSection() {
    const sectionPosts = getFilteredPosts();
    const currentStillValid = currentPostId && sectionPosts.some(p => p.id === currentPostId);

    if (currentStillValid) {
        if (typeof window.loadPost === 'function') window.loadPost(currentPostId);
    } else if (sectionPosts.length > 0) {
        if (typeof window.loadPost === 'function') window.loadPost(sectionPosts[0].id);
    } else {
        setCurrentPostId(null);
        if (typeof window.showEmptyState === 'function') window.showEmptyState();
    }
}

// ── Contadores y etiquetas ───────────────────────────────────

/**
 * Actualiza los contadores de badges en el sidebar.
 */
export function updateSectionCounts() {
    const countAll = posts.filter(p => !p.trashed && !p.archived).length;
    const countFav = posts.filter(p => p.pinned && !p.trashed).length;
    const countArc = posts.filter(p => p.archived && !p.trashed).length;
    const countTra = posts.filter(p => p.trashed).length;

    const allEl = document.getElementById('section-count-all');
    const favEl = document.getElementById('section-count-favorites');
    const arcEl = document.getElementById('section-count-archive');
    const traEl = document.getElementById('section-count-trash');

    if (allEl) allEl.textContent = countAll;
    if (favEl) favEl.textContent = countFav;
    if (arcEl) arcEl.textContent = countArc;
    if (traEl) traEl.textContent = countTra;
}

/**
 * Renderiza los botones de etiquetas en el sidebar.
 */
/**
 * Conmuta el estado expandido/colapsado de una etiqueta.
 * @param {string} labelId 
 */
export function toggleLabelCollapse(labelId) {
    if (expandedLabels.has(labelId)) {
        expandedLabels.delete(labelId);
    } else {
        expandedLabels.add(labelId);
    }
    renderSidebarLabels();
}
window.toggleLabelCollapse = toggleLabelCollapse;

/**
 * Colapsa todas las etiquetas y subetiquetas.
 */
export function collapseAllLabels() {
    expandedLabels.clear();
    renderSidebarLabels();
}
window.collapseAllLabels = collapseAllLabels;

/**
 * Renderiza los botones de etiquetas en el sidebar.
 */
export function renderSidebarLabels() {
    const container = document.getElementById('sidebar-labels-container');
    const mobContainer = document.getElementById('mob-labels-container');

    if (!container) return;

    const renderLabelTree = (parentId = null, depth = 0) => {
        let levelLabels;
        if (parentId === null) {
            levelLabels = labels.filter(l => !l.parentId || !labels.some(p => p.id === l.parentId));
        } else {
            levelLabels = labels.filter(l => l.parentId === parentId);
        }

        levelLabels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (levelLabels.length === 0) return '';

        return levelLabels.map(label => {
            const children = labels.filter(l => l.parentId === label.id);
            const hasChildren = children.length > 0;
            const isExpanded = expandedLabels.has(label.id);
            
            const isActive = currentSection === 'label' && currentLabelFilter === label.id;
            const activeClass = isActive 
                ? 'bg-google-sidebarActive dark:bg-google-sidebarActiveDark text-[#001d35] dark:text-[#c2e7ff] font-semibold' 
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60';
            const iconStyle = label.color ? `style="color: ${label.color}"` : '';

            // Botón chevron para colapsar/expandir o espaciador
            let toggleBtn = '';
            if (hasChildren) {
                const rotationClass = isExpanded ? 'rotate-90' : '';
                toggleBtn = `
                    <button onclick="event.stopPropagation(); toggleLabelCollapse('${label.id}')" 
                            class="p-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-full flex text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-transform duration-200 shrink-0 ${rotationClass}">
                        <span class="material-symbols-outlined text-base">chevron_right</span>
                    </button>
                `;
            } else {
                toggleBtn = `<div class="w-5 h-5 shrink-0"></div>`;
            }

            const childrenHtml = hasChildren 
                ? `<div class="label-children pl-3 ml-2.5 border-l border-slate-200/60 dark:border-slate-800/60 space-y-0.5 ${isExpanded ? '' : 'hidden'}">
                       ${renderLabelTree(label.id, depth + 1)}
                   </div>`
                : '';

            const postCount = posts.filter(p => !p.trashed && !p.archived && p.labels && p.labels.includes(label.id)).length;
            const badgeHtml = (sidebarExpanded && postCount > 0)
                ? `<span class="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-300/40 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 shrink-0">${postCount}</span>`
                : '';

            return `
                <div class="label-node mt-0.5">
                    <div class="flex items-center justify-between px-2 py-1 rounded-full transition-all text-sm group ${activeClass} w-full">
                        <div class="flex items-center gap-1.5 flex-1 min-w-0">
                            ${toggleBtn}
                            <button onclick="filterByLabel('${label.id}')" class="flex items-center gap-2 flex-1 min-w-0 text-left py-0.5">
                                <span class="material-symbols-outlined text-lg shrink-0" ${iconStyle}>label</span>
                                <span class="truncate">${label.name}</span>
                                ${badgeHtml}
                            </button>
                        </div>
                        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onclick="event.stopPropagation(); openEditLabelDialog('${label.id}')" class="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-full flex text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" title="Editar">
                                <span class="material-symbols-outlined text-xs">edit</span>
                            </button>
                            <button onclick="event.stopPropagation(); openDeleteLabelDialog('${label.id}')" class="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 rounded-full flex" title="Eliminar">
                                <span class="material-symbols-outlined text-xs">delete</span>
                            </button>
                        </div>
                    </div>
                    ${childrenHtml}
                </div>
            `;
        }).join('');
    };

    const generateHTML = () => {
        if (labels.length === 0) {
            return `<div class="text-[11px] text-slate-400 dark:text-slate-500 text-center py-4">
                Sin etiquetas
            </div>`;
        }
        return renderLabelTree(null, 0);
    };

    const htmlContent = generateHTML();
    container.innerHTML = htmlContent;
    if (mobContainer) mobContainer.innerHTML = htmlContent;
}

/**
 * Aplica el filtro de etiquetas y cambia a la sección 'label'.
 * @param {string} labelId 
 */
export function filterByLabel(labelId) {
    closeMobileSidebar();
    setCurrentLabelFilter(labelId);
    switchSection('label');
}

// ── Sidebar móvil ─────────────────────────────────────────────

/**
 * Cierra el sidebar móvil.
 */
export function closeMobileSidebar() {
    const sidebar = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (sidebar && backdrop) {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }
}

/**
 * Abre o cierra el sidebar en vistas móviles.
 */
export function toggleMobileSidebar() {
    const sidebar = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (!sidebar || !backdrop) return;

    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    } else {
        closeMobileSidebar();
    }
}

// ── Redimensionamiento manual ─────────────────────────────────

/**
 * Inicializa el redimensionamiento del sidebar mediante arrastre (drag-and-drop).
 */
export function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-resize-handle');
    if (!sidebar || !handle) return;

    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        // Solo clic izquierdo
        if (e.button !== 0) return;
        isResizing = true;
        handle.classList.add('resizing');
        sidebar.classList.add('no-transition');
        document.body.classList.add('select-none');
        document.body.style.cursor = 'col-resize';

        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;
            const rect = sidebar.getBoundingClientRect();
            let newWidth = moveEvent.clientX - rect.left;

            // Restringir el ancho entre el mínimo de 240px y el máximo de 400px
            if (newWidth < 240) newWidth = 240;
            if (newWidth > 400) newWidth = 400;

            // Aplicar inline styles con alta prioridad
            sidebar.style.setProperty('width', `${newWidth}px`, 'important');
            sidebar.style.setProperty('max-width', `${newWidth}px`, 'important');
            sidebar.style.setProperty('min-width', `${newWidth}px`, 'important');
        };

        const onMouseUp = () => {
            isResizing = false;
            handle.classList.remove('resizing');
            sidebar.classList.remove('no-transition');
            document.body.classList.remove('select-none');
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ── Exposición global ─────────────────────────────────────────
window.renderFileTree = renderFileTree;
window.renderExpandedPostList = renderExpandedPostList;
window.switchSection = switchSection;
window.filterByLabel = filterByLabel;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.toggleSidebarExpanded = toggleSidebarExpanded;
window.setSidebarMode = setSidebarMode;
window.renderSidebarLabels = renderSidebarLabels;
window.updateSectionCounts = updateSectionCounts;
window.toggleLabelCollapse = toggleLabelCollapse;
window.collapseAllLabels = collapseAllLabels;
window.initSidebarResize = initSidebarResize;
