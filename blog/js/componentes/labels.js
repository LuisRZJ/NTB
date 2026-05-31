// ============================================================
// labels.js — Gestión CRUD de etiquetas con selección de color
// ============================================================

import { labels, setLabels, posts, currentSection, currentLabelFilter, currentPostId, setCurrentPostId } from './state.js';
import { saveLabelsToStorage, savePostsToStorage } from './storage.js';
import { renderSidebarLabels, renderFileTree, updateSectionCounts, switchSection } from './sidebar.js';
import { showToast } from './toast.js';

let selectedLabelColorValue = null;
let currentEditingLabelId = null;
let labelToDeleteId = null;

/**
 * Resalta visualmente el color seleccionado en el diálogo.
 */
export function selectLabelColor(color, element) {
    selectedLabelColorValue = color;

    const choices = document.querySelectorAll('#label-color-choices button, #label-color-choices .relative');
    choices.forEach(btn => {
        btn.classList.remove('ring-2', 'ring-google-blue', 'ring-offset-2', 'dark:ring-offset-[#202124]');
    });

    if (element) {
        element.classList.add('ring-2', 'ring-google-blue', 'ring-offset-2', 'dark:ring-offset-[#202124]');
    }
}

/**
 * Retorna un color de contraste (blanco o negro) basado en el color hexadecimal.
 */
function getContrastColor(hexColor) {
    if (!hexColor || hexColor === 'null') return 'inherit';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

/**
 * Selecciona un color personalizado a través de la paleta nativa.
 */
export function selectCustomLabelColor(color) {
    selectedLabelColorValue = color;

    const customInput = document.getElementById('custom-label-color-input');
    const customContainer = customInput?.parentElement;

    if (customContainer) {
        selectLabelColor(color, customContainer);
        customContainer.style.backgroundColor = color;
        const icon = customContainer.querySelector('span');
        if (icon) {
            icon.style.color = getContrastColor(color);
        }
    }
}

/**
 * Abre el diálogo para crear una nueva etiquet/**
 * Popula el select de etiqueta padre previniendo niveles de anidación profundos y dependencias circulares.
 */
/**
 * Obtiene todos los IDs de las subetiquetas descendientes de forma recursiva.
 */
function getDescendantsRecursive(labelId) {
    const descendants = [];
    const queue = [labelId];
    while (queue.length > 0) {
        const currentId = queue.shift();
        labels.forEach(l => {
            if (l.parentId === currentId) {
                descendants.push(l.id);
                queue.push(l.id);
            }
        });
    }
    return descendants;
}

/**
 * Agrega recursivamente las opciones al selector respetando la jerarquía.
 */
function buildSelectTree(parentId, depth, selectElement, invalidParentIds) {
    let levelLabels;
    if (parentId === null) {
        // Encontrar etiquetas raíces: sin parentId o cuyo parentId ya no exista en el arreglo global
        levelLabels = labels.filter(l => !l.parentId || !labels.some(p => p.id === l.parentId));
    } else {
        levelLabels = labels.filter(l => l.parentId === parentId);
    }

    levelLabels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    levelLabels.forEach(label => {
        if (invalidParentIds.includes(label.id)) return;

        const option = document.createElement('option');
        option.value = label.id;
        // Prefijo de guiones y espacios para denotar profundidad
        const prefix = depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '— ' : '';
        option.innerHTML = prefix + label.name;
        selectElement.appendChild(option);

        buildSelectTree(label.id, depth + 1, selectElement, invalidParentIds);
    });
}

function populateParentSelect(currentLabelId = null) {
    const select = document.getElementById('label-parent-select');
    const helpText = document.getElementById('label-parent-help-text');
    if (!select) return;

    select.innerHTML = '<option value="">Ninguna (Etiqueta principal)</option>';
    select.disabled = false;
    if (helpText) helpText.classList.add('hidden');

    const invalidParentIds = [];
    if (currentLabelId) {
        invalidParentIds.push(currentLabelId);
        invalidParentIds.push(...getDescendantsRecursive(currentLabelId));
    }

    buildSelectTree(null, 0, select, invalidParentIds);
}

/**
 * Abre el diálogo para crear una nueva etiqueta.
 */
export function openLabelDialog() {
    currentEditingLabelId = null;
    selectedLabelColorValue = null;

    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');
    const titleEl = document.getElementById('label-dialog-title');
    const input = document.getElementById('label-input');
    const submitBtn = document.getElementById('label-dialog-submit-btn');
    const errorEl = document.getElementById('label-error');

    if (!backdrop || !container) return;

    if (titleEl) titleEl.textContent = 'Crear Etiqueta';
    if (submitBtn) submitBtn.textContent = 'Crear';
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    // Resetear selector de etiqueta padre
    populateParentSelect(null);

    // Resetear color por defecto (sin color)
    const nullBtn = document.querySelector('#label-color-choices button[data-color="null"]');
    selectLabelColor(null, nullBtn);

    const customInput = document.getElementById('custom-label-color-input');
    const customContainer = customInput?.parentElement;
    if (customContainer) {
        customContainer.style.backgroundColor = '';
        const icon = customContainer.querySelector('span');
        if (icon) icon.style.color = '';
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

/**
 * Abre el diálogo para editar una etiqueta existente.
 */
export function openEditLabelDialog(labelId) {
    const label = labels.find(l => l.id === labelId);
    if (!label) return;

    currentEditingLabelId = labelId;
    selectedLabelColorValue = label.color || null;

    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');
    const titleEl = document.getElementById('label-dialog-title');
    const input = document.getElementById('label-input');
    const submitBtn = document.getElementById('label-dialog-submit-btn');
    const errorEl = document.getElementById('label-error');

    if (!backdrop || !container) return;

    if (titleEl) titleEl.textContent = 'Editar Etiqueta';
    if (submitBtn) submitBtn.textContent = 'Guardar';
    if (input) {
        input.value = label.name;
        setTimeout(() => input.focus(), 50);
    }
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    // Configurar y poblar selector de etiqueta padre
    populateParentSelect(labelId);
    const select = document.getElementById('label-parent-select');
    if (select) {
        select.value = label.parentId || '';
    }

    // Resetear contenedor de color personalizado
    const customInput = document.getElementById('custom-label-color-input');
    const customContainer = customInput?.parentElement;
    if (customContainer) {
        customContainer.style.backgroundColor = '';
        const icon = customContainer.querySelector('span');
        if (icon) icon.style.color = '';
    }

    // Resaltar visualmente el color cargado
    if (selectedLabelColorValue === null) {
        const nullBtn = document.querySelector('#label-color-choices button[data-color="null"]');
        selectLabelColor(null, nullBtn);
    } else {
        const presetBtn = document.querySelector(`#label-color-choices button[data-color="${selectedLabelColorValue}"]`);
        if (presetBtn) {
            selectLabelColor(selectedLabelColorValue, presetBtn);
        } else {
            if (customInput) customInput.value = selectedLabelColorValue;
            selectCustomLabelColor(selectedLabelColorValue);
        }
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

/**
 * Cierra el diálogo de etiquetas.
 */
export function closeLabelDialog() {
    const backdrop = document.getElementById('label-dialog-backdrop');
    const container = document.getElementById('label-dialog-container');

    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);
}

/**
 * Ejecuta la acción del botón de guardar/crear del diálogo según corresponda.
 */
export function submitLabelDialog() {
    if (currentEditingLabelId) {
        updateLabel();
    } else {
        createLabel();
    }
}

/**
 * Crea una nueva etiqueta con el nombre y color del diálogo.
 */
export function createLabel() {
    const input = document.getElementById('label-input');
    const errorEl = document.getElementById('label-error');
    const parentSelect = document.getElementById('label-parent-select');

    if (!input) return;

    const name = input.value.trim();

    if (!name) {
        showLabelError('El nombre de la etiqueta no puede estar vacío.');
        return;
    }

    // Validar duplicados
    const duplicate = labels.some(l => l.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
        showLabelError('Ya existe una etiqueta con este nombre.');
        return;
    }

    if (errorEl) errorEl.classList.add('hidden');

    const parentId = parentSelect?.value || null;

    const newLabel = {
        id: crypto.randomUUID(),
        name: name,
        color: selectedLabelColorValue,
        parentId: parentId
    };

    labels.push(newLabel);
    saveLabelsToStorage();

    renderSidebarLabels();
    updateSectionCounts();
    closeLabelDialog();

    showToast(`Etiqueta "${name}" creada`);
}

/**
 * Actualiza la etiqueta actualmente en edición.
 */
export function updateLabel() {
    const input = document.getElementById('label-input');
    const errorEl = document.getElementById('label-error');
    const parentSelect = document.getElementById('label-parent-select');

    if (!input || !currentEditingLabelId) return;

    const newName = input.value.trim();

    if (!newName) {
        showLabelError('El nombre no puede estar vacío.');
        return;
    }

    // Validar duplicados (con excepción de ella misma)
    const duplicate = labels.some(l => l.id !== currentEditingLabelId && l.name.toLowerCase() === newName.toLowerCase());
    if (duplicate) {
        showLabelError('Ya existe otra etiqueta con ese nombre.');
        return;
    }

    const label = labels.find(l => l.id === currentEditingLabelId);
    if (label) {
        label.name = newName;
        label.color = selectedLabelColorValue;
        label.parentId = (parentSelect && !parentSelect.disabled) ? (parentSelect.value || null) : (label.parentId || null);

        saveLabelsToStorage();

        renderSidebarLabels();
        renderFileTree();

        // Refrescar chips del post activo si está en pantalla
        if (typeof window.renderPostLabels === 'function') {
            window.renderPostLabels();
        }

        closeLabelDialog();
        showToast('Etiqueta actualizada correctamente');
    }
}

/**
 * Muestra el error en la interfaz del diálogo.
 */
function showLabelError(message) {
    const errorEl = document.getElementById('label-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

/**
 * Abre el diálogo de confirmación para eliminar una etiqueta.
 */
export function openDeleteLabelDialog(labelId) {
    const label = labels.find(l => l.id === labelId);
    if (!label) return;

    labelToDeleteId = labelId;

    const backdrop = document.getElementById('delete-label-dialog-backdrop');
    const container = document.getElementById('delete-label-dialog-container');
    const message = document.getElementById('delete-label-message');
    const protectionOptions = document.getElementById('delete-label-protection-options');

    if (!backdrop || !container) return;

    // Obtener subetiquetas vinculadas
    const childLabelIds = getDescendantsRecursive(labelId);
    const labelsToDeleteIds = [labelId, ...childLabelIds];

    // Contar posts afectados
    const affectedPosts = posts.filter(post => post.labels && post.labels.some(id => labelsToDeleteIds.includes(id)));
    const count = affectedPosts.length;

    if (message) {
        if (childLabelIds.length > 0) {
            message.innerHTML = `¿Estás seguro de que deseas eliminar la etiqueta principal <b>"${label.name}"</b> y sus <b>${childLabelIds.length} subetiquetas</b> descendientes?<br><br>` + 
                                (count > 0 
                                 ? `Hay <b>${count}</b> entradas vinculadas a estas etiquetas.` 
                                 : `No hay entradas vinculadas a estas etiquetas.`);
        } else {
            message.innerHTML = `¿Estás seguro de que deseas eliminar la etiqueta <b>"${label.name}"</b>?<br><br>` + 
                                (count > 0 
                                 ? `Hay <b>${count}</b> entradas vinculadas a esta etiqueta.` 
                                 : `No hay entradas vinculadas a esta etiqueta.`);
        }
    }

    if (count > 0 && protectionOptions) {
        protectionOptions.classList.remove('hidden');
        const defaultRadio = document.querySelector('input[name="delete-post-option"][value="keep"]');
        if (defaultRadio) defaultRadio.checked = true;
    } else if (protectionOptions) {
        protectionOptions.classList.add('hidden');
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
    }, 10);
}

/**
 * Cierra el diálogo de confirmación de eliminación.
 */
export function closeDeleteLabelDialog() {
    const backdrop = document.getElementById('delete-label-dialog-backdrop');
    const container = document.getElementById('delete-label-dialog-container');

    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.remove('flex');
        backdrop.classList.add('hidden');
    }, 150);

    labelToDeleteId = null;
}

/**
 * Confirma la eliminación definitiva.
 */
export function confirmDeleteLabel() {
    if (!labelToDeleteId) return;

    const label = labels.find(l => l.id === labelToDeleteId);
    const labelName = label ? label.name : '';

    // Obtener subetiquetas vinculadas
    const childLabelIds = getDescendantsRecursive(labelToDeleteId);
    const labelsToDeleteIds = [labelToDeleteId, ...childLabelIds];

    // Obtener la opción de protección de entradas seleccionada
    const selectedOptionElement = document.querySelector('input[name="delete-post-option"]:checked');
    const selectedOption = selectedOptionElement ? selectedOptionElement.value : 'keep';

    // 1. Desasociar o eliminar entradas afectadas
    posts.forEach(post => {
        const hasDeletedLabel = post.labels && post.labels.some(id => labelsToDeleteIds.includes(id));
        if (hasDeletedLabel) {
            post.labels = post.labels.filter(id => !labelsToDeleteIds.includes(id));
            if (selectedOption === 'delete') {
                post.trashed = true;
                post.updatedAt = new Date().toISOString();
            }
        }
    });
    savePostsToStorage();

    // 2. Remover del estado global
    const updatedLabels = labels.filter(l => !labelsToDeleteIds.includes(l.id));
    setLabels(updatedLabels);
    saveLabelsToStorage();

    // 3. Auto-deseleccionar post actual si fue enviado a la papelera y no estamos en la sección de papelera
    const currentPost = posts.find(p => p.id === currentPostId);
    if (currentPost && currentPost.trashed && currentSection !== 'trash') {
        if (typeof window.showEmptyState === 'function') {
            window.showEmptyState();
        }
        setCurrentPostId(null);
    }

    // 4. Si estábamos visualizando esta etiqueta, volver a la sección "all"
    if (currentSection === 'label' && labelsToDeleteIds.includes(currentLabelFilter)) {
        switchSection('all');
    } else {
        renderSidebarLabels();
        renderFileTree();
        updateSectionCounts();
    }

    // 5. Refrescar los chips de etiquetas del editor si está abierto
    if (typeof window.renderPostLabels === 'function') {
        window.renderPostLabels();
    }

    closeDeleteLabelDialog();
    showToast(`Etiqueta "${labelName}" eliminada`);
}

// Exponer a window
window.openLabelDialog = openLabelDialog;
window.closeLabelDialog = closeLabelDialog;
window.submitLabelDialog = submitLabelDialog;
window.selectLabelColor = selectLabelColor;
window.selectCustomLabelColor = selectCustomLabelColor;
window.openEditLabelDialog = openEditLabelDialog;
window.openDeleteLabelDialog = openDeleteLabelDialog;
window.closeDeleteLabelDialog = closeDeleteLabelDialog;
window.confirmDeleteLabel = confirmDeleteLabel;
