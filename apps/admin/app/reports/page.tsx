import Link from "next/link";

import { AccessRequired } from "../../components/access-required";
import { ActionButton } from "../../components/action-button";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchAuthedApi } from "../../lib/server-api";

export const dynamic = "force-dynamic";

type ReportsResponse = {
  items: Array<{
    id: string;
    reason: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    reporter: {
      id: string;
      displayName: string;
      user: {
        email: string;
      } | null;
    };
    target: {
      id: string;
      displayName: string;
      user: {
        email: string;
      } | null;
    };
    match: {
      id: string;
      roomId: string | null;
      mode: string;
      createdAt: string;
    } | null;
  }>;
};

export default async function ReportsPage() {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to review reports and moderation actions."
      />
    );
  }

  const data = await fetchAuthedApi<ReportsResponse>("/admin/reports");

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moderation</p>
          <h1 style={titleStyle}>Reports</h1>
          <p style={bodyStyle}>Open reports are the fastest way to spot abuse and bad-room behavior.</p>
        </div>
        <Link href="/players" style={linkStyle}>
          Back to players
        </Link>
      </header>

      <section style={stackStyle}>
        {data?.items.length ? data.items.map((report) => (
          <article key={report.id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <strong>{report.reason}</strong>
                <div style={mutedStyle}>{report.status} · {report.createdAt.slice(0, 10)}</div>
              </div>
              <div style={buttonRowStyle}>
                <ActionButton endpoint={`/admin/reports/${report.id}`} method="PATCH" label="Resolve" body={{ status: "resolved" }} />
                <ActionButton endpoint={`/admin/reports/${report.id}`} method="PATCH" label="Reject" body={{ status: "rejected" }} />
              </div>
            </div>

            <div style={twoColumnStyle}>
              <Detail label="Reporter" value={`${report.reporter.displayName}${report.reporter.user?.email ? ` · ${report.reporter.user.email}` : ""}`} />
              <Detail label="Target" value={`${report.target.displayName}${report.target.user?.email ? ` · ${report.target.user.email}` : ""}`} />
              <Detail label="Match" value={report.match ? `${report.match.mode} · ${report.match.roomId ?? "local"} · ${report.match.createdAt.slice(0, 10)}` : "No match linked"} />
              <Detail label="Resolved" value={report.resolvedAt ? report.resolvedAt.slice(0, 10) : "Pending"} />
            </div>
          </article>
        )) : (
          <article style={emptyCardStyle}>
            {data ? "No reports found." : "No reports available yet."}
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
