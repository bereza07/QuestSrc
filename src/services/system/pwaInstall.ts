// PWA install helper.
//
// Chromium browsers fire `beforeinstallprompt` when the site meets install
// criteria (manifest + SW + served over https/localhost). We capture the
// event, expose an installable flag, and provide a `prompt()` method so a
// button in Settings can trigger the native install dialog on demand.
//
// Also detects whether the app is already running as an installed PWA
// (display-mode:standalone) so the UI can hide the install button.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(mm || iosStandalone);
}

function notify() {
  for (const cb of listeners) cb();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const pwaInstall = {
  /** Native install prompt is available to show right now. */
  canInstall(): boolean {
    return deferred !== null && !isStandalone();
  },

  /** The app is already running as an installed PWA. */
  isInstalled(): boolean {
    return isStandalone();
  },

  /** Show the browser's install dialog. Resolves once the user chooses. */
  async prompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome;
  },

  /** Subscribe to install-state changes (returns an unsubscribe). */
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
