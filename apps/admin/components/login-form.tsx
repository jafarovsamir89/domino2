"use client";

import type { FormEvent } from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "../lib/auth-client";

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.92)",
  color: "#e2e8f0",
  outline: "none"
} as const;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getCallbackURL() {
    return "/dashboard";
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      callbackURL: getCallbackURL()
    });

    if (error) {
      setStatus(error.message || "Login failed");
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setStatus(null);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: getCallbackURL()
    });

    if (error) {
      setStatus(error.message || "Google sign-in failed");
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={handleEmailSignIn} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={labelStyle}>Email</span>
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@yourgame.com"
            autoComplete="email"
            required
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={labelStyle}>Password</span>
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>
        <button style={primaryButtonStyle} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in with email"}
        </button>
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        <button style={secondaryButtonStyle} type="button" onClick={handleGoogleSignIn} disabled={isSubmitting}>
          Continue with Google
        </button>
        <p style={helperStyle}>
          Admin sign-up is intentionally not public. Accounts will be seeded or created by the backend team, then
          optionally linked to Google.
        </p>
      </div>

      {status ? (
        <div style={errorBoxStyle}>
          <strong style={{ display: "block", marginBottom: 6 }}>Sign-in problem</strong>
          <span>{status}</span>
        </div>
      ) : null}
    </div>
  );
}

const labelStyle = {
  color: "#cbd5e1",
  fontSize: 14
};

const primaryButtonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "14px 16px",
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617",
  fontWeight: 700,
  cursor: "pointer"
} as const;

const secondaryButtonStyle = {
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 14,
  padding: "14px 16px",
  background: "rgba(15,23,42,0.88)",
  color: "#e2e8f0",
  fontWeight: 600,
  cursor: "pointer"
} as const;

const helperStyle = {
  margin: 0,
  color: "#94a3b8",
  lineHeight: 1.6,
  fontSize: 14
};

const errorBoxStyle = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(127,29,29,0.18)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fecaca"
} as const;
