import { state, colorPalette, labelsList } from './state.js';
import { saveNotesToStorage } from './storage.js';
import { toggleLayoutStyles } from './layout.js';
import { showToast } from './toast.js';
import { updateBadgesCounts } from './badges.js';

export function refreshNotesView() {
    const notesGrid = document.getElementById('notes-grid');
    const pinnedGrid = document.getElementById('pinned-grid');
    const pinnedSection = document.getElementById('pinned-section');
    const otherSectionTitle = document.getElementById('others-section-title');
    const emptyState = document.getElementById('empty-state');

    if (!notesGrid || !pinnedGrid) return;

    notesGrid.innerHTML = '';
    pinnedGrid.innerHTML = '';

    let filtered = state.notes.filter(note => {
        if (state.searchQuery.trim() !== '') {
            const query = state.searchQuery.toLowerCase();
            const inTitle = note.title && note.title.toLowerCase().includes(query);
            const inContent = note.content && note.content.toLowerCase().includes(query);
            const inLabel = note.label && note.label.toLowerCase().includes(query);
            if (!inTitle && !inContent && !inLabel) return false;
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
            return note.label === state.selectedLabelFilter && !note.isTrash && !note.isArchived;
        }
        return true;
    });

    const showPinnedHeaderSplit = (state.currentTab === 'notes' || state.currentTab === 'tag');
    
    let pinnedNotes = [];
    let otherNotes = [];

    if (showPinnedHeaderSplit) {
        pinnedNotes = filtered.filter(n => n.isPinned);
        otherNotes = filtered.filter(n => !n.isPinned);
    } else {
        otherNotes = filtered;
    }

    if (pinnedNotes.length > 0) {
        pinnedSection?.classList.remove('hidden');
        otherSectionTitle?.classList.remove('hidden');
        pinnedNotes.forEach(note => {
            pinnedGrid.appendChild(createNoteCard(note));
        });
    } else {
        pinnedSection?.classList.add('hidden');
        otherSectionTitle?.classList.add('hidden');
    }

    if (otherNotes.length > 0) {
        otherNotes.forEach(note => {
            notesGrid.appendChild(createNoteCard(note));
        });
    }

    if (filtered.length === 0) {
        emptyState?.classList.remove('hidden');
    } else {
        emptyState?.classList.add('hidden');
    }

    toggleLayoutStyles();
    renderCategoryFilterChips();
    updateBadgesCounts();
}

export function createNoteCard(note) {
    const card = document.createElement('div');
    const colorMeta = colorPalette[note.color] || colorPalette.default;
    
    card.className = `note-card group p-5 rounded-3xl border transition-all duration-300 relative hover:shadow-md cursor-pointer flex flex-col justify-between ${colorMeta.bgLight} ${colorMeta.borderLight} ${colorMeta.bgDark} ${colorMeta.borderDark}`;
    card.dataset.id = note.id;

    const pinIconColor = note.isPinned ? 'text-amber-500 fill-amber-500' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600';
    const formattedContent = note.content.replace(/\n/g, '<br>');

    card.setAttribute('onclick', `openFullEditorForEdit('${note.id}', event)`);

    card.innerHTML = `
        <div>
            <div class="flex items-start justify-between gap-3 mb-2">
                <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-2 pr-6">${note.title || 'Sin Título'}</h4>
                <button onclick="toggleCardPin('${note.id}', event)" class="absolute top-4 right-4 p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex transition-colors z-10" title="Destacar">
                    <span class="material-symbols-outlined text-xl ${pinIconColor}">keep</span>
                </button>
            </div>
            
            <p class="text-xs text-slate-600 dark:text-slate-300 line-clamp-6 leading-relaxed mb-4">${formattedContent}</p>
        </div>

        <div class="flex items-center justify-between mt-auto pt-2 border-t border-slate-200/40 dark:border-slate-800/20">
            <div class="flex items-center gap-1.5 overflow-hidden">
                ${note.label ? `
                    <span class="inline-flex text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-slate-600 dark:text-slate-300 max-w-[80px] truncate" title="Etiqueta: ${note.label}">
                        ${note.label}
                    </span>
                ` : ''}
            </div>
            
            <div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                ${note.isTrash ? `
                    <button onclick="restoreNoteFromTrash('${note.id}', event)" class="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500 dark:text-slate-400" title="Restaurar nota">
                        <span class="material-symbols-outlined text-base">restore_from_trash</span>
                    </button>
                    <button onclick="permanentlyDeleteNote('${note.id}', event)" class="p-1.5 hover:bg-red-500/10 rounded-full flex text-red-500" title="Eliminar permanentemente">
                        <span class="material-symbols-outlined text-base">delete_forever</span>
                    </button>
                ` : `
                    <button onclick="toggleCardArchive('${note.id}', event)" class="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full flex text-slate-500 dark:text-slate-400" title="${note.isArchived ? 'Desarchivar' : 'Archivar'}">
                        <span class="material-symbols-outlined text-base">${note.isArchived ? 'unarchive' : 'archive'}</span>
                    </button>
                    <button onclick="moveNoteToTrash('${note.id}', event)" class="p-1.5 hover:bg-red-500/10 rounded-full flex text-red-500 hover:text-red-600" title="Mover a papelera">
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

    labelsList.forEach(lbl => {
        const btn = document.createElement('button');
        btn.onclick = () => filterByLabel(lbl);
        const isActive = (state.currentTab === 'tag' && state.selectedLabelFilter === lbl);
        btn.className = `px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${isActive ? 'bg-google-blue dark:bg-google-blueDark text-white dark:text-[#0c1b32] shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800/60 hover:bg-slate-300/60 text-slate-600 dark:text-slate-300'}`;
        btn.innerText = lbl;
        container.appendChild(btn);
    });
}

export function renderLabelsSidebars() {
    const sideCont = document.getElementById('side-labels-container');
    const mobCont = document.getElementById('mob-labels-container');

    if (sideCont) sideCont.innerHTML = '';
    if (mobCont) mobCont.innerHTML = '';

    labelsList.forEach(label => {
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
    
    const activeMobTabs = document.querySelectorAll(`[onclick="switchTab('${tabId}')"]`);
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
