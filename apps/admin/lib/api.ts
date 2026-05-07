const fallbackApiUrl = "http://localhost:3000/api";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || fallbackApiUrl;
}

type FetchApiInit = RequestInit & {
  json?: unknown;
};

export async function fetchApi<T>(path: string, init: FetchApiInit = {}): Promise<T | null> {
  try {
    const headers = new Headers(init.headers);
    if (init.json !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
