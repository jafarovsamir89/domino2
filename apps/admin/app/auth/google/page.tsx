"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { authClient } from "../../../lib/auth-client";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px 20px",
  background:
    "radial-gradient(circle at top, rgba(70, 150, 255, 0.12), transparent 40%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
  color: "#0f172a"
};

const cardStyle: CSSProperties = {
  width: "min(420px, 100%)",
  display: "grid",
  gap: 14,
  padding: 28,
  borderRadius: 24,
  background: "#ffffff",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  boxShadow: "0 24px 80px rgba(15,23,42,0.08)"
};

const hintStyle: CSSProperties = {
  margin: 0,
  lineHeight: 1.6,
  color: "#64748b"
};

const linkStyle: CSSProperties = {
  color: "#0284c7",
  textDecoration: "none",
  fontWeight: 600
};

export default function GoogleAuthPage() {
  const hasStartedRef = useRef(false);
  const [status, setStatus] = useState("Google hesabina giris hazirlanir...");

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const callbackURL =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("callbackURL") || "/dashboard"
        : "/dashboard";

    void authClient.signIn.social({
      provider: "google",
      callbackURL,
      fetchOptions: {
        onError(context) {
          const fallbackMessage =
            context.error?.message || "Google girisi baslamadi. Yeniden cehd edin.";
          setStatus(fallbackMessage);
        }
      }
    });
  }, []);

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: "1.8rem", lineHeight: 1.15 }}>Google ile giris</h1>
        <p style={hintStyle}>{status}</p>
        <p style={hintStyle}>
          Eger pencere acilmasa, brauzerde pop-up bloklanib. Bu halda{" "}
          <Link href="/login" style={linkStyle}>
            giris sehifesine
          </Link>{" "}
          qayidib yeniden yoxlayin.
        </p>
      </section>
    </main>
  );
}
