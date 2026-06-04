// ============================================================
// database.js — Módulo para Bases de Datos estilo Notion
// ============================================================

import { posts, currentPostId } from './state.js';
import { savePostsToStorage } from './storage.js';
import { showToast } from './toast.js';

// Color palette preset for select/multiselect/status chips
const CHIP_COLORS = [
    { name: 'Gris', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', hex: '#f1f5f9' },
    { name: 'Marrón', bg: 'bg-[#f5e6d3] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200', hex: '#f5e6d3' },
    { name: 'Naranja', bg: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300', hex: '#ffedd5' },
    { name: 'Amarillo', bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300', hex: '#fef9c3' },
    { name: 'Verde', bg: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300', hex: '#dcfce7' },
    { name: 'Azul', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300', hex: '#dbeafe' },
    { name: 'Púrpura', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300', hex: '#f3e8ff' },
    { name: 'Rosa', bg: 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300', hex: '#fce7f3' },
    { name: 'Rojo', bg: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300', hex: '#fee2e2' }
];

let activePopup = null;
let activeCellEditor = null;

// ============================================================
// 1. Funciones de Ciclo de Vida y Persistencia
// ============================================================

/**
 * Crea una estructura base de base de datos JSON.
 */
export function createDatabase(options = {}) {
    const dbId = options.id || crypto.randomUUID();
    return {
        id: dbId,
        title: options.title || 'Base de datos sin título',
        columns: [
            { id: 'col-name', name: 'Nombre', type: 'text', width: 220, options: {} },
            { 
                id: 'col-status', 
                name: 'Estado', 
                type: 'select', 
                width: 160, 
                options: {
                    choices: [
                        { id: 'ch-1', name: 'Pendiente', color: '#fef9c3' }, // Amarillo
                        { id: 'ch-2', name: 'En progreso', color: '#dbeafe' }, // Azul
                        { id: 'ch-3', name: 'Completado', color: '#dcfce7' }  // Verde
                    ]
                } 
            },
            { id: 'col-date', name: 'Fecha', type: 'date', width: 140, options: {} }
        ],
        rows: [
            { id: crypto.randomUUID(), createdAt: new Date().toISOString(), cells: {} },
            { id: crypto.randomUUID(), createdAt: new Date().toISOString(), cells: {} },
            { id: crypto.randomUUID(), createdAt: new Date().toISOString(), cells: {} }
        ],
        view: {
            sorts: [],
            filters: [],
            hiddenColumns: [],
            calculations: {},
            showCalculations: true
        }
    };
}

/**
 * Inserta un bloque de base de datos en la posición actual del cursor.
 */
export function insertDatabase() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const dbId = crypto.randomUUID();
    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    if (!post.databases) post.databases = {};
    post.databases[dbId] = createDatabase({ id: dbId });

    const html = `<div class="ntb-database-block my-6" data-db-id="${dbId}" contenteditable="false"></div><p><br></p>`;
    const range = selection.getRangeAt(0);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    range.deleteContents();
    let lastNode = null;
    while (tempDiv.firstChild) {
        lastNode = tempDiv.firstChild;
        range.insertNode(lastNode);
    }

    if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    const docContent = document.getElementById('doc-content');
    if (docContent) docContent.focus();

    // Renderizar la DB insertada
    const container = document.querySelector(`.ntb-database-block[data-db-id="${dbId}"]`);
    if (container) {
        renderDatabase(dbId, container);
    }

    triggerEditorInput();
}

/**
 * Escanea y renderiza todas las bases de datos presentes en el editor.
 */
export function initializeDatabases() {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases) return;

    const containers = document.querySelectorAll('.ntb-database-block');
    containers.forEach(container => {
        const dbId = container.getAttribute('data-db-id');
        if (dbId && post.databases[dbId]) {
            renderDatabase(dbId, container);
        } else {
            container.innerHTML = `<div class="p-4 text-rose-500 bg-rose-50 dark:bg-rose-950/20 rounded-lg text-sm">Error: Base de datos no encontrada en el registro.</div>`;
        }
    });
}

/**
 * Limpia el contenido HTML renderizado dentro de los placeholders de base de datos
 * antes de guardarlo en base de datos para no ensuciar el HTML almacenado.
 */
export function cleanDatabasesBeforeSave(htmlString) {
    if (!htmlString) return '';
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    const blocks = temp.querySelectorAll('.ntb-database-block');
    blocks.forEach(block => {
        block.innerHTML = ''; // Vaciar contenido renderizado
    });
    return temp.innerHTML;
}

/**
 * Elimina una base de datos tanto del modelo de datos como del editor.
 */
export function destroyDatabase(dbId) {
    const post = posts.find(p => p.id === currentPostId);
    if (post && post.databases) {
        delete post.databases[dbId];
    }
    const element = document.querySelector(`.ntb-database-block[data-db-id="${dbId}"]`);
    if (element) {
        element.remove();
    }
    triggerEditorInput();
}

/**
 * Notifica al editor que hubo un cambio para disparar el auto-guardado.
 */
function triggerEditorInput() {
    const docContent = document.getElementById('doc-content');
    if (docContent) {
        docContent.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

// ============================================================
// 2. Operaciones con Datos (Modificaciones del Modelo)
// ============================================================

export function addRow(dbId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const newRow = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        cells: {}
    };
    db.rows.push(newRow);
    
    refreshDatabase(dbId);
    triggerEditorInput();
}

export function deleteRow(dbId, rowId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    db.rows = db.rows.filter(r => r.id !== rowId);

    refreshDatabase(dbId);
    triggerEditorInput();
}

export function updateCell(dbId, rowId, columnId, value) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const row = db.rows.find(r => r.id === rowId);
    if (row) {
        row.cells[columnId] = value;
        refreshDatabase(dbId);
        triggerEditorInput();
    }
}

export function addColumn(dbId, name, type) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const colId = 'col-' + crypto.randomUUID().substring(0, 8);
    const newCol = {
        id: colId,
        name: name || 'Nueva columna',
        type: type || 'text',
        width: 150,
        options: type === 'select' || type === 'multiselect' || type === 'status' ? { choices: [] } : {}
    };

    db.columns.push(newCol);
    refreshDatabase(dbId);
    triggerEditorInput();
}

export function deleteColumn(dbId, columnId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    db.columns = db.columns.filter(c => c.id !== columnId);

    // Limpiar celdas asociadas a la columna en cada fila
    db.rows.forEach(row => {
        delete row.cells[columnId];
    });

    // Limpiar de ordenamientos y filtros
    db.view.sorts = db.view.sorts.filter(s => s.columnId !== columnId);
    db.view.filters = db.view.filters.filter(f => f.columnId !== columnId);
    if (db.view.calculations[columnId]) {
        delete db.view.calculations[columnId];
    }

    refreshDatabase(dbId);
    triggerEditorInput();
}

export function renameColumn(dbId, columnId, newName) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === columnId);
    if (col) {
        col.name = newName;
        refreshDatabase(dbId);
        triggerEditorInput();
    }
}

export function changeColumnType(dbId, columnId, newType) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === columnId);
    if (!col || col.type === newType) return;

    const oldType = col.type;
    col.type = newType;
    col.options = newType === 'select' || newType === 'multiselect' || newType === 'status' ? { choices: [] } : {};

    // Convertir datos de celda
    db.rows.forEach(row => {
        const val = row.cells[columnId];
        row.cells[columnId] = convertCellValue(val, oldType, newType);
    });

    // Limpiar filtros/ordenamientos incompatibles
    db.view.sorts = db.view.sorts.filter(s => s.columnId !== columnId);
    db.view.filters = db.view.filters.filter(f => f.columnId !== columnId);
    if (db.view.calculations[columnId]) {
        delete db.view.calculations[columnId];
    }

    refreshDatabase(dbId);
    triggerEditorInput();
}

export function resizeColumn(dbId, columnId, width) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === columnId);
    if (col) {
        col.width = Math.max(65, width);
        refreshDatabase(dbId);
    }
}

function convertCellValue(val, fromType, toType) {
    if (val === undefined || val === null) return null;

    if (toType === 'text') {
        if (Array.isArray(val)) return val.join(', ');
        return String(val);
    }

    if (toType === 'number') {
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
    }

    if (toType === 'checkbox') {
        if (typeof val === 'boolean') return val;
        if (String(val).toLowerCase() === 'true') return true;
        return !!val;
    }

    if (toType === 'date') {
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        // Intentar parsear fecha básica
        try {
            const d = new Date(val);
            if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        } catch(e) {}
        return null;
    }

    if (toType === 'url') {
        if (typeof val === 'string') return val;
        return '';
    }

    // Para select, multiselect y status, al cambiar de tipo, inicializar vacío
    if (toType === 'select' || toType === 'status') {
        return null;
    }
    if (toType === 'multiselect') {
        return [];
    }

    return null;
}

// ============================================================
// 3. Filtrado y Ordenamiento (Capa de Vista)
// ============================================================

export function getProcessedRows(db) {
    let result = [...db.rows];

    // 1. Aplicar Filtros
    if (db.view.filters && db.view.filters.length > 0) {
        result = result.filter(row => {
            return db.view.filters.every(filter => {
                const col = db.columns.find(c => c.id === filter.columnId);
                if (!col) return true;
                const cellVal = row.cells[filter.columnId];
                return evalFilter(cellVal, col.type, filter.operator, filter.value);
            });
        });
    }

    // 2. Aplicar Ordenamiento (Multi-nivel)
    if (db.view.sorts && db.view.sorts.length > 0) {
        result.sort((a, b) => {
            for (let sort of db.view.sorts) {
                const col = db.columns.find(c => c.id === sort.columnId);
                if (!col) continue;

                const valA = a.cells[sort.columnId];
                const valB = b.cells[sort.columnId];

                const comp = compareValues(valA, valB, col.type);
                if (comp !== 0) {
                    return sort.direction === 'asc' ? comp : -comp;
                }
            }
            // Fallback estable si son iguales
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    }

    return result;
}

function compareValues(a, b, type) {
    const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && v.length === 0);
    const emptyA = isEmpty(a);
    const emptyB = isEmpty(b);

    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;  // vacíos al final
    if (emptyB) return -1;

    if (type === 'number') {
        return parseFloat(a) - parseFloat(b);
    }
    if (type === 'checkbox') {
        return (a === b) ? 0 : (a ? -1 : 1);
    }
    if (type === 'date') {
        return new Date(a).getTime() - new Date(b).getTime();
    }
    // Cadenas / Chips
    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function evalFilter(val, type, op, filterVal) {
    const isValEmpty = val === undefined || val === null || String(val).trim() === '' || (Array.isArray(val) && val.length === 0);

    if (op === 'is_empty') return isValEmpty;
    if (op === 'is_not_empty') return !isValEmpty;

    if (type === 'text' || type === 'url') {
        const sVal = String(val || '').toLowerCase();
        const fVal = String(filterVal || '').toLowerCase();
        switch (op) {
            case 'contains': return sVal.includes(fVal);
            case 'does_not_contain': return !sVal.includes(fVal);
            case 'is': return sVal === fVal;
            case 'is_not': return sVal !== fVal;
            default: return true;
        }
    }

    if (type === 'number') {
        const nVal = parseFloat(val);
        const fVal = parseFloat(filterVal);
        if (isNaN(nVal) || isNaN(fVal)) return false;
        switch (op) {
            case 'eq': return nVal === fVal;
            case 'neq': return nVal !== fVal;
            case 'gt': return nVal > fVal;
            case 'lt': return nVal < fVal;
            case 'gte': return nVal >= fVal;
            case 'lte': return nVal <= fVal;
            default: return true;
        }
    }

    if (type === 'select' || type === 'status') {
        switch (op) {
            case 'is': return val === filterVal;
            case 'is_not': return val !== filterVal;
            default: return true;
        }
    }

    if (type === 'multiselect') {
        const arr = Array.isArray(val) ? val : [];
        switch (op) {
            case 'contains': return arr.includes(filterVal);
            case 'does_not_contain': return !arr.includes(filterVal);
            default: return true;
        }
    }

    if (type === 'date') {
        if (!val || !filterVal) return false;
        const dVal = new Date(val).getTime();
        const fVal = new Date(filterVal).getTime();
        switch (op) {
            case 'is': return val === filterVal;
            case 'before': return dVal < fVal;
            case 'after': return dVal > fVal;
            default: return true;
        }
    }

    if (type === 'checkbox') {
        const bVal = !!val;
        return op === 'is_true' ? bVal : !bVal;
    }

    return true;
}

// ============================================================
// 4. Motores de Formateo y Cálculos
// ============================================================

function formatNumberValue(val, options = {}) {
    if (val === null || val === undefined || isNaN(val)) return '';
    const decimals = options.decimals !== undefined ? options.decimals : 2;
    const format = options.format || 'plain';
    
    let formatted = val.toFixed(decimals);
    if (format === 'currency') {
        formatted = '$' + parseFloat(formatted).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    } else if (format === 'percent') {
        formatted = (val * 100).toFixed(decimals) + '%';
    } else {
        formatted = parseFloat(formatted).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    return formatted;
}

function formatDateString(val, options = {}) {
    if (!val) return '';
    const dateObj = new Date(val + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return '';
    
    const format = options.format || 'short';
    if (format === 'relative') {
        // Calcular diferencia de días
        const today = new Date();
        today.setHours(0,0,0,0);
        const cellDate = new Date(dateObj);
        cellDate.setHours(0,0,0,0);
        const diffTime = cellDate.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Mañana';
        if (diffDays === -1) return 'Ayer';
        if (diffDays > 1 && diffDays < 7) return `En ${diffDays} días`;
        if (diffDays < -1 && diffDays > -7) return `Hace ${Math.abs(diffDays)} días`;
    }
    
    const locale = 'es-ES';
    if (format === 'long') {
        return dateObj.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    return dateObj.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function computeCalculation(rows, column, fn) {
    if (!fn || fn === 'none') return '';
    const colId = column.id;
    const type = column.type;
    const values = rows.map(r => r.cells[colId]);
    
    switch (fn) {
        case 'count':
            return `Conteo: ${rows.length}`;
        case 'count_values': {
            const count = values.filter(v => v !== undefined && v !== null && String(v).trim() !== '' && (!Array.isArray(v) || v.length > 0) && v !== false).length;
            return `Lleno: ${count}`;
        }
        case 'count_unique': {
            const nonNull = values.filter(v => v !== undefined && v !== null && String(v).trim() !== '' && (!Array.isArray(v) || v.length > 0));
            const unique = new Set(nonNull.map(v => Array.isArray(v) ? JSON.stringify(v) : String(v)));
            return `Únicos: ${unique.size}`;
        }
        case 'sum': {
            if (type !== 'number') return 'Suma: —';
            const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
            const sum = nums.reduce((acc, curr) => acc + curr, 0);
            return `Suma: ${formatNumberValue(sum, column.options)}`;
        }
        case 'avg': {
            if (type !== 'number') return 'Promedio: —';
            const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
            if (nums.length === 0) return 'Prom: 0';
            const avg = nums.reduce((acc, curr) => acc + curr, 0) / nums.length;
            return `Prom: ${formatNumberValue(avg, column.options)}`;
        }
        case 'min': {
            if (type === 'number') {
                const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (nums.length === 0) return 'Mín: —';
                return `Mín: ${formatNumberValue(Math.min(...nums), column.options)}`;
            } else if (type === 'date') {
                const dates = values.filter(v => v).map(v => new Date(v).getTime()).filter(v => !isNaN(v));
                if (dates.length === 0) return 'Mín: —';
                return `Mín: ${formatDateString(new Date(Math.min(...dates)).toISOString().split('T')[0], column.options)}`;
            }
            return 'Mín: —';
        }
        case 'max': {
            if (type === 'number') {
                const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (nums.length === 0) return 'Máx: —';
                return `Máx: ${formatNumberValue(Math.max(...nums), column.options)}`;
            } else if (type === 'date') {
                const dates = values.filter(v => v).map(v => new Date(v).getTime()).filter(v => !isNaN(v));
                if (dates.length === 0) return 'Máx: —';
                return `Máx: ${formatDateString(new Date(Math.max(...dates)).toISOString().split('T')[0], column.options)}`;
            }
            return 'Máx: —';
        }
        case 'percent_empty': {
            const emptyCount = values.filter(v => v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && v.length === 0) || v === false).length;
            const pct = rows.length > 0 ? Math.round((emptyCount / rows.length) * 100) : 0;
            return `Vacío: ${pct}%`;
        }
        case 'percent_not_empty': {
            const nonEmptyCount = values.filter(v => v !== undefined && v !== null && String(v).trim() !== '' && (!Array.isArray(v) || v.length > 0) && v !== false).length;
            const pct = rows.length > 0 ? Math.round((nonEmptyCount / rows.length) * 100) : 0;
            return `Lleno: ${pct}%`;
        }
        default:
            return '';
    }
}

// ============================================================
// 5. Renderizador de la Base de Datos (DOM Builder)
// ============================================================

export function renderDatabase(dbId, container) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    container.innerHTML = '';
    
    // Contenedor principal con sombra y bordes redondeados
    const wrapper = document.createElement('div');
    wrapper.className = 'ntb-db-wrapper border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#1f2023] shadow-sm text-slate-800 dark:text-slate-200 overflow-hidden my-4';

    // 5.1 HEADER DE LA BASE DE DATOS
    const header = document.createElement('div');
    header.className = 'ntb-db-header flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 select-none';
    
    // Título editable
    const titleContainer = document.createElement('div');
    titleContainer.className = 'flex items-center gap-2 flex-1 min-w-[200px]';
    titleContainer.innerHTML = `<span class="material-symbols-outlined text-indigo-500 text-xl">database</span>`;
    
    const titleInput = document.createElement('input');
    titleInput.className = 'bg-transparent border-0 hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500 rounded px-1.5 py-0.5 text-base font-semibold focus:outline-none w-full transition-colors';
    titleInput.value = db.title;
    titleInput.placeholder = 'Base de datos sin título';
    titleInput.addEventListener('change', (e) => {
        db.title = e.target.value || 'Base de datos sin título';
        triggerEditorInput();
    });
    titleContainer.appendChild(titleInput);
    header.appendChild(titleContainer);

    // Controles del Header (Filtro, Ordenar, Cálculos, Menú)
    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-1.5';

    // Botón Filtros
    const filterBtn = document.createElement('button');
    filterBtn.className = `px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${db.view.filters.length > 0 ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40' : 'text-slate-600 dark:text-slate-400'}`;
    filterBtn.innerHTML = `<span class="material-symbols-outlined text-sm">filter_alt</span> Filtros ${db.view.filters.length > 0 ? `(${db.view.filters.length})` : ''}`;
    filterBtn.addEventListener('click', (e) => openFilterPanel(dbId, filterBtn));
    controls.appendChild(filterBtn);

    // Botón Ordenamiento
    const sortBtn = document.createElement('button');
    sortBtn.className = `px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${db.view.sorts.length > 0 ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200/40 dark:border-indigo-800/40' : 'text-slate-600 dark:text-slate-400'}`;
    sortBtn.innerHTML = `<span class="material-symbols-outlined text-sm">swap_vert</span> Ordenar ${db.view.sorts.length > 0 ? `(${db.view.sorts.length})` : ''}`;
    sortBtn.addEventListener('click', (e) => openSortPanel(dbId, sortBtn));
    controls.appendChild(sortBtn);

    // Botón Cálculos (Toggle footer)
    const calcBtn = document.createElement('button');
    calcBtn.className = `p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${db.view.showCalculations ? 'text-indigo-500 bg-indigo-500/10' : 'text-slate-500'}`;
    calcBtn.title = 'Mostrar calculations en pie de página';
    calcBtn.innerHTML = `<span class="material-symbols-outlined text-base">analytics</span>`;
    calcBtn.addEventListener('click', () => {
        db.view.showCalculations = !db.view.showCalculations;
        refreshDatabase(dbId);
        triggerEditorInput();
    });
    controls.appendChild(calcBtn);

    // Botón Menú
    const menuBtn = document.createElement('button');
    menuBtn.className = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';
    menuBtn.innerHTML = `<span class="material-symbols-outlined text-base">more_horiz</span>`;
    menuBtn.addEventListener('click', (e) => openDatabaseMenu(dbId, menuBtn));
    controls.appendChild(menuBtn);

    header.appendChild(controls);
    wrapper.appendChild(header);

    // 5.2 LA TABLA GRID
    const tableScrollContainer = document.createElement('div');
    tableScrollContainer.className = 'overflow-x-auto w-full';

    const table = document.createElement('table');
    table.className = 'w-full text-sm border-collapse table-fixed select-none';

    // Generar colgroup para ajustar anchos exactos
    const colGroup = document.createElement('colgroup');
    db.columns.forEach(col => {
        const colEl = document.createElement('col');
        colEl.style.width = `${col.width}px`;
        colGroup.appendChild(colEl);
    });
    
    // Columna para agregar nueva columna
    const addColGroup = document.createElement('col');
    addColGroup.style.width = '48px';
    colGroup.appendChild(addColGroup);
    table.appendChild(colGroup);

    // Cabecera (Thead)
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.className = 'bg-slate-50/70 dark:bg-slate-900/10 border-b border-slate-200 dark:border-slate-800/80';

    db.columns.forEach(col => {
        const th = document.createElement('th');
        th.className = 'relative px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200/60 dark:border-slate-800/40 text-xs tracking-wider select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/20 group';
        
        const thContent = document.createElement('div');
        thContent.className = 'flex items-center gap-1.5 cursor-pointer pr-3 truncate';
        
        // Icono según tipo de columna
        const colIcon = getColumnTypeIcon(col.type);
        thContent.innerHTML = `<span class="material-symbols-outlined text-slate-400 text-sm">${colIcon}</span><span class="truncate font-semibold">${col.name}</span>`;
        
        thContent.addEventListener('click', (e) => {
            if (e.target.classList.contains('ntb-db-resize-handle')) return;
            openColumnConfigPopup(dbId, col.id, th);
        });
        th.appendChild(thContent);

        // Handle de redimensionamiento
        const handle = document.createElement('div');
        handle.className = 'absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-600 transition-colors ntb-db-resize-handle';
        setupColumnResize(handle, dbId, col.id);
        th.appendChild(handle);

        headerRow.appendChild(th);
    });

    // Botón Agregar Columna (+)
    const addColTh = document.createElement('th');
    addColTh.className = 'p-0 text-center align-middle hover:bg-slate-50 dark:hover:bg-slate-900/30';
    const addColBtn = document.createElement('button');
    addColBtn.className = 'w-full h-8 flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-colors focus:outline-none';
    addColBtn.innerHTML = `<span class="material-symbols-outlined text-lg">add</span>`;
    addColBtn.title = 'Añadir columna';
    addColBtn.addEventListener('click', () => {
        openColumnAddPopup(dbId, addColTh);
    });
    addColTh.appendChild(addColBtn);
    headerRow.appendChild(addColTh);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Filas (Tbody)
    const tbody = document.createElement('tbody');
    const processedRows = getProcessedRows(db);

    if (processedRows.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'border-b border-slate-100 dark:border-slate-800/40';
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = db.columns.length + 1;
        emptyCell.className = 'px-4 py-8 text-center text-slate-400 text-xs italic';
        emptyCell.textContent = db.rows.length === 0 ? 'Sin filas. Clic en [+ Nueva] para agregar.' : 'Ninguna fila coincide con los filtros.';
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
    } else {
        processedRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = 'group border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors';

            db.columns.forEach(col => {
                const td = document.createElement('td');
                td.className = 'px-3 py-2 border-r border-slate-100 dark:border-slate-800/30 truncate align-middle cursor-pointer hover:bg-slate-100/20 dark:hover:bg-slate-800/5 relative group';
                
                const cellVal = row.cells[col.id];
                td.innerHTML = renderCellValue(col, cellVal);

                td.addEventListener('click', (e) => {
                    if (e.target.closest('.ntb-db-checkbox-symbol')) {
                        // Toggle directo para checkbox
                        const newVal = !cellVal;
                        updateCell(dbId, row.id, col.id, newVal);
                    } else if (e.target.closest('a') && col.type === 'url') {
                        // Permitir clicks normales en enlaces si no se está editando
                        return;
                    } else {
                        openCellEditor(dbId, row.id, col.id, td);
                    }
                });

                tr.appendChild(td);
            });

            // Acción eliminar fila en la última celda colgada
            const actionTd = document.createElement('td');
            actionTd.className = 'p-0 text-center align-middle relative opacity-0 group-hover:opacity-100 transition-opacity';
            const delRowBtn = document.createElement('button');
            delRowBtn.className = 'w-full h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors focus:outline-none';
            delRowBtn.innerHTML = `<span class="material-symbols-outlined text-base">delete</span>`;
            delRowBtn.title = 'Eliminar fila';
            delRowBtn.addEventListener('click', () => deleteRow(dbId, row.id));
            actionTd.appendChild(delRowBtn);
            tr.appendChild(actionTd);

            tbody.appendChild(tr);
        });
    }

    table.appendChild(tbody);

    // Footer de Cálculos (Tfoot)
    if (db.view.showCalculations) {
        const tfoot = document.createElement('tfoot');
        const footRow = document.createElement('tr');
        footRow.className = 'bg-slate-50/30 dark:bg-slate-900/5 border-t border-slate-200 dark:border-slate-800 font-medium text-slate-500 dark:text-slate-400 text-xs select-none';

        db.columns.forEach(col => {
            const td = document.createElement('td');
            td.className = 'px-3 py-1.5 border-r border-slate-100 dark:border-slate-800/30 align-middle truncate relative group cursor-pointer hover:bg-slate-100/40 dark:hover:bg-slate-800/10';
            
            const calcFn = db.view.calculations[col.id] || 'none';
            const calcResult = computeCalculation(processedRows, col, calcFn);
            
            if (calcFn === 'none') {
                td.innerHTML = `<span class="text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">Calcular</span>`;
            } else {
                td.textContent = calcResult;
            }

            td.addEventListener('click', (e) => {
                openCalculationDropdown(dbId, col.id, td);
            });

            footRow.appendChild(td);
        });

        // Celda vacía al final del footer
        const emptyTd = document.createElement('td');
        emptyTd.className = 'bg-transparent';
        footRow.appendChild(emptyTd);

        tfoot.appendChild(footRow);
        table.appendChild(tfoot);
    }

    tableScrollContainer.appendChild(table);
    wrapper.appendChild(tableScrollContainer);

    // 5.3 BOTÓN + NUEVA FILA ABAJO
    const footerAddRow = document.createElement('div');
    footerAddRow.className = 'px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center bg-white dark:bg-[#1f2023]';
    const addNewRowBtn = document.createElement('button');
    addNewRowBtn.className = 'text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 font-semibold flex items-center gap-1 transition-colors';
    addNewRowBtn.innerHTML = `<span class="material-symbols-outlined text-sm">add</span> Añadir fila`;
    addNewRowBtn.addEventListener('click', () => addRow(dbId));
    footerAddRow.appendChild(addNewRowBtn);
    wrapper.appendChild(footerAddRow);

    container.appendChild(wrapper);
}

function refreshDatabase(dbId) {
    const container = document.querySelector(`.ntb-database-block[data-db-id="${dbId}"]`);
    if (container) {
        renderDatabase(dbId, container);
    }
}

function getColumnTypeIcon(type) {
    switch (type) {
        case 'text': return 'notes';
        case 'number': return 'tag';
        case 'select': return 'arrow_drop_down_circle';
        case 'multiselect': return 'style';
        case 'date': return 'calendar_today';
        case 'checkbox': return 'check_box';
        case 'url': return 'link';
        case 'status': return 'toggle_on';
        default: return 'help';
    }
}

function getColumnTypeName(type) {
    switch (type) {
        case 'text': return 'Texto';
        case 'number': return 'Número';
        case 'select': return 'Selección única';
        case 'multiselect': return 'Selección múltiple';
        case 'date': return 'Fecha';
        case 'checkbox': return 'Casilla';
        case 'url': return 'Enlace web';
        case 'status': return 'Estado';
        default: return type;
    }
}

// ============================================================
// 6. Redimensionamiento de Columnas (Drag UI)
// ============================================================

function setupColumnResize(handle, dbId, columnId) {
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const post = posts.find(p => p.id === currentPostId);
        if (!post || !post.databases || !post.databases[dbId]) return;

        const db = post.databases[dbId];
        const col = db.columns.find(c => c.id === columnId);
        if (!col) return;

        const startX = e.clientX;
        const startWidth = col.width;

        const onMouseMove = (moveEv) => {
            const deltaX = moveEv.clientX - startX;
            const newWidth = Math.max(65, startWidth + deltaX);
            col.width = newWidth;
            
            // Actualizar en caliente en el DOM
            const container = document.querySelector(`.ntb-database-block[data-db-id="${dbId}"]`);
            if (container) {
                const index = db.columns.findIndex(c => c.id === columnId);
                if (index !== -1) {
                    const colElements = container.querySelectorAll('colgroup col');
                    if (colElements[index]) {
                        colElements[index].style.width = `${newWidth}px`;
                    }
                }
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            triggerEditorInput();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

// ============================================================
// 7. Visualización de Celdas (Render Cell)
// ============================================================

export function renderCellValue(column, value) {
    if (value === undefined || value === null || value === '') {
        if (column.type === 'checkbox') {
            return `<span class="material-symbols-outlined text-slate-300 dark:text-slate-700 hover:text-indigo-500/80 transition-colors text-xl ntb-db-checkbox-symbol">check_box_outline_blank</span>`;
        }
        return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;
    }

    switch (column.type) {
        case 'text':
            return `<span>${escapeHTML(String(value))}</span>`;

        case 'number':
            return `<span>${escapeHTML(formatNumberValue(value, column.options))}</span>`;

        case 'checkbox':
            return value 
                ? `<span class="material-symbols-outlined text-indigo-500 hover:text-indigo-600 transition-colors text-xl ntb-db-checkbox-symbol">check_box</span>`
                : `<span class="material-symbols-outlined text-slate-300 dark:text-slate-700 hover:text-indigo-500/80 transition-colors text-xl ntb-db-checkbox-symbol">check_box_outline_blank</span>`;

        case 'date':
            return `<span>${escapeHTML(formatDateString(value, column.options))}</span>`;

        case 'url':
            const linkText = String(value).replace(/^(https?:\/\/)?(www\.)?/, '').substring(0, 25);
            return `<a href="${escapeHTML(value)}" target="_blank" class="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 underline focus:outline-none" onclick="event.stopPropagation();"><span class="material-symbols-outlined text-sm">link</span><span class="truncate">${escapeHTML(linkText)}</span></a>`;

        case 'select': {
            const choices = column.options?.choices || [];
            const choice = choices.find(c => c.id === value);
            if (!choice) return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;
            
            // Buscar color correspondiente en CHIP_COLORS para dark/light css classes
            const colorClass = getChipColorClasses(choice.color);
            return `<span class="px-2 py-0.5 rounded text-xs font-medium inline-block select-none ${colorClass}">${escapeHTML(choice.name)}</span>`;
        }

        case 'multiselect': {
            const choices = column.options?.choices || [];
            const ids = Array.isArray(value) ? value : [];
            if (ids.length === 0) return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;
            
            const badgesHtml = ids.map(id => {
                const choice = choices.find(c => c.id === id);
                if (!choice) return '';
                const colorClass = getChipColorClasses(choice.color);
                return `<span class="px-2 py-0.5 rounded text-xs font-medium select-none inline-block mr-1 my-0.5 ${colorClass}">${escapeHTML(choice.name)}</span>`;
            }).join('');
            
            return `<div class="flex flex-wrap items-center">${badgesHtml}</div>`;
        }

        case 'status': {
            const choices = column.options?.choices || [];
            const choice = choices.find(c => c.id === value);
            if (!choice) return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;
            
            const colorClass = getChipColorClasses(choice.color);
            // Mostrar punto indicador del grupo
            const groupDotColor = choice.group === 'done' ? 'bg-green-500' : (choice.group === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400');
            return `<span class="px-2 py-0.5 rounded text-xs font-medium select-none inline-flex items-center gap-1.5 ${colorClass}"><span class="w-1.5 h-1.5 rounded-full ${groupDotColor}"></span>${escapeHTML(choice.name)}</span>`;
        }

        default:
            return `<span>${escapeHTML(String(value))}</span>`;
    }
}

function getChipColorClasses(hex) {
    const found = CHIP_COLORS.find(c => c.hex.toLowerCase() === (hex || '').toLowerCase());
    return found ? found.bg : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 8. Editores Inline por Celda (Cell Editors)
// ============================================================

export function openCellEditor(dbId, rowId, columnId, tdElement) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const row = db.rows.find(r => r.id === rowId);
    const col = db.columns.find(c => c.id === columnId);
    if (!row || !col) return;

    const currentValue = row.cells[columnId];
    
    // Crear contenedor del editor posicionado
    const rect = tdElement.getBoundingClientRect();
    
    activeCellEditor = {
        dbId, rowId, columnId, tdElement
    };

    // Editor especial para texto, número, fecha y url
    if (col.type === 'text' || col.type === 'number' || col.type === 'url' || col.type === 'date') {
        const input = document.createElement('input');
        input.className = 'absolute inset-0 w-full h-full px-3 py-2 bg-white dark:bg-[#1a1c1e] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 z-10';
        
        if (col.type === 'number') {
            input.type = 'number';
            input.step = 'any';
            input.value = currentValue !== undefined && currentValue !== null ? currentValue : '';
        } else if (col.type === 'date') {
            input.type = 'date';
            input.value = currentValue || '';
        } else {
            input.type = 'text';
            input.value = currentValue || '';
        }

        tdElement.style.position = 'relative';
        tdElement.appendChild(input);
        input.focus();
        if (col.type === 'text' || col.type === 'url') {
            input.select();
        }

        const handleSave = () => {
            let newVal = input.value;
            if (col.type === 'number') {
                newVal = newVal === '' ? null : parseFloat(newVal);
            }
            updateCell(dbId, rowId, columnId, newVal);
            cleanup();
        };

        const cleanup = () => {
            input.remove();
            activeCellEditor = null;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
                refreshDatabase(dbId);
            }
        });

        input.addEventListener('blur', handleSave);
    } 

    // Editor especial para select / multiselect / status
    else if (col.type === 'select' || col.type === 'multiselect' || col.type === 'status') {
        openSelectDropdownEditor(dbId, rowId, col, currentValue, rect);
    }
}

function openSelectDropdownEditor(dbId, rowId, col, currentValue, targetRect) {
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-2.5 w-64 text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-2';
    
    // Posicionamiento de popup
    let top = targetRect.bottom + window.scrollY;
    let left = targetRect.left + window.scrollX;
    
    // Validar desbordamiento de pantalla
    if (left + 256 > window.innerWidth) left = window.innerWidth - 270;
    if (top + 280 > window.innerHeight) top = targetRect.top + window.scrollY - 290;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    const choices = col.options?.choices || [];
    
    // Input buscador / creación
    const searchInput = document.createElement('input');
    searchInput.className = 'w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1c1e] text-xs rounded focus:outline-none focus:ring-1 focus:ring-indigo-500';
    searchInput.placeholder = 'Buscar o crear opción...';
    popup.appendChild(searchInput);

    const listContainer = document.createElement('div');
    listContainer.className = 'max-h-48 overflow-y-auto space-y-0.5';
    popup.appendChild(listContainer);

    const renderList = (filter = '') => {
        listContainer.innerHTML = '';
        const normFilter = filter.trim().toLowerCase();
        const filtered = choices.filter(c => c.name.toLowerCase().includes(normFilter));

        if (filtered.length === 0 && normFilter !== '') {
            const createBtn = document.createElement('button');
            createBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-xs text-indigo-500 font-medium flex items-center gap-1';
            createBtn.innerHTML = `<span class="material-symbols-outlined text-sm">add</span> Crear "${escapeHTML(filter)}"`;
            createBtn.addEventListener('click', () => {
                const newChoice = createNewChoiceForColumn(dbId, col.id, filter);
                if (col.type === 'multiselect') {
                    const currentArr = Array.isArray(currentValue) ? [...currentValue] : [];
                    currentArr.push(newChoice.id);
                    updateCell(dbId, rowId, col.id, currentArr);
                } else {
                    updateCell(dbId, rowId, col.id, newChoice.id);
                }
                closeActivePopups();
            });
            listContainer.appendChild(createBtn);
        }

        filtered.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded flex items-center justify-between text-xs transition-colors group';
            
            const badgeClass = getChipColorClasses(choice.color);
            const isSelected = col.type === 'multiselect'
                ? (Array.isArray(currentValue) && currentValue.includes(choice.id))
                : (currentValue === choice.id);

            const groupDot = col.type === 'status'
                ? `<span class="w-1.5 h-1.5 rounded-full ${choice.group === 'done' ? 'bg-green-500' : (choice.group === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400')}"></span>`
                : '';

            btn.innerHTML = `
                <span class="px-2 py-0.5 rounded font-medium inline-flex items-center gap-1.5 ${badgeClass}">${groupDot}${escapeHTML(choice.name)}</span>
                <span class="material-symbols-outlined text-indigo-500 text-base ${isSelected ? '' : 'opacity-0 group-hover:opacity-30'}">${col.type === 'multiselect' ? (isSelected ? 'check_box' : 'check_box_outline_blank') : 'check'}</span>
            `;

            btn.addEventListener('click', () => {
                if (col.type === 'multiselect') {
                    let currentArr = Array.isArray(currentValue) ? [...currentValue] : [];
                    if (currentArr.includes(choice.id)) {
                        currentArr = currentArr.filter(id => id !== choice.id);
                    } else {
                        currentArr.push(choice.id);
                    }
                    updateCell(dbId, rowId, col.id, currentArr);
                    // No cerrar popup de multiselect para permitir múltiples checks
                    currentValue = currentArr;
                    renderList(searchInput.value);
                } else {
                    updateCell(dbId, rowId, col.id, choice.id);
                    closeActivePopups();
                }
            });

            listContainer.appendChild(btn);
        });
    };

    searchInput.addEventListener('input', (e) => renderList(e.target.value));
    renderList();

    // Backdrop invisible para cerrar al hacer clic fuera
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
    searchInput.focus();
}

function createNewChoiceForColumn(dbId, colId, name) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return null;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    if (!col) return null;

    if (!col.options.choices) col.options.choices = [];
    
    // Elegir color aleatorio de CHIP_COLORS
    const randomColor = CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)].hex;
    
    const newChoice = {
        id: 'ch-' + crypto.randomUUID().substring(0, 8),
        name: name.trim(),
        color: randomColor
    };

    if (col.type === 'status') {
        newChoice.group = 'not_started'; // Grupo por defecto para status
    }

    col.options.choices.push(newChoice);
    triggerEditorInput();
    return newChoice;
}

// ============================================================
// 9. Configuración de Columnas (Headers y Add UI)
// ============================================================

function openColumnConfigPopup(dbId, columnId, thElement) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === columnId);
    if (!col) return;

    const rect = thElement.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 w-64 text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-3';
    
    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX;
    if (left + 256 > window.innerWidth) left = window.innerWidth - 270;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    // 1. Campo para renombrar
    const nameLabel = document.createElement('label');
    nameLabel.className = 'text-xs text-slate-400 dark:text-slate-500 font-bold uppercase';
    nameLabel.textContent = 'Nombre de columna';
    popup.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.className = 'w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1c1e] text-xs rounded focus:outline-none focus:ring-1 focus:ring-indigo-500';
    nameInput.value = col.name;
    nameInput.addEventListener('change', (e) => {
        renameColumn(dbId, columnId, e.target.value);
    });
    popup.appendChild(nameInput);

    // 2. Selector de tipo
    const typeLabel = document.createElement('label');
    typeLabel.className = 'text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mt-1';
    typeLabel.textContent = 'Tipo de datos';
    popup.appendChild(typeLabel);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1c1e] text-xs rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer';
    
    const types = ['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'url', 'status'];
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = getColumnTypeName(t);
        if (t === col.type) opt.selected = true;
        typeSelect.appendChild(opt);
    });

    typeSelect.addEventListener('change', (e) => {
        changeColumnType(dbId, columnId, e.target.value);
        closeActivePopups();
    });
    popup.appendChild(typeSelect);

    // 3. Botones de Acción (Sort, Eliminar, etc.)
    const divider = document.createElement('div');
    divider.className = 'border-t border-slate-100 dark:border-slate-800 my-1';
    popup.appendChild(divider);

    // Botón ordenar Ascendente
    const sortAscBtn = document.createElement('button');
    sortAscBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs flex items-center gap-2 text-slate-600 dark:text-slate-400';
    sortAscBtn.innerHTML = `<span class="material-symbols-outlined text-base">arrow_upward</span> Ordenar Ascendente`;
    sortAscBtn.addEventListener('click', () => {
        addSortRule(dbId, columnId, 'asc');
        closeActivePopups();
    });
    popup.appendChild(sortAscBtn);

    // Botón ordenar Descendente
    const sortDescBtn = document.createElement('button');
    sortDescBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs flex items-center gap-2 text-slate-600 dark:text-slate-400';
    sortDescBtn.innerHTML = `<span class="material-symbols-outlined text-base">arrow_downward</span> Ordenar Descendente`;
    sortDescBtn.addEventListener('click', () => {
        addSortRule(dbId, columnId, 'desc');
        closeActivePopups();
    });
    popup.appendChild(sortDescBtn);

    // Botón eliminar columna
    const delBtn = document.createElement('button');
    delBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded text-xs flex items-center gap-2 font-medium transition-colors';
    delBtn.innerHTML = `<span class="material-symbols-outlined text-base">delete</span> Eliminar columna`;
    delBtn.addEventListener('click', () => {
        if (db.columns.length <= 1) {
            alert('Una base de datos debe tener al menos una columna.');
            return;
        }
        deleteColumn(dbId, columnId);
        closeActivePopups();
    });
    popup.appendChild(delBtn);

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
}

function openColumnAddPopup(dbId, plusThElement) {
    closeActivePopups();

    const rect = plusThElement.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 w-64 text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-2.5';
    
    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX - 200; // Ajustar a la izquierda
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    // Título/Nombre
    const input = document.createElement('input');
    input.className = 'w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1c1e] text-xs rounded focus:outline-none focus:ring-1 focus:ring-indigo-500';
    input.placeholder = 'Nombre de columna';
    popup.appendChild(input);

    // Tipo
    const typeSelect = document.createElement('select');
    typeSelect.className = 'w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1c1e] text-xs rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer';
    
    const types = ['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'url', 'status'];
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = getColumnTypeName(t);
        typeSelect.appendChild(opt);
    });
    popup.appendChild(typeSelect);

    // Botón Aceptar
    const addBtn = document.createElement('button');
    addBtn.className = 'w-full bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold py-1.5 rounded transition-colors';
    addBtn.textContent = 'Crear Columna';
    addBtn.addEventListener('click', () => {
        const name = input.value.trim() || 'Nueva Columna';
        addColumn(dbId, name, typeSelect.value);
        closeActivePopups();
    });
    popup.appendChild(addBtn);

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
    input.focus();
}

// ============================================================
// 10. Paneles de Configuración de Filtros y Ordenamiento (Modals)
// ============================================================

function openFilterPanel(dbId, triggerBtn) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const rect = triggerBtn.getBoundingClientRect();
    
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 w-[380px] sm:w-[450px] max-h-[350px] overflow-y-auto text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-3';
    
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;
    if (left + 450 > window.innerWidth) left = window.innerWidth - 465;
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    const title = document.createElement('div');
    title.className = 'flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2';
    title.innerHTML = `<span class="font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-300"><span class="material-symbols-outlined text-lg">filter_alt</span> Filtros Activos</span>`;
    popup.appendChild(title);

    const filterList = document.createElement('div');
    filterList.className = 'space-y-2';
    popup.appendChild(filterList);

    const renderFilters = () => {
        filterList.innerHTML = '';
        if (db.view.filters.length === 0) {
            filterList.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 italic py-2">Sin filtros aplicados. Se muestran todas las filas.</div>`;
            return;
        }

        db.view.filters.forEach((filter, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-1.5 flex-wrap bg-slate-50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800/40 text-xs';

            // 1. Dropdown Columnas
            const colSel = document.createElement('select');
            colSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer';
            db.columns.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                if (c.id === filter.columnId) opt.selected = true;
                colSel.appendChild(opt);
            });
            colSel.addEventListener('change', (e) => {
                filter.columnId = e.target.value;
                // Reiniciar operador por defecto según tipo
                const newCol = db.columns.find(c => c.id === filter.columnId);
                filter.operator = getDefaultOperator(newCol.type);
                filter.value = '';
                triggerEditorInput();
                refreshDatabase(dbId);
                renderFilters();
            });
            item.appendChild(colSel);

            const col = db.columns.find(c => c.id === filter.columnId);
            
            // 2. Dropdown Operador
            const opSel = document.createElement('select');
            opSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer';
            const operators = getOperatorsForType(col.type);
            operators.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.val;
                opt.textContent = o.name;
                if (o.val === filter.operator) opt.selected = true;
                opSel.appendChild(opt);
            });
            opSel.addEventListener('change', (e) => {
                filter.operator = e.target.value;
                triggerEditorInput();
                refreshDatabase(dbId);
                renderFilters();
            });
            item.appendChild(opSel);

            // 3. Campo de valor de filtro (si el operador lo requiere)
            if (filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty' && filter.operator !== 'is_true' && filter.operator !== 'is_false') {
                if (col.type === 'select' || col.type === 'status') {
                    const valSel = document.createElement('select');
                    valSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer flex-1 min-w-[80px]';
                    const choices = col.options?.choices || [];
                    choices.forEach(ch => {
                        const opt = document.createElement('option');
                        opt.value = ch.id;
                        opt.textContent = ch.name;
                        if (ch.id === filter.value) opt.selected = true;
                        valSel.appendChild(opt);
                    });
                    valSel.addEventListener('change', (e) => {
                        filter.value = e.target.value;
                        triggerEditorInput();
                        refreshDatabase(dbId);
                    });
                    item.appendChild(valSel);
                } else if (col.type === 'multiselect') {
                    const valSel = document.createElement('select');
                    valSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer flex-1 min-w-[80px]';
                    const choices = col.options?.choices || [];
                    choices.forEach(ch => {
                        const opt = document.createElement('option');
                        opt.value = ch.id;
                        opt.textContent = ch.name;
                        if (ch.id === filter.value) opt.selected = true;
                        valSel.appendChild(opt);
                    });
                    valSel.addEventListener('change', (e) => {
                        filter.value = e.target.value;
                        triggerEditorInput();
                        refreshDatabase(dbId);
                    });
                    item.appendChild(valSel);
                } else if (col.type === 'date') {
                    const dateIn = document.createElement('input');
                    dateIn.type = 'date';
                    dateIn.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 focus:outline-none flex-1 min-w-[100px]';
                    dateIn.value = filter.value || '';
                    dateIn.addEventListener('change', (e) => {
                        filter.value = e.target.value;
                        triggerEditorInput();
                        refreshDatabase(dbId);
                    });
                    item.appendChild(dateIn);
                } else {
                    const valIn = document.createElement('input');
                    valIn.type = col.type === 'number' ? 'number' : 'text';
                    valIn.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none flex-1 min-w-[80px]';
                    valIn.placeholder = 'Valor...';
                    valIn.value = filter.value || '';
                    valIn.addEventListener('input', (e) => {
                        filter.value = e.target.value;
                        triggerEditorInput();
                        refreshDatabase(dbId);
                    });
                    item.appendChild(valIn);
                }
            }

            // Botón eliminar filtro
            const delBtn = document.createElement('button');
            delBtn.className = 'p-1 hover:bg-rose-100 hover:text-rose-500 dark:hover:bg-rose-950/20 text-slate-400 rounded transition-colors ml-auto focus:outline-none';
            delBtn.innerHTML = `<span class="material-symbols-outlined text-base">close</span>`;
            delBtn.addEventListener('click', () => {
                db.view.filters.splice(idx, 1);
                triggerEditorInput();
                refreshDatabase(dbId);
                renderFilters();
            });
            item.appendChild(delBtn);

            filterList.appendChild(item);
        });
    };

    // Botón para añadir filtro
    const addBtn = document.createElement('button');
    addBtn.className = 'w-full border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:text-indigo-500 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors focus:outline-none';
    addBtn.innerHTML = `<span class="material-symbols-outlined text-sm">add</span> Añadir filtro`;
    addBtn.addEventListener('click', () => {
        const firstCol = db.columns[0];
        db.view.filters.push({
            columnId: firstCol.id,
            operator: getDefaultOperator(firstCol.type),
            value: ''
        });
        triggerEditorInput();
        refreshDatabase(dbId);
        renderFilters();
    });
    popup.appendChild(addBtn);

    renderFilters();

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
}

function getDefaultOperator(type) {
    switch (type) {
        case 'text':
        case 'url': return 'contains';
        case 'number': return 'eq';
        case 'select':
        case 'status':
        case 'multiselect': return 'is';
        case 'date': return 'is';
        case 'checkbox': return 'is_true';
        default: return 'contains';
    }
}

function getOperatorsForType(type) {
    switch (type) {
        case 'text':
        case 'url':
            return [
                { val: 'contains', name: 'contiene' },
                { val: 'does_not_contain', name: 'no contiene' },
                { val: 'is', name: 'es' },
                { val: 'is_not', name: 'no es' },
                { val: 'is_empty', name: 'está vacío' },
                { val: 'is_not_empty', name: 'no está vacío' }
            ];
        case 'number':
            return [
                { val: 'eq', name: '=' },
                { val: 'neq', name: '≠' },
                { val: 'gt', name: '>' },
                { val: 'lt', name: '<' },
                { val: 'gte', name: '≥' },
                { val: 'lte', name: '≤' },
                { val: 'is_empty', name: 'está vacío' },
                { val: 'is_not_empty', name: 'no está vacío' }
            ];
        case 'select':
        case 'status':
            return [
                { val: 'is', name: 'es' },
                { val: 'is_not', name: 'no es' },
                { val: 'is_empty', name: 'está vacío' },
                { val: 'is_not_empty', name: 'no está vacío' }
            ];
        case 'multiselect':
            return [
                { val: 'contains', name: 'contiene' },
                { val: 'does_not_contain', name: 'no contiene' },
                { val: 'is_empty', name: 'está vacío' },
                { val: 'is_not_empty', name: 'no está vacío' }
            ];
        case 'date':
            return [
                { val: 'is', name: 'es' },
                { val: 'before', name: 'antes de' },
                { val: 'after', name: 'después de' },
                { val: 'is_empty', name: 'está vacío' },
                { val: 'is_not_empty', name: 'no está vacío' }
            ];
        case 'checkbox':
            return [
                { val: 'is_true', name: 'está marcado' },
                { val: 'is_false', name: 'no está marcado' }
            ];
        default:
            return [{ val: 'is_empty', name: 'está vacío' }];
    }
}

function openSortPanel(dbId, triggerBtn) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const rect = triggerBtn.getBoundingClientRect();
    
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 w-[340px] sm:w-[400px] max-h-[350px] overflow-y-auto text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-3';
    
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;
    if (left + 400 > window.innerWidth) left = window.innerWidth - 415;
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    const title = document.createElement('div');
    title.className = 'flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2';
    title.innerHTML = `<span class="font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-300"><span class="material-symbols-outlined text-lg">swap_vert</span> Reglas de Ordenamiento</span>`;
    popup.appendChild(title);

    const sortList = document.createElement('div');
    sortList.className = 'space-y-2';
    popup.appendChild(sortList);

    const renderSorts = () => {
        sortList.innerHTML = '';
        if (db.view.sorts.length === 0) {
            sortList.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 italic py-2">Sin ordenamiento configurado. Se muestra por creación.</div>`;
            return;
        }

        db.view.sorts.forEach((sort, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800/40 text-xs';

            // 1. Column
            const colSel = document.createElement('select');
            colSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer';
            db.columns.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                if (c.id === sort.columnId) opt.selected = true;
                colSel.appendChild(opt);
            });
            colSel.addEventListener('change', (e) => {
                sort.columnId = e.target.value;
                triggerEditorInput();
                refreshDatabase(dbId);
            });
            item.appendChild(colSel);

            // 2. Direction
            const dirSel = document.createElement('select');
            dirSel.className = 'bg-white dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none cursor-pointer';
            const dirs = [
                { val: 'asc', name: 'A → Z / Asc' },
                { val: 'desc', name: 'Z → A / Desc' }
            ];
            dirs.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.val;
                opt.textContent = d.name;
                if (d.val === sort.direction) opt.selected = true;
                dirSel.appendChild(opt);
            });
            dirSel.addEventListener('change', (e) => {
                sort.direction = e.target.value;
                triggerEditorInput();
                refreshDatabase(dbId);
            });
            item.appendChild(dirSel);

            // Remove Button
            const delBtn = document.createElement('button');
            delBtn.className = 'p-1 hover:bg-rose-100 hover:text-rose-500 dark:hover:bg-rose-950/20 text-slate-400 rounded transition-colors ml-auto focus:outline-none';
            delBtn.innerHTML = `<span class="material-symbols-outlined text-base">close</span>`;
            delBtn.addEventListener('click', () => {
                db.view.sorts.splice(idx, 1);
                triggerEditorInput();
                refreshDatabase(dbId);
                renderSorts();
            });
            item.appendChild(delBtn);

            sortList.appendChild(item);
        });
    };

    // Add Sort button
    const addBtn = document.createElement('button');
    addBtn.className = 'w-full border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:text-indigo-500 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors focus:outline-none';
    addBtn.innerHTML = `<span class="material-symbols-outlined text-sm">add</span> Añadir ordenamiento`;
    addBtn.addEventListener('click', () => {
        const firstCol = db.columns[0];
        db.view.sorts.push({
            columnId: firstCol.id,
            direction: 'asc'
        });
        triggerEditorInput();
        refreshDatabase(dbId);
        renderSorts();
    });
    popup.appendChild(addBtn);

    renderSorts();

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
}

function addSortRule(dbId, columnId, direction) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    if (!db.view.sorts) db.view.sorts = [];
    
    // Si ya existe un sort para esta columna, actualizarlo; si no, agregarlo
    const existing = db.view.sorts.find(s => s.columnId === columnId);
    if (existing) {
        existing.direction = direction;
    } else {
        db.view.sorts.push({ columnId, direction });
    }

    triggerEditorInput();
    refreshDatabase(dbId);
}

// ============================================================
// 11. Dropdowns de Acciones y Cálculos en Celdas
// ============================================================

function openCalculationDropdown(dbId, columnId, footerCellEl) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === columnId);
    if (!col) return;

    const rect = footerCellEl.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1 w-44 text-xs animate-in fade-in zoom-in duration-100 flex flex-col max-h-56 overflow-y-auto';
    
    let top = rect.top + window.scrollY - 180; // Intentar posicionarlo arriba
    let left = rect.left + window.scrollX;
    if (left + 176 > window.innerWidth) left = window.innerWidth - 190;
    if (top < 10) top = rect.bottom + window.scrollY + 4; // Si desborda arriba, poner abajo

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    const fns = [
        { val: 'none', name: 'Ninguno' },
        { val: 'count', name: 'Contar todo' },
        { val: 'count_values', name: 'Valores llenos' },
        { val: 'count_unique', name: 'Valores únicos' },
        { val: 'percent_empty', name: '% de vacíos' },
        { val: 'percent_not_empty', name: '% de llenos' }
    ];

    // Funciones matemáticas específicas
    if (col.type === 'number') {
        fns.push(
            { val: 'sum', name: 'Suma' },
            { val: 'avg', name: 'Promedio' },
            { val: 'min', name: 'Mínimo' },
            { val: 'max', name: 'Máximo' }
        );
    } else if (col.type === 'date') {
        fns.push(
            { val: 'min', name: 'Fecha más antigua' },
            { val: 'max', name: 'Fecha más reciente' }
        );
    }

    const currentFn = db.view.calculations[col.id] || 'none';

    fns.forEach(fn => {
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded transition-colors flex items-center justify-between ${fn.val === currentFn ? 'text-indigo-500 font-semibold' : 'text-slate-600 dark:text-slate-400'}`;
        btn.innerHTML = `<span>${fn.name}</span> ${fn.val === currentFn ? '<span class="material-symbols-outlined text-xs">check</span>' : ''}`;
        
        btn.addEventListener('click', () => {
            if (fn.val === 'none') {
                delete db.view.calculations[col.id];
            } else {
                db.view.calculations[col.id] = fn.val;
            }
            triggerEditorInput();
            refreshDatabase(dbId);
            closeActivePopups();
        });

        popup.appendChild(btn);
    });

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
}

function openDatabaseMenu(dbId, triggerBtn) {
    closeActivePopups();

    const rect = triggerBtn.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1 w-52 text-xs animate-in fade-in zoom-in duration-100 flex flex-col';
    
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX - 180;
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    // 1. Duplicar Base de Datos
    const dupBtn = document.createElement('button');
    dupBtn.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 rounded flex items-center gap-2 transition-colors';
    dupBtn.innerHTML = `<span class="material-symbols-outlined text-base">content_copy</span> Duplicar base de datos`;
    dupBtn.addEventListener('click', () => {
        duplicateDatabase(dbId);
        closeActivePopups();
    });
    popup.appendChild(dupBtn);

    // 2. Exportar a CSV
    const csvBtn = document.createElement('button');
    csvBtn.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 rounded flex items-center gap-2 transition-colors';
    csvBtn.innerHTML = `<span class="material-symbols-outlined text-base">download</span> Exportar a CSV`;
    csvBtn.addEventListener('click', () => {
        exportToCSV(dbId);
        closeActivePopups();
    });
    popup.appendChild(csvBtn);

    // Divisor
    const divider = document.createElement('div');
    divider.className = 'border-t border-slate-100 dark:border-slate-800 my-1';
    popup.appendChild(divider);

    // 3. Eliminar Base de Datos
    const delBtn = document.createElement('button');
    delBtn.className = 'w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded flex items-center gap-2 font-semibold transition-colors';
    delBtn.innerHTML = `<span class="material-symbols-outlined text-base">delete</span> Eliminar base de datos`;
    delBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres eliminar esta base de datos? Se perderán todos sus registros y columnas.')) {
            destroyDatabase(dbId);
        }
        closeActivePopups();
    });
    popup.appendChild(delBtn);

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[998] bg-transparent';
    backdrop.addEventListener('click', () => closeActivePopups());

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
    
    activePopup = { popup, backdrop };
}

function duplicateDatabase(dbId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const srcDb = post.databases[dbId];
    const newDbId = crypto.randomUUID();
    
    // Clonación profunda
    const dupDb = JSON.parse(JSON.stringify(srcDb));
    dupDb.id = newDbId;
    dupDb.title = dupDb.title + ' (Copia)';
    
    // Guardar copia
    post.databases[newDbId] = dupDb;

    // Duplicar el bloque en el editor HTML
    const srcBlock = document.querySelector(`.ntb-database-block[data-db-id="${dbId}"]`);
    if (srcBlock) {
        const dupBlock = document.createElement('div');
        dupBlock.className = 'ntb-database-block my-6';
        dupBlock.setAttribute('data-db-id', newDbId);
        dupBlock.setAttribute('contenteditable', 'false');

        // Insertar después de la original
        srcBlock.after(dupBlock);
        
        // Renderizar la copia
        renderDatabase(newDbId, dupBlock);
        triggerEditorInput();
        showToast('Base de datos duplicada');
    }
}

// ============================================================
// 12. Exportación a CSV
// ============================================================

export function exportToCSV(dbId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const processedRows = getProcessedRows(db);

    const csvRows = [];
    
    // Cabeceras de columna
    const headers = db.columns.map(c => `"${c.name.replace(/"/g, '""')}"`);
    csvRows.push(headers.join(','));

    // Datos por fila
    processedRows.forEach(row => {
        const rowData = db.columns.map(col => {
            const cellVal = row.cells[col.id];
            
            // Formatear valor legible para el CSV
            let strVal = '';
            if (cellVal !== undefined && cellVal !== null) {
                if (col.type === 'multiselect') {
                    const choices = col.options?.choices || [];
                    const names = (Array.isArray(cellVal) ? cellVal : []).map(id => {
                        const choice = choices.find(ch => ch.id === id);
                        return choice ? choice.name : '';
                    });
                    strVal = names.join('; ');
                } else if (col.type === 'select' || col.type === 'status') {
                    const choices = col.options?.choices || [];
                    const choice = choices.find(ch => ch.id === cellVal);
                    strVal = choice ? choice.name : '';
                } else if (col.type === 'checkbox') {
                    strVal = cellVal ? 'Verdadero' : 'Falso';
                } else {
                    strVal = String(cellVal);
                }
            }
            return `"${strVal.replace(/"/g, '""')}"`;
        });
        csvRows.push(rowData.join(','));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n"); // Bom UTF-8 para Excel en español
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const filename = `${db.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_export.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================
// 13. Cierre y Limpieza de Elementos Globales
// ============================================================

export function closeActivePopups() {
    if (activePopup) {
        if (activePopup.popup) activePopup.popup.remove();
        if (activePopup.backdrop) activePopup.backdrop.remove();
        activePopup = null;
    }
}

// Escuchar clicks globales en el documento para cerrar popups si el clic no es parte de ellos
document.addEventListener('mousedown', (e) => {
    // Si se hace clic en algo con editor de celda, no hacer nada para dejar que su propio blur funcione
    if (activeCellEditor && !e.target.closest('.ntb-db-cell-editor') && !e.target.closest('input')) {
        // closeCellEditor handles itself through input blur / save
    }
});

// Notificaciones delegadas a toast.js
