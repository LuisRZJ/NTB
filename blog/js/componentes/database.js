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
    
    let width = 150;
    if (type === 'checkbox') width = 75;
    if (type === 'logo') width = 90;

    const newCol = {
        id: colId,
        name: name || 'Nueva columna',
        type: type || 'text',
        width: width,
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
    if (!col.options) col.options = { choices: [] };
    if (!col.options.choices) col.options.choices = [];

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
        if (typeof val === 'object' && val !== null) {
            return val.description ? `${val.text || ''} (${val.description})` : (val.text || '');
        }
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
        default: {
            if (fn.startsWith('count_choice_')) {
                const choiceId = fn.replace('count_choice_', '');
                const choices = column.options?.choices || [];
                const choice = choices.find(c => c.id === choiceId);
                const choiceName = choice ? choice.name : 'Etiqueta';
                
                const count = values.filter(val => {
                    if (type === 'multiselect') {
                        return Array.isArray(val) && val.includes(choiceId);
                    }
                    return val === choiceId;
                }).length;

                return `${choiceName}: ${count}`;
            }

            if (fn.startsWith('percent_choice_')) {
                const choiceId = fn.replace('percent_choice_', '');
                const choices = column.options?.choices || [];
                const choice = choices.find(c => c.id === choiceId);
                const choiceName = choice ? choice.name : 'Etiqueta';

                const count = values.filter(val => {
                    if (type === 'multiselect') {
                        return Array.isArray(val) && val.includes(choiceId);
                    }
                    return val === choiceId;
                }).length;

                const pct = rows.length > 0 ? Math.round((count / rows.length) * 100) : 0;
                return `${choiceName}: ${pct}%`;
            }

            return '';
        }
    }
}

// ============================================================
// 5. Renderizador de la Base de Datos (DOM Builder)
// ============================================================

export function renderDatabase(dbId, container) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];

    // Sanitización e inicialización defensiva de db.view
    if (!db.view) {
        db.view = { sorts: [], filters: [], hiddenColumns: [], calculations: {}, showCalculations: true };
    } else {
        if (!Array.isArray(db.view.sorts)) db.view.sorts = [];
        if (!Array.isArray(db.view.filters)) db.view.filters = [];
        if (!Array.isArray(db.view.hiddenColumns)) db.view.hiddenColumns = [];
        if (!db.view.calculations || typeof db.view.calculations !== 'object') db.view.calculations = {};
        if (db.view.showCalculations === undefined) db.view.showCalculations = true;
    }

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
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
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

    db.columns.forEach((col, colIdx) => {
        const th = document.createElement('th');
        th.className = 'relative px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200/60 dark:border-slate-800/40 text-xs tracking-wider select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/20 group transition-all cursor-grab active:cursor-grabbing';
        th.setAttribute('data-col-id', col.id);
        th.setAttribute('data-col-index', colIdx);
        th.setAttribute('draggable', 'true');
        
        const thContent = document.createElement('div');
        thContent.className = 'flex items-center gap-1.5 pr-3 truncate pointer-events-auto';
        
        // Icono según tipo de columna
        const colIcon = getColumnTypeIcon(col.type);
        thContent.innerHTML = `<span class="material-symbols-outlined text-slate-400 text-sm flex-shrink-0">${colIcon}</span><span class="truncate font-semibold pointer-events-none">${col.name}</span>`;
        
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

        // Eventos Drag & Drop para reordenación rápida de columnas
        th.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('ntb-db-resize-handle')) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', col.id);
            th.classList.add('opacity-40', 'bg-indigo-50/50', 'dark:bg-indigo-950/30');
            window.__ntb_dragged_col_id = col.id;
            window.__ntb_dragged_db_id = dbId;
        });

        th.addEventListener('dragend', () => {
            th.classList.remove('opacity-40', 'bg-indigo-50/50', 'dark:bg-indigo-950/30');
            document.querySelectorAll('.ntb-db-drop-target').forEach(el => {
                el.classList.remove('ntb-db-drop-target', 'border-l-2', 'border-r-2', 'border-indigo-500');
            });
            delete window.__ntb_dragged_col_id;
            delete window.__ntb_dragged_db_id;
        });

        th.addEventListener('dragover', (e) => {
            if (!window.__ntb_dragged_col_id || window.__ntb_dragged_db_id !== dbId) return;
            if (window.__ntb_dragged_col_id === col.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = th.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            
            th.classList.add('ntb-db-drop-target');
            th.classList.remove('border-l-2', 'border-r-2', 'border-indigo-500');
            if (e.clientX < midpoint) {
                th.classList.add('border-l-2', 'border-indigo-500');
            } else {
                th.classList.add('border-r-2', 'border-indigo-500');
            }
        });

        th.addEventListener('dragleave', () => {
            th.classList.remove('ntb-db-drop-target', 'border-l-2', 'border-r-2', 'border-indigo-500');
        });

        th.addEventListener('drop', (e) => {
            th.classList.remove('ntb-db-drop-target', 'border-l-2', 'border-r-2', 'border-indigo-500');
            const draggedColId = window.__ntb_dragged_col_id || e.dataTransfer.getData('text/plain');
            if (!draggedColId || window.__ntb_dragged_db_id !== dbId || draggedColId === col.id) return;
            e.preventDefault();

            const fromIndex = db.columns.findIndex(c => c.id === draggedColId);
            let toIndex = db.columns.findIndex(c => c.id === col.id);
            if (fromIndex === -1 || toIndex === -1) return;

            const rect = th.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            if (e.clientX >= midpoint && fromIndex < toIndex) {
                // Posicionar a la derecha
            } else if (e.clientX >= midpoint && fromIndex > toIndex) {
                toIndex++;
            } else if (e.clientX < midpoint && fromIndex < toIndex) {
                toIndex--;
            }

            const [movedCol] = db.columns.splice(fromIndex, 1);
            db.columns.splice(toIndex, 0, movedCol);

            savePostsToStorage();
            triggerEditorInput();
            refreshDatabase(dbId);
            showToast(`Columna "${movedCol.name}" reordenada`);
        });

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
                td.innerHTML = renderCellValue(col, cellVal, dbId, row.id);

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
        case 'text': return 'short_text';
        case 'number': return 'tag';
        case 'select': return 'arrow_drop_down_circle';
        case 'multiselect': return 'style';
        case 'date': return 'calendar_today';
        case 'checkbox': return 'check_box';
        case 'url': return 'link';
        case 'status': return 'toggle_on';
        case 'logo': return 'image';
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
        case 'logo': return 'Logo';
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

export function renderCellValue(column, value, dbId = null, rowId = null) {
    if (value === undefined || value === null || value === '') {
        if (column.type === 'checkbox') {
            return `<span class="material-symbols-outlined text-slate-300 dark:text-slate-700 hover:text-indigo-500/80 transition-colors text-xl ntb-db-checkbox-symbol">check_box_outline_blank</span>`;
        }
        return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;
    }

    switch (column.type) {
        case 'text': {
            let cellText = '';
            let cellDesc = '';
            if (typeof value === 'object' && value !== null) {
                cellText = value.text || '';
                cellDesc = value.description || '';
            } else {
                cellText = String(value);
            }

            if (!cellText && !cellDesc) return `<span class="text-slate-300 dark:text-slate-700 italic text-xs">Vacío</span>`;

            const descIcon = cellDesc
                ? `<span class="material-symbols-outlined text-indigo-500 text-xs shrink-0 cursor-pointer hover:scale-125 transition-transform ml-1" title="Ver descripción: ${escapeHTML(cellDesc.substring(0, 50))}" onclick="event.stopPropagation(); openCellDescriptionModal('${dbId}', '${rowId}', '${column.id}');">description</span>`
                : (dbId && rowId ? `<span class="material-symbols-outlined text-slate-300 dark:text-slate-600 text-xs shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-indigo-500 transition-all ml-1" title="Añadir descripción" onclick="event.stopPropagation(); openCellDescriptionModal('${dbId}', '${rowId}', '${column.id}');">add_notes</span>` : '');

            return `<div class="flex items-center justify-between w-full overflow-hidden gap-1"><span class="truncate">${escapeHTML(cellText || 'Sin título')}</span>${descIcon}</div>`;
        }

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

        case 'logo': {
            const logoUrl = value && typeof value === 'string' ? value.trim() : (value && typeof value === 'object' ? value.url || '' : '');
            
            if (logoUrl) {
                return `<div class="flex items-center justify-center w-full h-full py-0.5"><img src="${escapeHTML(logoUrl)}" class="w-8 h-8 rounded-lg object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs cursor-pointer hover:scale-105 transition-transform" title="Haz clic para cambiar el logo" onclick="event.stopPropagation(); openLogoUrlModal('${dbId}', '${rowId}', '${column.id}');" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<span class=\\'text-[10px] text-rose-500 font-bold\\'>Error URL</span>';" /></div>`;
            }

            return `<button class="flex items-center justify-center gap-1 text-slate-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 text-xs italic transition-colors w-full py-1" onclick="event.stopPropagation(); openLogoUrlModal('${dbId}', '${rowId}', '${column.id}');"><span class="material-symbols-outlined text-base">add_photo_alternate</span> <span class="text-[11px] font-medium">Logo</span></button>`;
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
    
    if (col.type === 'logo') {
        openLogoUrlModal(dbId, rowId, columnId);
        return;
    }
    
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
            input.value = typeof currentValue === 'object' && currentValue !== null ? (currentValue.text || '') : (currentValue || '');
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
            } else if (col.type === 'text' && typeof currentValue === 'object' && currentValue !== null) {
                newVal = { ...currentValue, text: input.value };
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
    listContainer.className = 'max-h-48 overflow-y-auto space-y-1';
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
            const itemRow = document.createElement('div');
            itemRow.className = 'w-full flex items-center justify-between px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs transition-colors group relative gap-1';
            
            const badgeClass = getChipColorClasses(choice.color);
            const isSelected = col.type === 'multiselect'
                ? (Array.isArray(currentValue) && currentValue.includes(choice.id))
                : (currentValue === choice.id);

            const groupDot = col.type === 'status'
                ? `<span class="w-1.5 h-1.5 rounded-full ${choice.group === 'done' ? 'bg-green-500' : (choice.group === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400')}"></span>`
                : '';

            // Lado izquierdo: Chip interactivo
            const chipBtn = document.createElement('button');
            chipBtn.className = 'flex items-center gap-1.5 min-w-0 flex-1 text-left';
            chipBtn.innerHTML = `<span class="px-2 py-0.5 rounded font-medium inline-flex items-center gap-1.5 truncate ${badgeClass}">${groupDot}${escapeHTML(choice.name)}</span>`;
            
            chipBtn.addEventListener('click', () => {
                if (col.type === 'multiselect') {
                    let currentArr = Array.isArray(currentValue) ? [...currentValue] : [];
                    if (currentArr.includes(choice.id)) {
                        currentArr = currentArr.filter(id => id !== choice.id);
                    } else {
                        currentArr.push(choice.id);
                    }
                    updateCell(dbId, rowId, col.id, currentArr);
                    currentValue = currentArr;
                    renderList(searchInput.value);
                } else {
                    updateCell(dbId, rowId, col.id, choice.id);
                    closeActivePopups();
                }
            });
            itemRow.appendChild(chipBtn);

            // Controles de la opción (Seleccionado / Paleta / Editar / Borrar)
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'flex items-center gap-0.5 shrink-0';

            // Checkmark de selección
            if (isSelected) {
                const checkIcon = document.createElement('span');
                checkIcon.className = 'material-symbols-outlined text-indigo-500 text-base mr-1';
                checkIcon.textContent = col.type === 'multiselect' ? 'check_box' : 'check';
                actionsDiv.appendChild(checkIcon);
            }

            // Botón de Paleta de Color
            const paletteBtn = document.createElement('button');
            paletteBtn.className = 'p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100 flex';
            paletteBtn.title = 'Cambiar color';
            paletteBtn.innerHTML = `<span class="material-symbols-outlined text-sm">palette</span>`;
            paletteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openOptionColorPickerPopup(dbId, col.id, choice.id, paletteBtn, () => renderList(searchInput.value));
            });
            actionsDiv.appendChild(paletteBtn);

            // Botón de Renombrar Opción
            const editBtn = document.createElement('button');
            editBtn.className = 'p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100 flex';
            editBtn.title = 'Renombrar opción';
            editBtn.innerHTML = `<span class="material-symbols-outlined text-sm">edit_note</span>`;
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt('Nuevo nombre para la opción:', choice.name);
                if (newName !== null && newName.trim() !== '') {
                    renameChoice(dbId, col.id, choice.id, newName.trim());
                    renderList(searchInput.value);
                }
            });
            actionsDiv.appendChild(editBtn);

            // Botón de Eliminar Opción
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 flex';
            deleteBtn.title = 'Eliminar opción';
            deleteBtn.innerHTML = `<span class="material-symbols-outlined text-sm">delete</span>`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChoice(dbId, col.id, choice.id);
                renderList(searchInput.value);
            });
            actionsDiv.appendChild(deleteBtn);

            itemRow.appendChild(actionsDiv);
            listContainer.appendChild(itemRow);
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
    savePostsToStorage();
    triggerEditorInput();
    return newChoice;
}

export function updateChoiceColor(dbId, colId, choiceId, newColor) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    if (!col || !col.options || !col.options.choices) return;

    const choice = col.options.choices.find(c => c.id === choiceId);
    if (choice) {
        choice.color = newColor;
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
    }
}

export function renameChoice(dbId, colId, choiceId, newName) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    if (!col || !col.options || !col.options.choices) return;

    const choice = col.options.choices.find(c => c.id === choiceId);
    if (choice) {
        choice.name = newName.trim();
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
    }
}

export function deleteChoice(dbId, colId, choiceId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    if (!col || !col.options || !col.options.choices) return;

    // Eliminar la opción del array de choices
    col.options.choices = col.options.choices.filter(c => c.id !== choiceId);

    // Limpiar referencias en las filas
    db.rows.forEach(row => {
        const val = row.cells[colId];
        if (col.type === 'multiselect' && Array.isArray(val)) {
            row.cells[colId] = val.filter(id => id !== choiceId);
        } else if (val === choiceId) {
            row.cells[colId] = null;
        }
    });

    savePostsToStorage();
    triggerEditorInput();
    refreshDatabase(dbId);
    showToast('Opción eliminada');
}

function openOptionColorPickerPopup(dbId, colId, choiceId, triggerBtn, onComplete) {
    const rect = triggerBtn.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'fixed z-[1000] bg-white dark:bg-[#202124] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 text-xs flex flex-wrap gap-1.5 w-44 animate-in fade-in zoom-in duration-100';

    let top = rect.bottom + window.scrollY + 2;
    let left = rect.left + window.scrollX - 80;
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    CHIP_COLORS.forEach(c => {
        const colorBtn = document.createElement('button');
        colorBtn.className = `w-5 h-5 rounded-full ${c.bg} border border-slate-300 dark:border-slate-700 hover:scale-110 transition-transform flex items-center justify-center`;
        colorBtn.title = c.name;
        colorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateChoiceColor(dbId, colId, choiceId, c.hex);
            popup.remove();
            if (backdrop) backdrop.remove();
            if (onComplete) onComplete();
        });
        popup.appendChild(colorBtn);
    });

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-[999] bg-transparent';
    backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.remove();
        backdrop.remove();
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);
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
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3.5 w-64 text-sm animate-in fade-in zoom-in duration-100 flex flex-col gap-3 max-h-[80vh] overflow-y-auto no-scrollbar';
    
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX;
    if (left + 260 > window.innerWidth) left = window.innerWidth - 275;
    if (left < 10) left = 10;

    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;

    if (spaceBelow < 350 && spaceAbove > spaceBelow) {
        popup.style.maxHeight = `${Math.min(460, spaceAbove)}px`;
        top = Math.max(10, rect.top + window.scrollY - Math.min(460, spaceAbove) - 4);
    } else {
        popup.style.maxHeight = `${Math.min(460, Math.max(220, spaceBelow))}px`;
        top = rect.bottom + window.scrollY + 4;
    }

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
    
    const types = ['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'url', 'status', 'logo'];
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

    // Section: Gestión de Opciones de Etiquetas en Configuración
    if (col.type === 'select' || col.type === 'multiselect' || col.type === 'status' || (col.options && col.options.choices && col.options.choices.length > 0)) {
        const optionsLabel = document.createElement('label');
        optionsLabel.className = 'text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mt-1 block';
        optionsLabel.textContent = 'Opciones de etiquetas';
        popup.appendChild(optionsLabel);

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'max-h-36 overflow-y-auto space-y-1 pr-1 border border-slate-100 dark:border-slate-800 p-1.5 rounded-lg bg-slate-50/50 dark:bg-slate-900/30';

        const renderConfigChoices = () => {
            optionsContainer.innerHTML = '';
            const choices = col.options?.choices || [];

            if (choices.length === 0) {
                optionsContainer.innerHTML = `<span class="text-[11px] text-slate-400 italic block p-1">No hay opciones creadas.</span>`;
            } else {
                choices.forEach(ch => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center justify-between gap-1 p-1 bg-white dark:bg-[#1a1c1e] rounded border border-slate-200/60 dark:border-slate-800';

                    const left = document.createElement('div');
                    left.className = 'flex items-center gap-1.5 flex-1 min-w-0';

                    // Botón paleta de color
                    const paletteBtn = document.createElement('button');
                    paletteBtn.className = `w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0 ${getChipColorClasses(ch.color)}`;
                    paletteBtn.title = 'Cambiar color';
                    paletteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openOptionColorPickerPopup(dbId, col.id, ch.id, paletteBtn, () => {
                            savePostsToStorage();
                            refreshDatabase(dbId);
                            renderConfigChoices();
                        });
                    });
                    left.appendChild(paletteBtn);

                    // Input editable de nombre
                    const nameIn = document.createElement('input');
                    nameIn.className = 'bg-transparent border-0 text-xs font-medium text-slate-700 dark:text-slate-200 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1';
                    nameIn.value = ch.name;
                    nameIn.addEventListener('change', (e) => {
                        renameChoice(dbId, col.id, ch.id, e.target.value);
                    });
                    left.appendChild(nameIn);

                    row.appendChild(left);

                    // Botón eliminar opción
                    const delBtn = document.createElement('button');
                    delBtn.className = 'p-0.5 text-slate-400 hover:text-rose-500 rounded transition-colors flex';
                    delBtn.title = 'Eliminar opción';
                    delBtn.innerHTML = `<span class="material-symbols-outlined text-sm">delete</span>`;
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteChoice(dbId, col.id, ch.id);
                        renderConfigChoices();
                    });
                    row.appendChild(delBtn);

                    optionsContainer.appendChild(row);
                });
            }
        };

        renderConfigChoices();
        popup.appendChild(optionsContainer);

        // Botón para crear nueva opción desde la configuración
        const addOptionBtn = document.createElement('button');
        addOptionBtn.className = 'w-full py-1 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg flex items-center justify-center gap-1 transition-colors';
        addOptionBtn.innerHTML = `<span class="material-symbols-outlined text-sm">add</span> Añadir opción`;
        addOptionBtn.addEventListener('click', () => {
            const optName = prompt('Nombre de la nueva opción:');
            if (optName && optName.trim()) {
                createNewChoiceForColumn(dbId, col.id, optName.trim());
                savePostsToStorage();
                refreshDatabase(dbId);
                renderConfigChoices();
            }
        });
        popup.appendChild(addOptionBtn);
    }

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

    // Botones de Mover Columna a Izquierda / Derecha
    const colIdx = db.columns.findIndex(c => c.id === columnId);
    if (colIdx > 0) {
        const moveLeftBtn = document.createElement('button');
        moveLeftBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs flex items-center gap-2 text-slate-600 dark:text-slate-400';
        moveLeftBtn.innerHTML = `<span class="material-symbols-outlined text-base">arrow_back</span> Mover a la izquierda`;
        moveLeftBtn.addEventListener('click', () => {
            const [movedCol] = db.columns.splice(colIdx, 1);
            db.columns.splice(colIdx - 1, 0, movedCol);
            savePostsToStorage();
            triggerEditorInput();
            refreshDatabase(dbId);
            closeActivePopups();
            showToast(`Columna "${movedCol.name}" movida a la izquierda`);
        });
        popup.appendChild(moveLeftBtn);
    }

    if (colIdx < db.columns.length - 1) {
        const moveRightBtn = document.createElement('button');
        moveRightBtn.className = 'w-full text-left px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded text-xs flex items-center gap-2 text-slate-600 dark:text-slate-400';
        moveRightBtn.innerHTML = `<span class="material-symbols-outlined text-base">arrow_forward</span> Mover a la derecha`;
        moveRightBtn.addEventListener('click', () => {
            const [movedCol] = db.columns.splice(colIdx, 1);
            db.columns.splice(colIdx + 1, 0, movedCol);
            savePostsToStorage();
            triggerEditorInput();
            refreshDatabase(dbId);
            closeActivePopups();
            showToast(`Columna "${movedCol.name}" movida a la derecha`);
        });
        popup.appendChild(moveRightBtn);
    }

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
    
    const types = ['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'url', 'status', 'logo'];
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
                savePostsToStorage();
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
                savePostsToStorage();
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
                        savePostsToStorage();
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
                        savePostsToStorage();
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
                        savePostsToStorage();
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
                        savePostsToStorage();
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
                savePostsToStorage();
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
        savePostsToStorage();
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
                savePostsToStorage();
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
                savePostsToStorage();
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
                savePostsToStorage();
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
        savePostsToStorage();
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

    savePostsToStorage();
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
    } else if (col.type === 'select' || col.type === 'multiselect' || col.type === 'status' || (col.options && col.options.choices && col.options.choices.length > 0)) {
        const choices = col.options?.choices || [];
        if (choices.length > 0) {
            fns.push({ isHeader: true, name: 'CONTEO POR ETIQUETA' });
            choices.forEach(ch => {
                fns.push({
                    val: `count_choice_${ch.id}`,
                    name: `Contar "${ch.name}"`,
                    color: ch.color
                });
            });

            fns.push({ isHeader: true, name: 'PORCENTAJE POR ETIQUETA' });
            choices.forEach(ch => {
                fns.push({
                    val: `percent_choice_${ch.id}`,
                    name: `% de "${ch.name}"`,
                    color: ch.color
                });
            });
        }
    }

    const currentFn = db.view.calculations[col.id] || 'none';

    fns.forEach(fn => {
        if (fn.isHeader) {
            const headerEl = document.createElement('div');
            headerEl.className = 'px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase border-t border-slate-100 dark:border-slate-800 mt-1';
            headerEl.textContent = fn.name;
            popup.appendChild(headerEl);
            return;
        }

        const btn = document.createElement('button');
        btn.className = `w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded transition-colors flex items-center justify-between text-xs ${fn.val === currentFn ? 'text-indigo-500 font-semibold bg-indigo-50/50 dark:bg-indigo-950/30' : 'text-slate-600 dark:text-slate-400'}`;
        
        const dot = fn.color ? `<span class="w-2 h-2 rounded-full inline-block mr-1.5 shrink-0 ${getChipColorClasses(fn.color)}"></span>` : '';
        btn.innerHTML = `<span class="flex items-center truncate">${dot}${escapeHTML(fn.name)}</span> ${fn.val === currentFn ? '<span class="material-symbols-outlined text-xs shrink-0 ml-1">check</span>' : ''}`;
        
        btn.addEventListener('click', () => {
            if (fn.val === 'none') {
                delete db.view.calculations[col.id];
            } else {
                db.view.calculations[col.id] = fn.val;
            }
            savePostsToStorage();
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

    // 1. Propiedades y Columnas (Panel de Ajustes)
    const colMgrBtn = document.createElement('button');
    colMgrBtn.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 rounded flex items-center gap-2 transition-colors font-medium';
    colMgrBtn.innerHTML = `<span class="material-symbols-outlined text-base">view_column</span> Propiedades y columnas`;
    colMgrBtn.addEventListener('click', () => {
        closeActivePopups();
        openDatabaseColumnManager(dbId, triggerBtn);
    });
    popup.appendChild(colMgrBtn);

    // 2. Copiar Base de Datos (al portapapeles)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400 rounded flex items-center gap-2 transition-colors';
    copyBtn.innerHTML = `<span class="material-symbols-outlined text-base">copy_all</span> Copiar base de datos`;
    copyBtn.addEventListener('click', () => {
        copyDatabaseToClipboard(dbId);
        closeActivePopups();
    });
    popup.appendChild(copyBtn);

    // 3. Duplicar Base de Datos
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

// ============================================================
// 11b. Panel de Ajustes y Propiedades de Columnas
// ============================================================

export function openDatabaseColumnManager(dbId, triggerBtn) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];

    const rect = triggerBtn ? triggerBtn.getBoundingClientRect() : { top: 100, left: 100 };
    const popup = document.createElement('div');
    popup.className = 'fixed z-[999] bg-white dark:bg-[#202124] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 w-80 text-xs animate-in fade-in zoom-in duration-100 flex flex-col gap-3 max-h-[85vh]';
    
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX - 250;
    if (left < 10) left = 10;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
    if (top + 400 > window.innerHeight + window.scrollY) top = Math.max(10, window.innerHeight + window.scrollY - 420);

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    function renderColumnList() {
        popup.innerHTML = '';

        // Header del popup
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5';
        header.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500 text-lg">view_column</span>
                <span class="font-bold text-slate-800 dark:text-slate-100 text-sm">Propiedades y Columnas</span>
            </div>
            <button class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full flex" id="ntb-close-col-mgr">
                <span class="material-symbols-outlined text-base">close</span>
            </button>
        `;
        popup.appendChild(header);

        const closeBtn = header.querySelector('#ntb-close-col-mgr');
        if (closeBtn) closeBtn.addEventListener('click', () => closeActivePopups());

        // Contenedor de la lista de columnas
        const listContainer = document.createElement('div');
        listContainer.className = 'flex flex-col gap-2 overflow-y-auto max-h-72 pr-1 no-scrollbar';

        db.columns.forEach((col, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-2 bg-slate-50 dark:bg-[#1a1c1e] border border-slate-200/80 dark:border-slate-800 rounded-xl gap-2 transition-all hover:border-indigo-300 dark:hover:border-indigo-800';
            item.setAttribute('draggable', 'true');

            // Grupo izquierdo: Manejador drag, icono y nombre editable
            const leftGroup = document.createElement('div');
            leftGroup.className = 'flex items-center gap-2 flex-1 min-w-0';
            
            const dragHandle = document.createElement('span');
            dragHandle.className = 'material-symbols-outlined text-slate-400 cursor-grab text-base shrink-0 hover:text-slate-600 dark:hover:text-slate-200';
            dragHandle.textContent = 'drag_indicator';

            const colIcon = document.createElement('span');
            colIcon.className = 'material-symbols-outlined text-indigo-500 text-base shrink-0';
            colIcon.textContent = getColumnTypeIcon(col.type);

            const nameInput = document.createElement('input');
            nameInput.className = 'bg-transparent border-0 font-medium text-slate-700 dark:text-slate-200 text-xs focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500 rounded px-1 py-0.5 w-full truncate focus:outline-none';
            nameInput.value = col.name;
            nameInput.addEventListener('change', (e) => {
                renameColumn(dbId, col.id, e.target.value);
                savePostsToStorage();
                refreshDatabase(dbId);
            });

            leftGroup.appendChild(dragHandle);
            leftGroup.appendChild(colIcon);
            leftGroup.appendChild(nameInput);
            item.appendChild(leftGroup);

            // Grupo derecho: Botones Subir, Bajar y Eliminar
            const rightGroup = document.createElement('div');
            rightGroup.className = 'flex items-center gap-1 shrink-0';

            // Botón Subir
            const upBtn = document.createElement('button');
            upBtn.className = `p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-800 flex transition-colors ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}`;
            upBtn.title = 'Subir columna';
            upBtn.innerHTML = `<span class="material-symbols-outlined text-sm">keyboard_arrow_up</span>`;
            upBtn.addEventListener('click', () => {
                if (idx > 0) {
                    const [moved] = db.columns.splice(idx, 1);
                    db.columns.splice(idx - 1, 0, moved);
                    savePostsToStorage();
                    triggerEditorInput();
                    refreshDatabase(dbId);
                    renderColumnList();
                }
            });
            rightGroup.appendChild(upBtn);

            // Botón Bajar
            const downBtn = document.createElement('button');
            downBtn.className = `p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-800 flex transition-colors ${idx === db.columns.length - 1 ? 'opacity-30 pointer-events-none' : ''}`;
            downBtn.title = 'Bajar columna';
            downBtn.innerHTML = `<span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>`;
            downBtn.addEventListener('click', () => {
                if (idx < db.columns.length - 1) {
                    const [moved] = db.columns.splice(idx, 1);
                    db.columns.splice(idx + 1, 0, moved);
                    savePostsToStorage();
                    triggerEditorInput();
                    refreshDatabase(dbId);
                    renderColumnList();
                }
            });
            rightGroup.appendChild(downBtn);

            // Botón Eliminar
            const delBtn = document.createElement('button');
            delBtn.className = `p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex transition-colors ${db.columns.length <= 1 ? 'opacity-30 pointer-events-none' : ''}`;
            delBtn.title = 'Eliminar columna';
            delBtn.innerHTML = `<span class="material-symbols-outlined text-sm">delete</span>`;
            delBtn.addEventListener('click', () => {
                if (db.columns.length > 1) {
                    deleteColumn(dbId, col.id);
                    savePostsToStorage();
                    renderColumnList();
                }
            });
            rightGroup.appendChild(delBtn);

            item.appendChild(rightGroup);

            // Drag and drop entre los elementos de la lista
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', idx);
                item.classList.add('opacity-40');
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('opacity-40');
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const toIdx = idx;
                if (!isNaN(fromIdx) && fromIdx !== toIdx) {
                    const [moved] = db.columns.splice(fromIdx, 1);
                    db.columns.splice(toIdx, 0, moved);
                    savePostsToStorage();
                    triggerEditorInput();
                    refreshDatabase(dbId);
                    renderColumnList();
                }
            });

            listContainer.appendChild(item);
        });

        popup.appendChild(listContainer);

        // Pie del popup: Botón añadir nueva columna
        const footer = document.createElement('div');
        footer.className = 'border-t border-slate-100 dark:border-slate-800 pt-2.5 flex justify-between items-center';
        
        const addBtn = document.createElement('button');
        addBtn.className = 'w-full py-2 px-3 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-xs';
        addBtn.innerHTML = `<span class="material-symbols-outlined text-base">add</span> Nueva columna`;
        addBtn.addEventListener('click', () => {
            addColumn(dbId);
            savePostsToStorage();
            renderColumnList();
        });
        footer.appendChild(addBtn);

        popup.appendChild(footer);
    }

    renderColumnList();

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

window.openDatabaseColumnManager = openDatabaseColumnManager;

// ============================================================
// 14. Copiar al Portapapeles y Clonar al Pegar
// ============================================================

export function copyDatabaseToClipboard(dbId) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const payload = {
        type: 'ntb-database-clip',
        version: '1.0',
        data: db
    };
    const jsonStr = JSON.stringify(payload);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonStr).then(() => {
            localStorage.setItem('ntb_copied_database', jsonStr);
            showToast('Base de datos copiada al portapapeles');
        }).catch(() => {
            localStorage.setItem('ntb_copied_database', jsonStr);
            showToast('Base de datos copiada al portapapeles');
        });
    } else {
        localStorage.setItem('ntb_copied_database', jsonStr);
        showToast('Base de datos copiada al portapapeles');
    }
}

export function pasteClonedDatabase(dbData) {
    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    if (!post.databases) post.databases = {};

    const newDbId = crypto.randomUUID();
    const clonedDb = JSON.parse(JSON.stringify(dbData));
    clonedDb.id = newDbId;
    if (clonedDb.title) {
        clonedDb.title = clonedDb.title + ' (Copia)';
    }

    post.databases[newDbId] = clonedDb;

    const selection = window.getSelection();
    let range = null;
    if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
    }

    const html = `<div class="ntb-database-block my-6" data-db-id="${newDbId}" contenteditable="false"></div><p><br></p>`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const docContent = document.getElementById('doc-content');
    
    if (range && docContent && docContent.contains(range.commonAncestorContainer)) {
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
    } else if (docContent) {
        let lastNode = null;
        while (tempDiv.firstChild) {
            lastNode = tempDiv.firstChild;
            docContent.appendChild(lastNode);
        }
    }

    const container = document.querySelector(`.ntb-database-block[data-db-id="${newDbId}"]`);
    if (container) {
        renderDatabase(newDbId, container);
    }

    savePostsToStorage();
    triggerEditorInput();
    showToast('Base de datos pegada y clonada con éxito');
}

// Escuchar evento paste en el documento para detectar bases de datos copiadas
document.addEventListener('paste', (e) => {
    // Si se está editando una celda o un input normal, no interceptar
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.target.classList.contains('ntb-db-cell-editor')) {
        return;
    }

    const clipboardText = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    let dbData = null;

    if (clipboardText && clipboardText.includes('ntb-database-clip')) {
        try {
            const parsed = JSON.parse(clipboardText);
            if (parsed && parsed.type === 'ntb-database-clip' && parsed.data) {
                dbData = parsed.data;
            }
        } catch (err) {}
    }

    if (!dbData) {
        const fallbackText = localStorage.getItem('ntb_copied_database');
        if (fallbackText && fallbackText.includes('ntb-database-clip') && (!clipboardText || clipboardText.trim() === '')) {
            try {
                const parsed = JSON.parse(fallbackText);
                if (parsed && parsed.type === 'ntb-database-clip' && parsed.data) {
                    dbData = parsed.data;
                }
            } catch (err) {}
        }
    }

    if (dbData) {
        e.preventDefault();
        e.stopPropagation();
        pasteClonedDatabase(dbData);
    }
});

window.copyDatabaseToClipboard = copyDatabaseToClipboard;
window.pasteClonedDatabase = pasteClonedDatabase;

// ============================================================
// 15. Modal de Descripción Oculta / Extendida para Celdas
// ============================================================

export function openCellDescriptionModal(dbId, rowId, colId) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    const row = db.rows.find(r => r.id === rowId);
    if (!col || !row) return;

    const cellVal = row.cells[colId];
    let initialText = '';
    let initialDesc = '';

    if (typeof cellVal === 'object' && cellVal !== null) {
        initialText = cellVal.text || '';
        initialDesc = cellVal.description || '';
    } else if (cellVal !== undefined && cellVal !== null) {
        initialText = String(cellVal);
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-all duration-300';

    const container = document.createElement('div');
    container.className = 'w-full max-w-lg bg-white dark:bg-[#202124] rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 flex flex-col max-h-[85vh]';

    container.innerHTML = `
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500">description</span>
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Descripción Extendida — ${escapeHTML(col.name)}</span>
            </div>
            <button id="ntb-close-desc-modal" class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full flex transition-colors">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
        <div class="p-5 space-y-4 flex-1 overflow-y-auto">
            <div>
                <label for="ntb-desc-text-input" class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">Texto Principal (Visible en celda)</label>
                <input id="ntb-desc-text-input" type="text" value="${escapeHTML(initialText)}" placeholder="Ej: Título, resumen..." class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200">
            </div>
            <div>
                <label for="ntb-desc-area-input" class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">Descripción Oculta / Notas</label>
                <textarea id="ntb-desc-area-input" rows="6" placeholder="Escribe detalles extendidos, notas o información sobre este campo..." class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 resize-y">${escapeHTML(initialDesc)}</textarea>
            </div>
        </div>
        <div class="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 gap-2">
            <button id="ntb-clear-desc-btn" class="px-3.5 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-full transition-colors flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">delete</span> Borrar descripción
            </button>
            <div class="flex items-center gap-2">
                <button id="ntb-cancel-desc-btn" class="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">Cancelar</button>
                <button id="ntb-save-desc-btn" class="px-5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-full hover:shadow-md transition-all">Guardar</button>
            </div>
        </div>
    `;

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    const closeSelf = () => backdrop.remove();

    backdrop.querySelector('#ntb-close-desc-modal').addEventListener('click', closeSelf);
    backdrop.querySelector('#ntb-cancel-desc-btn').addEventListener('click', closeSelf);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSelf();
    });

    backdrop.querySelector('#ntb-clear-desc-btn').addEventListener('click', () => {
        const textVal = backdrop.querySelector('#ntb-desc-text-input').value.trim();
        updateCell(dbId, rowId, colId, textVal);
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
        showToast('Descripción eliminada');
        closeSelf();
    });

    backdrop.querySelector('#ntb-save-desc-btn').addEventListener('click', () => {
        const textVal = backdrop.querySelector('#ntb-desc-text-input').value.trim();
        const descVal = backdrop.querySelector('#ntb-desc-area-input').value.trim();

        if (descVal) {
            updateCell(dbId, rowId, colId, { text: textVal, description: descVal });
        } else {
            updateCell(dbId, rowId, colId, textVal);
        }

        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
        showToast('Descripción guardada');
        closeSelf();
    });

    setTimeout(() => {
        const area = backdrop.querySelector('#ntb-desc-area-input');
        if (area) area.focus();
    }, 50);
}

window.openCellDescriptionModal = openCellDescriptionModal;

// ============================================================
// 16. Modal de URL para Atributo de Columna 'Logo'
// ============================================================

export function openLogoUrlModal(dbId, rowId, colId) {
    closeActivePopups();

    const post = posts.find(p => p.id === currentPostId);
    if (!post || !post.databases || !post.databases[dbId]) return;

    const db = post.databases[dbId];
    const col = db.columns.find(c => c.id === colId);
    const row = db.rows.find(r => r.id === rowId);
    if (!col || !row) return;

    const currentUrl = row.cells[colId] || '';

    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-all duration-300';

    const container = document.createElement('div');
    container.className = 'w-full max-w-md bg-white dark:bg-[#202124] rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 flex flex-col max-h-[85vh] text-xs';

    container.innerHTML = `
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500">image</span>
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">Imagen de Logo — ${escapeHTML(col.name)}</span>
            </div>
            <button id="ntb-close-logo-modal" class="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full flex transition-colors">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
        <div class="p-5 space-y-4 flex-1 overflow-y-auto">
            <div>
                <label for="ntb-logo-url-input" class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">URL de la imagen del logo</label>
                <input id="ntb-logo-url-input" type="url" value="${escapeHTML(currentUrl)}" placeholder="https://ejemplo.com/logo.png" class="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200">
            </div>
            
            <!-- Vista Previa de la Imagen -->
            <div>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">Vista Previa</span>
                <div class="w-full h-32 rounded-xl bg-slate-50 dark:bg-[#1a1c1e] border border-slate-200 dark:border-slate-700 flex items-center justify-center p-3 relative overflow-hidden">
                    <img id="ntb-logo-preview-img" src="${escapeHTML(currentUrl)}" class="max-h-full max-w-full object-contain rounded ${currentUrl ? '' : 'hidden'}" onerror="this.classList.add('hidden'); document.getElementById('ntb-logo-preview-placeholder').classList.remove('hidden');" onload="this.classList.remove('hidden'); document.getElementById('ntb-logo-preview-placeholder').classList.add('hidden');" />
                    <div id="ntb-logo-preview-placeholder" class="flex flex-col items-center gap-1 text-slate-400 dark:text-slate-500 ${currentUrl ? 'hidden' : ''}">
                        <span class="material-symbols-outlined text-3xl">image</span>
                        <span class="text-[11px]">Ingresa una URL válida</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 gap-2">
            <button id="ntb-clear-logo-btn" class="px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-full transition-colors flex items-center gap-1 ${currentUrl ? '' : 'hidden'}">
                <span class="material-symbols-outlined text-sm">delete</span> Eliminar logo
            </button>
            <div class="flex items-center gap-2 ml-auto">
                <button id="ntb-cancel-logo-btn" class="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">Cancelar</button>
                <button id="ntb-save-logo-btn" class="px-5 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-full hover:shadow-md transition-all">Guardar Logo</button>
            </div>
        </div>
    `;

    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector('#ntb-logo-url-input');
    const previewImg = backdrop.querySelector('#ntb-logo-preview-img');
    const placeholder = backdrop.querySelector('#ntb-logo-preview-placeholder');

    input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
            previewImg.src = val;
            previewImg.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            previewImg.src = '';
            previewImg.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    });

    const closeSelf = () => backdrop.remove();

    backdrop.querySelector('#ntb-close-logo-modal').addEventListener('click', closeSelf);
    backdrop.querySelector('#ntb-cancel-logo-btn').addEventListener('click', closeSelf);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSelf();
    });

    backdrop.querySelector('#ntb-clear-logo-btn').addEventListener('click', () => {
        updateCell(dbId, rowId, colId, '');
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
        showToast('Logo eliminado');
        closeSelf();
    });

    backdrop.querySelector('#ntb-save-logo-btn').addEventListener('click', () => {
        const urlVal = input.value.trim();
        updateCell(dbId, rowId, colId, urlVal);
        savePostsToStorage();
        triggerEditorInput();
        refreshDatabase(dbId);
        showToast('Logo guardado');
        closeSelf();
    });

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

window.openLogoUrlModal = openLogoUrlModal;

