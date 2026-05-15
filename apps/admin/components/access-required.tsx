import Link from "next/link";

type AccessRequiredProps = {
  title: string;
  body: string;
};

export function AccessRequired({ title, body }: AccessRequiredProps) {
  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Secure Access</p>
        <h1 style={titleStyle}>{title}</h1>
        <p style={bodyStyle}>{body}</p>
        <Link href="/login" style={linkStyle}>
          Go to login
        </Link>
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: 760,
  margin: "64px auto",
  padding: "0 24px"
} as const;

const cardStyle = {
  padding: 32,
  borderRadius: 28,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 24px 60px rgba(15,23,42,0.08)"
} as const;

const eyebrowStyle = {
  textTransform: "uppercase",
  letterSpacing: 1.6,
  color: "#0284c7",
  fontSize: 12,
  margin: 0
} as const;

const titleStyle = {
  margin: "10px 0 12px",
  fontSize: 40,
  lineHeight: 1.05
} as const;

const bodyStyle = {
  color: "#64748b",
  lineHeight: 1.7,
  margin: "0 0 24px"
} as const;

const linkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #dbeafe, #cffafe)",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 700
} as const;
