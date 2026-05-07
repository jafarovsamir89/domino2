import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchAuthedApi } from "../../lib/server-api";

export const dynamic = "force-dynamic";

type AuditLogResponse = {
  items: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    payloadJson: unknown;
    createdAt: string;
    adminUser: {
      id: string;
      email: string;
      name: string;
      role: string | null;
    };
  }>;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export default async function AuditPage({
  searchParams
}: {
  searchParams?: Promise<{ action?: string; entityType?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to inspect audit activity."
      />
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const action = String(resolvedSearchParams.action || "");
  const entityType = String(resolvedSearchParams.entityType || "");
  const data = await fetchAuthedApi<AuditLogResponse>(
    `/admin/audit-logs?limit=50&offset=0&action=${encodeURIComponent(action)}&entityType=${encodeURIComponent(entityType)}`
  );

  return (
    <AdminFrame
      active="audit"
      title="Audit log"
      description="Every moderation action and admin change lands here so we can trace what happened and who changed it."
      actions={
        <form style={searchFormStyle}>
          <input name="action" defaultValue={action} placeholder="Filter by action" style={searchInputStyle} />
          <input name="entityType" defaultValue={entityType} placeholder="Filter by entity" style={searchInputStyle} />
          <button style={searchButtonStyle} type="submit">Filter</button>
          <Link href="/dashboard" style={linkStyle}>Dashboard</Link>
        </form>
      }
    >
      <section style={stackStyle}>
        {data?.items.length ? data.items.map((log) => (
          <article key={log.id} style={cardStyle}>
            <div style={headerStyle}>
              <div>
                <strong>{log.action}</strong>
                <div style={mutedStyle}>{log.entityType} · {log.entityId}</div>
              </div>
              <div style={mutedStyle}>{log.createdAt.slice(0, 10)}</div>
            </div>
            <div style={bodyStyle}>
              <div><span style={labelStyle}>Admin</span> {log.adminUser.name} · {log.adminUser.email}</div>
              <div><span style={labelStyle}>Role</span> {log.adminUser.role ?? "admin"}</div>
              <pre style={payloadStyle}>{JSON.stringify(log.payloadJson ?? {}, null, 2)}</pre>
            </div>
          </article>
        )) : (
          <article style={emptyCardStyle}>
            {data ? "No audit logs found." : "No audit log data available yet."}
          </article>
        )}
      </section>
    </AdminFrame>
  );
}

const stackStyle = {
  display: "grid",
  gap: 16
} as const;

const searchFormStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap"
} as const;

const searchInputStyle = {
  minWidth: 180,
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

const linkStyle = {
  color: "#38bdf8",
  textDecoration: "none",
  fontWeight: 700
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

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "start",
  marginBottom: 12
} as const;

const bodyStyle = {
  display: "grid",
  gap: 10,
  color: "#e2e8f0"
} as const;

const labelStyle = {
  color: "#94a3b8",
  marginRight: 6
} as const;

const mutedStyle = {
  color: "#94a3b8"
} as const;

const payloadStyle = {
  margin: 0,
  padding: 14,
  borderRadius: 14,
  background: "rgba(2,6,23,0.84)",
  border: "1px solid rgba(148,163,184,0.12)",
  color: "#cbd5e1",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
} as const;
