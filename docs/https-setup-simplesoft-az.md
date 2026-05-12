# Настройка доменов и HTTPS для Domino Telefon

Дата: 12.05.2026

Схема доменов:

- `gamed.simplesoft.az` - клиент игры и игровой веб-слой
- `apid.simplesoft.az` - platform API и Better Auth
- `admind.simplesoft.az` - админ-панель

Сервер:

- `34.28.23.216`

## 1. Что нужно сделать в DNS

Создайте три `A`-записи, все на один и тот же IP:

- `gamed.simplesoft.az` -> `34.28.23.216`
- `apid.simplesoft.az` -> `34.28.23.216`
- `admind.simplesoft.az` -> `34.28.23.216`

Если у регистратора есть поле `TTL`, оставьте стандартное значение.

Важно:

- старый сайт `www.simplesoft.az` не трогаем
- если у домена есть отдельный основной сайт, его записи не меняем

## 2. Что нужно сделать для SSL

Нужен один сертификат, который покрывает все три поддомена.

Рекомендуемая команда `certbot`:

```bash
sudo certbot --nginx \
  -d gamed.simplesoft.az \
  -d apid.simplesoft.az \
  -d admind.simplesoft.az
```

Если у вас уже стоит SSL для `www.simplesoft.az`, это не мешает. Для игры лучше выпускать отдельный сертификат именно на эти поддомены, чтобы не ломать основной сайт.

После выпуска сертификата проверьте, что файлы существуют:

- `/etc/letsencrypt/live/gamed.simplesoft.az/fullchain.pem`
- `/etc/letsencrypt/live/gamed.simplesoft.az/privkey.pem`

Если certbot создаст сертификат с другим именем, в Nginx нужно будет подставить фактический путь.

## 3. Что нужно сделать в Nginx

Используйте конфиг из `scripts/gcloud/nginx-domino2.conf`.

Нужно, чтобы:

- `gamed.simplesoft.az` проксировал на `127.0.0.1:2567`
- `apid.simplesoft.az` проксировал на `127.0.0.1:3000`
- `admind.simplesoft.az` проксировал на `127.0.0.1:3001`
- порт `80` только редиректил на `443`

После изменения конфига:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. Что нужно обновить в env

### Platform API

Файл на сервере: `.env.platform`

Нужные значения:

```env
BETTER_AUTH_SECRET=...случайный_секрет...
BETTER_AUTH_URL=https://apid.simplesoft.az
PUBLIC_APP_ORIGIN=https://gamed.simplesoft.az
ADMIN_APP_URL=https://admind.simplesoft.az
GAME_WEB_URL=https://gamed.simplesoft.az
```

### Admin

Если есть `apps/admin/.env.local` или похожий production env, проверьте:

```env
NEXT_PUBLIC_API_URL=https://apid.simplesoft.az/api
NEXT_PUBLIC_BETTER_AUTH_URL=https://apid.simplesoft.az
NEXT_PUBLIC_GAME_SERVER_URL=https://gamed.simplesoft.az
```

### Game client

В браузерной части проект уже должен использовать:

- `https://gamed.simplesoft.az`
- `https://apid.simplesoft.az`

Если где-то осталось старое значение с IP или `http`, его нужно убрать.

## 5. Что нужно сделать после DNS и SSL

1. Обновить конфиги на сервере.
2. Перезапустить `nginx`.
3. Перезапустить `domino-platform-api`.
4. Перезапустить `domino-platform-admin`.
5. Перезапустить legacy game server `domino-server`.
6. Проверить в браузере:
   - `https://gamed.simplesoft.az`
   - `https://apid.simplesoft.az/api/health`
   - `https://admind.simplesoft.az`

## 6. Что важно не забыть

- Не включайте `allowMixedContent`.
- Не оставляйте `usesCleartextTraffic=true`.
- Не держите старый IP в клиенте как основной fallback.
- Не публикуйте PostgreSQL на внешний интерфейс.
- Не используйте HTTP для production токенов.

## 7. Быстрая проверка

Если после настройки что-то не работает, проверяйте по порядку:

1. DNS резолвится ли домен в IP сервера.
2. Открывается ли 443 порт.
3. Валиден ли сертификат.
4. Совпадает ли `server_name` в Nginx.
5. Совпадают ли `BETTER_AUTH_URL` и `PUBLIC_APP_ORIGIN` с реальными доменами.
6. Нет ли старого `http://34.28.23.216` в env или JS.

