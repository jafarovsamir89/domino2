"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { fetchApiResult } from "../lib/api";

type EconomyField =
  | {
      name: string;
      label: string;
      type?: "text" | "number" | "datetime-local";
      placeholder?: string;
      help?: string;
      step?: number;
      min?: number;
      max?: number;
      required?: boolean;
    }
  | {
      name: string;
      label: string;
      type: "textarea";
      placeholder?: string;
      help?: string;
      required?: boolean;
      rows?: number;
    }
  | {
      name: string;
      label: string;
      type: "select";
      help?: string;
      required?: boolean;
      options: Array<{ label: string; value: string }>;
    }
  | {
      name: string;
      label: string;
      type: "checkbox";
      help?: string;
      required?: boolean;
    };

type EconomyEditFormProps = {
  endpoint: string;
  title: string;
  submitLabel: string;
  fields: EconomyField[];
  method?: "POST" | "PATCH" | "PUT";
  initialValues?: Record<string, unknown>;
  note?: string;
  compact?: boolean;
};

function toInputValue(value: unknown, type?: EconomyField["type"]) {
  if (type === "checkbox") return Boolean(value);
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  if (type === "datetime-local" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 16);
    }
  }
  return String(value);
}

function coerceFieldValue(field: EconomyField, value: FormDataEntryValue | null) {
  if (field.type === "checkbox") {
    return value === "on" || value === "true" || value === "1";
  }

  const raw = String(value ?? "").trim();
  if (field.type === "number") {
    if (!raw) return "";
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : "";
  }
  if (field.type === "datetime-local") {
    return raw ? new Date(raw).toISOString() : "";
  }
  return raw;
}

export function EconomyEditForm({
  endpoint,
  title,
  submitLabel,
  fields,
  method = "POST",
  initialValues = {},
  note,
  compact = false
}: EconomyEditFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState(() => {
    const next: Record<string, string | boolean> = {};
    for (const field of fields) {
      next[field.name] = toInputValue(initialValues[field.name], field.type);
    }
    return next;
  });

  const gridStyle = useMemo(
    () => ({
      display: "grid",
      gap: compact ? 10 : 12,
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
    }),
    [compact]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};

    for (const field of fields) {
      body[field.name] = coerceFieldValue(field, formData.get(field.name));
    }

    const result = await fetchApiResult(endpoint, {
      method,
      json: body
    });

    if (!result.ok) {
      setMessage(result.error || "Action failed");
      setBusy(false);
      return;
    }

    setMessage("Saved");
    router.refresh();
    setBusy(false);
  }

  return (
    <form style={formStyle} onSubmit={handleSubmit}>
      <div style={headerStyle}>
        <strong>{title}</strong>
        {note ? <span style={noteStyle}>{note}</span> : null}
      </div>

      <div style={gridStyle}>
        {fields.map((field) => {
          const shared = {
            name: field.name,
            id: field.name,
            placeholder: "placeholder" in field ? field.placeholder : undefined,
            required: field.required
          };

          if (field.type === "textarea") {
            return (
              <label key={field.name} style={fieldStyle}>
                <span style={labelStyle}>{field.label}</span>
                <textarea
                  {...shared}
                  rows={field.rows || 3}
                  defaultValue={String(formState[field.name] ?? "")}
                  style={textareaStyle}
                />
                {field.help ? <span style={helpStyle}>{field.help}</span> : null}
              </label>
            );
          }

          if (field.type === "select") {
            return (
              <label key={field.name} style={fieldStyle}>
                <span style={labelStyle}>{field.label}</span>
                <select {...shared} defaultValue={String(formState[field.name] ?? "")} style={inputStyle}>
                  <option value="">Select...</option>
                  {field.options.map((option) => (
                    <option key={`${field.name}:${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {field.help ? <span style={helpStyle}>{field.help}</span> : null}
              </label>
            );
          }

          if (field.type === "checkbox") {
            return (
              <label key={field.name} style={checkboxStyle}>
                <input
                  {...shared}
                  type="checkbox"
                  defaultChecked={Boolean(formState[field.name])}
                />
                <span>
                  <span style={labelStyle}>{field.label}</span>
                  {field.help ? <span style={helpStyle}>{field.help}</span> : null}
                </span>
              </label>
            );
          }

          return (
            <label key={field.name} style={fieldStyle}>
              <span style={labelStyle}>{field.label}</span>
              <input
                {...shared}
                type={field.type || "text"}
                step={field.step}
                min={field.min}
                max={field.max}
                defaultValue={String(formState[field.name] ?? "")}
                style={inputStyle}
              />
              {field.help ? <span style={helpStyle}>{field.help}</span> : null}
            </label>
          );
        })}
      </div>

      <div style={footerStyle}>
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Saving..." : submitLabel}
        </button>
        {message ? <span style={messageStyle}>{message}</span> : null}
      </div>
    </form>
  );
}

const formStyle = {
  padding: 16,
  borderRadius: 18,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  display: "grid",
  gap: 14
} as const;

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "baseline",
  flexWrap: "wrap"
} as const;

const noteStyle = {
  color: "#64748b",
  fontSize: 13
} as const;

const fieldStyle = {
  display: "grid",
  gap: 8
} as const;

const checkboxStyle = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  paddingTop: 8
} as const;

const labelStyle = {
  color: "#0f172a",
  fontWeight: 700,
  fontSize: 14
} as const;

const helpStyle = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5
} as const;

const inputStyle = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#ffffff",
  color: "#0f172a",
  padding: "12px 14px"
} as const;

const textareaStyle = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical"
} as const;

const footerStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap"
} as const;

const buttonStyle = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "linear-gradient(135deg, #dbeafe, #cffafe)",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer"
} as const;

const messageStyle = {
  color: "#64748b",
  fontSize: 13
} as const;
