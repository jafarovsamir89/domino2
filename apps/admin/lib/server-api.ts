import { cookies } from "next/headers";

import { fetchApi } from "./api";

export async function fetchAuthedApi<T>(path: string) {
  const cookieHeader = cookies().toString();
  return fetchApi<T>(path, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined
  });
}
