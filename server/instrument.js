// Sentry initialization for the Domino game server (Colyseus + Express).
// IMPORTANT: this file is required at the very top of index.js, before any
// other module is loaded, so Sentry can auto-instrument them.
const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN_GAME || process.env.SENTRY_DSN || "";

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release:
      process.env.SENTRY_RELEASE ||
      `domino-server@${process.env.npm_package_version || "1.0.0"}`,
    // Performance tracing. Tune via SENTRY_TRACES_SAMPLE_RATE (0..1).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    // Forward console logs to Sentry Logs.
    enableLogs: true,
  });
  console.info("[Sentry] Game server monitoring initialized");
} else {
  console.info("[Sentry] SENTRY_DSN not set \u2014 monitoring disabled");
}

module.exports = Sentry;
