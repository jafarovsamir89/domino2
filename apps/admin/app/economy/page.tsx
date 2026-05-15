import type { ReactNode } from "react";
import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { EconomyEditForm } from "../../components/economy-edit-form";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchAuthedApi } from "../../lib/server-api";

export const dynamic = "force-dynamic";

type EconomyOverviewResponse = {
  phase: string;
  metrics: {
    wallets: number;
    coinsInCirculation: number;
    coinsReserved: number;
    ledgerEntries: number;
    activeStakeTables: number;
  };
  config: {
    matchCommissionBps: number;
  };
};

type EconomyWalletListResponse = {
  items: Array<{
    id: string;
    playerId: string;
    displayName: string;
    email: string | null;
    isGuest: boolean;
    balance: number;
    reserved: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
    rating: number;
    updatedAt: string;
  }>;
};

type EconomyStakesResponse = {
  reservedCount: number;
  stakes: Array<{
    id: string;
    key: string;
    title: string;
    stakeAmount: number;
    commissionBps: number;
    isFree: boolean;
    isActive: boolean;
    sortOrder: number;
    bankExample: number;
    commissionExample: number;
    payoutExample: number;
  }>;
  reservations: Array<{
    id: string;
    roomId: string;
    matchId: string | null;
    playerId: string;
    stakeAmount: number;
    commissionBps: number;
    status: string;
    reservedAt: string;
    player: {
      displayName: string;
      user: {
        email: string;
      } | null;
    };
    stakeTable: {
      id: string;
      key: string;
      title: string;
    };
  }>;
};

export default async function EconomyPage() {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to manage coins, stakes and player balances."
      />
    );
  }

  const [overview, wallets, stakes] = await Promise.all([
    fetchAuthedApi<EconomyOverviewResponse>("/admin/economy/overview"),
    fetchAuthedApi<EconomyWalletListResponse>("/admin/economy/wallets?limit=12&offset=0"),
    fetchAuthedApi<EconomyStakesResponse>("/admin/economy/stakes")
  ]);

  return (
    <AdminFrame
      active="economy"
      title="Economy control"
      description="Coins, stakes and player balances live here. The rule is simple: coins support progression, never gameplay strength."
      actions={
        <>
          <Link href="/players" style={linkButtonStyle}>Players</Link>
          <Link href="/dashboard" style={linkButtonStyle}>Dashboard</Link>
        </>
      }
    >
      <section style={metricGridStyle}>
        <Metric label="Wallets" value={overview?.metrics.wallets ?? "API offline"} />
        <Metric label="Coins live" value={overview?.metrics.coinsInCirculation ?? "API offline"} />
        <Metric label="Coins reserved" value={overview?.metrics.coinsReserved ?? "API offline"} />
        <Metric label="Ledger rows" value={overview?.metrics.ledgerEntries ?? "API offline"} />
        <Metric label="Active stakes" value={overview?.metrics.activeStakeTables ?? "API offline"} />
      </section>

      <section style={sectionGridStyle}>
        <Panel title="Economy config" subtitle="Global coin sink defaults">
          {overview?.config ? (
            <EconomyEditForm
              endpoint="/admin/economy/config"
              method="PATCH"
              title="Update config"
              submitLabel="Save config"
              note="Use this to tune the match commission without touching code."
              fields={[
                { name: "matchCommissionBps", label: "Match commission bps", type: "number", min: 0, step: 1, help: "Applied to stake matches." }
              ]}
              initialValues={overview.config}
            />
          ) : (
            <div style={emptyStyle}>Economy config is not available yet.</div>
          )}
        </Panel>

        <Panel title="Top wallets" subtitle="Quick balance snapshot">
          {wallets?.items.length ? (
            <div style={listStyle}>
              {wallets.items.map((wallet) => (
                <article key={wallet.id} style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <strong>{wallet.displayName}</strong>
                    <span style={badgeStyle}>{wallet.balance} coins</span>
                  </div>
                  <div style={metaStyle}>
                    <span>{wallet.email ?? "No auth user"}</span>
                    <span>{wallet.reserved} reserved</span>
                    <span>{wallet.isGuest ? "unlinked" : "linked"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No wallets yet.</div>
          )}
        </Panel>
      </section>

      <section style={sectionGridStyle}>
        <Panel title="Stake tables" subtitle="Entry fees and commission">
          <div style={stackStyle}>
            <EconomyEditForm
              endpoint="/admin/economy/stakes"
              title="Create or update stake"
              submitLabel="Save stake"
              method="POST"
              note="Use a unique key like stake_50 or free."
              fields={[
                { name: "key", label: "Key", type: "text", required: true },
                { name: "title", label: "Title", type: "text", required: true },
                { name: "stakeAmount", label: "Stake amount", type: "number", min: 0, step: 1 },
                { name: "commissionBps", label: "Commission bps", type: "number", min: 0, step: 1 },
                { name: "sortOrder", label: "Sort order", type: "number", min: 0, step: 1 },
                { name: "isFree", label: "Free table", type: "checkbox", help: "Leave this on for the zero-balance fallback table." },
                { name: "isActive", label: "Active", type: "checkbox" }
              ]}
            />

            {stakes?.stakes.length ? stakes.stakes.map((stake) => (
              <EconomyEditForm
                key={stake.id}
                endpoint={`/admin/economy/stakes/${stake.id}`}
                method="PATCH"
                title={stake.title}
                submitLabel="Save stake"
                compact
                fields={[
                  { name: "key", label: "Key", type: "text", required: true },
                  { name: "title", label: "Title", type: "text", required: true },
                  { name: "stakeAmount", label: "Stake amount", type: "number", min: 0, step: 1 },
                  { name: "commissionBps", label: "Commission bps", type: "number", min: 0, step: 1 },
                  { name: "sortOrder", label: "Sort order", type: "number", min: 0, step: 1 },
                  { name: "isFree", label: "Free table", type: "checkbox" },
                  { name: "isActive", label: "Active", type: "checkbox" }
                ]}
                initialValues={stake}
              />
            )) : <div style={emptyStyle}>No stake tables found.</div>}
          </div>
        </Panel>
      </section>

      <section style={sectionGridStyle}>
        <Panel title="Recent reservations" subtitle="Stake flow audit">
          {stakes?.reservations.length ? (
            <div style={listStyle}>
              {stakes.reservations.map((reservation) => (
                <article key={reservation.id} style={cardStyle}>
                  <div style={cardHeaderStyle}>
                    <strong>{reservation.player.displayName}</strong>
                    <span style={badgeStyle}>{reservation.status}</span>
                  </div>
                  <div style={metaStyle}>
                    <span>{reservation.stakeTable.title}</span>
                    <span>{reservation.stakeAmount} coins</span>
                    <span>{reservation.player.user?.email ?? "No auth user"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div style={emptyStyle}>No stake reservations yet.</div>
          )}
        </Panel>
      </section>
    </AdminFrame>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </article>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>{title}</h2>
          {subtitle ? <div style={panelSubtitleStyle}>{subtitle}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

const linkButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 14,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 700
} as const;

const metricGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 14
} as const;

const metricStyle = {
  padding: 18,
  borderRadius: 18,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const metricLabelStyle = {
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 1.1,
  fontSize: 12
} as const;

const metricValueStyle = {
  marginTop: 8,
  fontSize: 30,
  fontWeight: 800
} as const;

const sectionGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))"
} as const;

const panelStyle = {
  padding: 20,
  borderRadius: 22,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "start",
  marginBottom: 16
} as const;

const panelTitleStyle = {
  margin: 0,
  fontSize: 24
} as const;

const panelSubtitleStyle = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.6
} as const;

const stackStyle = {
  display: "grid",
  gap: 14
} as const;

const listStyle = {
  display: "grid",
  gap: 10
} as const;

const cardStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.12)"
} as const;

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 8,
  flexWrap: "wrap"
} as const;

const metaStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 13
} as const;

const badgeStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  border: "1px solid rgba(56,189,248,0.2)",
  fontSize: 12,
  fontWeight: 700
} as const;

const emptyStyle = {
  padding: 16,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.12)",
  color: "#64748b"
} as const;
