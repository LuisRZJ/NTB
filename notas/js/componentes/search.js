import { state } from './state.js';
import { refreshNotesView } from './renderer.js';

export function handleSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    
    if (!input) return;
    
    state.searchQuery = input.value;

    if (clearBtn) {
        if (state.searchQuery.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
    refreshNotesView();
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
