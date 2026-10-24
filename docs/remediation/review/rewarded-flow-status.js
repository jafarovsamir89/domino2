const plugin = window.Capacitor?.registerPlugin?.('DominoRewardedFlow') || window.Capacitor?.Plugins?.DominoRewardedFlow;
document.getElementById('refresh').onclick = async () => {
    const status = document.getElementById('status');
    try {
        const value = await plugin.status();
        status.textContent = value.loadShowEnabled === false
            ? 'Модуль доступен. Загрузка и показ выключены. Монеты не начисляются.'
            : 'Настройки сборки требуют отдельной проверки перед запуском рекламы.';
    } catch { status.textContent = 'Для этой проверки нужна отдельная Android-сборка. Реклама не запускалась.'; }
};
