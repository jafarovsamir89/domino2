const LIMIT_WINDOW_MS = 30_000;
const LIMIT_MAX_JOINS = 8;

const joinAttempts = new Map();

function getJoinRateLimitBucket(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;
  return normalizedKey;
}

function checkJoinRateLimit(key, now = Date.now()) {
  const bucketKey = getJoinRateLimitBucket(key);
  if (!bucketKey) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const cutoff = now - LIMIT_WINDOW_MS;
  const attempts = (joinAttempts.get(bucketKey) || []).filter((ts) => Number(ts) > cutoff);
  attempts.push(now);
  joinAttempts.set(bucketKey, attempts);

  if (attempts.length <= LIMIT_MAX_JOINS) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const oldest = attempts[0];
  const retryAfterMs = Math.max(0, LIMIT_WINDOW_MS - (now - oldest));
  return { allowed: false, retryAfterMs };
}

function resetJoinRateLimits() {
  joinAttempts.clear();
}

module.exports = {
  LIMIT_WINDOW_MS,
  LIMIT_MAX_JOINS,
  checkJoinRateLimit,
  resetJoinRateLimits
};
