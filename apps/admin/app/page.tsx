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
        <NavCard href="/audit" title="Audit log" meta="Track moderation actions and admin activity." />
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
  background: "linear-gradient(135deg, #dbeafe, #cffafe)",
  color: "#0f172a"
} satisfies CSSProperties;

const secondaryLinkStyle = {
  ...buttonBaseStyle,
  background: "#ffffff",
  color: "#0f172a"
} satisfies CSSProperties;

const heroGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.6fr)",
  gap: 16
} satisfies CSSProperties;

const heroCardStyle = {
  padding: 28,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.06)"
} satisfies CSSProperties;

const heroEyebrowStyle = {
  margin: 0,
  color: "#0284c7",
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
  color: "#64748b",
  lineHeight: 1.7
} satisfies CSSProperties;

const quickCardStyle = {
  padding: 24,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  display: "grid",
  alignContent: "start",
  gap: 8
} satisfies CSSProperties;

const quickLabelStyle = {
  color: "#64748b",
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
  color: "#0284c7",
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
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  minHeight: 128
} satisfies CSSProperties;

const cardTitleStyle = {
  fontSize: 18
} satisfies CSSProperties;

const metaStyle = {
  display: "block",
  marginTop: 10,
  color: "#64748b",
  lineHeight: 1.5
} satisfies CSSProperties;
