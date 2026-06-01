const CACHE_NAME = 'ntb-cache-v10';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/blog.html',
  '/notas.html',
  '/tareas.html',
  '/css/estilos.css',
  '/blog/css/estilos.css',
  '/notas/css/estilos.css',
  '/tareas/css/estilos.css',
  '/sw-register.js',
  '/icon.svg',
  '/manifest.json'
];

// Instalación: Precargar recursos estáticos esenciales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Precachando recursos esenciales');
        // Usamos addAll, pero envolvemos en catch individual o capturamos errores si alguno falla en desarrollo
        return cache.addAll(PRECACHE_ASSETS).catch(err => {
          console.warn('[Service Worker] Error al precachar algunos recursos:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: Tomar control instantáneo y limpiar cachés obsoletas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción Fetch: Estrategia Red Primero (Network First) con Fallback a Caché
self.addEventListener('fetch', event => {
  // Filtrar peticiones no HTTP/HTTPS o externas (como chrome-extension:// o APIs remotas si no queremos cachearlas)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Filtrar peticiones POST (no se pueden cachear) u otros métodos que no sean GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la respuesta es válida, clonarla y guardarla en la caché
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback a caché local si la red falla
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no hay red ni recurso en caché, devolver error HTTP 503
          return new Response('NTB Workspace Offline: Recurso no disponible sin conexión.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
      })
  );
});
