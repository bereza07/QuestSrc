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

/** Resolve the request URL, routing DeepSeek through the same-origin proxy in
 * the browser (Vite dev-proxy or the sync server's production proxy). Tauri
 * calls the API directly through the native HTTP plugin. */
export function resolveUrl(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  if (!isTauri && clean === "https://api.deepseek.com") {
    return "/deepseek-proxy" + path;
  }
  return clean + path;
}
