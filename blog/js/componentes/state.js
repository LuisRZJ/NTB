// ============================================================
// state.js — Gestión centralizada del estado de la app Blog
// ============================================================
// Todos los módulos importan y mutan el estado a través de
// las funciones exportadas aquí. Esto mantiene una única
// fuente de verdad para la UI.
// ============================================================

// ── Posts ────────────────────────────────────────────────────
/** @type {Array<Object>} Lista completa de posts */
export const posts = [];

/**
 * Reemplaza la lista completa de posts.
 * @param {Array<Object>} p - Nueva lista de posts
 */
export function setPosts(p) {
    posts.length = 0;
    posts.push(...p);
}

// ── Labels (etiquetas) ──────────────────────────────────────
/** @type {Array<Object>} Lista de etiquetas disponibles */
export const labels = [];

/**
 * Reemplaza la lista completa de etiquetas.
 * @param {Array<Object>} l - Nueva lista de etiquetas
 */
export function setLabels(l) {
    labels.length = 0;
    labels.push(...l);
}

// ── Post actualmente en edición ─────────────────────────────
/** @type {string|null} ID del post que se está editando */
export let currentPostId = null;

/**
 * Establece el post que se está editando.
 * @param {string|null} id
 */
export function setCurrentPostId(id) {
    currentPostId = id;
}

// ── Sección activa del sidebar ──────────────────────────────
// Valores válidos: 'all' | 'favorites' | 'archive' | 'trash' | 'settings' | 'label'
/** @type {string} Sección visible actualmente */
export let currentSection = 'all';

/**
 * Cambia la sección activa de la navegación.
 * @param {'all'|'favorites'|'archive'|'trash'|'settings'|'label'} s
 */
export function setCurrentSection(s) {
    currentSection = s;
}

// ── Filtro por etiqueta ─────────────────────────────────────
/** @type {string|null} ID de la etiqueta usada como filtro */
export let currentLabelFilter = null;

/**
 * Filtra los posts por una etiqueta específica.
 * @param {string|null} id - ID de la etiqueta, o null para limpiar
 */
export function setCurrentLabelFilter(id) {
    currentLabelFilter = id;
}

// ── Búsqueda ────────────────────────────────────────────────
/** @type {string} Texto de búsqueda actual */
export let currentSearchQuery = '';

/**
 * Actualiza el texto de búsqueda.
 * @param {string} q
 */
export function setCurrentSearchQuery(q) {
    currentSearchQuery = q;
}

// ── Modo expandido del sidebar ───────────────────────────────
/** @type {boolean} true = sidebar en pantalla completa, false = posición lateral */
export let sidebarExpanded = true;

/**
 * Cambia el modo del sidebar.
 * @param {boolean} expanded
 */
export function setSidebarExpanded(expanded) {
    sidebarExpanded = expanded;
}
