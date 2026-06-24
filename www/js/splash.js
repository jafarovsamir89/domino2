(function () {
    const SPLASH_KEY = 'dominoSplashShown';
    const MIN_VISIBLE_MS = 3200;
    const splash = document.getElementById('splash-screen');

    if (!splash) return;

    try {
        if (sessionStorage.getItem(SPLASH_KEY) === '1') {
            splash.remove();
            return;
        }
        sessionStorage.setItem(SPLASH_KEY, '1');
    } catch (_) {}

    const pipLayouts = {
        0: [],
        1: [4],
        2: [2, 6],
        3: [2, 4, 6],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 1, 2, 6, 7, 8]
    };

    const parseTileValue = (tile) => {
        const raw = tile.getAttribute('data-v') || '';
        const [left, right] = raw.split('-').map((part) => Number.parseInt(part, 10));
        return {
            left: Number.isFinite(left) ? left : 0,
            right: Number.isFinite(right) ? right : 0
        };
    };

    const buildHalf = (value) => {
        const half = document.createElement('div');
        half.className = 'tile-half';
        const active = new Set(pipLayouts[value] || []);
        for (let index = 0; index < 9; index += 1) {
            const pip = document.createElement('span');
            pip.className = active.has(index) ? 'pip' : 'pip hidden';
            half.appendChild(pip);
        }
        return half;
    };

    const buildTile = (tile) => {
        const { left, right } = parseTileValue(tile);
        tile.textContent = '';

        const firstHalf = buildHalf(tile.classList.contains('v') ? left : left);
        const secondHalf = buildHalf(tile.classList.contains('v') ? right : right);

        if (tile.classList.contains('v')) {
            tile.appendChild(firstHalf);
            const divider = document.createElement('div');
            divider.className = 'tile-divider';
            tile.appendChild(divider);
            tile.appendChild(secondHalf);
        } else {
            tile.appendChild(firstHalf);
            const divider = document.createElement('div');
            divider.className = 'tile-divider';
            tile.appendChild(divider);
            tile.appendChild(secondHalf);
        }
    };

    splash.querySelectorAll('.tile').forEach(buildTile);

    const startedAt = performance.now();
    let loadReady = document.readyState === 'complete';
    let removed = false;

    const removeSplash = () => {
        if (removed) return;
        removed = true;
        splash.remove();
    };

    const hideSplash = () => {
        if (!splash.isConnected) return;
        splash.setAttribute('aria-hidden', 'true');
        splash.classList.add('is-hidden');
        splash.addEventListener('transitionend', removeSplash, { once: true });
        window.setTimeout(removeSplash, 700);
    };

    const tryHide = () => {
        if (!loadReady || removed) return;
        const elapsed = performance.now() - startedAt;
        const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
        window.setTimeout(hideSplash, delay);
    };

    if (loadReady) {
        tryHide();
    } else {
        window.addEventListener('load', () => {
            loadReady = true;
            tryHide();
        }, { once: true });
    }
})();
