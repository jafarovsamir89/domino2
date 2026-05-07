# Agent Deploy Quickstart

Короткая памятка для любого агента, который редактирует проект из IDE и потом должен быстро обновить GitHub и сервер.

## Главная команда

После изменений в IDE используй:

```powershell
npm run deploy:gcloud:git -- -Message "Короткое описание изменений"
```

Что делает эта команда:

- делает `git add`
- создает commit
- пушит в `origin/main`
- подключается к GCloud VM
- обновляет код на сервере
- пересобирает platform и legacy части
- перезапускает `pm2` процессы
- прогоняет health checks

Это основной и рекомендуемый способ деплоя.

## Если нужно просто обновить сервер из уже запушенного Git

Локально:

```powershell
npm run deploy:gcloud
```

Или вручную на сервере:

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh
```

## Если на сервере уже лежат нужные файлы и pull не нужен

Используй:

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh --no-pull
```

Это полезно только для редких случаев. Нормальный поток работы должен идти через GitHub.

## Если нужно включить Google OAuth credentials на VM

Есть отдельная команда:

```powershell
npm run deploy:gcloud:google
```

Она берет Google OAuth credentials из локальной папки `rsa/` и обновляет `.env.platform` на сервере.

## Какой поток считается правильным

После правок в IDE:

1. Проверить изменения локально.
2. Выполнить:

```powershell
npm run deploy:gcloud:git -- -Message "Что было изменено"
```

3. Проверить в браузере:

- `http://34.28.23.216:2567/` — игра
- `http://34.28.23.216/api/health` — API
- `http://34.28.23.216/` — admin

## Важные замечания

- Не редактировать файлы напрямую на сервере, если этого можно избежать.
- Основной источник истины для кода — GitHub `main`.
- На VM есть отдельные runtime-данные:
  - `.env.platform`
  - PostgreSQL
  - `server/data`
  - `pm2` процессы
- Если после деплоя визуально нет изменений в игре, сначала проверить кэш браузера и service worker:
  - `Ctrl+F5`
  - инкогнито
  - очистка site data

## Полезные URL

- игра: `http://34.28.23.216:2567/`
- admin: `http://34.28.23.216/`
- login: `http://34.28.23.216/login`
- direct Google auth: `http://34.28.23.216/auth/google`
- API health: `http://34.28.23.216/api/health`
- platform status: `http://34.28.23.216/api/platform/status`

