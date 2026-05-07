-- Run as a PostgreSQL superuser on the target VM.
-- Adjust credentials before production use.

DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_platform') THEN
      CREATE ROLE domino_platform LOGIN PASSWORD 'change-this-password';
   END IF;
END
$$;

DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'domino2_platform') THEN
      CREATE DATABASE domino2_platform OWNER domino_platform;
   END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE domino2_platform TO domino_platform;
