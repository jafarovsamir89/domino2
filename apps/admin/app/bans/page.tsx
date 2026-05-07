import Link from "next/link";

import { AccessRequired } from "../../components/access-required";
import { ActionButton } from "../../components/action-button";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchAuthedApi } from "../../lib/server-api";

export const dynamic = "force-dynamic";

type BansResponse = {
  items: Array<{
    id: string;
    reason: string;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    player: {
      id: string;
      displayName: string;
      user: {
        email: string;
      } | null;
    };
  }>;
};

export default async function BansPage() {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to view active bans and moderation history."
      />
    );
  }

  const data = await fetchAuthedApi<BansResponse>("/admin/bans");

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moderation</p>
          <h1 style={titleStyle}>Bans</h1>
          <p style={bodyStyle}>Active bans and historical moderation actions live here.</p>
        </div>
        <Link href="/reports" style={linkStyle}>
          Reports
        </Link>
      </header>

      <section style={stackStyle}>
        {data?.items.length ? data.items.map((ban) => {
          const isActive = !ban.revokedAt;
          return (
            <article key={ban.id} style={cardStyle}>
              <div style={cardHeaderStyle}>
                <div>
                  <strong>{ban.player.displayName}</strong>
                  <div style={mutedStyle}>{ban.player.user?.email ?? "No auth user"} · {ban.createdAt.slice(0, 10)}</div>
                </div>
                <div style={buttonRowStyle}>
                  {isActive ? (
                    <ActionButton endpoint={`/admin/bans/${ban.id}/revoke`} method="PATCH" label="Revoke" variant="primary" />
                  ) : null}
                </div>
              </div>

              <div style={twoColumnStyle}>
                <Detail label="Reason" value={ban.reason} />
                <Detail label="Status" value={isActive ? "Active" : `Revoked ${ban.revokedAt?.slice(0, 10)}`} />
                <Detail label="Expiry" value={ban.expiresAt ? ban.expiresAt.slice(0, 10) : "No expiry"} />
              </div>
            </article>
          );
        }) : (
          <article style={emptyCardStyle}>
            {data ? "No bans found." : "No bans available yet."}
          </article>
        )}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailStyle}>
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

const stackStyle = {
  display: "grid",
  gap: 16
} as const;

const cardStyle = {
  padding: 20,
  borderRadius: 20,
  background: "rgba(15,23,42,0.9)",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const emptyCardStyle = {
  ...cardStyle,
  color: "#94a3b8"
} as const;

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "start",
  marginBottom: 18
} as const;

const buttonRowStyle = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap"
} as const;

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12
} as const;

const detailStyle = {
  padding: 14,
  borderRadius: 14,
  background: "rgba(2,6,23,0.8)",
  border: "1px solid rgba(148,163,184,0.12)",
  display: "grid",
  gap: 6
} as const;

const mutedStyle = {
  color: "#94a3b8"
} as const;
