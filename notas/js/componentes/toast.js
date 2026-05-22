let toastTimeout = null;

export function showToast(message, actionText = null, actionCallback = null) {
    const toast = document.getElementById('toast-container');
    const msgEl = document.getElementById('toast-message');
    const actBtn = document.getElementById('toast-action');

    if (!toast || !msgEl || !actBtn) return;

    msgEl.innerText = message;

    if (actionText && actionCallback) {
        actBtn.innerText = actionText;
        actBtn.classList.remove('hidden');
        actBtn.onclick = function() {
            actionCallback();
            hideToast();
        };
    } else {
        actBtn.classList.add('hidden');
    }

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    if (toastTimeout) clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        hideToast();
    }, 4000);
}

export function hideToast() {
    const toast = document.getElementById('toast-container');
    if (!toast) return;

    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
}
