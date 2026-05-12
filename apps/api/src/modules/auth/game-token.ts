import crypto from "node:crypto";

export type GameTokenClaims = {
  userId: string;
  playerId: string;
  displayName: string;
  role: string;
  sessionId: string;
  provider: "better-auth";
  issuedAt: number;
  expiresAt: number;
};

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || ["change-me", "replace-me", "secret", "test"].includes(secret.trim())) {
    throw new Error(
      "BETTER_AUTH_SECRET environment variable is required. " +
        "Generate a random 32+ character secret and set it in .env"
    );
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createGameToken(claims: GameTokenClaims) {
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyGameToken(token: string): GameTokenClaims | null {
  const value = String(token || "").trim();
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  if (signPayload(payload) !== signature) return null;

  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as GameTokenClaims;
    if (!claims?.userId || !claims?.playerId || !claims?.displayName) return null;
    if (typeof claims.expiresAt !== "number" || claims.expiresAt <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
