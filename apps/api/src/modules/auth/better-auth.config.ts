export interface BetterAuthConfig {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  trustedOriginSet: Set<string>;
  google?: {
    clientId: string;
    clientSecret: string;
  };
}

export function getBetterAuthConfig(): BetterAuthConfig {
  const googleEnabled =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);
  const publicAppOrigin = process.env.PUBLIC_APP_ORIGIN || "http://34.28.23.216";

  const normalizeOrigin = (value?: string | null) => {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return value;
    }
  };

  const deriveGameOrigin = (value?: string | null) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.hostname}:2567`;
    } catch {
      return null;
    }
  };

  const trustedOrigins = Array.from(
    new Set(
      [
        publicAppOrigin,
        deriveGameOrigin(publicAppOrigin),
        process.env.ADMIN_APP_URL || "http://localhost:3001",
        process.env.GAME_WEB_URL || "http://localhost:2567",
        process.env.BETTER_AUTH_URL || "http://localhost:3000",
        ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      ]
        .map(normalizeOrigin)
        .filter((origin): origin is string => Boolean(origin))
    )
  );

  return {
    secret: process.env.BETTER_AUTH_SECRET || "change-me",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    trustedOrigins,
    trustedOriginSet: new Set(trustedOrigins),
    google: googleEnabled
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID || "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || ""
        }
      : undefined
  };
}
