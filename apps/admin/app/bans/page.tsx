import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
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

export default async function BansPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to view active bans and moderation history."
      />
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const status = String(resolvedSearchParams.status || "active");
  const data = await fetchAuthedApi<BansResponse>(`/admin/bans?status=${encodeURIComponent(status)}`);

  return (
    <AdminFrame
      active="bans"
      title="Bans"
      description="Active bans and historical moderation actions live here. Revoke or review with a single click."
      actions={
        <form style={searchFormStyle}>
          <select name="status" defaultValue={status} style={selectStyle}>
            <option value="active">Active only</option>
            <option value="revoked">Revoked</option>
            <option value="all">All bans</option>
          </select>
          <button style={searchButtonStyle} type="submit">Filter</button>
          <Link href="/reports" style={linkStyle}>Reports</Link>
        </form>
      }
    >
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
    </AdminFrame>
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

const linkStyle = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 700
} as const;

const searchFormStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
} as const;

const selectStyle = {
  minWidth: 150,
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

const stackStyle = {
  display: "grid",
  gap: 16
} as const;

const cardStyle = {
  padding: 20,
  borderRadius: 20,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const emptyCardStyle = {
  ...cardStyle,
  color: "#64748b"
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
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.12)",
  display: "grid",
  gap: 6
} as const;

const mutedStyle = {
  color: "#64748b"
} as const;
