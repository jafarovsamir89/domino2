"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fetchApi } from "../lib/api";

type ActionButtonProps = {
  endpoint: string;
  label: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
  variant?: "primary" | "secondary" | "danger";
};

export function ActionButton({
  endpoint,
  label,
  method = "POST",
  body,
  variant = "secondary"
}: ActionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    const result = await fetchApi(endpoint, {
      method,
      json: body
    });

    if (!result) {
      setError("Action failed");
      setBusy(false);
      return;
    }

    router.refresh();
    setBusy(false);
  }

  const style = variant === "danger" ? dangerStyle : variant === "primary" ? primaryStyle : secondaryStyle;

  return (
    <button type="button" disabled={busy} onClick={handleClick} style={style}>
      {busy ? "Working..." : label}
      {error ? <span style={errorStyle}>{error}</span> : null}
    </button>
  );
}

const baseStyle = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.2)",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 4
} as const;

const primaryStyle = {
  ...baseStyle,
  background: "linear-gradient(135deg, #38bdf8, #0f766e)",
  color: "#020617"
} as const;

const secondaryStyle = {
  ...baseStyle,
  background: "rgba(15,23,42,0.9)",
  color: "#e2e8f0"
} as const;

const dangerStyle = {
  ...baseStyle,
  background: "rgba(127,29,29,0.22)",
  color: "#fecaca",
  borderColor: "rgba(248,113,113,0.28)"
} as const;

const errorStyle = {
  color: "#fca5a5",
  fontSize: 12,
  fontWeight: 500
} as const;
