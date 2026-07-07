# 📘 Пошаговая инструкция: Play Console · Firebase · Keystore

<aside>
📘

Подробный гайд для первого раза. Делай по порядку, отмечай галочки. Если экран не совпадает с шагом — напиши мне, не угадывай.

</aside>

## 1️⃣ Google Play Console — создание приложения

- [x]  **Шаг 1. Открой Console.** Зайди на `https://play.google.com/console` под аккаунтом разработчика.
- [x]  **Шаг 2. Создай приложение.** Нажми **Create app / Создать приложение** (справа вверху).
- [x]  **Шаг 3. Заполни форму:**
    - App name / Название: `Domino` (видно в магазине, можно изменить позже)
    - Default language: напр. English (US) или Azerbaijani
    - App or game: выбери **Game / Игра**
    - Free or paid: **Free / Бесплатно**
    - Поставь галочки в Declarations (Developer Program Policies + US export laws)
- [x]  **Шаг 4. Нажми Create app.** Откроется Dashboard.

<aside>
ℹ️

Имя пакета `az.simplesoft.dominotelefon` НЕ вводится вручную — оно «привяжется» автоматически, когда ты впервые загрузишь AAB в трек (Фаза D). До этого приложение существует как «черновик».

</aside>

- [ ]  **Шаг 5. Ссылка для AppLovin.** Формируется из пакета и доступна сразу:

```
https://play.google.com/store/apps/details?id=az.simplesoft.dominotelefon
```

Её можно указать в AppLovin при регистрации (приложение пометится как «ещё не опубликовано» — это нормально).

Регестрация ждет подтверждения после того как будет опубликовано приложение

- [ ]  **Шаг 6 (опционально).** Можешь начать заполнять Dashboard (Store listing, Data Safety, Content rating), но удобнее доделать это в Фазе C по туду-листу.

---

## 2️⃣ Firebase — проект и google-services.json

<aside>
💡

Лучше создать Firebase-проект в ТОМ ЖЕ Google-аккаунте, где OAuth для входа через Google — меньше путаницы потом.

</aside>

- [x]  **Шаг 1. Открой Firebase Console:** `https://console.firebase.google.com`
- [x]  **Шаг 2. Add project / Добавить проект.** Назови, напр. `domino`. Аналитику можно включить или пропустить.
- [x]  **Шаг 3. Добавь Android-приложение** (иконка **Android** на главной проекта):
    - **Android package name:** `az.simplesoft.dominotelefon` (ТОЧНО так, регистр важен)
    - App nickname: `Domino` (необязательно)
    - Debug SHA-1: можно пропустить сейчас (SHA добавим позже для входа через Google)
    - Нажми **Register app**
- [x]  **Шаг 4. Скачай `google-services.json`** и положи файл в папку `android/app/` проекта.

<aside>
⚠️

Файл `google-services.json` НЕ коммить в git — он уже в `.gitignore`. Храни копию у себя.

</aside>

- [x]  **Шаг 5.** Остальные шаги SDK в мастере Firebase можно пропустить — клиентскую часть (Capacitor Push) я дам отдельным код-промтом.
- [x]  **Шаг 6.** Cloud Messaging уже включён по умолчанию. Серверная отправка у нас уже реализована — позже проверим ключи/доступ.

---

## 3️⃣ Релизный keystore (keytool) — детально

<aside>
🔑

keytool входит в состав JDK. Если установлена Android Studio — JDK уже есть. Проверь: в терминале набери `keytool` — должна появиться справка.

</aside>

- [ ]  **Шаг 1. Перейди в папку `android` проекта:**

```bash
cd путь/к/проекту/domino2/android
```

- [ ]  **Шаг 2. Сгенерируй ключ:**

```bash
keytool -genkey -v -keystore domino-release.jks -alias domino -keyalg RSA -keysize 2048 -validity 10000
```

- [x]  **Шаг 3. Ответь на вопросы keytool (записывай!):**
    - *Enter keystore password* — придумай пароль хранилища → повтори его
    - *What is your first and last name?* (CN) — можно `Samir Jafarov` или `Domino`
    - *Organizational unit / Organization* — можно `SimpleSoft` или Enter
    - *City / State* — по желанию
    - *Two-letter country code* — `AZ`
    - Подтверждение `Is ... correct? [no]:` — набери **yes** (в локали может быть `да`)
    - *Enter key password for <domino>* — нажми **Enter**, чтобы использовать тот же пароль, что у хранилища
- [x]  **Шаг 4.** Появится файл `domino-release.jks` в папке `android/`.
- [ ]  **Шаг 5. Создай файл `android/keystore.properties`** (подставь свои пароли и АБСОЛЮТНЫЙ путь):

```
storeFile=/полный/путь/к/domino2/android/domino-release.jks
storePassword=твой_пароль_хранилища
keyAlias=domino
keyPassword=твой_пароль_ключа
```

<aside>
⚠️

`keystore.properties` и `*.jks` уже в `.gitignore` — в репозиторий не попадут. Используй именно АБСОЛЮТНЫЙ путь в storeFile.

</aside>

- [ ]  **Шаг 6. Узнай SHA-1** (понадобится для входа через Google в Фазе D):

```bash
keytool -list -v -keystore domino-release.jks -alias domino
```

Скопируй строку `SHA1: ...` и сохрани.

- [ ]  **Шаг 7. СДЕЛАЙ РЕЗЕРВНУЮ КОПИЮ** файла `domino-release.jks` и паролей (облако / менеджер паролей).

<aside>
🚨

Если потеряешь keystore или пароли — без Play App Signing обновлять приложение будет НЕВОЗМОЖНО. Поэтому обязательно включи Play App Signing в Консоли и храни бэкап ключа.

</aside>

- [ ]  **Шаг 8. Сборка подписанного AAB** (когда дойдёшь):

```bash
cd android && ./gradlew bundleRelease
```

Готовый файл: `android/app/build/outputs/bundle/release/app-release.aab`

<aside>
💡

Перед сборкой AAB веб-часть (папка www) должна быть актуальной. Если меняли фронтенд — сначала собери web и синхронизируй (`npx cap sync android`), потом запускай bundleRelease.

</aside>