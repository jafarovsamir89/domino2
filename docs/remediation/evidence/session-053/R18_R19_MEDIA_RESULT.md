# S053 — микрофон, переподключение и запоздавшие звуки

2026-10-25, ветка `codex/rewarded-acceptance`, от `a5ee351`. Владелец поручил ещё пару пунктов. **Исправления R18/R19 завершены и проверены локально; полные карточки остаются открытыми, общий счёт28/42.** Владелец сообщил, что сейчас не может провести звонок/Bluetooth-проверку. NAT/TURN/двусторонний Wi-Fi↔LTE разговор не проводился.

## Исправлено и что это даёт

1. **Микрофон не включается поздним ответом.** Ранее реальный Android stream оставался live после выключения голоса, а код отправлял enabled=true. Новый generation+room+session guard останавливает такой поток. Выход из комнаты, окончательное закрытие, скрытие страницы/нативный фон и потеря соединения освобождают capture. Ошибка отправки сигнала не мешает локальной остановке. Старый отказ разрешения не выключает новую попытку; повторные enable не дублируют запрос.
2. **Голос остаётся работоспособным в следующей комнате.** Reusable reset отделён от terminal destroy, соответствующие app call sites исправлены. Reset останавливает живой stream; обычное выключение микрофона сохраняет сведения о других участниках для следующего явного включения. Системное завершение track снимает состояние «говорит».
3. **Переподключение с голосом не падает на Set.get.** В `DominoRoom.completeReconnectGrace` к Set ошибочно применялись Map.get/set. Новая регрессия воспроизвела TypeError. Теперь membership переносится через delete/add, старый ID удаляется и при уже существующем новом ID; остальные участники сохраняются. Это перенос server descriptor, не разрешение автоматически включать аппаратный микрофон.
4. **Звук не догоняет игрока после паузы.** Отложенные30/80ms эффекты получают generation; после mute/фон/нулевой громкости старая очередь отменяется. Уже запланированные WebAudio notes тоже останавливаются, чтобы замороженный context clock не воспроизвёл их при возвращении. Завершённые sources удаляются из учёта; новые эффекты продолжают работать.

Изменены source/www `voice.js`, `app.js`, `sounds.js`, native `DominoAudioPlugin.java`, server `DominoRoom.js`, tests. Нативный bridge добавляет `background` по Activity.onStop: обычный onPause системного диалога не отменяет успешный запрос микрофона. Chromium остаётся владельцем audio focus, дополнительный AudioManager owner не добавлялся. Диагностический audio экран теперь использует настоящий продуктовый VoiceChatManager с synthetic room без peers/сетевого транспорта; запись и отправка аудио не выполняются.

## Доказательства до исправлений

- [lifecycle-red.txt](lifecycle-red.txt):36tests,12pass/24fail/0skip — поздние streams, reset/destroy, одновременные запросы, transport failure, lifecycle и delayed sound.
- [phone-red.json](phone-red.json): настоящий микрофон старой audit сборки после disable+задержанной JS-доставки дал tracklive/localStreampresent/enabledSignal1. Поток сразу остановлен, cleanup trackended. Аудио не записывалось/не передавалось. Это локально воспроизведённый дефект, не утверждение о перехвате разговоров реальных игроков.
- [scheduled-notes-red.txt](scheduled-notes-red.txt): новые проверки не позволили считать suspend/gain достаточной отменой уже запланированных нот.
- [reconnect-voice-red.txt](reconnect-voice-red.txt): реальный room method упал с `this.voiceEnabledBySessionId.get is not a function`.

## Текущие проверки

| Проверка | Результат |
|---|---|
| Полный discovery server/client unit файлов |522/522,0fail/0skip; [server-verified.txt](server-verified.txt) |
| Targeted voice/audio source/www |50/50; [lifecycle-final-green.txt](lifecycle-final-green.txt) |
| Reconnect suite |24/24; [reconnect-voice-green.txt](reconnect-voice-green.txt) |
| Реальный browser main app root/www, реальный MediaStream от synthetic AudioContext |2/2: cancel, return-to-menu, новый capture; [browser-voice.txt](browser-voice.txt) |
| Root syntax/encoding |проходит; [root-final-check.txt](root-final-check.txt) |
| Новый audit APK/JDK21 |169tasks,12JVM, build success; [android-build-verified.txt](android-build-verified.txt) |
| Физический Android: основной набор |[device-verified.json](device-verified.json), [вывод](device-verified.txt) |
| Физический Android: pending permission edges |[device-pending.json](device-pending.json), [вывод](device-pending.txt) |

На физическом телефоне наблюдалось настоящее системное окно для **Domino Review**. Нажатия делались по свежему native hierarchy, с повторной проверкой активного permissioncontroller и app label. [Снимок](android-permission-dialog.png) просмотрен. Пройдены deny→retry→allow→stop; настоящий поздний stream после Stop теперь ended/localfalse/enabledSignal0; HOME останавливает capture и самовключения после возврата нет, новое явное включение работает. Отзыв RECORD_AUDIO завершил capture process; отмена системного окна не оставила stream. HOME и смена на собственный неподходящий HTTP loopback origin во время ожидающего диалога не прикрепили старый запрос к новому экрану. Даже с ранее выданным Android-разрешением этот origin не получает микрофон.

Настоящий AudioContext: старая отложенная callback не создала oscillator после mute/unmute; свежий score создал3; при mute все3запланированные score notes остановлены. Это состояние реальных audio nodes, не акустическое измерение и не проверка звонка/Bluetooth.

Начальные сбои harness сохранены: первый запуск слишком рано искал PID после revoke; следующий после успешных основных сценариев повторно использовал закрытую page. Исправлены ожидание process/WebView и очистка page reference; partial JSON и сырые выводы не объявлены полной приёмкой. Финальный полный набор прошёл. Первый unit red с намеренно pending promise был остановлен; исправлен порядок assert/5s timeout, содержание утверждения сохранено. Assertions не исключались/не ослаблялись.

## Артефакт, очистка и остаток

Финальный APK7c6b098f692be4880e4bc56f85cab625854c0e6a9982ef270bc75941071778e8,34726630bytes, `.audit`, native ads load/show=false. [Metadata](install-metadata.json); сохранён локально `.tmp/mobile-review/artifacts/s053-media.apk`, в Git бинарник не отправляется. Pending permission edges сняты на предыдущей сборке895fba80…5da7015 с теми же voice/native кодом; финальная отличается дополнительной отменой уже запланированных sound sources, основной полный набор на ней повторён. Source hashes в [source-hashes.json](source-hashes.json).

Исходное разрешение audit RECORD_AUDIO было false, без USER_SET/USER_FIXED; восстановлено ровно это состояние. Настройки звука восстановлены; Play24/1.20 и его install/update fields совпали до/после. Только `.audit` install-r/force-stop/permission flags; данные Play, радиосвязь, production и кошельки не менялись. Собственные preview4186/reverse/CDPforwards остановлены/удалены; PostgreSQL не запускалась. API189/189 — историческая S051, в S053 API не менялся и suite не повторялась. [Очистка](cleanup.json).

Повторение: новый audit APK текущих source/www/native; собственный synthetic4186preview/reverse, явныйserial и freshoutput для `scripts/media-permission-device.mjs`. Для pending edges добавить `--pending-only`. Скрипт рассчитан на наблюдавшийся Google permissioncontroller этого Android, отказывается от tap при сменившемся окне; на другом UI сначала осмотреть hierarchy. Он восстанавливает denied/no-userflag состояние, поэтому предназначен только для audit пакета с таким исходным состоянием, не для произвольного пользовательского приложения.

**До закрытия R18 нужны Wi-Fi↔LTE relay-only/selected candidate=relay и настоящий двусторонний разговор; до закрытия R19 — звонок/Bluetooth/смена выхода с участием владельца.** Сейчас у владельца нет такой возможности. Тесты этой сессии не заменяют эти сценарии и не увеличивают счёт закрытых карточек. Никакого deploy/публикации/активации рекламы не выполнялось.
