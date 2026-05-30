// ============================================================
// toast.js — Sistema de notificaciones toast para el Blog
// ============================================================
// Elementos del DOM esperados:
//   #toast-container  — contenedor principal del toast
//   #toast-message    — elemento de texto del mensaje
//   #toast-action     — botón de acción opcional
// ============================================================

/** @type {number|null} Referencia al timeout activo */
let toastTimeout = null;

/**
 * Muestra una notificación toast en la parte inferior de la pantalla.
 *
 * @param {string}        message        — Texto del mensaje a mostrar
 * @param {string|null}   actionText     — Texto del botón de acción (opcional)
 * @param {Function|null} actionCallback — Función a ejecutar al pulsar la acción (opcional)
 * @param {number}        duration       — Milisegundos antes de ocultar automáticamente (por defecto 4000)
 */
export function showToast(message, actionText = null, actionCallback = null, duration = 4000) {
    const toast  = document.getElementById('toast-container');
    const msgEl  = document.getElementById('toast-message');
    const actBtn = document.getElementById('toast-action');

    if (!toast || !msgEl || !actBtn) return;

    // Establecer el mensaje
    msgEl.innerText = message;

    // Configurar botón de acción si se proporcionó
    if (actionText && actionCallback) {
        actBtn.innerText = actionText;
        actBtn.classList.remove('hidden');
        actBtn.onclick = function () {
            actionCallback();
            hideToast();
        };
    } else {
        actBtn.classList.add('hidden');
    }

    // Mostrar el toast con animación
    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');

    // Limpiar timeout previo si existe
    if (toastTimeout) clearTimeout(toastTimeout);

    // Ocultar automáticamente después de la duración indicada
    toastTimeout = setTimeout(() => {
        hideToast();
    }, duration);
}

/**
 * Oculta el toast activo inmediatamente.
 */
export function hideToast() {
    const toast = document.getElementById('toast-container');
    if (!toast) return;

    toast.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');

    // Limpiar el timeout pendiente
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}
