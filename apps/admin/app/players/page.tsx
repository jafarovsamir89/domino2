import type { ReactNode } from "react";
import { ActionButton } from "../../components/action-button";
import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { fetchAuthedApi } from "../../lib/server-api";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";

export const dynamic = "force-dynamic";

type PlayerListResponse = {
  items: Array<{
    id: string;
    userId: string | null;
    displayName: string;
    isGuest: boolean;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string;
      role: string;
      emailVerified: boolean;
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
      balance: number;
      reserved: number;
      lifetimeEarned: number;
      lifetimeSpent: number;
    } | null;
    activeBans: number;
    openReports: number;
    matchCount: number;
  }>;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export default async function PlayersPage({
  searchParams
}: {
  searchParams?: Promise<{ query?: string; offset?: string; scope?: string; sort?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to inspect players and moderation flags."
      />
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = String(resolvedSearchParams.query || "").trim();
  const offset = String(resolvedSearchParams.offset || "0");
  const scope = String(resolvedSearchParams.scope || "all");
  const sort = String(resolvedSearchParams.sort || "updated");
  const offsetValue = Math.max(0, Number(offset) || 0);
  const data = await fetchAuthedApi<PlayerListResponse>(
    `/admin/players?query=${encodeURIComponent(query)}&offset=${encodeURIComponent(offset)}&scope=${encodeURIComponent(scope)}&sort=${encodeURIComponent(sort)}`
  );
  const pageSize = data?.pagination.limit ?? 20;
  const hasMore = Boolean(data?.pagination.hasMore);
  const prevOffset = Math.max(0, offsetValue - pageSize);
  const nextOffset = offsetValue + pageSize;

  return (
    <AdminFrame
      active="players"
      title="Player directory"
      description="Search players, inspect stats and jump into moderation without leaving the panel."
      actions={
        <form style={searchFormStyle}>
          <input name="query" defaultValue={query} placeholder="Search by name or email" style={searchInputStyle} />
          <select name="scope" defaultValue={scope} style={selectStyle}>
            <option value="all">All players</option>
            <option value="linked">Linked accounts</option>
            <option value="guests">Unlinked profiles</option>
            <option value="flagged">Flagged</option>
          </select>
          <select name="sort" defaultValue={sort} style={selectStyle}>
            <option value="updated">Recently updated</option>
            <option value="rating">Highest rating</option>
            <option value="matches">Most matches</option>
            <option value="flags">Most flags</option>
          </select>
          <button style={searchButtonStyle} type="submit">Apply</button>
        </form>
      }
    >
      <section style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Identity</Th>
              <Th>Rating</Th>
              <Th>Record</Th>
              <Th>Wallet</Th>
              <Th>Flags</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length ? (
              data.items.map((player) => (
                <tr key={player.id}>
                  <Td>
                    <strong>{player.displayName}</strong>
                    <div style={mutedStyle}>{player.createdAt.slice(0, 10)}</div>
                  </Td>
                  <Td>
                    <div style={mutedStyle}>{player.user?.email ?? "No auth user"}</div>
                    <div style={mutedStyle}>{player.user?.role ?? "player"}</div>
                    <div style={mutedStyle}>{player.isGuest ? "Unlinked profile" : "Linked to auth"}</div>
                  </Td>
                  <Td>{player.stats?.rating ?? 1000}</Td>
                  <Td>
                    {player.stats?.wins ?? 0}W / {player.stats?.losses ?? 0}L / {player.stats?.draws ?? 0}D
                    <div style={mutedStyle}>{player.stats?.matchesPlayed ?? 0} matches</div>
                  </Td>
                  <Td>
                    <strong>{player.wallet?.balance ?? 0}</strong>
                    <div style={mutedStyle}>{player.wallet?.reserved ?? 0} reserved</div>
                    <div style={mutedStyle}>{player.wallet?.lifetimeEarned ?? 0} earned / {player.wallet?.lifetimeSpent ?? 0} spent</div>
                  </Td>
                  <Td>
                    <Badge>{player.activeBans} bans</Badge>
                    <Badge>{player.openReports} open reports</Badge>
                  </Td>
                  <Td>
                    <Link href={`/players/${player.id}`} style={actionLinkStyle}>
                      Open
                    </Link>
                    {!player.isGuest ? (
                      <div style={actionStackStyle}>
                        <ActionButton
                          endpoint={`/admin/players/${player.id}/ban`}
                          label="Ban 24h"
                          variant="danger"
                          body={{
                            reason: "Manual moderation",
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                          }}
                        />
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))
            ) : (
              <tr>
                  <Td colSpan={7}>{data ? "No players found." : "API offline."}</Td>
                </tr>
              )}
          </tbody>
        </table>
        <div style={paginationStyle}>
          <Link
            href={buildPlayersHref({ query, scope, sort, offset: prevOffset })}
            style={{ ...pagerButtonStyle, ...(offsetValue <= 0 ? disabledPagerStyle : null) }}
            aria-disabled={offsetValue <= 0}
            tabIndex={offsetValue <= 0 ? -1 : 0}
          >
            Previous
          </Link>
          <div style={paginationMetaStyle}>
            <span>Showing {data?.items.length || 0} players</span>
            <span style={paginationMetaDimStyle}>offset {offsetValue}</span>
          </div>
          <Link
            href={buildPlayersHref({ query, scope, sort, offset: nextOffset })}
            style={{ ...pagerButtonStyle, ...(hasMore ? null : disabledPagerStyle) }}
            aria-disabled={!hasMore}
            tabIndex={!hasMore ? -1 : 0}
          >
            Next
          </Link>
        </div>
      </section>
    </AdminFrame>
  );
}

function buildPlayersHref({ query, scope, sort, offset }: { query: string; scope: string; sort: string; offset: number }) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  params.set("scope", scope);
  params.set("sort", sort);
  params.set("offset", String(Math.max(0, offset)));
  return `/players?${params.toString()}`;
}

function Th({ children }: { children: ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, colSpan }: { children: ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={tdStyle}>{children}</td>;
}

function Badge({ children }: { children: ReactNode }) {
  return <span style={badgeStyle}>{children}</span>;
}

const searchFormStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
} as const;

const searchInputStyle = {
  minWidth: 260,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "#ffffff",
  color: "#0f172a"
} as const;

const selectStyle = {
  minWidth: 160,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.2)",
  background: "#ffffff",
  color: "#0f172a"
} as const;

const searchButtonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(135deg, #dbeafe, #cffafe)",
  color: "#0f172a",
  fontWeight: 700
} as const;

const tableWrapStyle = {
  borderRadius: 24,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.16)",
  background: "#ffffff"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse"
} as const;

const thStyle = {
  padding: "14px 16px",
  textAlign: "left",
  color: "#64748b",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1.1,
  background: "#f8fafc"
} as const;

const tdStyle = {
  padding: "16px",
  verticalAlign: "top",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;

const mutedStyle = {
  color: "#64748b",
  marginTop: 4,
  fontSize: 13
} as const;

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginRight: 8,
  marginBottom: 6,
  padding: "6px 10px",
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#334155",
  fontSize: 12
} as const;

const actionLinkStyle = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 700
} as const;

const actionStackStyle = {
  marginTop: 10,
  display: "grid",
  gap: 8
} as const;

const paginationStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 16,
  borderTop: "1px solid rgba(148,163,184,0.12)",
  background: "#f8fafc",
  flexWrap: "wrap"
} as const;

const pagerButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 104,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "#ffffff",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 700
} as const;

const disabledPagerStyle = {
  opacity: 0.45,
  pointerEvents: "none"
} as const;

const paginationMetaStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  color: "#475569",
  fontSize: 13,
  flexWrap: "wrap"
} as const;

const paginationMetaDimStyle = {
  color: "#64748b"
} as const;
