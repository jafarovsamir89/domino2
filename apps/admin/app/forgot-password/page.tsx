"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";

import { requestPasswordReset, getAuthBaseUrl } from "../../lib/auth-actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const callbackURL = `${getAuthBaseUrl()}/reset-password`;
      const result = await requestPasswordReset(email, callbackURL);
      setMessage(result.message || "Reset link requested. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Account Recovery</p>
        <h1 style={titleStyle}>Forgot password</h1>
        <p style={bodyStyle}>
          Request a reset link for your admin account. The link will land on the new reset page in the platform
          surface.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={labelStyle}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@yourgame.com"
              required
              style={inputStyle}
            />
          </label>
          <button type="submit" style={buttonStyle} disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {message ? <p style={successStyle}>{message}</p> : null}
        {error ? <p style={errorStyle}>{error}</p> : null}

        <div style={footerStyle}>
          <Link href="/login" style={linkStyle}>
            Back to login
          </Link>
          <Link href="/verify-email" style={linkStyle}>
            Verify email
          </Link>
        </div>
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: 640,
  margin: "64px auto",
  padding: "0 24px"
} as const;

const cardStyle = {
  padding: 32,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 24px 60px rgba(15,23,42,0.08)"
} as const;

const eyebrowStyle = {
  textTransform: "uppercase",
  letterSpacing: 1.6,
  color: "#0284c7",
  fontSize: 12,
  margin: 0
} as const;

const titleStyle = {
  margin: "10px 0 12px",
  fontSize: 40,
  lineHeight: 1.05,
  color: "#0f172a"
} as const;

const bodyStyle = {
  color: "#64748b",
  lineHeight: 1.7,
  margin: "0 0 24px"
} as const;

const labelStyle = {
  display: "grid",
  gap: 8,
  color: "#334155",
  fontSize: 14
} as const;

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#ffffff",
  color: "#0f172a",
  outline: "none"
} as const;

const buttonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "14px 16px",
  background: "linear-gradient(135deg, #dbeafe, #cffafe)",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer"
} as const;

const successStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 16,
  background: "#eff6ff",
  border: "1px solid rgba(147,197,253,0.35)",
  color: "#0f172a"
} as const;

const errorStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 16,
  background: "#fff1f2",
  border: "1px solid rgba(251,113,133,0.25)",
  color: "#9f1239"
} as const;

const footerStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 18
} as const;

const linkStyle = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 600
} as const;
