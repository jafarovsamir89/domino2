"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { resetPassword } from "../lib/auth-actions";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      await resetPassword(token, password);
      setStatus("Password updated. You can sign in again.");
      setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Account Recovery</p>
      <h1 style={titleStyle}>Reset password</h1>
      <p style={bodyStyle}>
        Enter the token from your reset link and choose a new password for the admin platform.
      </p>

      {!token ? <p style={warningStyle}>Missing reset token. Open the link from your email or request a new one.</p> : null}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <label style={labelStyle}>
          Reset token
          <input type="text" value={token} readOnly style={inputStyle} />
        </label>
        <label style={labelStyle}>
          New password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a new password"
            required
            style={inputStyle}
          />
        </label>
        <button type="submit" style={buttonStyle} disabled={busy || !token}>
          {busy ? "Updating..." : "Update password"}
        </button>
      </form>

      {status ? <p style={successStyle}>{status}</p> : null}
      {error ? <p style={errorStyle}>{error}</p> : null}

      <div style={footerStyle}>
        <Link href="/login" style={linkStyle}>
          Back to login
        </Link>
        <Link href="/forgot-password" style={linkStyle}>
          Request new reset link
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

const warningStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(146,64,14,0.18)",
  border: "1px solid rgba(251,191,36,0.28)",
  color: "#fde68a",
  margin: "0 0 16px"
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
