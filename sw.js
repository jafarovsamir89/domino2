const CACHE_NAME = 'domino-v32';
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
    '/js/voice.js',
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
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const results = await Promise.allSettled(ASSETS.map(async (asset) => {
                const request = new Request(asset, { cache: 'reload' });
                const response = await fetch(request);
                if (!response.ok) {
                    throw new Error(`Failed to precache ${asset}: ${response.status}`);
                }
                await cache.put(request, response.clone());
            }));
            const failed = results.filter((result) => result.status === 'rejected');
            if (failed.length) {
                console.warn('[SW] Some assets could not be precached:', failed.length);
            }
        })()
    );
});

self.addEventListener('fetch', e => {
    const requestUrl = new URL(e.request.url);
    if (requestUrl.origin !== self.location.origin) {
        return;
    }
    e.respondWith((async () => {
        try {
            return await fetch(e.request);
        } catch {
            const cached = await caches.match(e.request);
            return cached || Response.error();
        }
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});
