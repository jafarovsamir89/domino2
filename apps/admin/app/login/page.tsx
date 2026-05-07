import Link from "next/link";

import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <p style={eyebrowStyle}>Secure Access</p>
        <h1 style={titleStyle}>Hesaba daxil ol</h1>
        <p style={bodyStyle}>
          This is the clean entry point for the admin surface. Email/password and Google login both land here, and
          the callback can return straight back to the game.
        </p>

        <div style={chipRowStyle}>
          <span style={chipStyle}>Better Auth</span>
          <span style={chipStyle}>Google OAuth</span>
          <span style={chipStyle}>Admin-only access</span>
        </div>
      </section>

      <section style={cardStyle}>
        <LoginForm />
        <div style={footerRowStyle}>
          <Link href="/forgot-password" style={footerLinkStyle}>Forgot password?</Link>
          <Link href="/verify-email" style={footerLinkStyle}>Verify email</Link>
        </div>
      </section>
    </main>
  );
}

const pageStyle = {
  width: "min(1160px, calc(100% - 32px))",
  margin: "40px auto 72px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  gap: 18,
  alignItems: "start"
} as const;

const heroStyle = {
  padding: 34,
  borderRadius: 28,
  background:
    "radial-gradient(circle at top left, rgba(56,189,248,0.18), transparent 34%), linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 30px 90px rgba(2,6,23,0.42)"
} as const;

const eyebrowStyle = {
  margin: 0,
  color: "#38bdf8",
  textTransform: "uppercase",
  letterSpacing: 1.6,
  fontSize: 12
} as const;

const titleStyle = {
  margin: "12px 0 14px",
  fontSize: 48,
  lineHeight: 1.02,
  letterSpacing: -1.2
} as const;

const bodyStyle = {
  margin: 0,
  maxWidth: 640,
  color: "#94a3b8",
  lineHeight: 1.75,
  fontSize: 16
} as const;

const chipRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 22
} as const;

const chipStyle = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 600
} as const;

const cardStyle = {
  padding: 28,
  borderRadius: 28,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 30px 90px rgba(2,6,23,0.36)",
  display: "grid",
  gap: 18
} as const;

const footerRowStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  justifyContent: "space-between"
} as const;

const footerLinkStyle = {
  color: "#7dd3fc",
  textDecoration: "none",
  fontWeight: 600
} as const;
