"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "../lib/auth-client";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  emailVerified?: boolean | null;
};

type SessionResponse = {
  user: SessionUser;
  session: {
    id: string;
    expiresAt: string;
  };
} | null;

export function DashboardSessionCard() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const result = await authClient.getSession();

      if (!mounted) return;

      setSession((result?.data as SessionResponse) || null);
      setIsLoading(false);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        }
      }
    });
  }

  return (
    <aside style={panelStyle}>
      <h2 style={titleStyle}>Session</h2>
      {isLoading ? (
        <p style={mutedStyle}>Checking auth state...</p>
      ) : session?.user ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={mutedStyle}>Signed in as</div>
            <div style={strongStyle}>{session.user.name}</div>
            <div style={mutedStyle}>{session.user.email}</div>
          </div>
          <div>
            <div style={mutedStyle}>Role</div>
            <div style={strongStyle}>{session.user.role ?? "player"}</div>
          </div>
          <div>
            <div style={mutedStyle}>Email</div>
            <div style={strongStyle}>{session.user.emailVerified ? "verified" : "needs verification"}</div>
          </div>
          {session.user.role === "admin" || session.user.role === "superadmin" ? null : (
            <div style={warningStyle}>
              This account is signed in, but it still needs an admin role before it can operate the private dashboard.
            </div>
          )}
          {session.user.emailVerified ? null : (
            <div style={warningStyle}>
              This account still needs email verification. You can open the verification page and resend the link.
            </div>
          )}
          <button style={secondaryButtonStyle} type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={mutedStyle}>No active admin session found.</p>
          <button style={primaryButtonStyle} type="button" onClick={() => router.push("/login")}>
            Go to login
          </button>
        </div>
      )}
    </aside>
  );
}

const panelStyle = {
  padding: 20,
  borderRadius: 20,
  background: "rgba(15,23,42,0.92)",
  border: "1px solid rgba(148,163,184,0.16)"
} as const;

const titleStyle = {
  marginTop: 0,
  marginBottom: 16
};

const mutedStyle = {
  margin: 0,
  color: "#94a3b8",
  lineHeight: 1.6
};

const strongStyle = {
  color: "#e2e8f0",
  fontWeight: 700,
  marginTop: 4
};

const primaryButtonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617",
  fontWeight: 700,
  cursor: "pointer"
} as const;

const secondaryButtonStyle = {
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 14,
  padding: "12px 16px",
  background: "rgba(15,23,42,0.88)",
  color: "#e2e8f0",
  fontWeight: 600,
  cursor: "pointer"
} as const;

const warningStyle = {
  borderRadius: 14,
  padding: 12,
  background: "rgba(146,64,14,0.18)",
  border: "1px solid rgba(251,191,36,0.28)",
  color: "#fde68a",
  lineHeight: 1.6
} as const;
