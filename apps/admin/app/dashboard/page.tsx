import type { ReactNode } from "react";
import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { DashboardSessionCard } from "../../components/dashboard-session-card";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchApi, getApiBaseUrl } from "../../lib/api";
import { fetchGameServerApi, getGameServerBaseUrl } from "../../lib/game-server";
import { fetchAuthedApi } from "../../lib/server-api";

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

type RealtimeSummaryResponse = {
  counts: {
    total: number;
    authenticatedConnected: number;
    authenticatedPlaying: number;
    rooms: number;
  };
  players: Array<{
    sessionId: string;
    userId: string;
    playerId: string;
    displayName: string;
    provider: string;
    isConnected: boolean;
    isPlaying: boolean;
    roomId: string | null;
    roomCode: string | null;
    role: string;
    joinedAt: string | null;
    updatedAt: string | null;
  }>;
  rooms: Array<{
    roomId: string;
    roomCode: string | null;
    gameActive: boolean;
    totalPlayers: number;
    connectedPlayers: number;
    authenticatedPlayers: number;
    players: Array<{
      sessionId: string;
      userId: string;
      playerId: string;
      displayName: string;
      provider: string;
      isConnected: boolean;
      isPlaying: boolean;
      roomCode: string | null;
      role: string;
      joinedAt: string | null;
    }>;
  }>;
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

  const [overview, authStatus, realtime] = await Promise.all([
    fetchAuthedApi<OverviewResponse>("/admin/overview"),
    fetchApi<AuthStatusResponse>("/platform/status"),
    fetchGameServerApi<RealtimeSummaryResponse>("/api/realtime/summary")
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
        <MetricCard label="Online Auth" value={realtime?.counts.authenticatedConnected ?? "Game offline"} />
        <MetricCard label="Playing Now" value={realtime?.counts.authenticatedPlaying ?? "Game offline"} />
      </section>

      <section style={layoutStyle}>
        <Panel title="API Status">
          <Row label="API URL" value={getApiBaseUrl()} />
          <Row label="Game Server" value={getGameServerBaseUrl()} />
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

      <section style={liveSectionStyle}>
        <Panel title="Realtime players">
          {realtime?.players.length ? (
            <div style={liveListStyle}>
              {realtime.players.map((player) => (
                <article key={player.sessionId} style={liveCardStyle}>
                  <div style={liveCardHeaderStyle}>
                    <strong>{player.displayName}</strong>
                    <span style={liveBadgeStyle}>{player.isPlaying ? "Playing" : "Connected"}</span>
                  </div>
                  <div style={liveMetaStyle}>
                    <span>{player.roomCode ?? player.roomId ?? "no room"}</span>
                    <span>{player.provider}</span>
                    <span>{player.role}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p style={copyStyle}>{realtime ? "No authenticated players are online right now." : "Realtime game server offline."}</p>
          )}
        </Panel>

        <Panel title="Realtime rooms">
          {realtime?.rooms.length ? (
            <div style={liveListStyle}>
              {realtime.rooms.map((room) => (
                <article key={room.roomId} style={liveCardStyle}>
                  <div style={liveCardHeaderStyle}>
                    <strong>{room.roomCode ?? room.roomId}</strong>
                    <span style={liveBadgeStyle}>{room.gameActive ? "Active match" : "Lobby"}</span>
                  </div>
                  <div style={liveMetaStyle}>
                    <span>{room.connectedPlayers} connected</span>
                    <span>{room.authenticatedPlayers} auth</span>
                    <span>{room.totalPlayers} total</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p style={copyStyle}>{realtime ? "No rooms are active right now." : "Realtime game server offline."}</p>
          )}
        </Panel>
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

const liveSectionStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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

const liveListStyle = {
  display: "grid",
  gap: 10
} as const;

const liveCardStyle = {
  padding: 14,
  borderRadius: 16,
  background: "rgba(2,6,23,0.82)",
  border: "1px solid rgba(148,163,184,0.12)"
} as const;

const liveCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 8
} as const;

const liveBadgeStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(56,189,248,0.16)",
  border: "1px solid rgba(56,189,248,0.24)",
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 700
} as const;

const liveMetaStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  color: "#94a3b8",
  fontSize: 13
} as const;
