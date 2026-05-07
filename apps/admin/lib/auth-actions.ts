const fallbackAuthUrl = "http://localhost:3000";

export function getAuthBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    (typeof window !== "undefined" ? window.location.origin : fallbackAuthUrl)
  ).replace(/\/$/, "");
}

async function authJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getAuthBaseUrl()}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || response.statusText || "Auth request failed");
  }

  return data as T;
}

export async function requestPasswordReset(email: string, callbackURL: string) {
  return authJson<{ status: boolean; message: string }>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({
      email,
      redirectTo: callbackURL
    })
  });
}

export async function sendVerificationEmail(email: string, callbackURL: string) {
  return authJson<{ status: boolean }>("/api/auth/send-verification-email", {
    method: "POST",
    body: JSON.stringify({
      email,
      callbackURL
    })
  });
}

export async function verifyEmail(token: string, callbackURL: string) {
  const path = `/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`;
  return authJson<{ status: boolean; user?: unknown }>(path);
}

export async function resetPassword(token: string, newPassword: string) {
  return authJson<{ status: boolean }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token,
      newPassword
    })
  });
}
