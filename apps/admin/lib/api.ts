const fallbackApiUrl = "https://apid.simplesoft.az/api";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || fallbackApiUrl;
}

type FetchApiInit = RequestInit & {
  json?: unknown;
};

export type FetchApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; data: null; status: number; error: string };

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

export async function fetchApiResult<T>(path: string, init: FetchApiInit = {}): Promise<FetchApiResult<T>> {
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
      const payload = await response.json().catch(() => ({}));
      return {
        ok: false,
        data: null,
        status: response.status,
        error: String(payload?.error || payload?.message || response.statusText || "Request failed")
      };
    }

    return {
      ok: true,
      data: (await response.json()) as T,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      status: 0,
      error: error instanceof Error ? error.message : "Request failed"
    };
  }
}
