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
import { initializeDatabases, cleanDatabasesBeforeSave, insertDatabase } from './database.js';

let autoSaveTimeout = null;
let lastSavedTitle = '';
let lastSavedContent = '';
let lastSnapshotTime = 0;

let currentColorCommand = null;
let lastColorSelectionRange = null;
let lastInternalLinkSelectionRange = null;
let lastTableSelectionRange = null;
let activeTableCell = null;

const FORMAT_COLORS = [
    { name: 'Negro', hex: '#000000' },
    { name: 'Gris Oscuro', hex: '#4b5563' },
    { name: 'Gris Claro', hex: '#d1d5db' },
    { name: 'Blanco', hex: '#ffffff' },
    { name: 'Rojo', hex: '#ef4444' },
    { name: 'Rojo Pastel', hex: '#fee2e2' },
    { name: 'Naranja', hex: '#f97316' },
    { name: 'Amarillo', hex: '#eab308' },
    { name: 'Amarillo Pastel', hex: '#fef9c3' },
    { name: 'Verde', hex: '#22c55e' },
    { name: 'Verde Pastel', hex: '#dcfce7' },
    { name: 'Azul', hex: '#3b82f6' },
    { name: 'Azul Pastel', hex: '#dbeafe' },
    { name: 'Púrpura', hex: '#a855f7' },
    { name: 'Rosa', hex: '#ec4899' }
];

function colorsMatch(c1, c2) {
    if (!c1 || !c2) return false;
    c1 = c1.trim().toLowerCase();
    c2 = c2.trim().toLowerCase();
    if (c1 === c2) return true;
    
    const toRgb = (color) => {
        if (color.startsWith('rgb')) {
            return color.replace(/\s+/g, '');
        }
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            let r, g, b;
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else {
                return color;
            }
            return `rgb(${r},${g},${b})`;
        }
        return color;
    };
    
    const r1 = toRgb(c1);
    const r2 = toRgb(c2);
    const isTransparent = (val) => val === 'transparent' || val === 'rgba(0,0,0,0)' || val === 'rgba(0, 0, 0, 0)';
    if (isTransparent(r1) && isTransparent(r2)) return true;
    
    return r1 === r2;
}

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
        initializeDatabases();
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

    // Aplicar foto de portada
    updateEditorCoverUI(post);

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
        databases: {},
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
    const newContentCleaned = cleanDatabasesBeforeSave(newContent);

    // Verificar si hay cambios reales
    if (newTitle === lastSavedTitle && newContentCleaned === lastSavedContent) {
        resetSaveStatus();
        return;
    }

    // Decidir si creamos una instantánea (snapshot) de la versión anterior
    // Criterios: No hay historial, o ha pasado > 2 minutos, o la longitud del contenido cambió > 10%
    const now = Date.now();
    const prevContentLength = lastSavedContent.length;
    const newContentLength = newContentCleaned.length;
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
    post.content = newContentCleaned;
    post.updatedAt = new Date().toISOString();

    savePostsToStorage();
    
    // Actualizar los valores guardados localmente
    lastSavedTitle = newTitle;
    lastSavedContent = newContentCleaned;

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
    if (command === 'formatBlock') {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            let node = selection.getRangeAt(0).startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            const activeBlock = node.closest(value);
            if (activeBlock) {
                // Si el formato ya está activo, cambiar a un párrafo normal (p) para desaplicar
                document.execCommand('formatBlock', false, 'p');
                triggerEditorInput();
                return;
            }
        }
    }
    document.execCommand(command, false, value);
    triggerEditorInput();
}

function triggerEditorInput() {
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.dispatchEvent(new Event('input'));
    }
    updateToolbarState();
}

export function formatInlineCode() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    
    const codeNode = node.closest('code');
    // Verificar que no sea un bloque de código (que está envuelto en PRE)
    if (codeNode && (!codeNode.parentNode || codeNode.parentNode.tagName !== 'PRE')) {
        // Alternar (Desaplicar): quitar la etiqueta code y reestablecer texto
        const textNode = document.createTextNode(codeNode.textContent);
        codeNode.parentNode.replaceChild(textNode, codeNode);
        
        const newRange = document.createRange();
        newRange.selectNodeContents(textNode);
        selection.removeAllRanges();
        selection.addRange(newRange);
        triggerEditorInput();
        return;
    }
    
    const selectedText = range.toString();
    if (selectedText) {
        const codeElement = document.createElement('code');
        codeElement.textContent = selectedText;
        range.deleteContents();
        range.insertNode(codeElement);
        range.setStartAfter(codeElement);
        range.setEndAfter(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
        triggerEditorInput();
    } else {
        const codeElement = document.createElement('code');
        codeElement.innerHTML = 'código';
        range.insertNode(codeElement);
        range.selectNodeContents(codeElement);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

export function formatCodeBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    
    const preNode = node.closest('pre');
    if (preNode) {
        // Alternar (Desaplicar): desarmar el bloque de código en párrafos normales
        const codeNode = preNode.querySelector('code');
        const text = codeNode ? codeNode.textContent : preNode.textContent;
        
        const lines = text.split('\n');
        const fragment = document.createDocumentFragment();
        lines.forEach(line => {
            const p = document.createElement('p');
            p.textContent = line || '\u00A0';
            fragment.appendChild(p);
        });
        
        preNode.parentNode.replaceChild(fragment, preNode);
        triggerEditorInput();
        return;
    }
    
    const selectedText = range.toString() || 'Bloque de código...';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = selectedText;
    pre.appendChild(code);
    
    range.deleteContents();
    range.insertNode(pre);
    
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    pre.after(p);
    
    range.setStartAfter(p);
    range.setEndAfter(p);
    selection.removeAllRanges();
    selection.addRange(range);
    triggerEditorInput();
}

/**
 * Inserta un enlace pidiendo el texto y la URL, haciéndolo funcional.
 */
export function insertLink() {
    const selection = window.getSelection();
    let selectedText = '';
    if (selection.rangeCount > 0) {
        selectedText = selection.toString();
    }

    const url = prompt('Introduce la URL del enlace:');
    if (!url) return;

    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl;
    }

    const text = prompt('Texto a mostrar:', selectedText || url) || url;

    const a = document.createElement('a');
    a.href = formattedUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    a.className = 'editor-link hover:underline text-google-blue dark:text-google-blueDark';

    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        
        range.setStartAfter(a);
        range.setEndAfter(a);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        const range = selection.getRangeAt(0);
        range.insertNode(a);
        range.setStartAfter(a);
        range.setEndAfter(a);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    triggerEditorInput();
}

/**
 * Actualiza el estado activo de los botones en la barra de herramientas.
 */
export function updateToolbarState() {
    const docContent = document.getElementById('doc-content');
    if (!docContent) return;

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    let range = selection.getRangeAt(0);
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
    }

    if (!docContent.contains(node)) return;

    const states = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikethrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        h1: false,
        h2: false,
        h3: false,
        blockquote: false,
        code: false,
        pre: false,
        link: false,
        textColor: false,
        highlightColor: false
    };

    let current = node;
    while (current && current !== docContent) {
        const tag = current.tagName;
        if (tag === 'H1') states.h1 = true;
        if (tag === 'H2') states.h2 = true;
        if (tag === 'H3') states.h3 = true;
        if (tag === 'BLOCKQUOTE') states.blockquote = true;
        if (tag === 'CODE') {
            if (current.parentNode && current.parentNode.tagName === 'PRE') {
                states.pre = true;
            } else {
                states.code = true;
            }
        }
        if (tag === 'PRE') states.pre = true;
        if (tag === 'A') states.link = true;
        
        // Comprobar si hay colores aplicados inline
        if (current.style && current.style.color && current.style.color !== 'inherit' && current.style.color !== 'initial') {
            states.textColor = true;
        }
        if (current.tagName === 'FONT' && current.hasAttribute('color') && current.getAttribute('color') !== 'inherit') {
            states.textColor = true;
        }
        if (current.style && current.style.backgroundColor && current.style.backgroundColor !== 'transparent' && current.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            states.highlightColor = true;
        }
        
        current = current.parentNode;
    }

    updateButtonState('btn-bold', states.bold);
    updateButtonState('btn-italic', states.italic);
    updateButtonState('btn-underline', states.underline);
    updateButtonState('btn-strikethrough', states.strikethrough);
    updateButtonState('btn-text-color', states.textColor);
    updateButtonState('btn-highlight-color', states.highlightColor);
    updateButtonState('btn-unordered-list', states.insertUnorderedList);
    updateButtonState('btn-ordered-list', states.insertOrderedList);
    updateButtonState('btn-h1', states.h1);
    updateButtonState('btn-h2', states.h2);
    updateButtonState('btn-h3', states.h3);
    updateButtonState('btn-blockquote', states.blockquote);
    updateButtonState('btn-inline-code', states.code);
    updateButtonState('btn-code-block', states.pre);
    updateButtonState('btn-link', states.link);

    // Actualizar barra de herramientas contextual de tablas
    updateTableContextToolbar();
}

function updateButtonState(id, isActive) {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (isActive) {
        btn.classList.add('toolbar-btn-active');
    } else {
        btn.classList.remove('toolbar-btn-active');
    }
}

/**
 * Inicializa el observador de la barra de herramientas y la navegación de enlaces.
 */
export function initToolbarStateObserver() {
    document.addEventListener('selectionchange', updateToolbarState);
    
    // Configurar enlaces funcionales al hacer clic dentro del editor
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.addEventListener('click', (e) => {
            const a = e.target.closest('a');
            if (a) {
                const postId = a.getAttribute('data-post-id');
                if (postId) {
                    window.loadPost(postId);
                } else {
                    window.open(a.href, '_blank');
                }
                e.preventDefault();
            }
        });
    }

    // Ocultar barra de tabla al hacer scroll
    const scrollContainer = document.querySelector('.flex-1.overflow-y-auto') || document.getElementById('main-workspace');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
            const toolbar = document.getElementById('table-context-toolbar');
            if (toolbar) {
                toolbar.classList.add('hidden');
                activeTableCell = null;
            }
        });
    }
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
 * Inserta una tabla de un tamaño específico.
 */
export function insertTableWithSize(rows, cols) {
    closeTableGridSelector();

    // Restaurar selección
    if (lastTableSelectionRange) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(lastTableSelectionRange);
    }

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    let html = '<table class="w-full my-4 border-collapse border border-slate-200 dark:border-slate-800 text-sm">';
    // Cabecera (thead)
    html += '<thead><tr class="bg-slate-100 dark:bg-slate-800/50">';
    for (let c = 1; c <= cols; c++) {
        html += `<th class="border border-slate-200 dark:border-slate-800 px-3 py-2 font-semibold text-left">Cabecera ${c}</th>`;
    }
    html += '</tr></thead><tbody>';
    // Filas (tbody)
    for (let r = 1; r <= rows; r++) {
        html += '<tr>';
        for (let c = 1; c <= cols; c++) {
            html += `<td class="border border-slate-200 dark:border-slate-800 px-3 py-2"><br></td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';

    const range = selection.getRangeAt(0);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    range.deleteContents();
    
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

    // Enfocar editor y notificar
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.focus();
    }
    triggerEditorInput();
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
        const renderLabelOptionRecursive = (parentId = null, depth = 0) => {
            let levelLabels;
            if (parentId === null) {
                levelLabels = labels.filter(l => !l.parentId || !labels.some(p => p.id === l.parentId));
            } else {
                levelLabels = labels.filter(l => l.parentId === parentId);
            }

            levelLabels.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            levelLabels.forEach(label => {
                const isChecked = post.labels && post.labels.includes(label.id);
                const item = document.createElement('label');
                
                // Indentación: 1.25rem por nivel de profundidad
                const indentStyle = depth > 0 ? `padding-left: ${depth * 1.25}rem;` : '';
                const subIndicator = depth > 0 
                    ? `<span class="material-symbols-outlined text-[15px] text-slate-400 dark:text-slate-500 shrink-0 select-none -mr-1">subdirectory_arrow_right</span>` 
                    : '';
                    
                item.className = 'flex items-center gap-2 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer select-none text-sm text-slate-700 dark:text-slate-200';
                if (indentStyle) {
                    item.style.cssText = indentStyle;
                }
                item.innerHTML = `
                    ${subIndicator}
                    <input type="checkbox" class="rounded text-google-blue border-slate-300 focus:ring-google-blue shrink-0" 
                           ${isChecked ? 'checked' : ''} 
                           onchange="togglePostLabel('${label.id}', this.checked)">
                    <span class="truncate">${label.name}</span>
                `;
                selector.appendChild(item);

                // Llamada recursiva para los hijos
                renderLabelOptionRecursive(label.id, depth + 1);
            });
        };

        renderLabelOptionRecursive(null, 0);
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
window.insertTable = openTableGridSelector;
window.insertDatabase = insertDatabase;
window.insertLink = insertLink;
window.initToolbarStateObserver = initToolbarStateObserver;
window.updateToolbarState = updateToolbarState;
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

// Nuevas funciones para selector de color del texto y resaltado
window.openColorPicker = openColorPicker;
window.closeColorPicker = closeColorPicker;
window.applyTextFormatColor = applyTextFormatColor;

window.openInternalLinkSelector = openInternalLinkSelector;
window.closeInternalLinkSelector = closeInternalLinkSelector;
window.filterInternalLinks = filterInternalLinks;
window.insertInternalLink = insertInternalLink;

window.updateEditorCoverUI = updateEditorCoverUI;
window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.changeCoverPhotoPrompt = changeCoverPhotoPrompt;
window.deleteCoverPhoto = deleteCoverPhoto;

// Creador y Editor Contextual de Tablas
export function openTableGridSelector(btn) {
    const selector = document.getElementById('table-grid-selector');
    const backdrop = document.getElementById('table-grid-selector-backdrop');
    const gridSquares = document.getElementById('table-grid-squares');
    const sizeText = document.getElementById('table-grid-size-text');
    if (!selector || !backdrop || !gridSquares || !sizeText) return;

    // Guardar selección activa
    const selection = window.getSelection();
    lastTableSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    // Generar cuadrícula de 10x10
    gridSquares.innerHTML = '';
    sizeText.textContent = '1x1';

    for (let r = 1; r <= 10; r++) {
        for (let c = 1; c <= 10; c++) {
            const square = document.createElement('div');
            square.className = 'w-3.5 h-3.5 border border-slate-200 dark:border-slate-700 rounded-sm cursor-pointer transition-colors';
            square.dataset.row = r;
            square.dataset.col = c;

            // Hover: iluminar cuadrícula hasta el tamaño RxC
            square.onmouseover = () => {
                sizeText.textContent = `${c} x ${r}`;
                const squares = gridSquares.querySelectorAll('div');
                squares.forEach(sq => {
                    const sqRow = parseInt(sq.dataset.row);
                    const sqCol = parseInt(sq.dataset.col);
                    if (sqRow <= r && sqCol <= c) {
                        sq.classList.add('bg-google-blue/30', 'dark:bg-google-blueDark/30', 'border-google-blue');
                        sq.classList.remove('border-slate-200', 'dark:border-slate-700');
                    } else {
                        sq.classList.remove('bg-google-blue/30', 'dark:bg-google-blueDark/30', 'border-google-blue');
                        sq.classList.add('border-slate-200', 'dark:border-slate-700');
                    }
                });
            };

            // Click: insertar tabla
            square.onclick = (e) => {
                e.preventDefault();
                insertTableWithSize(r, c);
            };

            gridSquares.appendChild(square);
        }
    }

    // Mostrar popover
    backdrop.classList.remove('hidden');
    selector.classList.remove('hidden');

    // Posicionar selector
    const rect = btn.getBoundingClientRect();
    const selectorHeight = selector.offsetHeight || 220;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < selectorHeight + 20) {
        selector.style.top = `${rect.top + window.scrollY - selectorHeight - 8}px`;
    } else {
        selector.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }

    const maxLeft = window.innerWidth - selector.offsetWidth - 16;
    selector.style.left = `${Math.max(16, Math.min(rect.left + window.scrollX, maxLeft))}px`;
}

export function closeTableGridSelector() {
    const selector = document.getElementById('table-grid-selector');
    const backdrop = document.getElementById('table-grid-selector-backdrop');
    if (selector) selector.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

export function updateTableContextToolbar() {
    const toolbar = document.getElementById('table-context-toolbar');
    if (!toolbar) return;

    const selection = window.getSelection();
    if (!selection.rangeCount) {
        toolbar.classList.add('hidden');
        activeTableCell = null;
        return;
    }

    let node = selection.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    activeTableCell = node.closest('td, th');
    
    // Asegurarse de que esté dentro de la zona editable del documento
    const docContent = document.getElementById('doc-content');
    if (activeTableCell && docContent && docContent.contains(activeTableCell)) {
        toolbar.classList.remove('hidden');
        
        // Calcular posición sobre la celda activa
        const rect = activeTableCell.getBoundingClientRect();
        const toolbarHeight = toolbar.offsetHeight || 38;
        const toolbarWidth = toolbar.offsetWidth || 350;
        
        const top = rect.top + window.scrollY - toolbarHeight - 8;
        const left = rect.left + window.scrollX + (rect.width / 2) - (toolbarWidth / 2);
        
        toolbar.style.top = `${top}px`;
        toolbar.style.left = `${Math.max(16, left)}px`;
    } else {
        toolbar.classList.add('hidden');
        activeTableCell = null;
    }
}

export function handleTableAction(action) {
    if (!activeTableCell) return;

    const table = activeTableCell.closest('table');
    const tr = activeTableCell.closest('tr');
    if (!table || !tr) return;

    const rowIndex = tr.rowIndex;
    const cellIndex = activeTableCell.cellIndex;

    switch (action) {
        case 'addRowAbove':
        case 'addRowBelow': {
            const isAbove = action === 'addRowAbove';
            const numCols = tr.cells.length;
            const newRow = document.createElement('tr');
            for (let i = 0; i < numCols; i++) {
                const newCell = document.createElement('td');
                newCell.className = 'border border-slate-200 dark:border-slate-800 px-3 py-2';
                newCell.innerHTML = '<br>';
                newRow.appendChild(newCell);
            }
            if (isAbove) {
                tr.parentNode.insertBefore(newRow, tr);
            } else {
                tr.parentNode.insertBefore(newRow, tr.nextSibling);
            }
            break;
        }

        case 'deleteRow': {
            if (table.rows.length <= 1) {
                table.remove();
            } else {
                tr.remove();
            }
            break;
        }

        case 'addColumnLeft':
        case 'addColumnRight': {
            const isRight = action === 'addColumnRight';
            const rows = table.rows;
            for (let i = 0; i < rows.length; i++) {
                const currentRow = rows[i];
                const isHeader = currentRow.parentNode.tagName === 'THEAD' || currentRow.cells[0].tagName === 'TH';
                const newCell = document.createElement(isHeader ? 'th' : 'td');
                newCell.className = isHeader
                    ? 'border border-slate-200 dark:border-slate-800 px-3 py-2 font-semibold text-left'
                    : 'border border-slate-200 dark:border-slate-800 px-3 py-2';
                newCell.innerHTML = '<br>';
                
                const targetIndex = isRight ? cellIndex + 1 : cellIndex;
                if (targetIndex >= currentRow.cells.length) {
                    currentRow.appendChild(newCell);
                } else {
                    currentRow.insertBefore(newCell, currentRow.cells[targetIndex]);
                }
            }
            break;
        }

        case 'deleteColumn': {
            const numCols = tr.cells.length;
            if (numCols <= 1) {
                table.remove();
            } else {
                const rows = table.rows;
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i].cells[cellIndex]) {
                        rows[i].cells[cellIndex].remove();
                    }
                }
            }
            break;
        }

        case 'alignLeft':
        case 'alignCenter':
        case 'alignRight': {
            const alignment = action === 'alignLeft' ? 'left' : (action === 'alignCenter' ? 'center' : 'right');
            const rows = table.rows;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].cells[cellIndex]) {
                    rows[i].cells[cellIndex].style.textAlign = alignment;
                }
            }
            break;
        }

        case 'deleteTable': {
            table.remove();
            break;
        }
    }

    // Ocultar barra flotante
    const toolbar = document.getElementById('table-context-toolbar');
    if (toolbar) toolbar.classList.add('hidden');
    activeTableCell = null;

    triggerEditorInput();
}

window.openTableGridSelector = openTableGridSelector;
window.closeTableGridSelector = closeTableGridSelector;
window.updateTableContextToolbar = updateTableContextToolbar;
window.handleTableAction = handleTableAction;

export function openColorPicker(command, btn) {
    const selector = document.getElementById('text-format-color-picker');
    const backdrop = document.getElementById('text-format-color-picker-backdrop');
    if (!selector || !backdrop) return;

    currentColorCommand = command;
    
    // Guardar selección activa
    const selection = window.getSelection();
    lastColorSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    // Actualizar título
    const titleEl = document.getElementById('color-picker-title');
    if (titleEl) {
        titleEl.textContent = command === 'foreColor' ? 'Color de Texto' : 'Resaltado';
    }

    // Obtener valor activo si existe para destacar el botón correspondiente
    let activeValue = '';
    if (selection.rangeCount > 0) {
        let node = selection.getRangeAt(0).startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        
        let current = node;
        const docContent = document.getElementById('doc-content');
        while (current && current !== docContent) {
            if (command === 'foreColor') {
                if (current.style && current.style.color) {
                    activeValue = current.style.color;
                    break;
                }
                if (current.tagName === 'FONT' && current.hasAttribute('color')) {
                    activeValue = current.getAttribute('color');
                    break;
                }
            } else if (command === 'backColor') {
                if (current.style && current.style.backgroundColor) {
                    activeValue = current.style.backgroundColor;
                    break;
                }
            }
            current = current.parentNode;
        }
    }

    // Poblar la paleta de colores curados
    const grid = document.getElementById('color-picker-grid');
    if (grid) {
        grid.innerHTML = '';
        FORMAT_COLORS.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'w-7 h-7 rounded-full border border-slate-200 dark:border-slate-700 transition-transform hover:scale-110 active:scale-95 cursor-pointer relative';
            swatch.style.backgroundColor = color.hex;
            swatch.title = color.name;
            
            // Si el color actual coincide con el de la paleta, marcarlo con un dot contrastante
            if (activeValue && colorsMatch(activeValue, color.hex)) {
                const dot = document.createElement('span');
                const isVeryLight = color.hex.toLowerCase() === '#ffffff' || 
                                    color.hex.toLowerCase() === '#fef9c3' || 
                                    color.hex.toLowerCase() === '#dcfce7' || 
                                    color.hex.toLowerCase() === '#dbeafe' || 
                                    color.hex.toLowerCase() === '#fee2e2' || 
                                    color.hex.toLowerCase() === '#d1d5db';
                const borderColor = isVeryLight ? 'border-slate-800' : 'border-white';
                dot.className = `absolute inset-1.5 rounded-full border-2 ${borderColor} bg-transparent`;
                swatch.appendChild(dot);
            }
            
            swatch.onclick = (e) => {
                e.preventDefault();
                applyTextFormatColor(color.hex);
            };
            grid.appendChild(swatch);
        });
    }

    // Configurar botón de restablecer
    const resetBtn = document.getElementById('color-picker-reset-btn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.preventDefault();
            // Para resetear: foreColor a inherit, backColor a transparent/rgba(0,0,0,0)
            const resetVal = command === 'foreColor' ? 'inherit' : 'transparent';
            applyTextFormatColor(resetVal);
        };
    }

    // Mostrar temporalmente para medir
    backdrop.classList.remove('hidden');
    selector.classList.remove('hidden');

    // Calcular posición flotante del selector
    const rect = btn.getBoundingClientRect();
    const selectorHeight = selector.offsetHeight || 180;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < selectorHeight + 20) {
        selector.style.top = `${rect.top + window.scrollY - selectorHeight - 8}px`;
    } else {
        selector.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }

    const maxLeft = window.innerWidth - selector.offsetWidth - 16;
    selector.style.left = `${Math.max(16, Math.min(rect.left + window.scrollX, maxLeft))}px`;
}

export function closeColorPicker() {
    const selector = document.getElementById('text-format-color-picker');
    const backdrop = document.getElementById('text-format-color-picker-backdrop');
    if (selector) selector.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

export function applyTextFormatColor(color) {
    if (lastColorSelectionRange) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(lastColorSelectionRange);
    }
    
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.focus();
    }

    if (currentColorCommand) {
        document.execCommand(currentColorCommand, false, color);
        triggerEditorInput();
    }
    
    closeColorPicker();
}

window.openColorPicker = openColorPicker;
window.closeColorPicker = closeColorPicker;
window.applyTextFormatColor = applyTextFormatColor;

// Nuevas funciones para selector de enlaces internos
export function openInternalLinkSelector(btn) {
    const selector = document.getElementById('internal-link-selector');
    const backdrop = document.getElementById('internal-link-selector-backdrop');
    if (!selector || !backdrop) return;

    // Guardar selección activa
    const selection = window.getSelection();
    lastInternalLinkSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    // Limpiar buscador
    const searchInput = document.getElementById('internal-link-search');
    if (searchInput) searchInput.value = '';

    // Renderizar lista inicial de posts
    renderInternalLinkList();

    // Mostrar
    backdrop.classList.remove('hidden');
    selector.classList.remove('hidden');

    // Calcular posición flotante del selector
    const rect = btn.getBoundingClientRect();
    const selectorHeight = selector.offsetHeight || 240;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < selectorHeight + 20) {
        selector.style.top = `${rect.top + window.scrollY - selectorHeight - 8}px`;
    } else {
        selector.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }

    const maxLeft = window.innerWidth - selector.offsetWidth - 16;
    selector.style.left = `${Math.max(16, Math.min(rect.left + window.scrollX, maxLeft))}px`;
}

export function closeInternalLinkSelector() {
    const selector = document.getElementById('internal-link-selector');
    const backdrop = document.getElementById('internal-link-selector-backdrop');
    if (selector) selector.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

export function renderInternalLinkList(filterQuery = '') {
    const listContainer = document.getElementById('internal-link-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const query = filterQuery.trim().toLowerCase();

    // Obtener posts excluyendo el actual y los que estén en la papelera
    const availablePosts = posts.filter(p => p.id !== currentPostId && !p.trashed);
    
    // Filtrar por término
    const filtered = query 
        ? availablePosts.filter(p => p.title.toLowerCase().includes(query))
        : availablePosts;

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-center py-4 text-slate-400 dark:text-slate-500';
        empty.textContent = query ? 'Sin coincidencias' : 'No hay otras entradas';
        listContainer.appendChild(empty);
        return;
    }

    filtered.forEach(p => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors truncate text-slate-700 dark:text-slate-200 font-medium block';
        item.textContent = p.title.trim() || 'Sin Título';
        item.title = p.title;
        
        item.onclick = (e) => {
            e.preventDefault();
            insertInternalLink(p.id, p.title.trim() || 'Sin Título');
        };
        listContainer.appendChild(item);
    });
}

export function filterInternalLinks() {
    const searchInput = document.getElementById('internal-link-search');
    if (searchInput) {
        renderInternalLinkList(searchInput.value);
    }
}

export function insertInternalLink(targetPostId, targetPostTitle) {
    if (lastInternalLinkSelectionRange) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(lastInternalLinkSelectionRange);
    }

    const selection = window.getSelection();
    let selectedText = '';
    if (selection.rangeCount > 0) {
        selectedText = selection.toString();
    }

    const a = document.createElement('a');
    a.href = `#post-${targetPostId}`;
    a.setAttribute('data-post-id', targetPostId);
    a.className = 'editor-link editor-internal-link hover:underline text-google-blue dark:text-google-blueDark font-medium';
    a.textContent = selectedText || targetPostTitle;

    // Enfocar editor
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.focus();
    }

    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        
        range.setStartAfter(a);
        range.setEndAfter(a);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        if (docContent) {
            const range = document.createRange();
            range.selectNodeContents(docContent);
            range.collapse(false);
            range.insertNode(a);
            range.setStartAfter(a);
            range.setEndAfter(a);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    triggerEditorInput();
    closeInternalLinkSelector();
}

window.openInternalLinkSelector = openInternalLinkSelector;
window.closeInternalLinkSelector = closeInternalLinkSelector;
window.filterInternalLinks = filterInternalLinks;
window.insertInternalLink = insertInternalLink;

export function updateEditorCoverUI(post) {
    const coverContainer = document.getElementById('doc-cover-container');
    const coverImg = document.getElementById('doc-cover-img');
    if (!coverContainer || !coverImg) return;

    if (post && post.cover) {
        coverImg.src = post.cover;
        coverImg.onerror = () => {
            coverContainer.classList.add('hidden');
        };
        coverContainer.classList.remove('hidden');
    } else {
        coverImg.src = '';
        coverContainer.classList.add('hidden');
    }
}

export function toggleMoreMenu(btn) {
    const menu = document.getElementById('more-menu-dropdown');
    const backdrop = document.getElementById('more-menu-backdrop');
    if (!menu || !backdrop) return;

    if (!menu.classList.contains('hidden')) {
        closeMoreMenu();
        return;
    }

    const post = posts.find(p => p.id === currentPostId);
    menu.innerHTML = '';
    
    const changeOption = document.createElement('button');
    changeOption.className = 'w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2.5 font-medium';
    changeOption.innerHTML = `
        <span class="material-symbols-outlined text-lg text-slate-500 dark:text-slate-400">image</span>
        ${post && post.cover ? 'Cambiar foto de portada' : 'Añadir foto de portada'}
    `;
    changeOption.onclick = (e) => {
        e.preventDefault();
        closeMoreMenu();
        changeCoverPhotoPrompt();
    };
    menu.appendChild(changeOption);

    if (post && post.cover) {
        const deleteOption = document.createElement('button');
        deleteOption.className = 'w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm text-red-600 dark:text-red-400 flex items-center gap-2.5 font-medium border-t border-slate-100 dark:border-slate-800';
        deleteOption.innerHTML = `
            <span class="material-symbols-outlined text-lg">delete</span>
            Eliminar foto de portada
        `;
        deleteOption.onclick = (e) => {
            e.preventDefault();
            closeMoreMenu();
            deleteCoverPhoto();
        };
        menu.appendChild(deleteOption);
    }

    backdrop.classList.remove('hidden');
    menu.classList.remove('hidden');

    const rect = btn.getBoundingClientRect();
    const menuHeight = menu.offsetHeight || 80;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < menuHeight + 20) {
        menu.style.top = `${rect.top + window.scrollY - menuHeight - 8}px`;
    } else {
        menu.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }

    const maxLeft = window.innerWidth - menu.offsetWidth - 16;
    menu.style.left = `${Math.max(16, Math.min(rect.left + window.scrollX - menu.offsetWidth + btn.offsetWidth, maxLeft))}px`;
}

export function closeMoreMenu() {
    const menu = document.getElementById('more-menu-dropdown');
    const backdrop = document.getElementById('more-menu-backdrop');
    if (menu) menu.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

export function changeCoverPhotoPrompt() {
    openCoverPhotoModal();
}

export function openCoverPhotoModal() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const backdrop = document.getElementById('cover-photo-dialog-backdrop');
    const container = document.getElementById('cover-photo-dialog-container');
    const input = document.getElementById('cover-photo-url-input');
    const deleteBtn = document.getElementById('cover-photo-delete-btn');
    const errorMsg = document.getElementById('cover-photo-error-msg');

    if (!backdrop || !container || !input) return;

    input.value = post.cover || '';
    if (errorMsg) {
        errorMsg.classList.add('hidden');
        errorMsg.textContent = '';
    }

    if (deleteBtn) {
        if (post.cover) {
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }
    }

    previewCoverPhotoUrl(input.value);

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        container.classList.remove('scale-95');
        container.classList.add('scale-100');
        input.focus();
        if (input.value) input.select();
    }, 10);
}

export function closeCoverPhotoModal() {
    const backdrop = document.getElementById('cover-photo-dialog-backdrop');
    const container = document.getElementById('cover-photo-dialog-container');
    if (!backdrop || !container) return;

    container.classList.remove('scale-100');
    container.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.add('hidden');
    }, 150);
}

export function previewCoverPhotoUrl(url) {
    const previewContainer = document.getElementById('cover-photo-preview-container');
    const previewImg = document.getElementById('cover-photo-preview-img');
    const previewError = document.getElementById('cover-photo-preview-error');
    const errorMsg = document.getElementById('cover-photo-error-msg');

    if (errorMsg) errorMsg.classList.add('hidden');

    const trimmed = (url || '').trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
        if (previewContainer) previewContainer.classList.add('hidden');
        return;
    }

    if (previewContainer && previewImg) {
        if (previewError) previewError.classList.add('hidden');
        previewImg.src = trimmed;
        previewContainer.classList.remove('hidden');
    }
}

export function handleCoverPreviewError() {
    const previewError = document.getElementById('cover-photo-preview-error');
    if (previewError) {
        previewError.classList.remove('hidden');
    }
}

export function submitCoverPhotoModal() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    const input = document.getElementById('cover-photo-url-input');
    const errorMsg = document.getElementById('cover-photo-error-msg');
    if (!input) return;

    const trimmedUrl = input.value.trim();

    if (trimmedUrl === '') {
        deleteCoverPhoto();
        closeCoverPhotoModal();
        return;
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
        if (errorMsg) {
            errorMsg.textContent = 'Por favor, introduce una URL válida que empiece por http:// o https://';
            errorMsg.classList.remove('hidden');
        } else {
            showToast('Por favor, introduce una URL válida (http://... o https://...)');
        }
        return;
    }

    post.cover = trimmedUrl;
    post.updatedAt = new Date().toISOString();
    savePostsToStorage();
    updateEditorCoverUI(post);
    renderFileTree();
    showToast('Foto de portada actualizada');
    closeCoverPhotoModal();
}

export function deleteCoverPhotoFromModal() {
    deleteCoverPhoto();
    closeCoverPhotoModal();
}

export function deleteCoverPhoto() {
    if (!currentPostId) return;
    const post = posts.find(p => p.id === currentPostId);
    if (!post || post.trashed) return;

    if (post.cover) {
        delete post.cover;
        post.updatedAt = new Date().toISOString();
        savePostsToStorage();
        updateEditorCoverUI(post);
        renderFileTree();
        showToast('Foto de portada eliminada');
    }
}

window.updateEditorCoverUI = updateEditorCoverUI;
window.toggleMoreMenu = toggleMoreMenu;
window.closeMoreMenu = closeMoreMenu;
window.changeCoverPhotoPrompt = changeCoverPhotoPrompt;
window.openCoverPhotoModal = openCoverPhotoModal;
window.closeCoverPhotoModal = closeCoverPhotoModal;
window.previewCoverPhotoUrl = previewCoverPhotoUrl;
window.handleCoverPreviewError = handleCoverPreviewError;
window.submitCoverPhotoModal = submitCoverPhotoModal;
window.deleteCoverPhotoFromModal = deleteCoverPhotoFromModal;
window.deleteCoverPhoto = deleteCoverPhoto;
