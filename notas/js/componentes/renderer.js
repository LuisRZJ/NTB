import { state, colorPalette, getLabelsList, getLabelColor } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { toggleLayoutStyles } from './layout.js';
import { showToast } from './toast.js';
import { updateBadgesCounts } from './badges.js';
import { renderMarkdown } from './markdown.js';

let activeOtherNotes = [];
let currentLimit = 24;
const BATCH_SIZE = 24;
let isScrollHandlerAttached = false;

export function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function formatFullDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function isToday(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

export function isYesterday(timestamp) {
    const date = new Date(timestamp);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
}

export function getDateGroupLabel(timestamp) {
    if (!timestamp) return null;
    if (isToday(timestamp)) return 'Hoy';
    if (isYesterday(timestamp)) return 'Ayer';
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function createDateSeparator(label, isPinned = false) {
    const div = document.createElement('div');
    div.className = 'col-span-full flex items-center gap-3 py-2';
    div.innerHTML = `
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">${label}</span>
        <div class="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
    `;
    return div;
}

export function refreshNotesView() {
    const notesGrid = document.getElementById('notes-grid');
    const pinnedGrid = document.getElementById('pinned-grid');
    const pinnedSection = document.getElementById('pinned-section');
    const otherSectionTitle = document.getElementById('others-section-title');
    const emptyState = document.getElementById('empty-state');
    const settingsView = document.getElementById('settings-view');
    const metricsView = document.getElementById('metrics-view');
    const docsView = document.getElementById('docs-view');
    const quickNoteContainer = document.getElementById('quick-note-container');
    const categoryChips = document.getElementById('category-filter-chips');

    if (!notesGrid || !pinnedGrid) return;

    if (state.currentTab === 'settings') {
        notesGrid.innerHTML = '';
        pinnedGrid.innerHTML = '';
        pinnedSection?.classList.add('hidden');
        otherSectionTitle?.classList.add('hidden');
        emptyState?.classList.add('hidden');
        
        quickNoteContainer?.classList.add('hidden');
        categoryChips?.classList.add('hidden');
        metricsView?.classList.add('hidden');
        docsView?.classList.add('hidden');
        settingsView?.classList.remove('hidden');

        document.getElementById('fab-create-note')?.classList.add('hidden');
        document.getElementById('search-bar-container')?.classList.add('hidden');
        document.getElementById('layout-toggle-btn')?.classList.add('hidden');

        if (window.loadSettingsStats) {
            window.loadSettingsStats();
        }
        
        updateBadgesCounts();
        return;
    }

    if (state.currentTab === 'metrics') {
        notesGrid.innerHTML = '';
        pinnedGrid.innerHTML = '';
        pinnedSection?.classList.add('hidden');
        otherSectionTitle?.classList.add('hidden');
        emptyState?.classList.add('hidden');
        
        quickNoteContainer?.classList.add('hidden');
        categoryChips?.classList.add('hidden');
        settingsView?.classList.add('hidden');
        docsView?.classList.add('hidden');
        metricsView?.classList.remove('hidden');

        document.getElementById('fab-create-note')?.classList.add('hidden');
        document.getElementById('search-bar-container')?.classList.add('hidden');
        document.getElementById('layout-toggle-btn')?.classList.add('hidden');

        if (window.updateMetricsView) {
            window.updateMetricsView();
        }
        
        updateBadgesCounts();
        return;
    }

    if (state.currentTab === 'docs') {
        notesGrid.innerHTML = '';
        pinnedGrid.innerHTML = '';
        pinnedSection?.classList.add('hidden');
        otherSectionTitle?.classList.add('hidden');
        emptyState?.classList.add('hidden');
        
        quickNoteContainer?.classList.add('hidden');
        categoryChips?.classList.add('hidden');
        settingsView?.classList.add('hidden');
        metricsView?.classList.add('hidden');
        docsView?.classList.remove('hidden');

        document.getElementById('fab-create-note')?.classList.add('hidden');
        document.getElementById('search-bar-container')?.classList.add('hidden');
        document.getElementById('layout-toggle-btn')?.classList.add('hidden');

        // Auto-completar token si hay sesión activa
        const tokenInput = document.getElementById('docs-test-token');
        if (tokenInput && !tokenInput.value) {
            const savedPass = sessionStorage.getItem('github_sync_pass') || localStorage.getItem('github_sync_pass');
            if (savedPass) tokenInput.value = savedPass;
        }

        // Auto-detectar zona horaria
        const tzInput = document.getElementById('docs-test-tz');
        if (tzInput && !tzInput.value) {
            try {
                tzInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
            } catch(e) {
                tzInput.value = 'America/Mexico_City';
            }
        }

        updateBadgesCounts();
        return;
    }

    settingsView?.classList.add('hidden');
    metricsView?.classList.add('hidden');
    docsView?.classList.add('hidden');
    quickNoteContainer?.classList.remove('hidden');
    categoryChips?.classList.remove('hidden');

    document.getElementById('fab-create-note')?.classList.remove('hidden');
    document.getElementById('search-bar-container')?.classList.remove('hidden');
    document.getElementById('layout-toggle-btn')?.classList.remove('hidden');

    notesGrid.innerHTML = '';
    pinnedGrid.innerHTML = '';

    let filtered = state.notes.filter(note => {
        if (state.searchQuery.trim() !== '') {
            const query = state.searchQuery.toLowerCase();
            const inTitle = note.title && note.title.toLowerCase().includes(query);
            const inContent = note.content && note.content.toLowerCase().includes(query);
            const inTags = Array.isArray(note.tags) && note.tags.some(t => t.toLowerCase().includes(query));
            if (!inTitle && !inContent && !inTags) return false;
        }

        if (state.currentTab === 'notes') {
            return !note.isArchived && !note.isTrash;
        } else if (state.currentTab === 'pinned') {
            return note.isPinned && !note.isArchived && !note.isTrash;
        } else if (state.currentTab === 'archive') {
            return note.isArchived && !note.isTrash;
        } else if (state.currentTab === 'trash') {
            return note.isTrash;
        } else if (state.currentTab === 'tag') {
            return (note.tags || []).includes(state.selectedLabelFilter) && !note.isTrash && !note.isArchived;
        }
        return true;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const showPinnedHeaderSplit = (state.currentTab === 'notes' || state.currentTab === 'tag');

    let pinnedNotes = [];
    let otherNotes = [];

    if (showPinnedHeaderSplit) {
        pinnedNotes = filtered.filter(n => n.isPinned);
        otherNotes = filtered.filter(n => !n.isPinned);
    } else {
        otherNotes = filtered;
    }

    activeOtherNotes = otherNotes;
    currentLimit = BATCH_SIZE;

    if (pinnedNotes.length > 0) {
        pinnedSection?.classList.remove('hidden');
        otherSectionTitle?.classList.remove('hidden');
        renderNotesWithDateSeparators(pinnedGrid, pinnedNotes);
    } else {
        pinnedSection?.classList.add('hidden');
        otherSectionTitle?.classList.add('hidden');
    }

    if (otherNotes.length > 0) {
        renderNotesWithDateSeparators(notesGrid, otherNotes.slice(0, currentLimit));
    }

    if (filtered.length === 0) {
        emptyState?.classList.remove('hidden');
    } else {
        emptyState?.classList.add('hidden');
    }

    toggleLayoutStyles();
    renderCategoryFilterChips();
    updateBadgesCounts();
    if (window.checkBirthday) window.checkBirthday();
    attachScrollLoadMore();
}

function attachScrollLoadMore() {
    if (isScrollHandlerAttached) return;
    window.addEventListener('scroll', () => {
        if (state.currentTab === 'settings' || state.currentTab === 'metrics' || state.currentTab === 'docs') return;
        
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            if (currentLimit < activeOtherNotes.length) {
                currentLimit += BATCH_SIZE;
                const notesGrid = document.getElementById('notes-grid');
                if (notesGrid) {
                    notesGrid.innerHTML = '';
                    renderNotesWithDateSeparators(notesGrid, activeOtherNotes.slice(0, currentLimit));
                }
            }
        }
    });
    isScrollHandlerAttached = true;
}

export function renderNotesWithDateSeparators(container, notes) {
    let lastDateLabel = null;
    const fragment = document.createDocumentFragment();

    notes.forEach((note, index) => {
        const currentDateLabel = getDateGroupLabel(note.createdAt);

        if (currentDateLabel !== lastDateLabel) {
            fragment.appendChild(createDateSeparator(currentDateLabel));
            lastDateLabel = currentDateLabel;
        }

        fragment.appendChild(createNoteCard(note));
    });
    
    container.appendChild(fragment);
}

export function createNoteCard(note) {
    const card = document.createElement('div');
    const colorMeta = colorPalette[note.color] || colorPalette.default;

    card.className = `note-card group p-5 rounded-3xl border transition-all duration-300 relative hover:shadow-md cursor-pointer flex flex-col justify-between ${colorMeta.bgLight} ${colorMeta.borderLight} ${colorMeta.bgDark} ${colorMeta.borderDark}`;
    card.dataset.id = note.id;

    const pinIconColor = note.isPinned ? 'text-amber-500 fill-amber-500' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600';
    const renderedTitle = note.title ? renderMarkdown(note.title) : 'Sin Título';
    const renderedContent = note.content ? renderMarkdown(note.content) : '';
    const createdDate = formatDate(note.createdAt);
    const wasEdited = note.updatedAt && note.updatedAt !== note.createdAt;
    const editedDate = wasEdited ? formatDate(note.updatedAt) : '';
    const hasHistory = note.history && note.history.length > 0;

    card.setAttribute('onclick', `openFullEditorForEdit('${note.id}', event)`);

    card.innerHTML = `
        <div>
            <div class="flex items-start justify-between gap-3 mb-2">
                <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-2 pr-6">${renderedTitle}</h4>
                <button onclick="toggleCardPin('${note.id}', event)" class="absolute top-4 right-4 p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex transition-colors z-10" title="Destacar">
                    <span class="material-symbols-outlined text-xl ${pinIconColor}">keep</span>
                </button>
            </div>

            <div class="text-xs text-slate-600 dark:text-slate-300 line-clamp-6 leading-relaxed mb-4 markdown-content">${renderedContent}</div>
        </div>

        <div class="flex items-center justify-between mt-auto pt-2 border-t border-slate-200/40 dark:border-slate-800/20">
            <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                ${(() => {
                    const noteTags = Array.isArray(note.tags) ? note.tags : [];
                    if (noteTags.length === 0) return '';
                    const visible = noteTags.slice(0, 2);
                    const extra = noteTags.length - visible.length;
                    const pills = visible.map(t => {
                        const color = getLabelColor(t);
                        const style = color ? `style="background-color: ${color}1a; color: ${color}; border: 1px solid ${color}33;"` : '';
                        return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-300 shrink-0 max-w-[80px] truncate" ${style} title="${t}" onclick="event.stopPropagation()">${t}</span>`;
                    }).join('');
                    const extraPill = extra > 0 ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-400 shrink-0">+${extra}</span>` : '';
                    return pills + extraPill;
                })()}
                <span class="text-[10px] text-slate-400 dark:text-slate-500 shrink-0" title="${createdDate}">
                    ${createdDate}${editedDate ? ' · Editada' : ''}
                </span>
            </div>

            <div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                ${hasHistory ? `
                    <button onclick="openNoteHistory('${note.id}', event)" class="p-1 shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500 dark:text-slate-400" title="Historial">
                        <span class="material-symbols-outlined text-base">history</span>
                    </button>
                ` : ''}
                ${note.isTrash ? `
                    <button onclick="restoreNoteFromTrash('${note.id}', event)" class="p-1 shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500 dark:text-slate-400" title="Restaurar nota">
                        <span class="material-symbols-outlined text-base">restore_from_trash</span>
                    </button>
                    <button onclick="permanentlyDeleteNote('${note.id}', event)" class="p-1 shrink-0 hover:bg-red-500/10 rounded-full flex text-red-500" title="Eliminar permanentemente">
                        <span class="material-symbols-outlined text-base">delete_forever</span>
                    </button>
                ` : `
                    <button onclick="toggleCardArchive('${note.id}', event)" class="p-1 shrink-0 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500 dark:text-slate-400" title="${note.isArchived ? 'Desarchivar' : 'Archivar'}">
                        <span class="material-symbols-outlined text-base">${note.isArchived ? 'unarchive' : 'archive'}</span>
                    </button>
                    <button onclick="moveNoteToTrash('${note.id}', event)" class="p-1 shrink-0 hover:bg-red-500/10 rounded-full flex text-red-500 hover:text-red-600" title="Mover a papelera">
                        <span class="material-symbols-outlined text-base">delete</span>
                    </button>
                `}
            </div>
        </div>
    `;
    return card;
}

export function renderCategoryFilterChips() {
    const container = document.getElementById('category-filter-chips');
    if (!container) return;
    
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.onclick = () => switchTab('notes');
    allBtn.className = `px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${state.currentTab === 'notes' ? 'bg-google-blue dark:bg-google-blueDark text-white dark:text-[#0c1b32] shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800/60 hover:bg-slate-300/60 text-slate-600 dark:text-slate-300'}`;
    allBtn.innerText = 'Todas';
    container.appendChild(allBtn);

    const pinnedBtn = document.createElement('button');
    pinnedBtn.onclick = () => switchTab('pinned');
    pinnedBtn.className = `px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${state.currentTab === 'pinned' ? 'bg-google-blue dark:bg-google-blueDark text-white dark:text-[#0c1b32] shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800/60 hover:bg-slate-300/60 text-slate-600 dark:text-slate-300'}`;
    pinnedBtn.innerText = 'Destacadas';
    container.appendChild(pinnedBtn);

    getLabelsList().forEach(lbl => {
        const btn = document.createElement('button');
        btn.onclick = () => filterByLabel(lbl.name);
        const isActive = (state.currentTab === 'tag' && state.selectedLabelFilter === lbl.name);
        const color = lbl.color;
        
        btn.className = `px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border`;
        
        if (isActive) {
            if (color) {
                btn.style.backgroundColor = `${color}33`;
                btn.style.color = color;
                btn.style.borderColor = color;
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.borderColor = 'transparent';
                btn.className += ' bg-google-blue dark:bg-google-blueDark text-white dark:text-[#0c1b32] shadow-sm';
            }
        } else {
            if (color) {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = '';
                btn.style.borderColor = `${color}33`;
                btn.className += ' text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                btn.style.borderColor = 'transparent';
                btn.className += ' bg-slate-200/60 dark:bg-slate-800/60 hover:bg-slate-300/60 text-slate-600 dark:text-slate-300';
            }
        }
        
        btn.innerText = lbl.name;
        container.appendChild(btn);
    });
}

export function renderLabelsSidebars() {
    const sideCont = document.getElementById('side-labels-container');
    const mobCont = document.getElementById('mob-labels-container');

    if (sideCont) sideCont.innerHTML = '';
    if (mobCont) mobCont.innerHTML = '';

    getLabelsList().forEach(label => {
        const btn = document.createElement('button');
        btn.onclick = () => filterByLabel(label);
        btn.dataset.label = label;
        btn.className = `label-nav-tab w-full flex items-center gap-4 px-4 py-2 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-all font-medium text-xs [&.active]:bg-google-sidebarActive dark:[&.active]:bg-google-sidebarActiveDark [&.active]:text-[#001d35] dark:[&.active]:text-[#c2e7ff]`;
        btn.innerHTML = `
            <span class="material-symbols-outlined text-sm">label</span>
            <span>${label}</span>
        `;
        
        if (sideCont) sideCont.appendChild(btn);

        if (mobCont) {
            const mobBtn = btn.cloneNode(true);
            mobBtn.onclick = () => {
                filterByLabel(label);
                toggleMobileSidebar();
            };
            mobCont.appendChild(mobBtn);
        }
    });
}

function switchTab(tabId) {
    state.currentTab = tabId;
    state.selectedLabelFilter = '';

    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    const sideBtn = document.getElementById(`side-tab-${tabId}`);
    if (sideBtn) sideBtn.classList.add('active');

    document.querySelectorAll('.mob-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.mob-drawer-btn').forEach(el => el.classList.remove('active'));
    
    const activeMobTabs = document.querySelectorAll(`[onclick*="switchTab('${tabId}')"]`);
    activeMobTabs.forEach(tab => tab.classList.add('active'));

    clearSearch();
    refreshNotesView();
}

function filterByLabel(labelName) {
    state.currentTab = 'tag';
    state.selectedLabelFilter = labelName;

    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.label-nav-tab').forEach(el => {
        if(el.dataset.label === labelName) el.classList.add('active');
        else el.classList.remove('active');
    });

    refreshNotesView();
}

function clearSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    if (input) input.value = '';
    state.searchQuery = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    refreshNotesView();
}

function toggleMobileSidebar() {
    const drawer = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    
    if (!drawer || !backdrop) return;
    
    const isHidden = drawer.classList.contains('-translate-x-full');
    if (isHidden) {
        backdrop.classList.remove('hidden');
        drawer.classList.remove('-translate-x-full');
    } else {
        backdrop.classList.add('hidden');
        drawer.classList.add('-translate-x-full');
    }
}

window.switchTab = switchTab;
window.filterByLabel = filterByLabel;
window.clearSearch = clearSearch;
window.toggleMobileSidebar = toggleMobileSidebar;

// ── Funciones para el Probador Interactivo de la API (Documentación) ──
async function runDocsApiTest() {
    const endpoint = document.getElementById('docs-test-endpoint')?.value || '/api/tareas';
    const authMode = document.getElementById('docs-test-authmode')?.value || 'bearer';
    const token = document.getElementById('docs-test-token')?.value.trim() || '';
    const dateVal = document.getElementById('docs-test-date')?.value || '';
    const tzVal = document.getElementById('docs-test-tz')?.value.trim() || '';
    const includeOverdue = document.getElementById('docs-test-overdue')?.checked || false;

    const loadingEl = document.getElementById('docs-test-loading');
    const executeBtn = document.getElementById('btn-docs-execute');
    const outputWrap = document.getElementById('docs-test-output-wrap');
    const outputPre = document.getElementById('docs-test-output');
    const statusBadge = document.getElementById('docs-res-status-badge');
    const timeEl = document.getElementById('docs-res-time');
    const rateLimitEl = document.getElementById('docs-res-ratelimit');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (executeBtn) executeBtn.disabled = true;

    // Construir URL y Query Params
    const url = new URL(endpoint, window.location.origin);
    if (dateVal) url.searchParams.set('date', dateVal);
    if (tzVal) url.searchParams.set('tz', tzVal);
    if (includeOverdue) url.searchParams.set('include_overdue', 'true');
    if (authMode === 'query' && token) {
        url.searchParams.set('token', token);
    }

    const headers = {};
    if (authMode === 'bearer' && token) {
        headers['Authorization'] = `Bearer ${token}`;
    } else if (authMode === 'header' && token) {
        headers['x-api-key'] = token;
    }

    const startTime = performance.now();
    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers
        });

        const duration = Math.round(performance.now() - startTime);
        const data = await response.json().catch(() => ({ error: 'Respuesta no parseable como JSON' }));

        if (timeEl) timeEl.textContent = `${duration}ms`;

        // Rate limit header
        const limit = response.headers.get('X-RateLimit-Limit') || '30';
        const remaining = response.headers.get('X-RateLimit-Remaining');
        if (rateLimitEl) {
            rateLimitEl.textContent = remaining !== null ? `Rate Limit: ${remaining}/${limit}` : `Rate Limit: 30 req/min`;
        }

        // Status badge
        if (statusBadge) {
            statusBadge.textContent = `${response.status} ${response.statusText || (response.ok ? 'OK' : 'Error')}`;
            if (response.status === 200) {
                statusBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
            } else if (response.status === 401 || response.status === 403) {
                statusBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
            } else if (response.status === 429) {
                statusBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
            } else {
                statusBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
            }
        }

        if (outputPre) {
            outputPre.textContent = JSON.stringify(data, null, 2);
        }
        if (outputWrap) outputWrap.classList.remove('hidden');

    } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        if (timeEl) timeEl.textContent = `${duration}ms`;
        if (statusBadge) {
            statusBadge.textContent = 'Error de Red';
            statusBadge.className = 'px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
        }
        if (outputPre) {
            outputPre.textContent = JSON.stringify({ error: 'Fallo al conectar con el servidor', detalle: err.message }, null, 2);
        }
        if (outputWrap) outputWrap.classList.remove('hidden');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (executeBtn) executeBtn.disabled = false;
    }
}

function copyDocsOutput() {
    const outputPre = document.getElementById('docs-test-output');
    if (!outputPre || !outputPre.textContent) return;
    navigator.clipboard.writeText(outputPre.textContent).then(() => {
        showToast('✓ JSON copiado al portapapeles');
    }).catch(() => {
        showToast('Error al copiar JSON');
    });
}

function switchSnippetTab(tabKey) {
    document.querySelectorAll('.snippet-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-indigo-100', 'dark:bg-indigo-950/50', 'text-indigo-700', 'dark:text-indigo-300');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
    });

    const activeBtn = document.getElementById(`tab-btn-${tabKey}`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-indigo-100', 'dark:bg-indigo-950/50', 'text-indigo-700', 'dark:text-indigo-300');
        activeBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
    }

    document.querySelectorAll('.snippet-content').forEach(el => el.classList.add('hidden'));
    const targetContent = document.getElementById(`snippet-${tabKey}`);
    if (targetContent) targetContent.classList.remove('hidden');
}

function copySnippet(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    const codeEl = wrap.querySelector('code') || wrap.querySelector('pre');
    const textToCopy = codeEl ? codeEl.innerText : wrap.innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('✓ Código copiado al portapapeles');
    }).catch(() => {
        showToast('Error al copiar código');
    });
}

window.runDocsApiTest = runDocsApiTest;
window.copyDocsOutput = copyDocsOutput;
window.switchSnippetTab = switchSnippetTab;
window.copySnippet = copySnippet;

