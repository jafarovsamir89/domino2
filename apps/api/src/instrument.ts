import * as Sentry from "@sentry/nestjs";
import { buildInfo } from './build-info.js';
const build = buildInfo();

const dsn = process.env.SENTRY_DSN_API || process.env.SENTRY_DSN || "";

// Ensure Sentry.init runs before any other module is imported (see main.ts).
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: build.release,
    initialScope: { tags: { deploySha: build.deploySha, service: 'api' } },
    // Performance tracing. Tune via SENTRY_TRACES_SAMPLE_RATE (0..1).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    // Forward console logs to Sentry Logs.
    enableLogs: true,
  });
}
