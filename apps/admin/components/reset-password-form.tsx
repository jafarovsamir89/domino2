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

const warningStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#fff7ed",
  border: "1px solid rgba(251,191,36,0.22)",
  color: "#92400e",
  margin: "0 0 16px"
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
