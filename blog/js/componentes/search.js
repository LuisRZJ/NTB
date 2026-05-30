// ============================================================
// search.js — Gestión de la barra de búsqueda con debounce
// ============================================================

import { setCurrentSearchQuery } from './state.js';
import { renderFileTree } from './sidebar.js';

let searchTimeout = null;

/**
 * Maneja el evento de entrada en el buscador principal con un debounce de 250ms
 * para no saturar los procesos de renderizado.
 */
export function handleSearch() {
    const input = document.getElementById('sidebar-search-input');
    const clearBtn = document.getElementById('sidebar-clear-search');

    if (!input) return;

    const query = input.value;

    // Mostrar/ocultar el botón de limpiar
    if (clearBtn) {
        if (query.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    // Debounce
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        setCurrentSearchQuery(query);
        renderFileTree();
    }, 250);
}

/**
 * Limpia el campo de búsqueda, restablece el estado y vuelve a renderizar.
 */
export function clearSearch() {
    const input = document.getElementById('sidebar-search-input');
    const clearBtn = document.getElementById('sidebar-clear-search');

    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');

    setCurrentSearchQuery('');
    renderFileTree();
}

// Exponer al objeto global para eventos inline
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
