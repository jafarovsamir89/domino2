"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { sendVerificationEmail, verifyEmail, getAuthBaseUrl } from "../lib/auth-actions";

type VerifyEmailPanelProps = {
  token: string;
};

export function VerifyEmailPanel({ token }: VerifyEmailPanelProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    async function run() {
      setBusy(true);
      setError(null);
      try {
        await verifyEmail(token, `${getAuthBaseUrl()}/login`);
        if (!mounted) return;
        setStatus("Email verified. You can sign in now.");
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Verification failed");
      } finally {
        if (mounted) setBusy(false);
      }
    }

    void run();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      await sendVerificationEmail(email, `${getAuthBaseUrl()}/verify-email`);
      setStatus("Verification email requested. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Account Recovery</p>
      <h1 style={titleStyle}>Verify email</h1>
      <p style={bodyStyle}>
        If you already have a token, this page verifies it automatically. Otherwise you can request a new
        verification email.
      </p>

      {token ? <p style={tokenStyle}>Token received from the link.</p> : null}

      {!token ? (
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
            {busy ? "Sending..." : "Send verification email"}
          </button>
        </form>
      ) : null}

      {busy ? <p style={hintStyle}>Working...</p> : null}
      {status ? <p style={successStyle}>{status}</p> : null}
      {error ? <p style={errorStyle}>{error}</p> : null}

      <div style={footerStyle}>
        <Link href="/login" style={linkStyle}>
          Back to login
        </Link>
        <Link href="/forgot-password" style={linkStyle}>
          Forgot password
        </Link>
      </div>
    </section>
  );
}

const cardStyle = {
  padding: 32,
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98))",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 30px 80px rgba(15,23,42,0.45)"
} as const;

const eyebrowStyle = {
  textTransform: "uppercase",
  letterSpacing: 1.6,
  color: "#38bdf8",
  fontSize: 12,
  margin: 0
} as const;

const titleStyle = {
  margin: "10px 0 12px",
  fontSize: 40,
  lineHeight: 1.05
} as const;

const bodyStyle = {
  color: "#94a3b8",
  lineHeight: 1.7,
  margin: "0 0 24px"
} as const;

const tokenStyle = {
  margin: "0 0 16px",
  padding: 14,
  borderRadius: 16,
  background: "rgba(14,116,144,0.16)",
  border: "1px solid rgba(103,232,249,0.22)",
  color: "#cffafe"
} as const;

const hintStyle = {
  marginTop: 12,
  color: "#94a3b8"
} as const;

const labelStyle = {
  display: "grid",
  gap: 8,
  color: "#cbd5e1",
  fontSize: 14
} as const;

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.92)",
  color: "#e2e8f0",
  outline: "none"
} as const;

const buttonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "14px 16px",
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617",
  fontWeight: 700,
  cursor: "pointer"
} as const;

const successStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 16,
  background: "rgba(21,128,61,0.18)",
  border: "1px solid rgba(74,222,128,0.28)",
  color: "#bbf7d0"
} as const;

const errorStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 16,
  background: "rgba(127,29,29,0.18)",
  border: "1px solid rgba(248,113,113,0.28)",
  color: "#fecaca"
} as const;

const footerStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 18
} as const;

const linkStyle = {
  color: "#7dd3fc",
  textDecoration: "none",
  fontWeight: 600
} as const;
