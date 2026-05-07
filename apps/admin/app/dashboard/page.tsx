import type { ReactNode } from "react";
import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { DashboardSessionCard } from "../../components/dashboard-session-card";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchApi, getApiBaseUrl } from "../../lib/api";

type OverviewResponse = {
  phase: string;
  metrics: {
    players: number;
    users: number;
    matches: number;
    reportsOpen: number;
    bansActive: number;
  };
};

type AuthStatusResponse = {
  provider: string;
  phase: string;
  googleEnabled: boolean;
  emailRecoveryEnabled?: boolean;
  passwordResetEnabled?: boolean;
  trustedOrigins: string[];
};

export default async function DashboardPage() {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to open the dashboard, players, reports and bans pages."
      />
    );
  }

  const [overview, authStatus] = await Promise.all([
    fetchApi<OverviewResponse>("/admin/overview"),
    fetchApi<AuthStatusResponse>("/platform/status")
  ]);

  return (
    <AdminFrame
      active="dashboard"
      title="Platform dashboard"
      description="This page is now the operational center for the game. It surfaces live metrics, auth status and deployment notes in one readable flow."
      actions={
        <>
          <Link href="/players" style={linkButtonStyle}>Players</Link>
          <Link href="/reports" style={linkButtonStyle}>Reports</Link>
        </>
      }
      footer={<span>Current target VM: `instance-20260418-225724` on GCloud.</span>}
    >
      <section style={metricGridStyle}>
        <MetricCard label="Players" value={overview?.metrics.players ?? "API offline"} />
        <MetricCard label="Auth Users" value={overview?.metrics.users ?? "API offline"} />
        <MetricCard label="Matches" value={overview?.metrics.matches ?? "API offline"} />
        <MetricCard label="Open Reports" value={overview?.metrics.reportsOpen ?? "API offline"} />
        <MetricCard label="Active Bans" value={overview?.metrics.bansActive ?? "API offline"} />
      </section>

      <section style={layoutStyle}>
        <Panel title="API Status">
          <Row label="API URL" value={getApiBaseUrl()} />
          <Row label="Auth Provider" value={authStatus?.provider ?? "unreachable"} />
          <Row label="Auth Phase" value={authStatus?.phase ?? "unreachable"} />
          <Row label="Google Login" value={authStatus ? (authStatus.googleEnabled ? "enabled" : "disabled") : "unknown"} />
          <Row label="Email Recovery" value={authStatus ? (authStatus.emailRecoveryEnabled ? "enabled" : "disabled") : "unknown"} />
          <Row label="Password Reset" value={authStatus ? (authStatus.passwordResetEnabled ? "enabled" : "disabled") : "unknown"} />
        </Panel>

        <div style={{ display: "grid", gap: 16 }}>
          <DashboardSessionCard />
          <Panel title="Deployment Notes">
            <p style={copyStyle}>What is already live: PostgreSQL, Nginx, API on `3000`, admin on `3001`.</p>
            <p style={copyStyle}>What still stays separate for now: the legacy game server under PM2 on port `2567`.</p>
          </Panel>
        </div>
      </section>
    </AdminFrame>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <h2 style={panelTitleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>{value}</span>
    </div>
  );
}

const linkButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 14,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#e2e8f0",
  textDecoration: "none",
  fontWeight: 700
} as const;

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 16
} as const;

const layoutStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
  gap: 16
} as const;

const metricCardStyle = {
  padding: 20,
  borderRadius: 22,
  background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(8,15,31,0.92))",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 16px 36px rgba(2,6,23,0.18)"
} as const;

const metricLabelStyle = {
  color: "#94a3b8",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 1.1,
  marginBottom: 10
} as const;

const metricValueStyle = {
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1.1
} as const;

const panelStyle = {
  padding: 22,
  borderRadius: 24,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const panelTitleStyle = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 20
} as const;

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 0",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;

const rowLabelStyle = {
  color: "#94a3b8"
} as const;

const rowValueStyle = {
  color: "#e2e8f0",
  textAlign: "right"
} as const;

const copyStyle = {
  margin: "0 0 10px",
  color: "#cbd5e1",
  lineHeight: 1.6
} as const;
