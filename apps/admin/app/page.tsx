import type { CSSProperties } from "react";
import Link from "next/link";

import { AdminFrame } from "../components/admin-frame";

export default function HomePage() {
  return (
    <AdminFrame
      active="home"
      title="Admin panel foundation"
      description="Operational control for players, moderation and the future commerce layer. The surface is now tuned to feel like one product instead of a stack of temporary screens."
      actions={
        <>
          <Link href="/dashboard" style={primaryLinkStyle}>Open dashboard</Link>
          <Link href="/login" style={secondaryLinkStyle}>Admin login</Link>
        </>
      }
    >
      <section style={heroGridStyle}>
        <article style={heroCardStyle}>
          <p style={heroEyebrowStyle}>Live stack</p>
          <h2 style={heroTitleStyle}>NestJS, PostgreSQL and Better Auth are already wired in.</h2>
          <p style={heroBodyStyle}>
            The admin layer is ready for metrics, player support, moderation and billing scaffolding.
            We are now polishing the surfaces so the workflow feels deliberate instead of stitched together.
          </p>
        </article>

        <article style={quickCardStyle}>
          <div style={quickLabelStyle}>Current status</div>
          <div style={quickValueStyle}>Platform is online</div>
          <div style={quickMetaStyle}>API, admin and legacy game server are running side by side.</div>
        </article>
      </section>

      <section style={gridStyle}>
        <NavCard href="/dashboard" title="Dashboard" meta="Live metrics from the new API foundation." />
        <NavCard href="/players" title="Players" meta="Identity, stats and auth-link inspection." />
        <NavCard href="/reports" title="Reports" meta="Open abuse reports and moderation workflow." />
        <NavCard href="/bans" title="Bans" meta="Active bans and revocation actions." />
        <NavCard href="/login" title="Login" meta="Better Auth entry point for admins and moderators." />
      </section>
    </AdminFrame>
  );
}

function NavCard({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <Link href={href} style={cardStyle}>
      <strong style={cardTitleStyle}>{title}</strong>
      <span style={metaStyle}>{meta}</span>
    </Link>
  );
}

const buttonBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 14,
  textDecoration: "none",
  fontWeight: 700,
  border: "1px solid rgba(148,163,184,0.16)"
} satisfies CSSProperties;

const primaryLinkStyle = {
  ...buttonBaseStyle,
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617"
} satisfies CSSProperties;

const secondaryLinkStyle = {
  ...buttonBaseStyle,
  background: "rgba(15,23,42,0.9)",
  color: "#e2e8f0"
} satisfies CSSProperties;

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.6fr)",
  gap: 16
} satisfies CSSProperties;

const heroCardStyle = {
  padding: 28,
  borderRadius: 28,
  background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(8,15,31,0.95))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 24px 80px rgba(2,6,23,0.35)"
} satisfies CSSProperties;

const heroEyebrowStyle = {
  margin: 0,
  color: "#38bdf8",
  textTransform: "uppercase",
  letterSpacing: 1.6,
  fontSize: 12
} satisfies CSSProperties;

const heroTitleStyle = {
  margin: "10px 0 12px",
  fontSize: 32,
  lineHeight: 1.05
} satisfies CSSProperties;

const heroBodyStyle = {
  margin: 0,
  maxWidth: 680,
  color: "#94a3b8",
  lineHeight: 1.7
} satisfies CSSProperties;

const quickCardStyle = {
  padding: 24,
  borderRadius: 28,
  background: "rgba(15,23,42,0.92)",
  border: "1px solid rgba(148,163,184,0.16)",
  display: "grid",
  alignContent: "start",
  gap: 8
} satisfies CSSProperties;

const quickLabelStyle = {
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: 1.1,
  fontSize: 11
} satisfies CSSProperties;

const quickValueStyle = {
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1.1
} satisfies CSSProperties;

const quickMetaStyle = {
  color: "#7dd3fc",
  lineHeight: 1.6
} satisfies CSSProperties;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16
} satisfies CSSProperties;

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

const cardTitleStyle = {
  fontSize: 18
} satisfies CSSProperties;

const metaStyle = {
  display: "block",
  marginTop: 10,
  color: "#94a3b8",
  lineHeight: 1.5
} satisfies CSSProperties;
