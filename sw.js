const CACHE_NAME = 'domino-v35';
const SW_VERSION = 'browser-production-trace-v1';
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

const NETWORK_FIRST_PATHS = [
    /^\/$/,
    /^\/index\.html$/,
    /^\/sw\.js$/,
    /^\/manifest\.json$/,
    /^\/js\/.+\.js$/,
    /^\/css\/.+\.css$/
];

function isSameOriginRequest(requestUrl) {
    return requestUrl.origin === self.location.origin;
}

function shouldNetworkFirst(requestUrl) {
    return NETWORK_FIRST_PATHS.some((pattern) => pattern.test(requestUrl.pathname));
}

function shouldCacheFallback(requestUrl) {
    return requestUrl.pathname.startsWith('/assets/') || requestUrl.pathname.startsWith('/shared/');
}

async function networkFirst(request, cache) {
    try {
        const freshRequest = new Request(request, { cache: 'no-store' });
        const freshResponse = await fetch(freshRequest);
        if (freshResponse && freshResponse.ok) {
            await cache.put(request, freshResponse.clone());
        }
        return freshResponse;
    } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
    }
}

async function cacheFirst(request, cache) {
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch {
        return Response.error();
    }
}

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

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', e => {
    const requestUrl = new URL(e.request.url);
    if (!isSameOriginRequest(requestUrl)) {
        return;
    }

    const request = e.request;
    const cache = caches.open(CACHE_NAME);

    e.respondWith((async () => {
        const activeCache = await cache;
        if (shouldNetworkFirst(requestUrl)) {
            return networkFirst(request, activeCache);
        }

        if (shouldCacheFallback(requestUrl)) {
            return cacheFirst(request, activeCache);
        }

        try {
            const response = await fetch(request);
            if (response && response.ok) {
                await activeCache.put(request, response.clone());
            }
            return response;
        } catch {
            const cached = await activeCache.match(request);
            return cached || Response.error();
        }
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => String(k).startsWith('domino-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});
