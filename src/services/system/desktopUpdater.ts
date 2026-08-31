// Desktop (Tauri) auto-updater bridge.
//
// The Tauri updater plugin talks to a signed manifest served from
// tauri.conf.json → plugins.updater.endpoints (we point it at GitHub Releases).
// It downloads the platform-specific bundle, verifies its Ed25519 signature
// against the pubkey baked into the binary, installs it, and hands control to
// process.relaunch() so the app restarts on the new version.
//
// This module is loaded ONLY inside the desktop app — everything is behind the
// isTauri guard, and the underlying `@tauri-apps/plugin-updater` package is
// lazily imported so the web build never touches it.

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string; date?: string }
  | { kind: "downloading"; percent: number }
  | { kind: "installing" }
  | { kind: "up-to-date" }
  | { kind: "error"; message: string };

/** True in the Tauri desktop app; false in the web/PWA build. */
export function canAutoUpdate(): boolean {
  return isTauri;
}

/**
 * Check for updates. Resolves with the current status. When an update is
 * available, `installAndRestart` may be called to apply it.
 *
 * Silent when nothing new — safe to call on every app start.
 */
export async function checkForUpdate(
  onProgress?: (s: UpdateStatus) => void,
): Promise<UpdateStatus> {
  if (!isTauri) return { kind: "up-to-date" };
  try {
    onProgress?.({ kind: "checking" });
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update || !update.available) {
      const s: UpdateStatus = { kind: "up-to-date" };
      onProgress?.(s);
      return s;
    }
    const s: UpdateStatus = {
      kind: "available",
      version: update.version,
      notes: update.body,
      date: update.date,
    };
    onProgress?.(s);
    return s;
  } catch (err) {
    const s: UpdateStatus = {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    onProgress?.(s);
    return s;
  }
}

/**
 * Download + install the pending update and relaunch. The updater plugin
 * verifies the Ed25519 signature against the pubkey in tauri.conf.json before
 * running the installer, so an attacker who compromises the release manifest
 * still can't ship a malicious binary.
 */
export async function installAndRestart(
  onProgress?: (s: UpdateStatus) => void,
): Promise<void> {
  if (!isTauri) return;
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update || !update.available) return;
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress?.({ kind: "downloading", percent: 0 });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({
          kind: "downloading",
          percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
        });
        break;
      case "Finished":
        onProgress?.({ kind: "installing" });
        break;
    }
  });
  await relaunch();
}

/**
 * Best-effort background check on app start. Never throws — logs errors quietly
 * so a network issue can't block the app from launching.
 */
export function scheduleStartupCheck(delayMs = 5000): void {
  if (!isTauri) return;
  setTimeout(() => {
    void checkForUpdate().catch(() => {});
  }, delayMs);
}
