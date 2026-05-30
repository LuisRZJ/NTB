import { state } from './state.js';
import { refreshNotesView } from './renderer.js';

let searchTimeout;

export function handleSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    
    if (!input) return;
    
    const query = input.value;

    if (clearBtn) {
        if (query.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        state.searchQuery = query;
        refreshNotesView();
    }, 250);
}

export function clearSearchInput() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    
    if (input) input.value = '';
    state.searchQuery = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    refreshNotesView();
}

window.clearSearch = clearSearchInput;
