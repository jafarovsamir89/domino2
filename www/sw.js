const CACHE_NAME = 'domino-v20';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/account.js',
    '/js/model.js',
    '/js/board.js',
    '/js/ai.js',
    '/js/renderer.js',
    '/js/sounds.js',
    '/js/translations.js',
    '/js/vendor/colyseus.js',
    '/manifest.json',
    '/assets/icon.png',
    '/assets/reactions/1F923.svg',
    '/assets/reactions/1F609.svg',
    '/assets/reactions/1F618.svg',
    '/assets/reactions/1F929.svg',
    '/assets/reactions/1F914.svg',
    '/assets/reactions/1F62E-200D-1F4A8.svg',
    '/assets/reactions/1F634.svg',
    '/assets/reactions/1F62D.svg',
    '/assets/reactions/1F92C.svg',
    '/assets/reactions/1F48B.svg',
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});
