import { verifyPassword as verifyBuiltInPassword } from "better-auth/crypto";

import { isLegacyPasswordHash, encodeLegacyPassword, verifyLegacyPassword } from "@domino2/shared";

export interface BetterAuthConfig {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  trustedOriginSet: Set<string>;
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (input: { hash: string; password: string }) => Promise<boolean>;
  google?: {
    clientId: string;
    clientSecret: string;
  };
  apple?: {
    clientId: string;
    clientSecret: string;
  };
}

export function getBetterAuthConfig(): BetterAuthConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const defaultGameWebUrl = isProduction ? "https://gamed.simplesoft.az" : "http://localhost:2567";
  const defaultApiUrl = isProduction ? "https://apid.simplesoft.az" : "http://localhost:3000";
  const defaultAdminUrl = isProduction ? "https://admind.simplesoft.az" : "http://localhost:3001";
  const googleEnabled =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const appleEnabled =
    Boolean(process.env.APPLE_CLIENT_ID) &&
    Boolean(process.env.APPLE_CLIENT_SECRET);
  const publicAppOrigin = process.env.PUBLIC_APP_ORIGIN || defaultGameWebUrl;

  const normalizeOrigin = (value?: string | null) => {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return value;
    }
  };

  const ensureSecureUrl = (label: string, value: string) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${label} must be a valid absolute URL`);
    }

    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (isProduction && !isLocal && parsed.protocol !== "https:") {
      throw new Error(`${label} must use HTTPS in production`);
    }

    return parsed.toString().replace(/\/$/, "");
  };

  const trustedOrigins = Array.from(
    new Set(
      [
        publicAppOrigin,
        process.env.ADMIN_APP_URL || defaultAdminUrl,
        process.env.GAME_WEB_URL || defaultGameWebUrl,
        process.env.BETTER_AUTH_URL || defaultApiUrl,
        ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      ]
        .map(normalizeOrigin)
        .filter((origin): origin is string => Boolean(origin))
    )
  );

  const hashPassword = async (password: string) => encodeLegacyPassword(password);
  const verifyPassword = async ({ hash, password }: { hash: string; password: string }) => {
    if (isLegacyPasswordHash(hash)) {
      return verifyLegacyPassword(hash, password);
    }

    return verifyBuiltInPassword({ hash, password });
  };

  const baseURL = ensureSecureUrl("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL || defaultApiUrl);
  const normalizedTrustedOrigins = trustedOrigins.map((origin) => ensureSecureUrl("trusted origin", origin));

  return {
    secret:
      (() => {
        const secret = process.env.BETTER_AUTH_SECRET;
        if (!secret || ["change-me", "replace-me", "secret", "test"].includes(secret.trim())) {
          throw new Error(
            "BETTER_AUTH_SECRET environment variable is required. " +
              "Generate a random 32+ character secret and set it in .env"
          );
        }
        return secret;
      })(),
    baseURL,
    trustedOrigins: normalizedTrustedOrigins,
    trustedOriginSet: new Set(normalizedTrustedOrigins),
    hashPassword,
    verifyPassword,
    google: googleEnabled
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID || "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || ""
        }
      : undefined,
    apple: appleEnabled
      ? {
          clientId: process.env.APPLE_CLIENT_ID || "",
          clientSecret: process.env.APPLE_CLIENT_SECRET || ""
        }
      : undefined
  };
}
