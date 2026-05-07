import type { CSSProperties } from "react";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "48px 24px 80px" }}>
      <section style={{ marginBottom: 32 }}>
        <p style={{ textTransform: "uppercase", letterSpacing: 1.6, color: "#38bdf8", fontSize: 12 }}>
          Domino2 Operations
        </p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 40, lineHeight: 1.05 }}>
          Admin panel foundation for players, moderation and future payments.
        </h1>
        <p style={{ maxWidth: 720, color: "#94a3b8", lineHeight: 1.6 }}>
          This panel is being built around the new NestJS + PostgreSQL platform layer. The current goal is to make
          operational data visible before we tighten admin auth and moderation workflows.
        </p>
      </section>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16
        }}
      >
        <a href="/dashboard" style={cardStyle}>
          <strong>Dashboard</strong>
          <span style={metaStyle}>Live metrics from the new API foundation.</span>
        </a>
        <a href="/players" style={cardStyle}>
          <strong>Players</strong>
          <span style={metaStyle}>Identity, stats and auth-link inspection.</span>
        </a>
        <a href="/reports" style={cardStyle}>
          <strong>Reports</strong>
          <span style={metaStyle}>Open abuse reports and moderation workflow.</span>
        </a>
        <a href="/bans" style={cardStyle}>
          <strong>Bans</strong>
          <span style={metaStyle}>Active bans and revocation actions.</span>
        </a>
        <a href="/login" style={cardStyle}>
          <strong>Login</strong>
          <span style={metaStyle}>Better Auth entry point for admins and moderators.</span>
        </a>
      </section>
    </main>
  );
}

const cardStyle = {
  display: "block",
  padding: 20,
  borderRadius: 20,
  textDecoration: "none",
  color: "inherit",
  background: "linear-gradient(135deg, rgba(30,41,59,0.95), rgba(15,23,42,0.9))",
  border: "1px solid rgba(148,163,184,0.16)",
  minHeight: 128
} satisfies CSSProperties;

const metaStyle = {
  display: "block",
  marginTop: 10,
  color: "#94a3b8",
  lineHeight: 1.5
} satisfies CSSProperties;
