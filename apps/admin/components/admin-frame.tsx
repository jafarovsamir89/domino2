import Link from "next/link";
import type { ReactNode } from "react";

type AdminFrameProps = {
  active?: "dashboard" | "players" | "reports" | "bans" | "audit" | "home" | "auth";
  actions?: ReactNode;
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  footer?: ReactNode;
  title: string;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
  { href: "/players", label: "Players", key: "players" },
  { href: "/reports", label: "Reports", key: "reports" },
  { href: "/bans", label: "Bans", key: "bans" },
  { href: "/audit", label: "Audit", key: "audit" }
] as const;

export function AdminFrame({
  active,
  actions,
  children,
  description,
  eyebrow = "Domino2 Control Room",
  footer,
  title
}: AdminFrameProps) {
  return (
    <main style={pageStyle}>
      <aside style={sidebarStyle}>
        <div>
          <p style={brandEyebrowStyle}>{eyebrow}</p>
          <div style={brandTitleStyle}>Domino2</div>
          <p style={brandCopyStyle}>
            Player ops, moderation and commerce-ready controls in one clean surface.
          </p>
        </div>

        <nav style={navStyle} aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  ...navLinkStyle,
                  ...(isActive ? navLinkActiveStyle : null)
                }}
              >
                <span>{item.label}</span>
                <span style={navLinkDotStyle} />
              </Link>
            );
          })}
        </nav>

        <div style={sidebarNoteStyle}>
          <div style={sidebarNoteLabelStyle}>Live stack</div>
          <div style={sidebarNoteValueStyle}>NestJS + PostgreSQL + Better Auth</div>
          <div style={sidebarNoteMetaStyle}>API on `3000`, admin on `3001`</div>
        </div>
      </aside>

      <section style={contentStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>{eyebrow}</p>
            <h1 style={titleStyle}>{title}</h1>
            {description ? <p style={descriptionStyle}>{description}</p> : null}
          </div>
          {actions ? <div style={actionsStyle}>{actions}</div> : null}
        </header>

        {children}

        {footer ? <footer style={footerStyle}>{footer}</footer> : null}
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: 1440,
  margin: "0 auto",
  padding: "28px 20px 56px",
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  gap: 22,
  alignItems: "start"
} as const;

const sidebarStyle = {
  position: "sticky",
  top: 20,
  display: "grid",
  gap: 20,
  padding: 22,
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(8,15,31,0.98), rgba(10,15,26,0.94))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 24px 80px rgba(2,6,23,0.4)"
} as const;

const brandEyebrowStyle = {
  margin: 0,
  color: "#38bdf8",
  textTransform: "uppercase",
  letterSpacing: 1.6,
  fontSize: 11
} as const;

const brandTitleStyle = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: -0.6
} as const;

const brandCopyStyle = {
  margin: "10px 0 0",
  color: "#94a3b8",
  lineHeight: 1.7,
  fontSize: 14
} as const;

const navStyle = {
  display: "grid",
  gap: 8
} as const;

const navLinkStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  borderRadius: 16,
  textDecoration: "none",
  color: "#cbd5e1",
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(148,163,184,0.1)",
  fontWeight: 600
} as const;

const navLinkActiveStyle = {
  background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(15,118,110,0.16))",
  color: "#f8fafc",
  borderColor: "rgba(56,189,248,0.28)"
} as const;

const navLinkDotStyle = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "currentColor",
  opacity: 0.8
} as const;

const sidebarNoteStyle = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(2,6,23,0.72)",
  border: "1px solid rgba(148,163,184,0.12)"
} as const;

const sidebarNoteLabelStyle = {
  color: "#94a3b8",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1.1,
  marginBottom: 6
} as const;

const sidebarNoteValueStyle = {
  color: "#e2e8f0",
  fontWeight: 700,
  lineHeight: 1.5
} as const;

const sidebarNoteMetaStyle = {
  marginTop: 6,
  color: "#7dd3fc",
  fontSize: 13
} as const;

const contentStyle = {
  display: "grid",
  gap: 18
} as const;

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "end",
  padding: "8px 0 0",
  flexWrap: "wrap"
} as const;

const eyebrowStyle = {
  margin: 0,
  color: "#38bdf8",
  textTransform: "uppercase",
  letterSpacing: 1.6,
  fontSize: 12
} as const;

const titleStyle = {
  margin: "8px 0 10px",
  fontSize: 40,
  lineHeight: 1.02,
  letterSpacing: -1
} as const;

const descriptionStyle = {
  margin: 0,
  maxWidth: 820,
  color: "#94a3b8",
  lineHeight: 1.7
} as const;

const actionsStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center"
} as const;

const footerStyle = {
  color: "#94a3b8",
  fontSize: 13
} as const;
