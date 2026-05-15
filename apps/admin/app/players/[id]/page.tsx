import type { ReactNode } from "react";
import Link from "next/link";

import { AdminFrame } from "../../../components/admin-frame";
import { AccessRequired } from "../../../components/access-required";
import { ActionButton } from "../../../components/action-button";
import { EconomyEditForm } from "../../../components/economy-edit-form";
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
  wallet: {
    id: string;
    balance: number;
    reserved: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
    updatedAt: string;
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
      <AdminFrame active="players" title="Player not found" description="The requested player profile could not be loaded." actions={<Link href="/players" style={linkStyle}>Back to players</Link>}>
        <div style={emptyStyle}>We could not find that player in the current dataset.</div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame
      active="players"
      title={player.displayName}
      description={`${player.user?.email ?? "No auth user linked"} · ${player.user?.role ?? "player"}`}
      actions={
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
      }
    >
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
          <StatRow label="Linked account" value={player.isGuest ? "no" : "yes"} />
          <StatRow label="Language" value={player.language ?? "n/a"} />
          <StatRow label="Avatar seed" value={player.avatarSeed ?? "n/a"} />
          <StatRow label="Created" value={player.createdAt.slice(0, 10)} />
          <StatRow label="Updated" value={player.updatedAt.slice(0, 10)} />
        </Panel>

        <Panel title="Wallet">
          <StatRow label="Balance" value={player.wallet?.balance ?? 0} />
          <StatRow label="Reserved" value={player.wallet?.reserved ?? 0} />
          <StatRow label="Earned" value={player.wallet?.lifetimeEarned ?? 0} />
          <StatRow label="Spent" value={player.wallet?.lifetimeSpent ?? 0} />
          <StatRow label="Updated" value={player.wallet?.updatedAt?.slice(0, 10) ?? "n/a"} />
        </Panel>
      </section>

      <section style={sectionStyle}>
        <Panel title="Active bans">
          {player.bans.length ? player.bans.map((ban) => (
            <div key={ban.id} style={itemCardStyle}>
              <div style={banHeaderStyle}>
                <strong>{ban.reason}</strong>
                {!ban.revokedAt ? (
                  <ActionButton endpoint={`/admin/bans/${ban.id}/revoke`} method="PATCH" label="Revoke" variant="primary" />
                ) : null}
              </div>
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

      <section style={sectionStyle}>
        <Panel title="Coin adjustments">
          <div style={adjustmentStackStyle}>
            <EconomyEditForm
              endpoint={`/admin/economy/wallets/${player.id}/grant`}
              title="Grant coins"
              submitLabel="Grant"
              fields={[
                { name: "amount", label: "Amount", type: "number", min: 1, step: 1, required: true },
                { name: "reason", label: "Reason", type: "text", required: true },
                { name: "note", label: "Note", type: "textarea", rows: 2 }
              ]}
            />
            <EconomyEditForm
              endpoint={`/admin/economy/wallets/${player.id}/spend`}
              title="Spend coins"
              submitLabel="Spend"
              fields={[
                { name: "amount", label: "Amount", type: "number", min: 1, step: 1, required: true },
                { name: "reason", label: "Reason", type: "text", required: true },
                { name: "note", label: "Note", type: "textarea", rows: 2 }
              ]}
            />
          </div>
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
    </AdminFrame>
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

const linkStyle = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 700
} as const;

const emptyStyle = {
  padding: 24,
  borderRadius: 20,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#64748b",
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)"
} as const;

const actionRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
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

const adjustmentStackStyle = {
  display: "grid",
  gap: 14
} as const;

const panelStyle = {
  padding: 20,
  borderRadius: 20,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)"
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
  color: "#64748b"
} as const;

const itemCardStyle = {
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.12)",
  marginBottom: 10
} as const;

const banHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 8,
  flexWrap: "wrap"
} as const;

const matchRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "12px 0",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;
