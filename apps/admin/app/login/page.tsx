import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Secure Access</p>
        <h1 style={titleStyle}>Admin Login</h1>
        <p style={bodyStyle}>
          The platform layer now has a real `Better Auth` backend. This page is the first operational doorway into the
          custom admin surface for your domino service.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}

const pageStyle = {
  maxWidth: 640,
  margin: "64px auto",
  padding: "0 24px"
};

const cardStyle = {
  padding: 32,
  borderRadius: 28,
  background: "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98))",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 30px 80px rgba(15,23,42,0.45)"
};

const eyebrowStyle = {
  textTransform: "uppercase",
  letterSpacing: 1.6,
  color: "#38bdf8",
  fontSize: 12,
  margin: 0
};

const titleStyle = {
  margin: "10px 0 12px",
  fontSize: 40,
  lineHeight: 1.05
};

const bodyStyle = {
  color: "#94a3b8",
  lineHeight: 1.7,
  margin: "0 0 24px"
};
