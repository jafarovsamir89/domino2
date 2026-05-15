import Link from "next/link";

import { VerifyEmailPanel } from "../../components/verify-email-panel";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams?: Promise<{ token?: string; callbackURL?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const token = String(resolvedSearchParams?.token || "");

  return (
    <main style={pageStyle}>
      <section style={topCardStyle}>
        <p style={eyebrowStyle}>Account Recovery</p>
        <h1 style={titleStyle}>Verify email</h1>
        <p style={bodyStyle}>
          If you already have a token, this page verifies it automatically. Otherwise you can request a new
          verification email.
        </p>
        <div style={footerStyle}>
          <Link href="/login" style={linkStyle}>
            Back to login
          </Link>
          <Link href="/forgot-password" style={linkStyle}>
            Forgot password
          </Link>
        </div>
      </section>

      <VerifyEmailPanel token={token} />
    </main>
  );
}

const pageStyle = {
  maxWidth: 640,
  margin: "64px auto",
  padding: "0 24px",
  display: "grid",
  gap: 16
} as const;

const topCardStyle = {
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
  margin: "0 0 18px"
} as const;

const footerStyle = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap"
} as const;

const linkStyle = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 600
} as const;
