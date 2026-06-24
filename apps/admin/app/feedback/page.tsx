import Link from "next/link";

import { AdminFrame } from "../../components/admin-frame";
import { AccessRequired } from "../../components/access-required";
import { ActionButton } from "../../components/action-button";
import { getAdminSession, isAdminRole } from "../../lib/admin-session";
import { fetchAuthedApi } from "../../lib/server-api";

export const dynamic = "force-dynamic";

type FeedbackResponse = {
  items: Array<{
    id: string;
    message: string;
    category: string | null;
    contactEmail: string | null;
    status: string;
    appVersion: string | null;
    locale: string | null;
    createdAt: string;
    resolvedAt: string | null;
    resolvedByUser: {
      id: string;
      email: string;
      name: string;
      role: string | null;
    } | null;
    player: {
      id: string;
      displayName: string;
      user: {
        email: string;
      } | null;
    } | null;
  }>;
};

export default async function FeedbackPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; query?: string }>;
}) {
  const session = await getAdminSession();
  if (!session?.user || !isAdminRole(session.user.role)) {
    return (
      <AccessRequired
        title="Admin access required"
        body="Sign in with an admin account to review player feedback."
      />
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const status = String(resolvedSearchParams.status || "new");
  const query = String(resolvedSearchParams.query || "");
  const data = await fetchAuthedApi<FeedbackResponse>(
    `/admin/feedback?status=${encodeURIComponent(status)}&query=${encodeURIComponent(query)}`
  );

  return (
    <AdminFrame
      active="feedback"
      title="Feedback"
      description="Player feedback lands here so the team can review, resolve, and track recurring issues without leaving the admin panel."
      actions={
        <form style={searchFormStyle}>
          <select name="status" defaultValue={status} style={selectStyle}>
            <option value="new">New only</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All feedback</option>
          </select>
          <input name="query" defaultValue={query} placeholder="Search message, category or email" style={searchInputStyle} />
          <button style={searchButtonStyle} type="submit">
            Filter
          </button>
          <Link href="/reports" style={linkStyle}>
            Reports
          </Link>
        </form>
      }
    >
      <section style={stackStyle}>
        {data?.items.length ? data.items.map((feedback) => (
          <article key={feedback.id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <strong>{feedback.category || "general"}</strong>
                <div style={mutedStyle}>
                  {feedback.status} · {feedback.createdAt.slice(0, 10)}
                </div>
              </div>
              <div style={buttonRowStyle}>
                <ActionButton endpoint={`/admin/feedback/${feedback.id}`} method="PATCH" label="Resolve" body={{ status: "resolved" }} />
                <ActionButton endpoint={`/admin/feedback/${feedback.id}`} method="PATCH" label="Reject" body={{ status: "rejected" }} />
              </div>
            </div>

            <div style={messageStyle}>{feedback.message}</div>

            <div style={twoColumnStyle}>
              <Detail label="Player" value={feedback.player ? `${feedback.player.displayName}${feedback.player.user?.email ? ` · ${feedback.player.user.email}` : ""}` : "Anonymous"} />
              <Detail label="Contact" value={feedback.contactEmail || "Not provided"} />
              <Detail label="Locale" value={feedback.locale || "Unknown"} />
              <Detail label="App version" value={feedback.appVersion || "Unknown"} />
              <Detail label="Resolved" value={feedback.resolvedAt ? feedback.resolvedAt.slice(0, 10) : "Pending"} />
              <Detail label="Resolved by" value={feedback.resolvedByUser ? `${feedback.resolvedByUser.name} · ${feedback.resolvedByUser.email}` : "Not resolved yet"} />
            </div>
          </article>
        )) : (
          <article style={emptyCardStyle}>
            {data ? "No feedback found." : "No feedback available yet."}
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

const searchInputStyle = {
  minWidth: 240,
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
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 12px 28px rgba(15,23,42,0.06)"
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

const messageStyle = {
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.12)",
  color: "#0f172a",
  lineHeight: 1.7,
  marginBottom: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
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
