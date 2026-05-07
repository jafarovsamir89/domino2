export type Role = "player" | "moderator" | "admin" | "superadmin";

export interface HealthPayload {
  status: "ok";
  service: string;
}

export * from "./legacy-auth.js";
