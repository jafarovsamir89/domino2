import type { ReactNode } from "react";

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
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 24px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ textTransform: "uppercase", letterSpacing: 1.6, color: "#38bdf8", fontSize: 12 }}>
          Domino2 Control Room
        </p>
        <h1 style={{ margin: "8px 0 10px", fontSize: 36 }}>Platform dashboard</h1>
        <p style={{ color: "#94a3b8", lineHeight: 1.6, maxWidth: 780 }}>
          This page is already wired to the new NestJS API. Once PostgreSQL is provisioned on the target GCloud VM,
          these metrics become the backbone for moderation, player support and commerce ops.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 28
        }}
      >
        <MetricCard label="Players" value={overview?.metrics.players ?? "API offline"} />
        <MetricCard label="Auth Users" value={overview?.metrics.users ?? "API offline"} />
        <MetricCard label="Matches" value={overview?.metrics.matches ?? "API offline"} />
        <MetricCard label="Open Reports" value={overview?.metrics.reportsOpen ?? "API offline"} />
        <MetricCard label="Active Bans" value={overview?.metrics.bansActive ?? "API offline"} />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
          gap: 16
        }}
      >
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
            <p style={copyStyle}>Current target VM: `instance-20260418-225724` on GCloud.</p>
            <p style={copyStyle}>What is already live: PostgreSQL, Nginx, API on `3000`, admin on `3001`.</p>
            <p style={copyStyle}>What still stays separate for now: the legacy game server under PM2 on port `2567`.</p>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article
      style={{
        padding: 20,
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(30,41,59,0.96), rgba(15,23,42,0.92))",
        border: "1px solid rgba(148,163,184,0.16)"
      }}
    >
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        padding: 20,
        borderRadius: 20,
        background: "rgba(15,23,42,0.9)",
        border: "1px solid rgba(148,163,184,0.16)"
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderTop: "1px solid rgba(148,163,184,0.08)" }}>
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const copyStyle = {
  margin: "0 0 10px",
  color: "#cbd5e1",
  lineHeight: 1.6
};
