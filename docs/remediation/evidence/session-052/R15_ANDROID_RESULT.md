# R15 / S052 — запуск проверен на физическом Android

2026-10-25. **R15 закрыта по локальной приёмке; общий результат28/42.** Код заставки исправлен ранее S025/S032. Здесь завершены отсутствовавшие сопоставимые Android cold/warm/offline проверки. Изменений production/Play нет.

## Что получает игрок

Заставка больше не удерживает готовую игру обязательные5,5секунды. При недоступном сервере появляется понятное сообщение; бесплатная одиночная партия работает, повторная попытка восстанавливает обычный экран. Ожидание критического UI и ошибок ограничено существующими6/8секундными механизмами; застывший JS event loop этим не лечится.

## Сравнимость

Один телефон2201117SG, Android13, WebView155.0.8059.43. Оба APK — один отдельный debug.audit пакет, те же app/native/resources/config, SDKgatefalse. Проверены фактический package/debug identity и SHA перед install-r. Не сравнивали debug с установленным Play release.

Baseline собран новым audit-only `--startup-baseline`: только `js/splash.js` из immutable `eb8b21ed47e0f137eeaf79aa7fb18f7231292718`, SHA`d8cd49ed86527f4fa0e166631c16c18f11ff93544b7ea84a5ab3c2eb29dd3231`, со старым MIN_VISIBLE_MS5500. Candidate — сохранённый APK S051. Проверка **618ZIP entries, исключая подписи, находит ровно одно различие: assets/public/js/splash.js**; [контроль](apk-controlled-diff.json). Это контроль эффекта заставки на текущем приложении, не реконструкция целого исторического release.

Пять пар, порядок baseline/candidate чередуется. Каждый cold: новый audit process после force-stop, новыйPID проверен. Перед cold симметрично сбрасывался только старый session marker `dominoSplashShown`; приложение/OS cache не очищались. Install-r может штатно инвалидировать кеши; одинаковый порядок подготовки применён к обоим вариантам. Warm reload сохраняет session marker; warm Activity return — HOME→та же Activity. Температура батареи42,2–43,4°C, зарядка шла; интервалы/температуры каждой строки сохранены. Нельзя переносить абсолютные числа на все устройства/релиз/production-сеть.

## Результаты

Медианы5измерений каждого варианта:

| Метрика | Старая заставка | Новая заставка |
|---|---:|---:|
| Cold: UI ready от начала навигации |1,415с|1,395с|
| Cold: проверенное открытие solo-меню от начала навигации |8,329с|4,669с|
| Cold: команда native launch→проверенное меню, с ADB/CDP overhead |9,660с|6,052с|
| Warm reload: проверенное меню |1,982с|2,485с|
| Warm возврат Activity: команда→проверенное меню |0,342с|0,409с|

Контрольное открытие выполняется после удаления splash DOM и включает polling/click/CDP overhead. Это **верхняя оценка проверенной доступности**, не самый ранний возможный тап. Новая interactive mark появляется раньше контрольного клика; raw данные сохранены. Cold контроль сократился на3,660с при сопоставимом моменте готовности UI. Warm reload в этом прогоне на0,503с дольше; ускорение warm не заявляется. Прежний ранний session-skip не возвращался ради красивого результата. Warm остаётся ограниченным и реально интерактивным;5точек недостаточно для общего вывода о небольших различиях задержки.

[Полные30наблюдений:10cold/10warmreload/10Activityreturns](startup-device.json), [сводка](timing-summary.json), [сырой финальный вывод](device-final.txt).

## Offline и восстановление

Остановлен только собственный loopback API4186, а CSP audit пакета запрещает production endpoints. Bundled assets доступны. Wi-Fi/LTE/настройки связи владельца не менялись; это **недоступность всей прикладной сети игры**, а не утверждение о режиме полёта телефона.

На физическом устройстве: notice виден, UIready1,039с, interactive mark1,147с, проверенное меню2,315с; запущена настоящая бесплатная solo на2игроков, gameActive=true, сумма hand+boneyard+board=28. Затем API запущен снова, нажата реальная кнопка «Повторить», после reload обычное меню проверено за1,799с. [Offline screenshot](offline-home.png), [после восстановления](healthy-home.png) просмотрены.

Первый device прогон успел снять10timing samples, но завершился на неверном предположении collector о поле `game.players`. Продукт использует `game.hands`; игровой экран уже был активен. [Ошибка](device-first-failed.txt), [первые округлённые замеры](first-run-timings.json) сохранены как незавершённые. Collector исправлен на более содержательную проверку actual gameActive/hands/28tiles; для полного trace выполнен свежий полный прогон, старые данные не подменены. Теперь collector сохраняет partial JSON при будущей ошибке. Утверждение не исключалось и не ослаблялось.

Все12актуальных startup browser scenarios проходят: cold/warm, необязательные ресурсы/window.load, delayed/hung account, guest solo доauth, offline/retry, missing/stalled module/deadline, root/www. [Вывод](startup-browser.txt). Build baseline:169tasks/12JVMtests; [build](baseline-build.txt). CLI отказывает TestSuite+startupbaseline и существующему output до изменения workdir; [guards](builder-guards.json). Изменены только audit builder/collector и документы; product splash source/www не менялись.

## Повторение и очистка

Собрать два свежих audit артефакта из одного checkout: обычный `--rewarded-flow` и `--rewarded-flow --startup-baseline`, с разными fresh`--output`. Скопировать APK в ignored`.tmp/mobile-review/artifacts/`, проверить SHA и контролируемую разницу. На другом компьютере нужно пересобрать APK; metadata не содержат бинарник.

```sh
node docs/remediation/scripts/startup-audit-device.mjs --serial DEVICE_SERIAL --baseline BASELINE_METADATA --candidate CANDIDATE_METADATA --output docs/remediation/evidence/session-NNN/startup-device.json
```

Collector требует свежий output, фактическийdebug.audit identity/SHA, свободный4186, явныйserial. Он не выбирает Play, восстанавливает candidate при неудаче, закрывает свои CDPforwards/preview и reverse. После финального прогона на телефоне **candidate**, baseline остался только сохранённым тестовым артефактом. Play version/install/update fields совпали до/после. PG не запускалась; сеть/телефонные настройки не менялись. Снимки не содержат других приложений/уведомлений.

APK SHA baseline`37db14406312178336efbd58887b19d4a46820b0c58ffc73145c7402eebeba6b`, candidate`dc8b4a39c91827e86df12135c319f07d32b3f0567301b3cb9bf8fb8019ac46b4`; [baseline metadata](baseline-metadata.json), [candidate metadata](candidate-metadata.json). Результат относится к локальной приёмке R15; разрешением на deploy или публикацию он не является.
