# Domino Telefon (Пятёрочка)

🌍 *[Read in English](#english)* | 🇷🇺 *[Читать на русском](#русский)*

---

<a name="english"></a>
# 🇬🇧 English - Project Overview

A full-stack, cross-platform implementation of the classic "Telefon" (Five Club / Пятёрочка) domino game. The project features a mobile-first web client, an Android application wrapper, a real-time multiplayer game server, and a modernized web platform infrastructure for user management.

## 🏗 Project Architecture

The repository is structured as a monorepo, containing both the legacy/active game components and the next-generation modern platform.

### 1. Client App (Frontend & Mobile Wrapper)
Located primarily in the root directory (`/js`, `/css`, `/assets`, `index.html`).
- **Tech Stack:** HTML5, Vanilla CSS, Modern JavaScript (ES6+), Web Audio API.
- **Mobile Wrapper:** [Capacitor](https://capacitorjs.com/) (`/android` directory) to compile the web app into a native Android APK.
- **Core Logic:** Contains the game board rendering (zoom-to-fit logic), AI bots (`ai.js`), and game rules implementation (`board.js`, `model.js`).
- **Networking:** Communicates with the backend using the Colyseus SDK.

### 2. Game Server (Real-time Multiplayer Backend)
Located in the `/server` directory.
- **Tech Stack:** Node.js, Express, [Colyseus](https://colyseus.io/).
- **Role:** Handles the real-time websocket connections, game state synchronization (`DominoRoom.js`), and basic account operations (`accountStore.js`).
- **Status:** Currently functional, but authentication and data storage are being migrated to the new Platform API.

### 3. Modern Platform (Next-Gen Infrastructure)
Located in the `/apps` and `/packages` directories. This is the modernized architecture built to handle robust authentication, database management, and administrative tools.
- **`apps/api` (`@domino2/api`)**: A **NestJS** backend providing REST/GraphQL APIs, integrating **Better Auth** for robust authentication (including Google OAuth), and interacting with the database.
- **`apps/admin` (`@domino2/admin`)**: A dedicated administration interface/dashboard for managing users, game statistics, and platform settings.
- **`packages/db` (`@domino2/db`)**: Contains the **Prisma ORM** schema (`schema.prisma`), database migrations, and scripts to import legacy JSON accounts into the new PostgreSQL database.
- **`packages/shared` (`@domino2/shared`)**: Shared code, types, and utilities used across the monorepo apps.

## 🎮 Game Rules

The goal of the game is to score points by making the sum of all open ends of the domino chain a multiple of **5**.
- **The Telephone (Spinner)**: The first double played on the board becomes the "Telephone". It allows connections on all four sides (top, bottom, left, right).
- **Scoring**: If the sum of open ends is 5, 10, 15, 20, etc., you get that many points.
- **Gosha (Combo)**: If you have tiles that match all open ends and the resulting sum is a multiple of 5, you can play them all at once.
- **Fish (Рыба)**: If no player can make a move, the round ends in a "Fish". The player with the fewest points in hand wins the bonus.

## 🚀 Building and Running

### Prerequisites
- Node.js & NPM
- Android Studio (for compiling the Android APK)
- Docker (for the PostgreSQL database)

### Web Client & Android Build
1. **Sync web assets to the output folder**:
   ```powershell
   npm run sync:www
   ```
2. **Update Capacitor**:
   ```bash
   npm run cap:copy
   ```
3. **Build APK**:
   ```powershell
   npm run apk:debug
   ```

### Running the Platform Services
The platform uses npm workspaces. You can run the various components from the root:
- **Start Local Database:** `npm run platform:db` (starts PostgreSQL via Docker)
- **Run NestJS API:** `npm run platform:api:dev`
- **Run Admin Dashboard:** `npm run platform:admin:dev`
- **Generate Prisma Client:** `npm run platform:prisma:generate`
- **Migrate Legacy Accounts:** `npm run platform:legacy:import`

### Real-time Game Server
Navigate to the `/server` folder and run:
```bash
cd server
npm start
```

## ☁️ Deployment
The project includes automated scripts for deploying to Google Cloud in the `/scripts/gcloud/` directory:
- `npm run deploy:gcloud` - Deploys the full stack.
- `npm run deploy:gcloud:platform` - Deploys only the modern platform (API/Admin).
- `npm run deploy:gcloud:legacy` - Deploys only the game server.

---

<a name="русский"></a>
# 🇷🇺 Русский - Обзор проекта

Полноценная кроссплатформенная реализация классической игры в домино "Телефон" (Пятёрочка). Проект включает в себя мобильный веб-клиент, оболочку для Android-приложения, игровой сервер для многопользовательской игры в реальном времени и современную инфраструктуру веб-платформы для управления пользователями.

## 🏗 Архитектура проекта

Репозиторий имеет структуру монорепозитория (monorepo), содержащего как текущие игровые компоненты, так и современную платформу нового поколения.

### 1. Клиентское приложение (Frontend и Mobile Wrapper)
Находится в корневой директории (`/js`, `/css`, `/assets`, `index.html`).
- **Технологии:** HTML5, Vanilla CSS, современный JavaScript (ES6+), Web Audio API.
- **Мобильная оболочка:** [Capacitor](https://capacitorjs.com/) (директория `/android`) для компиляции веб-приложения в нативный Android APK.
- **Основная логика:** Содержит логику отрисовки поля (с функцией zoom-to-fit), ИИ-ботов (`ai.js`) и реализацию правил игры (`board.js`, `model.js`).
- **Сеть:** Общается с бэкендом с помощью SDK Colyseus.

### 2. Игровой сервер (Real-time Multiplayer Backend)
Находится в директории `/server`.
- **Технологии:** Node.js, Express, [Colyseus](https://colyseus.io/).
- **Роль:** Обрабатывает веб-сокет соединения в реальном времени, синхронизирует состояние игры (`DominoRoom.js`) и выполняет базовые операции с аккаунтами (`accountStore.js`).
- **Статус:** В настоящее время функционирует, но аутентификация и хранение данных переносятся в новый Platform API.

### 3. Современная платформа (Next-Gen Infrastructure)
Находится в директориях `/apps` и `/packages`. Это модернизированная архитектура, созданная для надежной аутентификации, управления базами данных и инструментами администрирования.
- **`apps/api` (`@domino2/api`)**: Бэкенд на **NestJS**, предоставляющий REST/GraphQL API. Интегрирует **Better Auth** для надежной аутентификации (включая Google OAuth) и взаимодействует с базой данных.
- **`apps/admin` (`@domino2/admin`)**: Выделенный интерфейс/дашборд администратора для управления пользователями, статистикой игр и настройками платформы.
- **`packages/db` (`@domino2/db`)**: Содержит схему **Prisma ORM** (`schema.prisma`), миграции базы данных и скрипты для импорта старых аккаунтов (из JSON) в новую базу данных PostgreSQL.
- **`packages/shared` (`@domino2/shared`)**: Общий код, типы и утилиты, используемые в различных приложениях монорепозитория.

## 🎮 Правила игры

Цель игры - заработать очки, делая так, чтобы сумма всех открытых концов цепочки домино была кратна **5**.
- **Телефон (Спиннер)**: Первый дубль, сыгранный на доске, становится "Телефоном". К нему можно присоединять костяшки со всех четырех сторон (сверху, снизу, слева, справа).
- **Подсчет очков**: Если сумма открытых концов равна 5, 10, 15, 20 и т.д., вы получаете соответствующее количество очков.
- **Гоша (Комбо)**: Если у вас есть костяшки, которые подходят ко всем открытым концам, и итоговая сумма кратна 5, вы можете сыграть их все одновременно.
- **Рыба**: Если ни один игрок не может сделать ход и базар пуст, раунд заканчивается "Рыбой". Игрок с наименьшим количеством очков на руках выигрывает бонус.

## 🚀 Сборка и запуск

### Требования
- Node.js и NPM
- Android Studio (для компиляции Android APK)
- Docker (для базы данных PostgreSQL)

### Веб-клиент и сборка под Android
1. **Синхронизация веб-ресурсов в папку выдачи**:
   ```powershell
   npm run sync:www
   ```
2. **Обновление Capacitor**:
   ```bash
   npm run cap:copy
   ```
3. **Сборка APK**:
   ```powershell
   npm run apk:debug
   ```

### Запуск сервисов платформы
Платформа использует npm workspaces. Вы можете запускать различные компоненты из корня:
- **Запуск локальной базы данных:** `npm run platform:db` (запускает PostgreSQL через Docker)
- **Запуск NestJS API:** `npm run platform:api:dev`
- **Запуск панели администратора:** `npm run platform:admin:dev`
- **Генерация Prisma Client:** `npm run platform:prisma:generate`
- **Миграция старых аккаунтов:** `npm run platform:legacy:import`

### Игровой сервер реального времени
Перейдите в папку `/server` и выполните:
```bash
cd server
npm start
```

## ☁️ Развертывание (Деплой)
Проект включает автоматизированные скрипты для развертывания в Google Cloud в директории `/scripts/gcloud/`:
- `npm run deploy:gcloud` - Развертывание всего стека.
- `npm run deploy:gcloud:platform` - Развертывание только современной платформы (API/Admin).
- `npm run deploy:gcloud:legacy` - Развертывание только игрового сервера.
