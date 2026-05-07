const fallbackGameServerUrl = "http://127.0.0.1:2567";

export function getGameServerBaseUrl() {
  return process.env.GAME_SERVER_URL || process.env.NEXT_PUBLIC_GAME_SERVER_URL || fallbackGameServerUrl;
}

type FetchGameServerInit = RequestInit;

export async function fetchGameServerApi<T>(path: string, init: FetchGameServerInit = {}): Promise<T | null> {
  try {
    const response = await fetch(`${getGameServerBaseUrl()}${path}`, {
      cache: "no-store",
      ...init
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}
