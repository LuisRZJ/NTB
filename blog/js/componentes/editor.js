// ============================================================
// editor.js — Gestión del editor de texto, auto-guardado e interacciones
// ============================================================

import { 
    posts, 
    labels,
    currentPostId, 
    setCurrentPostId, 
    currentSection, 
    currentLabelFilter,
    setPosts
} from './state.js';
import { savePostsToStorage } from './storage.js';
import { renderFileTree, updateSectionCounts, renderSidebarLabels } from './sidebar.js';
import { showToast } from './toast.js';

let autoSaveTimeout = null;
let lastSavedTitle = '';
let lastSavedContent = '';
let lastSnapshotTime = 0;

/**
 * Muestra el editor y oculta el estado vacío.
 */
export function hideEmptyState() {
    const editorView = document.getElementById('editor-view');
    const emptyState = document.getElementById('empty-state');
    if (editorView) editorView.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');
}

/**
 * Oculta el editor y muestra el estado vacío.
 */
export function showEmptyState() {
    const editorView = document.getElementById('editor-view');
    const emptyState = document.getElementById('empty-state');
    if (editorView) editorView.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
}

/**
 * Carga una entrada en el editor y actualiza la UI.
 * 
 * @param {string} id - ID del post a cargar
 */
export function loadPost(id) {
    const post = posts.find(p => p.id === id);
    if (!post) {
        showEmptyState();
        return;
    }

    setCurrentPostId(id);
    hideEmptyState();

    // Rellenar campos del editor
    const docIcon = document.getElementById('doc-icon');
    const docTitle = document.getElementById('doc-title');
    const docContent = document.getElementById('doc-content');

    if (docIcon) docIcon.textContent = post.icon || '📄';
    if (docTitle) {
        docTitle.value = post.title || '';
        docTitle.disabled = !!post.trashed; // Deshabilitar edición si está en la papelera
    }
    if (docContent) {
        docContent.innerHTML = post.content || '';
        docContent.contentEditable = !post.trashed; // Deshabilitar edición si está en la papelera
    }

    // Actualizar breadcrumbs
    const breadcrumbTitle = document.getElementById('breadcrumb-title');
    const breadcrumbSection = document.getElementById('breadcrumb-section');

    if (breadcrumbTitle) {
        breadcrumbTitle.textContent = post.title.trim() || 'Sin Título';
    }

    if (breadcrumbSection) {
        if (currentSection === 'all') breadcrumbSection.textContent = 'Todas';
        else if (currentSection === 'favorites') breadcrumbSection.textContent = 'Favoritos';
        else if (currentSection === 'archive') breadcrumbSection.textContent = 'Archivadas';
        else if (currentSection === 'trash') breadcrumbSection.textContent = 'Papelera';
        else if (currentSection === 'label') {
            const labelObj = labels.find(l => l.id === currentLabelFilter);
            breadcrumbSection.textContent = labelObj ? `Etiqueta: ${labelObj.name}` : 'Etiqueta';
        }
    }

    // Actualizar iconos de acciones (Pin, Archivar)
    const pinIcon = document.getElementById('pin-icon');
    if (pinIcon) {
        pinIcon.textContent = post.pinned ? 'star' : 'star_border';
        pinIcon.classList.toggle('text-amber-500', !!post.pinned);
    }

    const archiveIcon = document.getElementById('archive-icon');
    const archiveBtn = document.getElementById('btn-archive');
    if (archiveIcon) {
        archiveIcon.textContent = post.archived ? 'unarchive' : 'archive';
    }
    if (archiveBtn) {
        archiveBtn.title = post.archived ? 'Desarchivar' : 'Archivar';
    }

    // Mostrar estado de guardado
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    if (statusText && statusIcon) {
        statusIcon.classList.remove('saving-pulse');
        if (post.trashed) {
            statusIcon.textContent = 'delete_outline';
            statusText.textContent = 'Solo lectura (entrada en la papelera)';
        } else {
            statusIcon.textContent = 'cloud_done';
            statusText.textContent = 'Listo';
        }
    }

    // Guardar copia local para detectar cambios
    lastSavedTitle = post.title || '';
    lastSavedContent = post.content || '';
    lastSnapshotTime = Date.now();

    // Renderizar chips de etiquetas asociadas
    renderPostLabels();

    // Aplicar fondo personalizado
    updateEditorBackgroundUI(post);

    // Resaltar en el árbol (colapsado y expandido)
    document.querySelectorAll('.file-tree-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.getElementById(`btn-post-${id}`);
    if (activeItem) activeItem.classList.add('active');

    // Resaltar en el árbol expandido
    document.querySelectorAll('.expanded-post-card').forEach(item => {
        item.classList.remove('bg-google-sidebarActive', 'dark:bg-google-sidebarActiveDark', 'text-[#001d35]', 'dark:text-[#c2e7ff]');
        item.classList.add('text-slate-700', 'dark:text-slate-200', 'hover:bg-slate-200/50', 'dark:hover:bg-slate-800/60');
    });
    const activeExpanded = document.getElementById(`exp-btn-post-${id}`);
    if (activeExpanded) {
        activeExpanded.classList.add('bg-google-sidebarActive', 'dark:bg-google-sidebarActiveDark', 'text-[#001d35]', 'dark:text-[#c2e7ff]');
        activeExpanded.classList.remove('text-slate-700', 'dark:text-slate-200', 'hover:bg-slate-200/50', 'dark:hover:bg-slate-800/60');
    }

    // Colapsar sidebar pantalla completa → modo lateral
    if (typeof window.setSidebarMode === 'function') {
        window.setSidebarMode(false);
    }
    if (typeof window.closeMobileSidebar === 'function') {
        window.closeMobileSidebar();
    }

    // Asegurar que el editor es visible
    const editorView = document.getElementById('editor-view');
    const settingsView = document.getElementById('settings-view');
    const breadcrumb = document.getElementById('editor-breadcrumb');
    const actions = document.getElementById('editor-actions');
    if (editorView) editorView.classList.remove('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (breadcrumb) { breadcrumb.classList.remove('hidden'); breadcrumb.classList.add('sm:flex'); }
    if (actions) actions.classList.remove('hidden');

    // Si estamos en móvil, cerrar el sidebar
    const mobileSidebar = document.getElementById('mobile-sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (mobileSidebar && !mobileSidebar.classList.contains('-translate-x-full')) {
        mobileSidebar.classList.add('-translate-x-full');
        if (backdrop) backdrop.classList.add('hidden');
    }
}

/**
 * Crea una nueva entrada en blanco en la sección activa, la guarda y la carga en el editor.
 */
export function createNewPost() {
    // Si la sección activa es Papelera o Ajustes, forzar ir a 'all'
    if (currentSection === 'trash' || currentSection === 'settings') {
        setCurrentSection('all');
        const allBtn = document.getElementById('section-all-btn');
        if (allBtn) {
            document.querySelectorAll('.section-tab').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
        }
    }

    const newPost = {
        id: crypto.randomUUID(),
        icon: '📄',
        background: 'default',
        title: '',
        content: '',
        pinned: false,
        archived: false,
        trashed: false,
        labels: currentSection === 'label' && currentLabelFilter ? [currentLabelFilter] : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: []
    };

    posts.unshift(newPost);
    savePostsToStorage();
    renderFileTree();
    updateSectionCounts();
    loadPost(newPost.id);

    // Dar foco al título
    const docTitle = document.getElementById('doc-title');
    if (docTitle) docTitle.focus();

    showToast('Nueva entrada creada');
}

/**
 * Activa los event listeners de auto-guardado en el editor.
 */
export function setupAutoSave() {
    const docTitle = document.getElementById('doc-title');
    const docContent = document.getElementById('doc-content');

    if (!docTitle || !docContent) return;

    const triggerSave = () => {
        if (!currentPostId) return;

        // Mostrar UI de Guardando...
        const statusText = document.getElementById('status-text');
        const statusIcon = document.getElementById('status-icon');
        if (statusText && statusIcon) {
            statusIcon.textContent = 'cloud_sync';
            statusIcon.classList.add('saving-pulse');
            statusText.textContent = 'Guardando...';
        }

        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(performAutoSave, 1500);
    };

    docTitle.addEventListener('input', triggerSave);
    docContent.addEventListener('input', triggerSave);
}

/**
 * Realiza el guardado del post actual y crea instantáneas en el historial si corresponde.
 */
function performAutoSave() {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const docTitle = document.getElementById('doc-title');
    const docContent = document.getElementById('doc-content');

    if (!docTitle || !docContent) return;

    const newTitle = docTitle.value;
    const newContent = docContent.innerHTML;

    // Verificar si hay cambios reales
    if (newTitle === lastSavedTitle && newContent === lastSavedContent) {
        resetSaveStatus();
        return;
    }

    // Decidir si creamos una instantánea (snapshot) de la versión anterior
    // Criterios: No hay historial, o ha pasado > 2 minutos, o la longitud del contenido cambió > 10%
    const now = Date.now();
    const prevContentLength = lastSavedContent.length;
    const newContentLength = newContent.length;
    const lengthDiff = Math.abs(newContentLength - prevContentLength);
    const sizeChangedSignificantly = prevContentLength > 0 && (lengthDiff / prevContentLength) > 0.1;
    const timeElapsed = (now - lastSnapshotTime) > 120000; // 2 minutos

    if (!post.history) post.history = [];

    if (post.history.length === 0 || timeElapsed || sizeChangedSignificantly) {
        const snapshot = {
            id: 'snapshot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            title: lastSavedTitle,
            content: lastSavedContent,
            timestamp: new Date().toISOString()
        };
        post.history.push(snapshot);
        // Limitar a 30 versiones
        if (post.history.length > 30) {
            post.history.shift();
        }
        lastSnapshotTime = now;
    }

    // Actualizar post
    post.title = newTitle;
    post.content = newContent;
    post.updatedAt = new Date().toISOString();

    savePostsToStorage();
    
    // Actualizar los valores guardados localmente
    lastSavedTitle = newTitle;
    lastSavedContent = newContent;

    // Actualizar breadcrumb
    const breadcrumbTitle = document.getElementById('breadcrumb-title');
    if (breadcrumbTitle) breadcrumbTitle.textContent = newTitle.trim() || 'Sin Título';

    // Actualizar en el árbol de archivos (títulos, etc.) sin perder foco del cursor
    updateFileTreeItemUI(post);
    updateSectionCounts();
    resetSaveStatus();
}

/**
 * Restablece visualmente el estado de guardado a "Listo".
 */
function resetSaveStatus() {
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    if (statusText && statusIcon) {
        statusIcon.textContent = 'cloud_done';
        statusIcon.classList.remove('saving-pulse');
        statusText.textContent = 'Guardado';
    }
}

/**
 * Actualiza el texto de un ítem individual en el árbol de navegación para no redibujar todo
 * y evitar pérdida de foco o saltos visuales durante la edición.
 */
function updateFileTreeItemUI(post) {
    const btn = document.getElementById(`btn-post-${post.id}`);
    if (btn) {
        const titleSpan = btn.querySelector('.truncate');
        if (titleSpan) {
            titleSpan.textContent = post.title.trim() || 'Sin Título';
        }
        const iconSpan = btn.querySelector('span:first-child');
        if (iconSpan) {
            iconSpan.textContent = post.icon || '📄';
        }
    } else {
        // Si no existía, redibujar completo
        renderFileTree();
    }
}

/**
 * Ejecuta comandos de edición enriquecida.
 * 
 * @param {string} command 
 * @param {string} value 
 */
export function formatDoc(command, value = null) {
    document.execCommand(command, false, value);
    // Disparar evento input para activar auto-guardado
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.dispatchEvent(new Event('input'));
    }
}

/**
 * Aplica formato de código en línea a la selección.
 */
export function formatInlineCode() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (selectedText) {
        const codeElement = document.createElement('code');
        codeElement.textContent = selectedText;
        range.deleteContents();
        range.insertNode(codeElement);
        // Colocar el cursor al final del nuevo elemento
        range.setStartAfter(codeElement);
        range.setEndAfter(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
        
        const docContent = document.getElementById('doc-content');
        if (docContent) docContent.dispatchEvent(new Event('input'));
    } else {
        // Si no hay selección, insertar un fragmento vacío para escribir
        const codeElement = document.createElement('code');
        codeElement.innerHTML = 'código';
        range.insertNode(codeElement);
        range.selectNodeContents(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

/**
 * Inserta un bloque de código (pre).
 */
export function formatCodeBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString() || 'Bloque de código...';
    
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = selectedText;
    pre.appendChild(code);
    
    range.deleteContents();
    range.insertNode(pre);
    
    // Insertar un párrafo vacío después para facilitar seguir escribiendo
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    pre.after(p);
    
    range.setStartAfter(p);
    range.setEndAfter(p);
    selection.removeAllRanges();
    selection.addRange(range);
    
    const docContent = document.getElementById('doc-content');
    if (docContent) docContent.dispatchEvent(new Event('input'));
}

/**
 * Inserta una lista de tareas (checklist).
 */
export function insertTaskList() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    const container = document.createElement('div');
    container.className = 'task-list-item flex items-start gap-2 my-1';
    
    // Agregamos inline el onclick para registrar el estado 'checked' en el HTML persistido
    container.innerHTML = `
        <input type="checkbox" class="rounded text-google-blue border-slate-300 focus:ring-google-blue shrink-0 mt-1" onclick="this.setAttribute('checked', this.checked ? 'checked' : '')">
        <span class="outline-none flex-1 min-w-0" contenteditable="true">Tarea...</span>
    `;
    
    range.deleteContents();
    range.insertNode(container);
    
    // Colocar el foco en el texto
    const span = container.querySelector('span');
    if (span) {
        const textRange = document.createRange();
        textRange.selectNodeContents(span);
        selection.removeAllRanges();
        selection.addRange(textRange);
        span.focus();
    }
    
    const docContent = document.getElementById('doc-content');
    if (docContent) docContent.dispatchEvent(new Event('input'));
}

/**
 * Inserta una imagen pidiendo la URL y el texto alternativo.
 */
export function insertImage() {
    const url = prompt('Introduce la URL de la imagen:');
    if (url) {
        const alt = prompt('Texto alternativo de la imagen (opcional):') || 'Imagen';
        formatDoc('insertImage', url);
        
        // Darle un estilo de max-width a todas las imágenes del documento
        setTimeout(() => {
            const docContent = document.getElementById('doc-content');
            if (docContent) {
                const imgs = docContent.querySelectorAll('img');
                imgs.forEach(img => {
                    if (img.src === url && !img.className) {
                        img.className = 'max-w-full h-auto rounded-2xl border border-slate-200 dark:border-slate-800 my-4';
                        img.alt = alt;
                    }
                });
                docContent.dispatchEvent(new Event('input'));
            }
        }, 50);
    }
}

/**
 * Inserta una tabla interactiva pidiendo dimensiones.
 */
export function insertTable() {
    const rowsInput = prompt('Número de filas:', '3');
    const colsInput = prompt('Número de columnas:', '3');
    
    const rows = parseInt(rowsInput || '0');
    const cols = parseInt(colsInput || '0');
    
    if (rows > 0 && cols > 0) {
        let html = '<table class="w-full my-4 border-collapse border border-slate-200 dark:border-slate-800 text-sm">';
        // Cabecera
        html += '<thead><tr class="bg-slate-100 dark:bg-slate-800/50">';
        for (let c = 0; c < cols; c++) {
            html += `<th class="border border-slate-200 dark:border-slate-800 px-3 py-2 font-semibold text-left">Cabecera ${c+1}</th>`;
        }
        html += '</tr></thead><tbody>';
        // Filas
        for (let r = 0; r < rows; r++) {
            html += '<tr>';
            for (let c = 0; c < cols; c++) {
                html += `<td class="border border-slate-200 dark:border-slate-800 px-3 py-2">Fila ${r+1} Col ${c+1}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table><p><br></p>';
        
        const selection = window.getSelection();
        if (selection.rangeCount) {
            const range = selection.getRangeAt(0);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            range.deleteContents();
            
            // Insertar los elementos de la tabla
            let lastNode = null;
            while (wrapper.firstChild) {
                lastNode = wrapper.firstChild;
                range.insertNode(lastNode);
            }
            
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.setEndAfter(lastNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            
            const docContent = document.getElementById('doc-content');
            if (docContent) docContent.dispatchEvent(new Event('input'));
        }
    }
}

/**
 * Fija o desfija la entrada actual en favoritos.
 */
export function toggleCurrentPostPin() {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    post.pinned = !post.pinned;
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();

    const pinIcon = document.getElementById('pin-icon');
    if (pinIcon) {
        pinIcon.textContent = post.pinned ? 'star' : 'star_border';
        pinIcon.classList.toggle('text-amber-500', post.pinned);
    }

    renderFileTree();
    updateSectionCounts();

    showToast(post.pinned ? 'Entrada fijada en favoritos' : 'Entrada desfijada de favoritos');
}

/**
 * Archiva o desarchiva la entrada actual.
 */
export function archiveCurrentPost() {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    post.archived = !post.archived;
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();

    renderFileTree();
    updateSectionCounts();

    const msg = post.archived ? 'Entrada archivada' : 'Entrada desarchivada';
    showToast(msg);

    // Redirigir a otro post de la sección si el archivado ya no pertenece aquí
    if (currentSection === 'all' && post.archived) {
        loadNextAvailablePost();
    } else if (currentSection === 'archive' && !post.archived) {
        loadNextAvailablePost();
    } else {
        // Recargar el post para actualizar icono
        loadPost(post.id);
    }
}

/**
 * Envía la entrada actual a la papelera (con soporte para deshacer).
 */
export function trashCurrentPost() {
    if (!currentPostId) return;

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const isTrashed = post.trashed;

    if (isTrashed) {
        // Si ya está en papelera, eliminar permanentemente
        if (confirm('¿Eliminar permanentemente esta entrada? Esta acción no se puede deshacer.')) {
            const index = posts.findIndex(p => p.id === currentPostId);
            if (index !== -1) {
                posts.splice(index, 1);
                savePostsToStorage();
                renderFileTree();
                updateSectionCounts();
                showToast('Entrada eliminada permanentemente');
                loadNextAvailablePost();
            }
        }
    } else {
        // Mover a papelera común
        post.trashed = true;
        post.updatedAt = new Date().toISOString();
        savePostsToStorage();

        renderFileTree();
        updateSectionCounts();

        // Cargar siguiente disponible
        loadNextAvailablePost();

        showToast('Entrada movida a la papelera', 'Deshacer', () => {
            post.trashed = false;
            post.updatedAt = new Date().toISOString();
            savePostsToStorage();
            renderFileTree();
            updateSectionCounts();
            loadPost(post.id);
        });
    }
}

/**
 * Carga el primer post disponible según los filtros actuales de la sección activa,
 * o muestra la vista vacía si no queda ninguno.
 */
function loadNextAvailablePost() {
    let sectionPosts = posts.filter(post => {
        if (currentSection === 'all') return !post.trashed && !post.archived;
        if (currentSection === 'favorites') return post.pinned && !post.trashed;
        if (currentSection === 'archive') return post.archived && !post.trashed;
        if (currentSection === 'trash') return post.trashed;
        if (currentSection === 'label') return !post.trashed && !post.archived && post.labels && post.labels.includes(currentLabelFilter);
        return true;
    });

    if (sectionPosts.length > 0) {
        loadPost(sectionPosts[0].id);
    } else {
        setCurrentPostId(null);
        showEmptyState();
    }
}

const EMOJI_CATEGORIES = [
    {
        name: 'Populares',
        emojis: ['📝', '💻', '💡', '🚀', '🔥', '✨', '📌', '🎨', '💼', '📚', '✅', '❤️', '🌟', '🎉', '🛠️', '🧭']
    },
    {
        name: 'Escribir & Trabajo',
        emojis: ['📄', '✏️', '✒️', '📅', '📊', '📎', '📁', '📇', '🖨️', '✉️', '📞', '🔍', '⚙️', '🔒', '🔑', '🏷️']
    },
    {
        name: 'Emociones & Caras',
        emojis: ['😀', '😉', '😎', '🤔', '😮', '😴', '🥳', '👻', '🤖', '👾', '👍', '👏', '🙌', '🤝', '💪', '🧠']
    },
    {
        name: 'Objetos & Símbolos',
        emojis: ['🔋', '📱', '🔔', '📣', '🎁', '🏆', '💎', '🎵', '📷', '🌍', '🏠', '🚗', '⏳', '🎯', '⚡']
    }
];

const SOLID_COLORS = [
    { name: 'Gris Claro', value: '#f1f3f4' },
    { name: 'Azul Claro', value: '#e8f0fe' },
    { name: 'Verde Claro', value: '#e6f4ea' },
    { name: 'Amarillo Claro', value: '#fef7e0' },
    { name: 'Rojo Claro', value: '#fce8e6' },
    { name: 'Lavanda', value: '#f3e8fd' },
    { name: 'Azul Noche', value: '#0d1b2a' },
    { name: 'Verde Bosque', value: '#1b4332' },
    { name: 'Chocolate', value: '#2b1c1c' },
    { name: 'Púrpura Oscuro', value: '#1d0f2b' }
];

const GRADIENTS = [
    { name: 'Aurora Borealis', value: 'linear-gradient(135deg, #1fa2ff 0%, #12d8fa 50%, #a6ffcb 100%)' },
    { name: 'Sunset Glow', value: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)' },
    { name: 'Ocean Breeze', value: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)' },
    { name: 'Deep Lavender', value: 'linear-gradient(135deg, #654ea3 0%, #eaafc8 100%)' },
    { name: 'Glassmorphic Aurora', value: 'linear-gradient(135deg, #8ec5fc 0%, #e0c3fc 100%)' },
    { name: 'Dark Cyber', value: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' }
];

/**
 * Abre el diálogo de Emoji Picker personalizado.
 */
export function changePostIcon() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const backdrop = document.getElementById('icon-picker-backdrop');
    if (!backdrop) return;

    // Resetear inputs
    const searchInput = document.getElementById('emoji-search-input');
    const manualInput = document.getElementById('manual-emoji-input');
    if (searchInput) searchInput.value = '';
    if (manualInput) manualInput.value = '';

    renderEmojis();
    backdrop.classList.remove('hidden');
}

/**
 * Cierra el diálogo de Emoji Picker.
 */
export function closeIconPicker() {
    const backdrop = document.getElementById('icon-picker-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

/**
 * Renderiza la grilla de emojis en el Emoji Picker.
 */
export function renderEmojis(filterQuery = '') {
    const container = document.getElementById('emoji-categories-container');
    if (!container) return;

    container.innerHTML = '';
    const query = filterQuery.toLowerCase().trim();

    if (query) {
        const allFiltered = [];
        EMOJI_CATEGORIES.forEach(cat => {
            cat.emojis.forEach(emoji => {
                if (emoji.includes(query)) {
                    allFiltered.push(emoji);
                }
            });
        });

        // Emojis de fallback básicos
        const keywordsMap = {
            'nota': ['📝', '📄', '✏️', '✒️', '📚'],
            'escribir': ['📝', '✏️', '✒️'],
            'tech': ['💻', '📱', '🔋', '⚡', '🤖', '👾'],
            'web': ['💻', '🌍', '⚡'],
            'idea': ['💡', '⚡', '🧠'],
            'cohete': ['🚀', '🔥'],
            'fuego': ['🔥'],
            'estrella': ['✨', '🌟'],
            'pin': ['📌'],
            'arte': ['🎨'],
            'trabajo': ['💼', '📅', '📊', '📎'],
            'check': ['✅'],
            'amor': ['❤️'],
            'corazon': ['❤️'],
            'fiesta': ['🎉', '🥳'],
            'herramienta': ['🛠️', '⚙️'],
            'brujula': ['🧭'],
            'cara': ['😀', '😉', '😎', '🤔', '😮', '😴', '🥳'],
            'feliz': ['😀', '😉', '😎', '🥳', '👍'],
            'pensar': ['🤔', '🧠'],
            'robot': ['🤖', '👾'],
            'juego': ['👾'],
            'mano': ['👍', '👏', '🙌', '🤝'],
            'fuerza': ['💪'],
            'cerebro': ['🧠'],
            'musica': ['🎵'],
            'foto': ['📷'],
            'mundo': ['🌍'],
            'casa': ['🏠'],
            'carro': ['🚗'],
            'reloj': ['⏳']
        };

        Object.keys(keywordsMap).forEach(key => {
            if (key.includes(query) || query.includes(key)) {
                keywordsMap[key].forEach(emoji => {
                    if (!allFiltered.includes(emoji)) {
                        allFiltered.push(emoji);
                    }
                });
            }
        });

        if (allFiltered.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No se encontraron emojis</p>';
            return;
        }

        const title = document.createElement('h4');
        title.className = 'emoji-category-title';
        title.textContent = 'Resultados de búsqueda';
        container.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'emoji-grid';
        allFiltered.forEach(emoji => {
            const item = document.createElement('div');
            item.className = 'emoji-item';
            item.textContent = emoji;
            item.onclick = () => selectIcon(emoji);
            grid.appendChild(item);
        });
        container.appendChild(grid);
    } else {
        EMOJI_CATEGORIES.forEach(cat => {
            const title = document.createElement('h4');
            title.className = 'emoji-category-title';
            title.textContent = cat.name;
            container.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'emoji-grid';
            cat.emojis.forEach(emoji => {
                const item = document.createElement('div');
                item.className = 'emoji-item';
                item.textContent = emoji;
                item.onclick = () => selectIcon(emoji);
                grid.appendChild(item);
            });
            container.appendChild(grid);
        });
    }
}

/**
 * Asigna el emoji seleccionado al post actual.
 */
export function selectIcon(emoji) {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const cleanIcon = emoji.trim() || '📄';
    post.icon = cleanIcon;
    post.updatedAt = new Date().toISOString();

    savePostsToStorage();

    const docIcon = document.getElementById('doc-icon');
    if (docIcon) docIcon.textContent = cleanIcon;

    updateFileTreeItemUI(post);
    closeIconPicker();
}

/**
 * Guarda un emoji escrito/pegado de forma manual.
 */
export function saveManualEmoji() {
    const input = document.getElementById('manual-emoji-input');
    if (!input) return;

    const val = input.value.trim();
    if (!val) {
        showToast('Introduce un emoji válido');
        return;
    }

    selectIcon(val);
}

/**
 * Filtra los emojis de la grilla según la búsqueda.
 */
export function searchEmojis(query) {
    renderEmojis(query);
}

/**
 * Abre el diálogo de Background Picker.
 */
export function openBackgroundDialog() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const backdrop = document.getElementById('background-picker-backdrop');
    if (!backdrop) return;

    const solidGrid = document.getElementById('solid-colors-grid');
    const gradGrid = document.getElementById('gradients-grid');
    const customColorInput = document.getElementById('custom-solid-color');

    // Poblar Colores Sólidos
    if (solidGrid) {
        solidGrid.innerHTML = '';
        SOLID_COLORS.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color.value;
            swatch.title = color.name;
            if (post.background === color.value) {
                swatch.classList.add('active');
            }
            swatch.onclick = () => {
                document.querySelectorAll('.color-swatch, .gradient-swatch').forEach(el => el.classList.remove('active'));
                swatch.classList.add('active');
                applyPostBackground(color.value);
            };
            solidGrid.appendChild(swatch);
        });
    }

    // Poblar Gradientes
    if (gradGrid) {
        gradGrid.innerHTML = '';
        GRADIENTS.forEach(grad => {
            const swatch = document.createElement('button');
            swatch.className = 'gradient-swatch';
            swatch.style.background = grad.value;
            if (post.background === grad.value) {
                swatch.classList.add('active');
            }
            
            const label = document.createElement('span');
            label.textContent = grad.name;
            swatch.appendChild(label);

            swatch.onclick = () => {
                document.querySelectorAll('.color-swatch, .gradient-swatch').forEach(el => el.classList.remove('active'));
                swatch.classList.add('active');
                applyPostBackground(grad.value);
            };
            gradGrid.appendChild(swatch);
        });
    }

    // Inicializar input de color personalizado
    if (customColorInput) {
        const isCustom = post.background && !SOLID_COLORS.some(c => c.value === post.background) && !GRADIENTS.some(g => g.value === post.background);
        customColorInput.value = isCustom && post.background.startsWith('#') ? post.background : '#ffffff';
    }

    backdrop.classList.remove('hidden');
}

/**
 * Cierra el diálogo de Background Picker.
 */
export function closeBackgroundDialog() {
    const backdrop = document.getElementById('background-picker-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

/**
 * Guarda y aplica el fondo seleccionado al post.
 */
export function applyPostBackground(bgValue) {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    post.background = bgValue;
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();

    updateEditorBackgroundUI(post);
}

/**
 * Aplica un color sólido libre (personalizado).
 */
export function applyCustomSolidColor(hexValue) {
    applyPostBackground(hexValue);
}

/**
 * Remueve el fondo personalizado del post actual.
 */
export function removePostBackground() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    post.background = 'default';
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();

    updateEditorBackgroundUI(post);

    document.querySelectorAll('.color-swatch, .gradient-swatch').forEach(el => el.classList.remove('active'));
    closeBackgroundDialog();
}

/**
 * Actualiza la UI del editor con el fondo y la legibilidad adaptativa del post.
 */
export function updateEditorBackgroundUI(post) {
    const editorView = document.getElementById('editor-view');
    if (!editorView) return;

    editorView.classList.remove('has-custom-bg', 'text-light-contrast', 'text-dark-contrast');
    editorView.style.background = '';

    if (post && post.background && post.background !== 'default') {
        editorView.classList.add('has-custom-bg');
        editorView.style.background = post.background;

        const contrast = getContrastColor(post.background);
        if (contrast === '#ffffff') {
            editorView.classList.add('text-light-contrast');
        } else {
            editorView.classList.add('text-dark-contrast');
        }
    }
}

/**
 * Calcula la legibilidad (contraste) de un color de fondo para saber si aplicar texto oscuro o claro.
 */
function getContrastColor(bgValue) {
    if (!bgValue || bgValue === 'default') return null;

    let colorToAnalyze = bgValue;
    
    if (bgValue.includes('gradient')) {
        const hexMatches = bgValue.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g);
        if (hexMatches && hexMatches.length > 0) {
            colorToAnalyze = hexMatches[0];
        } else {
            const rgbMatches = bgValue.match(/rgb\([^)]+\)|rgba\([^)]+\)/g);
            if (rgbMatches && rgbMatches.length > 0) {
                colorToAnalyze = rgbMatches[0];
            } else {
                return '#ffffff';
            }
        }
    }

    if (colorToAnalyze.startsWith('rgb')) {
        const rgbValues = colorToAnalyze.match(/\d+/g);
        if (rgbValues && rgbValues.length >= 3) {
            const r = parseInt(rgbValues[0]);
            const g = parseInt(rgbValues[1]);
            const b = parseInt(rgbValues[2]);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return yiq >= 128 ? '#1e293b' : '#ffffff';
        }
    }

    const hex = colorToAnalyze.replace('#', '');
    let r = 255, g = 255, b = 255;
    if (hex.length === 3) {
        r = parseInt(hex.substr(0, 1) + hex.substr(0, 1), 16);
        g = parseInt(hex.substr(1, 1) + hex.substr(1, 1), 16);
        b = parseInt(hex.substr(2, 1) + hex.substr(2, 1), 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
    }
    
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#1e293b' : '#ffffff';
}

export function renderPostLabels() {
    const container = document.getElementById('post-labels-chips');
    if (!container) return;

    container.innerHTML = '';

    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.labels || post.labels.length === 0) {
        container.innerHTML = '<span class="text-xs text-slate-400 dark:text-slate-500 italic">Sin etiquetas</span>';
        return;
    }

    post.labels.forEach(labelId => {
        const labelObj = labels.find(l => l.id === labelId);
        if (labelObj) {
            const chip = document.createElement('span');
            chip.className = 'px-2 py-0.5 text-xs rounded-full border flex items-center gap-1 font-medium transition-all';
            
            // Aplicar estilo de color si existe
            if (labelObj.color) {
                chip.style.borderColor = `${labelObj.color}40`; // 25% opacidad para borde
                chip.style.backgroundColor = `${labelObj.color}15`; // ~8% opacidad de fondo
                chip.style.color = labelObj.color;
            } else {
                chip.className += ' bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
            }

            chip.innerHTML = `
                <span>${labelObj.name}</span>
                ${!post.trashed ? `
                    <span class="material-symbols-outlined text-[10px] cursor-pointer opacity-70 hover:opacity-100 hover:text-red-500 transition-opacity" onclick="event.stopPropagation(); removeLabelFromPost('${labelObj.id}')">close</span>
                ` : ''}
            `;
            container.appendChild(chip);
        }
    });
}

/**
 * Quita una etiqueta específica del post activo.
 * 
 * @param {string} labelId 
 */
export function removeLabelFromPost(labelId) {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    post.labels = (post.labels || []).filter(id => id !== labelId);
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();
    renderPostLabels();
    renderFileTree();
    updateSectionCounts();
}

export function openPostLabelSelector() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const btn = document.querySelector('#post-labels-container button');
    const selector = document.getElementById('post-label-selector');
    const backdrop = document.getElementById('post-label-selector-backdrop');

    if (!btn || !selector || !backdrop) return;

    // Renderizar listado de etiquetas primero para poder medir la altura real
    selector.innerHTML = '';
    if (labels.length === 0) {
        selector.innerHTML = '<p class="text-xs text-slate-400 dark:text-slate-500 text-center py-2">No hay etiquetas creadas</p>';
    } else {
        const rootLabels = labels.filter(l => !l.parentId || !labels.some(p => p.id === l.parentId));
        const subLabels = labels.filter(l => l.parentId && labels.some(p => p.id === l.parentId));

        const addLabelCheckbox = (label, isSub = false) => {
            const isChecked = post.labels && post.labels.includes(label.id);
            const item = document.createElement('label');
            
            const indentStyle = isSub ? 'pl-6' : '';
            const subIndicator = isSub 
                ? `<span class="material-symbols-outlined text-[15px] text-slate-400 dark:text-slate-500 shrink-0 select-none -mr-1">subdirectory_arrow_right</span>` 
                : '';
                
            item.className = `flex items-center gap-2 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer select-none text-sm text-slate-700 dark:text-slate-200 ${indentStyle}`;
            item.innerHTML = `
                ${subIndicator}
                <input type="checkbox" class="rounded text-google-blue border-slate-300 focus:ring-google-blue shrink-0" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="togglePostLabel('${label.id}', this.checked)">
                <span class="truncate">${label.name}</span>
            `;
            selector.appendChild(item);
        };

        rootLabels.forEach(root => {
            addLabelCheckbox(root, false);
            const children = subLabels.filter(l => l.parentId === root.id);
            children.forEach(child => {
                addLabelCheckbox(child, true);
            });
        });
    }

    // Mostrar temporalmente para medir
    backdrop.classList.remove('hidden');
    selector.classList.remove('hidden');

    // Calcular posición óptima del selector flotante para evitar desbordar por debajo
    const rect = btn.getBoundingClientRect();
    const selectorHeight = selector.offsetHeight || 200;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < selectorHeight + 20) {
        // Si no cabe abajo, lo mostramos arriba del botón
        selector.style.top = `${rect.top + window.scrollY - selectorHeight - 8}px`;
    } else {
        // De lo contrario, se muestra abajo de manera estándar
        selector.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }
    
    // Ajustar límite horizontal para no salirse de los lados de la pantalla
    const maxLeft = window.innerWidth - selector.offsetWidth - 16;
    selector.style.left = `${Math.max(16, Math.min(rect.left + window.scrollX, maxLeft))}px`;
}

/**
 * Cierra el seleccionador flotante de etiquetas.
 */
export function closePostLabelSelector() {
    const selector = document.getElementById('post-label-selector');
    const backdrop = document.getElementById('post-label-selector-backdrop');
    if (selector) selector.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

/**
 * Añade o remueve una etiqueta al post activo al cambiar un checkbox del seleccionador.
 * 
 * @param {string} labelId 
 * @param {boolean} isChecked 
 */
export function togglePostLabel(labelId, isChecked) {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    if (!post.labels) post.labels = [];

    if (isChecked) {
        if (!post.labels.includes(labelId)) {
            post.labels.push(labelId);
        }
    } else {
        post.labels = post.labels.filter(id => id !== labelId);
    }

    post.updatedAt = new Date().toISOString();
    savePostsToStorage();
    renderPostLabels();
    renderFileTree();
    updateSectionCounts();
}

// Exponer funciones al objeto global para eventos inline
window.loadPost = loadPost;
window.createNewPost = createNewPost;
window.formatDoc = formatDoc;
window.formatInlineCode = formatInlineCode;
window.formatCodeBlock = formatCodeBlock;
window.insertTaskList = insertTaskList;
window.insertImage = insertImage;
window.insertTable = insertTable;
window.toggleCurrentPostPin = toggleCurrentPostPin;
window.archiveCurrentPost = archiveCurrentPost;
window.trashCurrentPost = trashCurrentPost;
window.changePostIcon = changePostIcon;
window.openPostLabelSelector = openPostLabelSelector;
window.closePostLabelSelector = closePostLabelSelector;
window.togglePostLabel = togglePostLabel;
window.removeLabelFromPost = removeLabelFromPost;
window.showEmptyState = showEmptyState;
window.hideEmptyState = hideEmptyState;

// Nuevas funciones de Iconos y Fondos personalizados
window.closeIconPicker = closeIconPicker;
window.searchEmojis = searchEmojis;
window.saveManualEmoji = saveManualEmoji;
window.openBackgroundDialog = openBackgroundDialog;
window.closeBackgroundDialog = closeBackgroundDialog;
window.applyPostBackground = applyPostBackground;
window.applyCustomSolidColor = applyCustomSolidColor;
window.removePostBackground = removePostBackground;
