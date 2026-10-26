import { translations } from './translations.js';

const host = document.getElementById('account-deletion-management');
if (host) {
    const api = String(globalThis.DOMINO_ENDPOINTS?.API_BASE || '').replace(/\/$/, '');
    const langSelect = document.getElementById('deletion-language');
    let language = 'en', state = 'loading', record = null, working = false, available = false, authenticated = false;
    try { language = Object.hasOwn(translations, localStorage.getItem('domino-lang')) ? localStorage.getItem('domino-lang') : 'en'; } catch {}
    const t = key => translations[language]?.[key] || translations.en[key] || key;
    const status = document.getElementById('deletion-status');
    const confirm = document.getElementById('deletion-confirm');
    const login = document.getElementById('deletion-login');
    const request = document.getElementById('deletion-request');
    const cancel = document.getElementById('deletion-cancel');
    const check = document.getElementById('deletion-check');
    const native = Boolean(globalThis.Capacitor?.isNativePlatform?.());
    const nativeLink = document.getElementById('deletion-browser-link');
    langSelect.value = language;
    function render() {
        if (available) { document.documentElement.lang = language; document.title = t('deletion-manage') + ' — Domino Telefon'; }
        host.querySelectorAll('[data-deletion-i18n]').forEach(el => { el.textContent = t(el.dataset.deletionI18n); });
        const pending = record?.state === 'pending' || record?.state === 'erasing';
        const signedIn = authenticated && state !== 'recent-login';
        status.textContent = native ? t('deletion-native-web') : state === 'error' ? t('deletion-action-failed') : state === 'loading' ? t('deletion-working')
            : pending ? t('deletion-pending').replace('{date}', new Date(record.deleteAfter).toLocaleString(language)) + (!signedIn ? ' ' + t('deletion-sign-in') : '')
            : state === 'signed-out' ? t('deletion-sign-in') : state === 'recent-login' ? t('deletion-recent-login') : t('deletion-none');
        document.getElementById('deletion-account').textContent = record?.accountLabel ? `${t('deletion-account-label')}: ${record.accountLabel}` : '';
        login.hidden = signedIn || native;
        login.textContent = t(state === 'recent-login' ? 'deletion-recent-login-button' : 'deletion-login-button');
        confirm.closest('label').hidden = !signedIn || pending || native;
        request.hidden = !signedIn || pending || native;
        request.disabled = working || confirm.value !== 'DELETE';
        cancel.hidden = !signedIn || !pending || record?.canCancel !== true || native;
        for (const button of [login, cancel, check]) button.disabled = working;
        check.hidden = native;
        nativeLink.hidden = !native;
        nativeLink.textContent = t('deletion-native-web');
    }
    async function call(path, body) {
        const response = await fetch(api + path, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401) { state = 'signed-out'; authenticated = false; }
            else if (data.message === 'recent_login_required') state = 'recent-login';
            else state = 'error';
            throw Error('request_failed');
        }
        return data;
    }
    async function refresh() {
        if (!available || working || native) return;
        working = true; render();
        try {
            const next = await call('/account/deletion');
            if (next.confirmationToken !== record?.confirmationToken) confirm.value = '';
            record = next; state = 'ready'; authenticated = true;
        }
        catch {} finally { working = false; render(); }
    }
    async function mutate(path, body) {
        if (!available || working || native) return;
        working = true; render();
        let refreshAfter = false;
        try {
            const confirmationToken = path.endsWith('/cancel') ? record?.cancelConfirmationToken : record?.confirmationToken;
            record = await call(path, { ...body, confirmationToken });
            state = path.endsWith('/cancel') ? 'ready' : 'signed-out';
            if (state === 'signed-out') authenticated = false;
            refreshAfter = path.endsWith('/cancel'); confirm.value = '';
        }
        catch {} finally { working = false; render(); }
        if (refreshAfter) await refresh();
    }
    login.addEventListener('click', async () => {
        if (working || native) return;
        working = true; render();
        try {
            const result = await call('/auth/sign-in/social', { provider: 'google', callbackURL: new URL('delete-account.html#request', location.href).href });
            const target = new URL(result.url);
            if (target.protocol !== 'https:' || !['accounts.google.com', new URL(api).hostname].includes(target.hostname)) throw Error('invalid_auth_destination');
            location.assign(target.href);
        } catch { if (state !== 'recent-login') state = 'error'; working = false; render(); }
    });
    request.addEventListener('click', () => { if (confirm.value === 'DELETE') void mutate('/account/deletion', { confirm: 'DELETE' }); });
    cancel.addEventListener('click', () => void mutate('/account/deletion/cancel', { confirm: 'CANCEL_DELETION' }));
    check.addEventListener('click', () => void refresh());
    confirm.addEventListener('input', render);
    langSelect.addEventListener('change', () => { language = langSelect.value; render(); });
    render();
    // Read capability first: old/disabled backends retain the existing request path.
    void (async () => {
        try {
            const caps = await call('/account/deletion/capabilities');
            if (caps.available !== true || caps.policyVersion !== 'owner30_v1' || caps.confirmation !== 'session-version-v1' || caps.waitingDays !== 30 || caps.backupDaysAfterDeletion !== 30 || caps.cancellation !== 'explicit') return;
            available = true; host.hidden = false; document.querySelectorAll('[data-deletion-legacy]').forEach(el => { el.hidden = true; });
            if (!native) await refresh();
        } catch {} finally { render(); }
    })();
}
