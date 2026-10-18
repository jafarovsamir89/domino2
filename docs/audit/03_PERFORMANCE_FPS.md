# Плавность, FPS, память и анимации

**Дополнение на том же телефоне:** живая Telefon-партия 161,27 с с 343 командами дала 36,20 rAF/s и 34,51 native presentations/s, p95 интервала около 50 мс. Это отдельный workload от stress-сцены ниже. По 5 cold/warm запусков: cold Activity median1,116 с, UI proxy7,689 с; warm85/242 мс. [Методика, raw и ограничения](SINGLE_ANDROID_AUDIT.md). Прежний стресс-тест не заменяется этим замером; release battery/TTI и другие устройства отложены.

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Метод и реальные ограничения

Реальный телефон: модель 2201117SG, MT6781, Android 13/API 33, RAM около 6 GB, экран 1080×2400, WebView 155.0.8059.43, CSS viewport 392×823, DPR 2,75. Проверялся отдельный debug-пакет с тем же web-кодом и локальным HTTP-сервером. Release native startup и доставка production-ресурсов этим не измеряются. Устройство было на зарядке; в одном снимке battery temperature 41 °C. Тепловой режим не стабилизирован лабораторно.

[performance.mjs](evidence/scripts/performance.mjs) изолирует renderer: законный fixture поля с 5/10/20/28 костяшками, таймеры игры остановлены, travel последней костяшки повторяется раз в 650 мс, каждое окно около 6,5 с. Руки оставлены в UI: это synthetic renderer stress, а не полноценная партия с сохранением общего числа костяшек. rAF cadence — показатель отзывчивости анимационного цикла, **не измеренная частота фактического вывода GPU на дисплей**.

На desktop Chromium дополнительно применялось CPU throttle 1×/4×/6×. Это три синтетических режима одного компьютера, а не три Android-устройства. Все дали около 60 rAF/s и p95 около 17,6 мс; переносить этот успех на дешёвые телефоны нельзя.

## Android

| Костяшки | rAF кадров/с | p95, мс | p99, мс | Long tasks | render p95, мс |
|---|---:|---:|---:|---:|---:|
| 5 | 23.8 | 66.7 | 101.1 | 1 | 1.3 |
| 10 | 23.9 | 50.8 | 69.1 | 0 | 1.3 |
| 20 | 26.0 | 66.6 | 116.7 | 0 | 1.2 |
| 28 | 25.2 | 66.6 | 68.8 | 1 | 1.5 |

[Сырые измерения Android](evidence/metrics/performance-android.json), [desktop](evidence/metrics/performance-desktop.json), [скрипт](evidence/scripts/performance.mjs). Profiler включался на окне 28 костяшек, поэтому его накладные расходы также включены.

CPU profiles, открываемые во вкладке Performance/JavaScript Profiler Chrome DevTools как flame chart: [Android](evidence/traces/android-cpu-1.cpuprofile), [desktop 1×](evidence/traces/desktop-cpu-1.cpuprofile), [4×](evidence/traces/desktop-cpu-4.cpuprofile), [6×](evidence/traces/desktop-cpu-6.cpuprofile). Полный compositor/Perfetto trace и input-to-photon latency не сняты.

## Диагностическое сравнение

| Последовательный вариант, 28 костяшек | rAF/s | p95 кадра | PSS приложения, MiB | Graphics, MiB |
|---|---:|---:|---:|---:|
| Базовый | 24,9 | 66,7 мс | 620 | 377 |
| Реальный canvas ratio 1,25 | 25,0 | 66,6 мс | 588 | 351 |
| Дополнительно однотонный фон | 24,7 | 66,7 мс | 526 | 289 |
| Дополнительно без CSS animation/filter/blur/shadow | 54,5 | 33,3 мс | 301 | 63 |

[android-ab.json](evidence/metrics/android-ab.json), meminfo каждого этапа рядом. Это один последовательный эксперимент, изменения накопительные. Он указывает на дорогую композицию CSS; он **не выделяет индивидуальный вклад** tileGlow, activeTurnPulse, blur и shadows и не доказывает ровно такой выигрыш после продуктового исправления. Отдельное уменьшение canvas ratio в этом опыте почти не изменило rAF.

CDP screenshot в Android WebView не включил GPU canvas. Эти изображения нельзя трактовать как исчезновение поля. Для визуального контроля использован native screencap: [исходное поле](evidence/screenshots/android-native-baseline.png), [диагностический вариант](evidence/screenshots/android-native-no_css_animation_or_blur.png).

## Карточки технических действий

### R-14 — тяжёлая CSS-композиция, P1, измерено

1. Место: `css/style.css:6020–6028` tileGlow, `6364–6370,6420–6423` activeTurnPulse; backdrop-filter встречается на панелях `4252,4687,4943,5230`.
2. Условия: мобильный WebView, несколько playable tiles и активная подсвеченная рука/соперник.
3. Воспроизведение: Android baseline и cumulative A/B из [android-ab.mjs](evidence/scripts/android-ab.mjs).
4. Доказательство: около 25→54,5 rAF/s после комплекса CSS-изменений; Graphics 377→63 MiB.
5. Причина: постоянная анимация box-shadow и слои с размытиями требуют повторного paint/compositing. Конкретный dominant effect ещё не изолирован.
6. Влияние: заметная неровность движения, высокий расход графической памяти; battery impact пока не измерен.
7. Минимальное исправление: статическая чёткая рамка хода, короткий opacity pulse отдельного небольшого слоя; отключать несущественные бесконечные эффекты по reduced-motion/quality preset; избегать живого backdrop blur за игровым столом.
8. Архитектурная альтернатива: единый effect scheduler, лимит площади анимированных слоёв и заранее подготовленные glow assets.
9. Риск: потеря понятности допустимого хода и текущего игрока.
10. Приёмка: отдельные A/B для animation-only, shadow-only и blur-only; три повтора в случайном порядке, одинаковая температура, native FrameTimeline + visual QA.
11. Цель: p95 ≤20 мс на среднем поддерживаемом устройстве, без потери контраста подсказок.
12. Ожидаемый эффект: рост плавности и снижение graphics memory. 54,5 — диагностический результат, 60 не достигнуты и не обещаны.

### R-13 — лимит pixel ratio не применяется к Layer, P1, измерено

1. Файл/функция: `js/konvaBoardRenderer.js:238–246`, mount.
2. Условия: DPR выше 1,25 на Android; lowPowerMode вычисляет лимит.
3. Воспроизведение: прочитать stage pixelRatio и `layer.getCanvas().getPixelRatio()`.
4. Метрика: stage attr 1,25, фактический canvas ratio 2,75; 1078×1625 вместо примерно 490×739.
5. Причина: pixelRatio передан Stage, тогда как canvas Layer использует собственный ratio.
6. Влияние: площадь buffer примерно в 4,84 раза больше задуманной; это не равно 4,84-кратному росту всей RAM.
7. Минимальное исправление: применить ratio к scene/hit canvas либо задать корректный Konva global до создания Layer с контролем остальных canvas.
8. Альтернатива: renderer quality profile с управляемым resize, cache budget и восстановлением после DPR/orientation change.
9. Риск: размытые точки/линии и hit-coordinate mismatch.
10. Тест: фактический buffer соответствует profile; скриншоты 1×/1,25×/2× и точность стрелок/касания на телефоне.
11. Цель: меньше graphics memory без ухудшения читаемости.
12. Измеренный эффект: PSS уменьшился в последовательном опыте, FPS почти не изменился; обещать исправление всех тормозов этим нельзя.

### R-15 — обязательная задержка первого экрана, P1, доказано кодом

1. `js/splash.js:3–4,83–108`, MIN_VISIBLE_MS=5500, ожидание window.load.
2. Каждый новый sessionStorage-контекст, включая новый запуск WebView.
3. Открыть новый контекст; замерить splash removal и первую доступную кнопку.
4. Нижняя искусственная задержка 5,5 с плюс transition; это кодовый бюджет, не измеренный cold TTI релиза.
5. Брендовая заставка связана с загрузкой всех window load ресурсов и минимальным временем.
6. Влияние: длинный путь до первой партии и повторного входа.
7. Минимум: короткая заставка, завершение по готовности критического UI, bounded timeout на внешние ресурсы.
8. Альтернатива: progressive boot: shell→локальная партия→опциональный auth/network.
9. Риск: скачки layout и исчезновение обещанной индикации загрузки.
10. Тест: cold/warm, offline и slow assets, p50/p95 interactive, доступный fallback.
11. Цель: первый интерактивный экран ≤2 с на среднем телефоне; утвердить после release измерений.
12. Ожидаемый выигрыш: убрать искусственную часть задержки; фактическое сокращение TTI пока не измерено.

### Кандидат R-26 — повторное чтение метрик, пока не доказанный bottleneck

`readBoardMetrics` в начале `buildLayout` читает CSS variables до сравнения signature. Повторные неизменные renders имеют p95 0,2–1,8 мс в наших окнах: данных, что именно это главный тормоз, нет. Минимальный эксперимент — cache metrics на theme/resize, затем сравнение CPU profile и forced layout. Риск — устаревшая тема/плотность; приёмка — resize/theme parity и меньший renderer CPU при том же поле. Не начинать с этой оптимизации, пока дорогая CSS-композиция не разобрана.

## Память, ресурсы и оставшиеся измерения

100 одинаковых renders после принудительной GC: Android JS heap 7 412 796→7 426 068 bytes, desktop 6 528 496→6 148 264. Это не демонстрирует крупной JS-утечки в таком коротком сценарии; не исключает рост за час, смену комнат или WebRTC leaks. Native PSS достигал около 612–620 MiB, значительную долю составляла graphics. Нужен 30–60-минутный soak с 50 rematch, 20 social overlays, reconnect и voice, memory after GC/trim и числом listeners/timers.

Assets суммарно около 21,1 MB; три музыкальных MP3 занимают около 7,6 MB; один table skin — около 1,7 MB. [asset-sizes.json](evidence/metrics/asset-sizes.json). Не удалять качество по одному размеру: проверить decode dimensions, своевременность загрузки, фоновые audio tracks и жизненный цикл textures.

Не выполнены: три реальных класса Android, совместная нагрузка gifts+audio+network, compositor trace, батарея без зарядки, часовой thermal soak, hardware input latency. План: low 3–4 GB, этот MT6781, современный 8 GB; одинаковые seeded replays 5/10/20/28, 3×30 с на сцену и 30 минут живой партии. Целевой 60 FPS остаётся целевым.
