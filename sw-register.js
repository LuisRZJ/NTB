if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('[NTB PWA] Service Worker registrado con éxito en el scope:', registration.scope);
      })
      .catch(error => {
        console.warn('[NTB PWA] Error al registrar el Service Worker:', error);
      });
  });
}
