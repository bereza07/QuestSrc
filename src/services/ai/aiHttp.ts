// HTTP for AI calls. In the Tauri desktop app we use the native HTTP plugin so
// requests aren't subject to browser CORS. In the web preview we use window.fetch,
// routing DeepSeek through a Vite dev proxy (see vite.config.ts) to dodge CORS.

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(url, init) as unknown as Promise<Response>;
  }
  return window.fetch(url, init);
}

/** Resolve the request URL, routing DeepSeek through the dev proxy in the browser. */
export function resolveUrl(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (!isTauri && import.meta.env.DEV && clean === "https://api.deepseek.com") {
    return "/deepseek-proxy" + path;
  }
  return clean + path;
}
