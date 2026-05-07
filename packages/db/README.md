# `@domino2/db`

This package contains:

- Prisma schema
- database migrations
- platform bootstrap helpers
- catalog and payments foundation

## Common commands

1. Start PostgreSQL:

```bash
docker compose -f docker-compose.platform.yml up -d
```

2. Copy the DB env file:

```bash
cp packages/db/.env.example packages/db/.env
```

3. Run migrations:

```bash
cd packages/db
npm run migrate:dev
```

4. Generate the Prisma client:

```bash
npm run generate
```
