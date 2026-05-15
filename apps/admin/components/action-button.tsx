"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fetchApiResult } from "../lib/api";

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

    const result = await fetchApiResult(endpoint, {
      method,
      json: body
    });

    if (!result.ok) {
      setError(result.error || "Action failed");
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
  border: "1px solid rgba(148,163,184,0.18)",
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
  background: "linear-gradient(135deg, #e0f2fe, #dbeafe)",
  color: "#0f172a"
} as const;

const secondaryStyle = {
  ...baseStyle,
  background: "#ffffff",
  color: "#0f172a"
} as const;

const dangerStyle = {
  ...baseStyle,
  background: "#fff1f2",
  color: "#9f1239",
  borderColor: "rgba(244,63,94,0.22)"
} as const;

const errorStyle = {
  color: "#dc2626",
  fontSize: 12,
  fontWeight: 500
} as const;
