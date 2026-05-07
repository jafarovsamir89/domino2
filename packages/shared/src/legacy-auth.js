import crypto from "node:crypto";

export function normalizeLegacyName(value) {
  return String(value || "Player")
    .replace(/[<>&"']/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24) || "Player";
}

export function makeLegacyAliasEmail(value, fallbackName = "player") {
  const raw = String(value || "").trim();
  if (raw.includes("@")) {
    return raw.slice(0, 254).toLowerCase();
  }

  const alias = normalizeLegacyName(fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "player";

  return `${alias}@domino.local`;
}

export function encodeLegacyPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `legacy-scrypt:${salt}:${hash}`;
}

export function encodeLegacyPasswordFromParts(salt, hash) {
  const normalizedSalt = String(salt || "").trim();
  const normalizedHash = String(hash || "").trim();
  if (!normalizedSalt || !normalizedHash) {
    throw new Error("Legacy password hash is missing");
  }

  return `legacy-scrypt:${normalizedSalt}:${normalizedHash}`;
}

export function isLegacyPasswordHash(hash) {
  return String(hash || "").startsWith("legacy-scrypt:");
}

export function verifyLegacyPassword(hash, password) {
  if (!isLegacyPasswordHash(hash)) return false;

  const [, salt, expectedHash] = String(hash).split(":");
  if (!salt || !expectedHash) return false;

  const computedHash = crypto.scryptSync(String(password || ""), salt, 64);
  const currentHash = Buffer.from(expectedHash, "hex");
  if (currentHash.length !== computedHash.length) return false;

  return crypto.timingSafeEqual(currentHash, computedHash);
}
