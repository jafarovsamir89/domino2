import crypto from "node:crypto";

type ProofPayload = Record<string, unknown>;

function getSecret() {
  const secret = process.env.DOMINO_SERVER_SECRET || process.env.BETTER_AUTH_SECRET || "";
  if (!secret || ["change-me", "replace-me", "secret", "test"].includes(secret.trim())) {
    throw new Error(
      "DOMINO_SERVER_SECRET or BETTER_AUTH_SECRET environment variable is required for signed server requests"
    );
  }

  return secret;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(normalizeValue(value));
}

export function signDominoPayload(payload: ProofPayload) {
  return crypto.createHmac("sha256", getSecret()).update(stableStringify(payload)).digest("base64url");
}

export function verifyDominoPayload(payload: ProofPayload, proof: string | null | undefined) {
  const signature = String(proof || "").trim();
  if (!signature) return false;

  const expected = signDominoPayload(payload);
  if (expected.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
