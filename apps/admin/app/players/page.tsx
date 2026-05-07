import type { ReactNode } from "react";
import Link from "next/link";

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
  searchParams?: Promise<{ query?: string; offset?: string }>;
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
  const data = await fetchAuthedApi<PlayerListResponse>(
    `/admin/players?query=${encodeURIComponent(query)}&offset=${encodeURIComponent(offset)}`
  );

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Players</p>
          <h1 style={titleStyle}>Player directory</h1>
          <p style={bodyStyle}>Search players, inspect stats, and jump into moderation without leaving the panel.</p>
        </div>
        <form style={searchFormStyle}>
          <input
            name="query"
            defaultValue={query}
            placeholder="Search by name or email"
            style={searchInputStyle}
          />
          <button style={searchButtonStyle} type="submit">
            Search
          </button>
        </form>
      </header>

      <section style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Identity</Th>
              <Th>Rating</Th>
              <Th>Record</Th>
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
                  </Td>
                  <Td>{player.stats?.rating ?? 1000}</Td>
                  <Td>
                    {player.stats?.wins ?? 0}W / {player.stats?.losses ?? 0}L / {player.stats?.draws ?? 0}D
                    <div style={mutedStyle}>{player.stats?.matchesPlayed ?? 0} matches</div>
                  </Td>
                  <Td>
                    <Badge>{player.activeBans} bans</Badge>
                    <Badge>{player.openReports} open reports</Badge>
                  </Td>
                  <Td>
                    <Link href={`/players/${player.id}`} style={actionLinkStyle}>
                      Open
                    </Link>
                  </Td>
                </tr>
              ))
            ) : (
              <tr>
                <Td colSpan={6}>{data ? "No players found." : "API offline."}</Td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
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
  maxWidth: 720,
  color: "#94a3b8",
  lineHeight: 1.6
} as const;

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
  background: "rgba(15,23,42,0.95)",
  color: "#e2e8f0"
} as const;

const searchButtonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617",
  fontWeight: 700
} as const;

const tableWrapStyle = {
  borderRadius: 24,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(15,23,42,0.88)"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse"
} as const;

const thStyle = {
  padding: "14px 16px",
  textAlign: "left",
  color: "#94a3b8",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1.1,
  background: "rgba(15,23,42,0.98)"
} as const;

const tdStyle = {
  padding: "16px",
  verticalAlign: "top",
  borderTop: "1px solid rgba(148,163,184,0.08)"
} as const;

const mutedStyle = {
  color: "#94a3b8",
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
  background: "rgba(15,23,42,0.88)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#cbd5e1",
  fontSize: 12
} as const;

const actionLinkStyle = {
  color: "#38bdf8",
  textDecoration: "none",
  fontWeight: 700
} as const;
