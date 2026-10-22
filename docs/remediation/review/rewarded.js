(() => {
    const $ = id => document.getElementById(id);
    const cap = window.Capacitor;
    const native = cap?.registerPlugin?.('DominoRewardedReview') || cap?.Plugins?.DominoRewardedReview;
    let phase = 'idle';
    const refresh = () => {
        $('init').disabled = !native || phase !== 'idle' || !$('adult').checked || !$('accept').checked;
        $('suite').disabled = phase !== 'ready';
    };
    const render = state => {
        phase = state.phase;
        const labels = { idle: 'Проверка не запускалась.', initializing: 'Подключение к LevelPlay…', ready: 'LevelPlay подключён. Откройте тестовый экран.', failed: `Подключение не удалось. Код: ${state.errorCode}. Для повтора перезапустите проверочную игру.` };
        $('status').textContent = labels[phase] || 'Неизвестное состояние';
        refresh();
    };
    const failed = e => { $('status').textContent = `Ошибка проверки: ${e.message || 'нет ответа'}`; refresh(); };
    $('adult').onchange = $('accept').onchange = refresh;
    $('init').onclick = async () => {
        $('init').disabled = true;
        try { render(await native.initializeTestSuite({ adultOwner: $('adult').checked, testAccepted: $('accept').checked })); }
        catch (e) { failed(e); }
    };
    $('suite').onclick = async () => { try { await native.openTestSuite(); } catch (e) { failed(e); } };
    if (native) {
        native.addListener('stateChange', render).catch(failed);
        native.status().then(render).catch(failed);
    } else $('status').textContent = 'Нужна проверочная Android-сборка с модулем LevelPlay.';
    refresh();
})();
