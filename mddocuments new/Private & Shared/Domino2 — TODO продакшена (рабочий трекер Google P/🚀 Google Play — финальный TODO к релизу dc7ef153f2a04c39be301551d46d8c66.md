# 🚀 Google Play — финальный TODO к релизу

<aside>
🎯

Цель: собрать подписанный AAB без подводных камней → закрытый тест (12+ тестеров, 14 дней) → продакшен. Решения зафиксированы 30.06.2026.

</aside>

## Зафиксированные решения

- Монеты — **только виртуальные**, без вывода → это НЕ real-money gambling (мягче по политике Play).
- Покупка монет — **Google Play Billing**.
- Реклама — **AppLovin MAX** (подключаем).
- Push-уведомления — **FCM** (добавляем `google-services.json`).
- Минификация R8 — **выключена** в первом релизе (`minifyEnabled false`).
- Релизный keystore — создаём через `keytool` (инструкция в Фазе B).
- Тестеры — группа 12+ уже есть.
- Контакт для Data Safety / Privacy — `support@simplesoft.az`.

---

## Фаза A — Код и сборка (без Консоли, можно делать сейчас)

- [x]  **Версия**: поднять `versionCode 20 → 21` и `versionName "1.18" → "1.19"` в `android/app/build.gradle` ✅ (коммит 729bce6)
- [ ]  **Минификация**: оставить `minifyEnabled false` (решение принято; R8 — отдельным заходом позже с keep-правилами + тестом на устройстве)
- [ ]  **FCM / push**:
    - [ ]  Создать проект Firebase для пакета `az.simplesoft.dominotelefon`, скачать `google-services.json` в `android/app/`
    - [ ]  Подключить Capacitor Push Notifications плагин на клиенте (регистрация токена, отправка на сервер)
    - [ ]  Добавить `POST_NOTIFICATIONS` в манифест + рантайм-запрос на Android 13+
    - [ ]  Проверить серверную отправку FCM (код отправки уже есть в `sendDirectMessageForPlayer`)
- [ ]  **Play Billing (покупка монет)**:
    - [ ]  Подключить billing-плагин (напр. RevenueCat или `@capacitor-community/in-app-purchases`)
    - [ ]  Реализовать покупку монет как **consumable** товар
    - [ ]  Серверная верификация покупки (Google Play Developer API) перед начислением монет
    - [ ]  Обработка восстановления/ошибок/возвратов
- [ ]  **AppLovin MAX (реклама)**:
    - [ ]  Интегрировать SDK + mediation, форматы (rewarded для монет / interstitial)
    - [ ]  Начисление монет за rewarded-ad через сервер (анти-чит)
    - [ ]  Учесть: SDK добавит разрешение `AD_ID` → отразить в Data Safety (Фаза C)
- [ ]  **Перетест модерации чата**: отправить ранее проходившее мат-слово + 6 сообщений подряд (anti-flood)

<aside>
⚠️

AppLovin при регистрации просит ссылку на магазин. Решается так: сначала создаём приложение в Play Console (Фаза C) — тогда становится доступен URL вида `https://play.google.com/store/apps/details?id=az.simplesoft.dominotelefon`, его и указываем в AppLovin. То есть регистрацию AppLovin делаем ПОСЛЕ создания приложения в Консоли.

</aside>

---

## Фаза B — Релизный keystore (пошагово, keytool)

1. [ ] Сгенерировать ключ (выполнить в папке `android/`, ответить на вопросы, ЗАПОМНИТЬ пароли):

```bash
keytool -genkey -v -keystore domino-release.jks -alias domino -keyalg RSA -keysize 2048 -validity 10000
```

1. [ ] Создать файл `android/keystore.properties` (он уже в `.gitignore` — в репозиторий не попадёт):

```
storeFile=/абсолютный/путь/к/android/domino-release.jks
storePassword=ВАШ_ПАРОЛЬ_ХРАНИЛИЩА
keyAlias=domino
keyPassword=ВАШ_ПАРОЛЬ_КЛЮЧА
```

1. [ ] Узнать SHA-1 релизного ключа (понадобится для Google Sign-In в Фазе D):

```bash
keytool -list -v -keystore domino-release.jks -alias domino
```

1. [ ] **Сделать резервную копию `domino-release.jks` и паролей** в надёжном месте (потеря = невозможность обновлять приложение, если не включён Play App Signing).
2. [ ] Собрать подписанный AAB:

```bash
cd android && ./gradlew bundleRelease
```

Готовый файл: `android/app/build/outputs/bundle/release/app-release.aab`

<aside>
✅

30.06.2026: AAB собран и подписан release-ключом (versionCode 21, ~21 МБ). Сборку запускать на JDK из Android Studio JBR (openjdk 21): JDK 17 даёт ошибку `invalid source release: 21`, JDK 26 не подходит (jlink).

</aside>

<aside>
🔒

Включи **Play App Signing** в Консоли — тогда твой `.jks` будет только upload-ключом, а Google хранит основной ключ подписи (безопаснее). При этом в OAuth-клиент нужно добавить ОБА SHA-1: твой upload-ключ и App Signing-ключ из Консоли.

</aside>

---

## Фаза C — Google Play Console (теперь доступно)

- [ ]  Создать приложение, привязать пакет `az.simplesoft.dominotelefon`
- [ ]  Включить **Play App Signing**
- [ ]  **Store listing**: иконка 512×512, feature graphic 1024×500, скриншоты (телефон), краткое и полное описание (az/en/ru)
- [ ]  **Data Safety**:
    - [ ]  Privacy Policy URL (наш `privacy.html`)
    - [ ]  Микрофон → голосовой чат (объяснить использование)
    - [ ]  Рекламный ID `AD_ID` = **да** (из-за AppLovin)
    - [ ]  Перечислить собираемые данные (аккаунт, покупки, идентификаторы)
    - [ ]  Контакт: `support@simplesoft.az` (подтвердить, что ящик реально читается)
- [ ]  **Content rating (IARC)**: указать **simulated gambling = да** (виртуальные ставки), но это НЕ азартные игры на реальные деньги
- [ ]  **Target audience**: 12+ (из-за simulated gambling; не для детей)
- [ ]  **Ads declaration**: да (AppLovin)
- [ ]  **In-app products**: создать товар(ы) монет (consumable) для Billing

---

## Фаза D — Закрытое тестирование + Google Sign-In

<aside>
🚨

КРИТИЧНО: после создания ключа и включения Play App Signing добавить SHA-1 (upload + App Signing) в OAuth client в Google Cloud Console для пакета `az.simplesoft.dominotelefon`. Иначе вход через Google в релизе работать НЕ будет.

</aside>

- [ ]  Зарегистрировать релизный SHA-1 (+ App Signing SHA-1) в OAuth client
- [ ]  Проверить/добавить нужные домены в `ALLOWED_ORIGINS` на сервере
- [ ]  Залить AAB в **closed testing** трек
- [ ]  Добавить 12+ тестеров (opt-in), запустить 14-дневный отсчёт
- [ ]  Собрать обратную связь, пофиксить найденное

---

## Фаза E — Серверная часть (Этап 4, не Консоль)

- [ ]  Проверить `PLATFORM_API_URL` в prod-env (используется в relay голоса)
- [ ]  Проверить `ALLOWED_ORIGINS`
- [ ]  TURN-сервер для голосового чата
- [ ]  Бэкапы PostgreSQL
- [ ]  Ревизия env/secrets перед продом

---

## Фаза F — Продакшен

- [ ]  После 14 дней закрытого теста — запросить production access
- [ ]  Финальная сборка (поднять versionCode), выпуск в production
- [ ]  Мониторинг крэшей/отзывов после релиза

[📘 Пошаговая инструкция: Play Console · Firebase · Keystore](%F0%9F%9A%80%20Google%20Play%20%E2%80%94%20%D1%84%D0%B8%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9%20TODO%20%D0%BA%20%D1%80%D0%B5%D0%BB%D0%B8%D0%B7%D1%83/%F0%9F%93%98%20%D0%9F%D0%BE%D1%88%D0%B0%D0%B3%D0%BE%D0%B2%D0%B0%D1%8F%20%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D1%8F%20Play%20Console%20%C2%B7%20Firebase%20%C2%B7%20K%20475644c5073f4e8f87453e772f967bb2.md)