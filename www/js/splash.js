(function () {
    const MAX_STARTUP_MS = 8000;
    const splash = document.getElementById('splash-screen');

    if (!splash) return;

    const pipLayouts = {
        0: [],
        1: [4],
        2: [2, 6],
        3: [2, 4, 6],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8]
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
        half.className = 'splash-half';
        const active = new Set(pipLayouts[value] || []);
        for (let index = 0; index < 9; index += 1) {
            const pip = document.createElement('span');
            pip.className = active.has(index) ? 'splash-pip' : 'splash-pip off';
            half.appendChild(pip);
        }
        return half;
    };

    const buildTile = (tile) => {
        const { left, right } = parseTileValue(tile);
        tile.textContent = '';

        const firstHalf = buildHalf(left);
        const secondHalf = buildHalf(right);

        if (tile.classList.contains('v')) {
            tile.appendChild(firstHalf);
            const divider = document.createElement('div');
            divider.className = 'splash-divider';
            tile.appendChild(divider);
            tile.appendChild(secondHalf);
        } else {
            tile.appendChild(firstHalf);
            const divider = document.createElement('div');
            divider.className = 'splash-divider';
            tile.appendChild(divider);
            tile.appendChild(secondHalf);
        }
    };

    splash.querySelectorAll('.splash-tile').forEach(buildTile);

    let removed = false;
    let hideTimer = null;
    const language = (() => {
        try { return localStorage.getItem('domino-lang') || navigator.language.slice(0, 2); }
        catch { return navigator.language.slice(0, 2); }
    })();
    const text = language === 'ru'
        ? { error: 'Не удалось загрузить игру. Проверьте соединение и повторите.', network: 'Нет связи с сервером. Доступные локальные функции можно использовать.', retry: 'Повторить' }
        : language === 'az'
            ? { error: 'Oyun yüklənmədi. Bağlantını yoxlayıb yenidən cəhd edin.', network: 'Serverlə əlaqə yoxdur. Mövcud yerli funksiyalardan istifadə edə bilərsiniz.', retry: 'Yenidən cəhd et' }
            : { error: 'The game could not load. Check your connection and retry.', network: 'Cannot reach the server. Available local features can still be used.', retry: 'Retry' };
    const panel = (id, message) => {
        const node = document.createElement('div');
        node.id = id;
        node.setAttribute('role', 'status');
        const label = document.createElement('p');
        label.textContent = message;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = text.retry;
        retry.addEventListener('click', () => location.reload());
        node.append(label, retry);
        return node;
    };
    const showError = () => {
        if (removed || document.getElementById('startup-error')) return;
        splash.classList.add('has-startup-error');
        splash.append(panel('startup-error', text.error));
        performance.mark('domino-startup-error');
    };
    const removeSplash = () => {
        if (removed) return;
        removed = true;
        clearTimeout(deadline);
        cancelAnimationFrame(hideTimer);
        window.removeEventListener('domino:startup-ready', tryHide);
        window.removeEventListener('error', onError, true);
        splash.remove();
        performance.mark('domino-startup-interactive');
        if (window.__dominoStartupConnectionUnavailable || navigator.onLine === false) {
            const screen = document.getElementById('start-screen');
            const host = screen?.querySelector('.start-shell');
            if (host && !document.getElementById('startup-network-note')) {
                screen.classList.add('has-startup-notice');
                host.prepend(panel('startup-network-note', text.network));
            }
        }
    };
    const tryHide = () => {
        if (removed || !window.__dominoUiReady || !window.__dominoAccountReady) return;
        splash.setAttribute('aria-hidden', 'true');
        splash.classList.add('is-hidden');
        // Readiness, not optional images/fonts/window.load or a session marker, owns the splash.
        hideTimer = requestAnimationFrame(removeSplash);
    };
    const onError = event => {
        if ((event.target?.tagName === 'SCRIPT' && event.target.type === 'module')
            || /\/js\/app\.js(?:$|[?:])/.test(event.filename || '')) showError();
    };
    const deadline = window.setTimeout(showError, MAX_STARTUP_MS);
    window.addEventListener('domino:startup-ready', tryHide);
    window.addEventListener('error', onError, true);
    tryHide();
})();
