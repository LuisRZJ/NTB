import { state, getLabelsList, addLabel as addLabelToState, removeLabel as removeLabelFromState, setLabelsList, getLabelColor } from './state.js';
import { saveLabelsToStorage } from './storage.js';
import { refreshNotesView } from './renderer.js';
import { showToast } from './toast.js';

export function populateLabelSelectors() {
    const labels = getLabelsList();
    const selectors = ['qn-label-selector', 'dialog-note-label'];

    selectors.forEach(selectorId => {
        const selector = document.getElementById(selectorId);
        if (!selector) return;

        const currentValue = selector.value;
        const firstOption = selector.options[0];

        selector.innerHTML = '';
        if (firstOption) {
            selector.appendChild(firstOption);
        }

        labels.forEach(label => {
            const option = document.createElement('option');
            option.value = label.name;
            option.textContent = label.name;
            selector.appendChild(option);
        });

        if (currentValue && labels.some(l => l.name === currentValue)) {
            selector.value = currentValue;
        }
    });
}

export function renderSidebarLabels() {
    const sideCont = document.getElementById('side-labels-container');
    const mobCont = document.getElementById('mob-labels-container');

    if (sideCont) sideCont.innerHTML = '';
    if (mobCont) mobCont.innerHTML = '';

    getLabelsList().forEach(label => {
        const sideBtn = createSidebarLabelButton(label, 'desktop');
        const mobBtn = createSidebarLabelButton(label, 'mobile');

        if (sideCont) sideCont.appendChild(sideBtn);
        if (mobCont) mobCont.appendChild(mobBtn);
    });
}

function createSidebarLabelButton(label, type) {
    const btn = document.createElement('div');
    btn.className = `label-nav-tab w-full flex items-center gap-2 px-4 py-2 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 transition-all font-medium text-xs [&.active]:bg-google-sidebarActive dark:[&.active]:bg-google-sidebarActiveDark [&.active]:text-[#001d35] dark:[&.active]:text-[#c2e7ff] group`;
    btn.dataset.label = label.name;

    const labelBtn = document.createElement('button');
    labelBtn.className = 'flex items-center gap-3 flex-1 min-w-0';
    labelBtn.onclick = () => {
        if (type === 'mobile') {
            filterByLabelMobile(label.name);
        } else {
            filterByLabelDesktop(label.name);
        }
    };

    const iconStyle = label.color ? `style="color: ${label.color}"` : '';
    labelBtn.innerHTML = `
        <span class="material-symbols-outlined text-sm shrink-0" ${iconStyle}>label</span>
        <span class="truncate">${label.name}</span>
    `;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'label-actions-div flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0';

    const editBtn = document.createElement('button');
    editBtn.className = 'p-1 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-full flex items-center justify-center';
    editBtn.title = 'Editar';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openEditLabelDialog(label.name);
    };
    editBtn.innerHTML = '<span class="material-symbols-outlined text-xs">edit</span>';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full flex items-center justify-center text-red-500';
    deleteBtn.title = 'Eliminar';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteLabel(label.name);
    };
    deleteBtn.innerHTML = '<span class="material-symbols-outlined text-xs">delete</span>';

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    btn.appendChild(labelBtn);
    btn.appendChild(actionsDiv);

    return btn;
}

function filterByLabelDesktop(labelName) {
    state.currentTab = 'tag';
    state.selectedLabelFilter = labelName;

    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.label-nav-tab').forEach(el => {
        if(el.dataset.label === labelName) el.classList.add('active');
        else el.classList.remove('active');
    });

    refreshNotesView();
}

function filterByLabelMobile(labelName) {
    filterByLabelDesktop(labelName);
    toggleMobileSidebar();
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

let selectedLabelColorValue = null;

export function selectLabelColor(color, element) {
    selectedLabelColorValue = color;
    
    const buttons = document.querySelectorAll('#label-color-choices button, #label-color-choices .relative');
    buttons.forEach(btn => {
        btn.classList.remove('ring-2', 'ring-google-blue', 'ring-offset-2', 'dark:ring-offset-[#202124]');
    });
    
    if (element) {
        element.classList.add('ring-2', 'ring-google-blue', 'ring-offset-2', 'dark:ring-offset-[#202124]');
    }
}

function getContrastColor(hexColor) {
    if (!hexColor || hexColor === 'null') return 'inherit';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

export function selectCustomLabelColor(color) {
    selectedLabelColorValue = color;
    
    const customContainer = document.querySelector('#custom-label-color-input')?.parentElement;
    if (customContainer) {
        selectLabelColor(color, customContainer);
        customContainer.style.backgroundColor = color;
        const icon = customContainer.querySelector('span');
        if (icon) {
            icon.style.color = getContrastColor(color);
        }
    }
}

export function openLabelDialog() {
    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');
    const input = document.getElementById('new-label-name');
    const errorDiv = document.getElementById('label-error');

    if (!backdrop || !container) return;

    selectedLabelColorValue = null;
    const nullBtn = document.querySelector('#label-color-choices button[data-color="null"]');
    selectLabelColor(null, nullBtn);

    const customInput = document.getElementById('custom-label-color-input');
    const customContainer = customInput?.parentElement;
    if (customContainer) {
        customContainer.style.backgroundColor = '';
        const icon = customContainer.querySelector('span');
        if (icon) icon.style.color = '';
    }

    if (errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    if (input) {
        input.value = '';
        input.focus();
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');

    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

export function closeLabelDialog() {
    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');
    const titleSpan = document.getElementById('label-dialog-title');
    const submitBtn = document.getElementById('label-dialog-submit-btn');

    if (!backdrop || !container) return;

    if (titleSpan) titleSpan.textContent = 'Crear Etiqueta';
    if (submitBtn) submitBtn.textContent = 'Crear';
    submitBtn?.setAttribute('onclick', 'createNewLabel()');

    container.classList.remove('scale-100');
    container.classList.add('scale-95');

    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

export function createNewLabel() {
    const input = document.getElementById('new-label-name');
    const errorDiv = document.getElementById('label-error');

    if (!input) return;

    const labelName = input.value.trim();

    if (!labelName) {
        if (errorDiv) {
            errorDiv.textContent = 'El nombre de la etiqueta no puede estar vacío';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    const labels = getLabelsList();
    if (labels.some(l => l.name.toLowerCase() === labelName.toLowerCase())) {
        if (errorDiv) {
            errorDiv.textContent = 'Ya existe una etiqueta con este nombre';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    addLabelToState(labelName, selectedLabelColorValue);
    saveLabelsToStorage();
    populateLabelSelectors();
    renderSidebarLabels();
    // Refrescar chips del dialog si está abierto
    if (typeof window.renderDialogTagChips === 'function') {
        const dialogOpen = !document.getElementById('note-dialog-backdrop')?.classList.contains('hidden');
        if (dialogOpen) {
            const activeTags = Array.from(document.querySelectorAll('.dialog-tag-chip[data-active="true"]')).map(c => c.dataset.tag);
            window.renderDialogTagChips(activeTags);
        }
    }
    refreshNotesView();
    closeLabelDialog();
    showToast(`Etiqueta "${labelName}" creada correctamente`);
}

let currentEditingLabel = '';
let labelToDelete = '';

export function openDeleteLabelDialog(labelName) {
    labelToDelete = labelName;
    const backdrop = document.getElementById('delete-label-dialog-backdrop');
    const container = document.getElementById('delete-label-dialog-container');
    const message = document.getElementById('delete-label-message');

    if (!backdrop || !container) return;

    if (message) {
        message.textContent = `¿Eliminar la etiqueta "${labelName}"? Las notas con esta etiqueta no se eliminarán, solo perderán la etiqueta.`;
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');

    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

export function closeDeleteLabelDialog() {
    const backdrop = document.getElementById('delete-label-dialog-backdrop');
    const container = document.getElementById('delete-label-dialog-container');

    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');

    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
        labelToDelete = '';
    }, 150);
}

export function confirmDeleteLabel() {
    if (!labelToDelete) return;

    state.notes.forEach(note => {
        if (Array.isArray(note.tags)) {
            note.tags = note.tags.filter(t => t !== labelToDelete);
        }
    });

    removeLabelFromState(labelToDelete);
    saveLabelsToStorage();
    import('./storage.js').then(m => m.saveNotesToStorage());
    populateLabelSelectors();
    renderSidebarLabels();
    refreshNotesView();
    closeDeleteLabelDialog();
    showToast(`Etiqueta "${labelToDelete}" eliminada`);
}

export function deleteLabel(labelName) {
    openDeleteLabelDialog(labelName);
}

export function openEditLabelDialog(oldLabel) {
    currentEditingLabel = oldLabel;
    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');
    const titleSpan = document.getElementById('label-dialog-title');
    const submitBtn = document.getElementById('label-dialog-submit-btn');
    const input = document.getElementById('new-label-name');
    const errorDiv = document.getElementById('label-error');

    if (!backdrop || !container) return;

    const labelObj = getLabelsList().find(l => l.name === oldLabel);
    const currentColor = labelObj ? labelObj.color : null;
    selectedLabelColorValue = currentColor;

    // Resetear estilos del contenedor de color personalizado
    const customInput = document.getElementById('custom-label-color-input');
    const customContainer = customInput?.parentElement;
    if (customContainer) {
        customContainer.style.backgroundColor = '';
        const icon = customContainer.querySelector('span');
        if (icon) icon.style.color = '';
    }

    // Seleccionar visualmente el botón de color correspondiente
    if (currentColor === null) {
        const nullBtn = document.querySelector('#label-color-choices button[data-color="null"]');
        selectLabelColor(null, nullBtn);
    } else {
        const presetBtn = document.querySelector(`#label-color-choices button[data-color="${currentColor}"]`);
        if (presetBtn) {
            selectLabelColor(currentColor, presetBtn);
        } else {
            if (customInput) customInput.value = currentColor;
            selectCustomLabelColor(currentColor);
        }
    }

    if (titleSpan) titleSpan.textContent = 'Editar Etiqueta';
    if (submitBtn) {
        submitBtn.textContent = 'Actualizar';
        submitBtn.setAttribute('onclick', 'updateLabel()');
    }
    if (input) {
        input.value = oldLabel;
        input.focus();
        input.select();
    }
    if (errorDiv) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');

    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

export function submitLabelDialog() {
    if (currentEditingLabel && document.getElementById('label-dialog-submit-btn')?.textContent === 'Actualizar') {
        updateLabel();
    } else {
        createNewLabel();
    }
}

export function updateLabel() {
    const input = document.getElementById('new-label-name');
    const errorDiv = document.getElementById('label-error');

    if (!input) return;

    const newLabelName = input.value.trim();

    if (!newLabelName) {
        if (errorDiv) {
            errorDiv.textContent = 'El nombre de la etiqueta no puede estar vacío';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    const labels = getLabelsList();
    if (labels.some(l => l.name.toLowerCase() === newLabelName.toLowerCase() && l.name.toLowerCase() !== currentEditingLabel.toLowerCase())) {
        if (errorDiv) {
            errorDiv.textContent = 'Ya existe una etiqueta con este nombre';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    const noteUpdatePromises = state.notes.map(note => {
        if (Array.isArray(note.tags) && note.tags.includes(currentEditingLabel)) {
            note.tags = note.tags.map(t => t === currentEditingLabel ? newLabelName : t);
        }
        return Promise.resolve();
    });

    Promise.all(noteUpdatePromises).then(() => {
        const newLabels = labels.map(l => {
            if (l.name === currentEditingLabel) {
                return { name: newLabelName, color: selectedLabelColorValue };
            }
            return l;
        });
        setLabelsList(newLabels);
        saveLabelsToStorage();
        import('./storage.js').then(m => m.saveNotesToStorage());
        populateLabelSelectors();
        renderSidebarLabels();
        // Refrescar chips del dialog si está abierto
        if (typeof window.renderDialogTagChips === 'function') {
            const currentChips = document.querySelectorAll('.dialog-tag-chip');
            if (currentChips.length > 0) {
                const activeTags = Array.from(document.querySelectorAll('.dialog-tag-chip[data-active="true"]')).map(c => c.dataset.tag);
                const updatedActive = activeTags.map(t => t === currentEditingLabel ? newLabelName : t);
                window.renderDialogTagChips(updatedActive);
            }
        }
        refreshNotesView();
        closeLabelDialog();

        const titleSpan = document.getElementById('label-dialog-title');
        const submitBtn = document.getElementById('label-dialog-submit-btn');
        if (titleSpan) titleSpan.textContent = 'Crear Etiqueta';
        if (submitBtn) {
            submitBtn.textContent = 'Crear';
            submitBtn.setAttribute('onclick', 'createNewLabel()');
        }
        currentEditingLabel = '';

        showToast(`Etiqueta actualizada a "${newLabelName}"`);
    });
}

window.openLabelDialog = openLabelDialog;
window.closeLabelDialog = closeLabelDialog;
window.createNewLabel = createNewLabel;
window.populateLabelSelectors = populateLabelSelectors;
window.openEditLabelDialog = openEditLabelDialog;
window.updateLabel = updateLabel;
window.deleteLabel = deleteLabel;
window.renderSidebarLabels = renderSidebarLabels;
window.submitLabelDialog = submitLabelDialog;
window.openDeleteLabelDialog = openDeleteLabelDialog;
window.closeDeleteLabelDialog = closeDeleteLabelDialog;
window.confirmDeleteLabel = confirmDeleteLabel;
window.selectLabelColor = selectLabelColor;
window.selectCustomLabelColor = selectCustomLabelColor;