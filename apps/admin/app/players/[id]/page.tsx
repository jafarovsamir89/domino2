import type { ReactNode } from "react";
import Link from "next/link";

import { AccessRequired } from "../../../components/access-required";
import { ActionButton } from "../../../components/action-button";
import { getAdminSession, isAdminRole } from "../../../lib/admin-session";
import { fetchAuthedApi } from "../../../lib/server-api";

export const dynamic = "force-dynamic";

type PlayerDetailResponse = {
  id: string;
  userId: string | null;
  displayName: string;
  avatarSeed: string | null;
  isGuest: boolean;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
    image: string | null;
  } | null;
  stats: {
    rating: number;
    points: number;
    wins: number;
    losses: number;
    draws: number;
    matchesPlayed: number;
    currentStreak: number;
    bestStreak: number;
  } | null;
  bans: Array<{
    id: string;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    revokedAt: string | null;
  }>;
  reportsIn: Array<{
    id: string;
    reason: string;
    status: string;
    createdAt: string;
  }>;
  recentMatches: Array<{
    id: string;
    result: string | null;
    points: number;
    roundWins: number;
    ratingDelta: number | null;
    match: {
      id: string;
      createdAt: string;
      mode: string;
      roomId: string | null;
      winnerKey: string | null;
      totalPoints: number;
    };
  }>;
};

export default async function PlayerDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to inspect player profiles, bans and match history."
      />
    );
  }

  const resolvedParams = await params;
  const player = await fetchAuthedApi<PlayerDetailResponse>(`/admin/players/${encodeURIComponent(resolvedParams.id)}`);

  if (!player) {
    return (
      <main style={pageStyle}>
        <p style={eyebrowStyle}>Players</p>
        <h1 style={titleStyle}>Player not found</h1>
        <Link href="/players" style={linkStyle}>
          Back to players
        </Link>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Players</p>
          <h1 style={titleStyle}>{player.displayName}</h1>
          <p style={bodyStyle}>{player.user?.email ?? "No auth user linked"} · {player.user?.role ?? "player"}</p>
        </div>
        <div style={actionRowStyle}>
          <ActionButton
            endpoint={`/admin/players/${player.id}/ban`}
            label="Ban 24h"
            variant="danger"
            body={{
              reason: "Manual moderation",
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }}
          />
          <ActionButton
            endpoint={`/admin/players/${player.id}/ban`}
            label="Ban indefinitely"
            variant="danger"
            body={{ reason: "Manual moderation" }}
          />
        </div>
      </header>

      <section style={gridStyle}>
        <Panel title="Stats">
          <StatRow label="Rating" value={player.stats?.rating ?? 1000} />
          <StatRow label="Points" value={player.stats?.points ?? 0} />
          <StatRow label="Wins" value={player.stats?.wins ?? 0} />
          <StatRow label="Losses" value={player.stats?.losses ?? 0} />
          <StatRow label="Draws" value={player.stats?.draws ?? 0} />
          <StatRow label="Matches" value={player.stats?.matchesPlayed ?? 0} />
          <StatRow label="Streak" value={player.stats?.currentStreak ?? 0} />
          <StatRow label="Best streak" value={player.stats?.bestStreak ?? 0} />
        </Panel>

        <Panel title="Identity">
          <StatRow label="Player ID" value={player.id} />
          <StatRow label="User ID" value={player.userId ?? "not linked"} />
          <StatRow label="Guest" value={player.isGuest ? "yes" : "no"} />
          <StatRow label="Language" value={player.language ?? "n/a"} />
          <StatRow label="Avatar seed" value={player.avatarSeed ?? "n/a"} />
          <StatRow label="Created" value={player.createdAt.slice(0, 10)} />
          <StatRow label="Updated" value={player.updatedAt.slice(0, 10)} />
        </Panel>
      </section>

      <section style={sectionStyle}>
        <Panel title="Active bans">
          {player.bans.length ? player.bans.map((ban) => (
            <div key={ban.id} style={itemCardStyle}>
              <strong>{ban.reason}</strong>
              <div style={mutedStyle}>{ban.expiresAt ? `Expires ${ban.expiresAt.slice(0, 10)}` : "No expiry"}</div>
              <div style={mutedStyle}>{ban.revokedAt ? `Revoked ${ban.revokedAt.slice(0, 10)}` : "Active"}</div>
            </div>
          )) : <p style={mutedStyle}>No bans recorded.</p>}
        </Panel>

        <Panel title="Open reports">
          {player.reportsIn.length ? player.reportsIn.map((report) => (
            <div key={report.id} style={itemCardStyle}>
              <strong>{report.reason}</strong>
              <div style={mutedStyle}>{report.status} · {report.createdAt.slice(0, 10)}</div>
            </div>
          )) : <p style={mutedStyle}>No reports against this player.</p>}
        </Panel>
      </section>

      <Panel title="Recent matches">
        {player.recentMatches.length ? player.recentMatches.map((entry) => (
          <div key={entry.id} style={matchRowStyle}>
            <div>
              <strong>{entry.match.mode}</strong>
              <div style={mutedStyle}>{entry.match.createdAt.slice(0, 10)} · room {entry.match.roomId ?? "local"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>{entry.result ?? "unknown"}</div>
              <div style={mutedStyle}>{entry.points} pts · Δ {entry.ratingDelta ?? 0}</div>
            </div>
          </div>
        )) : <p style={mutedStyle}>No matches yet.</p>}
      </Panel>
    </main>
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

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={statRowStyle}>
      <span style={mutedStyle}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "40px 24px 80px"
} as const;

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "end",
  marginBottom: 24,
  flexWrap: "wrap"
} as const;

const actionRowStyle = {
  display: "flex",
  gap: 10,
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
  margin: "8px 0 8px",
  fontSize: 36
} as const;

const bodyStyle = {
  margin: 0,
  color: "#94a3b8"
} as const;

const linkStyle = {
  color: "#38bdf8",
  textDecoration: "none",
  fontWeight: 700
} as const;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginBottom: 16
} as const;

const sectionStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  marginBottom: 16
} as const;

const panelStyle = {
  padding: 20,
  borderRadius: 20,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const panelTitleStyle = {
  marginTop: 0,
  marginBottom: 16
} as const;

const statRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "8px 0",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;

const mutedStyle = {
  color: "#94a3b8"
} as const;

const itemCardStyle = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(2,6,23,0.8)",
  border: "1px solid rgba(148,163,184,0.12)",
  marginBottom: 10
} as const;

const matchRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "12px 0",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;
