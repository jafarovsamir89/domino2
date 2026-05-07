import { fetchAuthedApi } from "./server-api";

type AdminSessionResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    role?: string | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
} | null;

export async function getAdminSession() {
  return fetchAuthedApi<AdminSessionResponse>("/platform/session");
}

export function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "superadmin";
}
