# `@domino2/db`

Этот пакет хранит:

- Prisma schema;
- миграции;
- скрипты миграции legacy-данных;
- базовые enum и foundation под catalog/payments.

## Первые команды

1. Поднять PostgreSQL:

```bash
docker compose -f docker-compose.platform.yml up -d
```

2. Скопировать env:

```bash
cp packages/db/.env.example packages/db/.env
```

3. Выполнить миграции:

```bash
cd packages/db
npm run migrate:dev
```

4. После этого можно запускать импорт legacy-данных:

```bash
node scripts/import-legacy-accounts.mjs ../../server/data/accounts.json
```

