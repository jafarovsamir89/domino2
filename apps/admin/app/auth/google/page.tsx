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
    "radial-gradient(circle at top, rgba(70, 150, 255, 0.16), transparent 40%), linear-gradient(180deg, #08111f 0%, #0d1728 55%, #101d31 100%)",
  color: "#f5f7fb"
};

const cardStyle: CSSProperties = {
  width: "min(420px, 100%)",
  display: "grid",
  gap: 14,
  padding: 28,
  borderRadius: 24,
  background: "rgba(10, 18, 32, 0.9)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)"
};

const hintStyle: CSSProperties = {
  margin: 0,
  lineHeight: 1.6,
  color: "rgba(226, 232, 240, 0.78)"
};

const linkStyle: CSSProperties = {
  color: "#8ec5ff",
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
