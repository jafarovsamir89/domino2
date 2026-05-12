import { createAuthClient } from "better-auth/react";

const baseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://apid.simplesoft.az");

export const authClient = createAuthClient({
  baseURL
});
