import { create } from "zustand";
import { exportData, importData, isBackupFile } from "@/services/system/dataTransfer";
import type { Repositories } from "@/data/repositories";

// Client side of LAN sync. The server stores the whole dataset (the same JSON as
// Export) per account. We PUSH local → server and PULL server → local. Coarse
// last-write-wins; fine for one person across a few devices. The app stays fully
// offline-capable — sync is opt-in and explicit.

type Status = "idle" | "syncing" | "error";

interface SyncState {
  serverUrl: string;
  email: string | null;
  token: string | null;
  autoSync: boolean;
  status: Status;
  error: string | null;
  lastSyncedAt: string | null;

  setServerUrl: (url: string) => void;
  setAutoSync: (on: boolean) => void;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  push: (repos: Repositories) => Promise<void>;
  forcePush: (repos: Repositories) => Promise<void>;
  pull: (repos: Repositories) => Promise<boolean>; // true if server had data
  wipeServerData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const LS = {
  url: "qf.sync.url",
  token: "qf.sync.token",
  email: "qf.sync.email",
  auto: "qf.sync.auto",
  last: "qf.sync.last",
};

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setLs(key: string, val: string | null) {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function api(
  url: string,
  path: string,
  method: string,
  token: string | null,
  body?: unknown,
): Promise<Response> {
  try {
    return await fetch(baseUrl(url) + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure (server down / wrong address / CORS). Surface a
    // clear, localizable reason instead of the bare "Failed to fetch".
    throw new Error("__UNREACHABLE__");
  }
}

/** Ping the server's /health so the UI can confirm connectivity. */
export async function checkServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl(url) + "/health");
    return res.ok;
  } catch {
    return false;
  }
}

async function errText(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  serverUrl: ls(LS.url) || "http://localhost:4000",
  email: ls(LS.email),
  token: ls(LS.token),
  autoSync: ls(LS.auto) === "1",
  status: "idle",
  error: null,
  lastSyncedAt: ls(LS.last),

  setServerUrl: (url) => {
    setLs(LS.url, url);
    set({ serverUrl: url });
  },

  setAutoSync: (on) => {
    setLs(LS.auto, on ? "1" : "0");
    set({ autoSync: on });
  },

  register: async (email, password) => {
    set({ status: "syncing", error: null });
    try {
      const res = await api(get().serverUrl, "/auth/register", "POST", null, { email, password });
      if (!res.ok) throw new Error(await errText(res));
      const data = await res.json();
      setLs(LS.token, data.token);
      setLs(LS.email, data.email);
      set({ token: data.token, email: data.email, status: "idle" });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  login: async (email, password) => {
    set({ status: "syncing", error: null });
    try {
      const res = await api(get().serverUrl, "/auth/login", "POST", null, { email, password });
      if (!res.ok) throw new Error(await errText(res));
      const data = await res.json();
      setLs(LS.token, data.token);
      setLs(LS.email, data.email);
      set({ token: data.token, email: data.email, status: "idle" });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  logout: () => {
    setLs(LS.token, null);
    setLs(LS.email, null);
    set({ token: null, email: null, error: null });
  },

  push: async (repos) => {
    const { token, serverUrl, lastSyncedAt } = get();
    if (!token) return;
    set({ status: "syncing", error: null });
    try {
      const dataset = await exportData(repos);
      // Send the timestamp we last saw. Server rejects with 409 if another
      // device already pushed since then — surfaced as __CONFLICT__ so the UI
      // can offer "pull server / overwrite anyway".
      const res = await api(serverUrl, "/data", "PUT", token, {
        dataset,
        baseUpdatedAt: lastSyncedAt,
      });
      if (res.status === 409) throw new Error("__CONFLICT__");
      if (!res.ok) throw new Error(await errText(res));
      const data = await res.json();
      setLs(LS.last, data.updatedAt);
      set({ status: "idle", lastSyncedAt: data.updatedAt });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  /** Force-push, overriding server-side conflict detection. */
  forcePush: async (repos) => {
    const { token, serverUrl } = get();
    if (!token) return;
    set({ status: "syncing", error: null });
    try {
      const dataset = await exportData(repos);
      const res = await api(serverUrl, "/data", "PUT", token, { dataset }); // no base = overwrite
      if (!res.ok) throw new Error(await errText(res));
      const data = await res.json();
      setLs(LS.last, data.updatedAt);
      set({ status: "idle", lastSyncedAt: data.updatedAt });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },

  /** Wipe THIS user's dataset on the server. Throws on any server error so the
   *  UI can surface "still there — restart server or check network" instead of
   *  a false "wiped" toast. */
  wipeServerData: async () => {
    const { token, serverUrl } = get();
    if (!token) return;
    const res = await api(serverUrl, "/data", "DELETE", token);
    if (!res.ok) throw new Error(await errText(res));
    setLs(LS.last, null);
    set({ lastSyncedAt: null });
  },

  /** Full account wipe on the server (dataset + user). Also logs out locally.
   *  If the server call fails we do NOT log out locally — the account is still
   *  live and the user needs to see the error to try again. */
  deleteAccount: async () => {
    const { token, serverUrl } = get();
    if (!token) return;
    const res = await api(serverUrl, "/account", "DELETE", token);
    if (!res.ok) throw new Error(await errText(res));
    setLs(LS.token, null);
    setLs(LS.email, null);
    setLs(LS.last, null);
    set({ token: null, email: null, lastSyncedAt: null });
  },

  pull: async (repos) => {
    const { token, serverUrl } = get();
    if (!token) return false;
    set({ status: "syncing", error: null });
    try {
      const res = await api(serverUrl, "/data", "GET", token);
      if (res.status === 204) {
        set({ status: "idle" });
        return false;
      }
      if (!res.ok) throw new Error(await errText(res));
      const data = await res.json();
      if (!isBackupFile(data.dataset)) throw new Error("Bad dataset from server");
      await importData(repos, data.dataset);
      setLs(LS.last, data.updatedAt);
      set({ status: "idle", lastSyncedAt: data.updatedAt });
      return true;
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
}));

// Debounced auto-push after local mutations (only when logged in + autoSync).
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoPush(repos: Repositories) {
  const { token, autoSync } = useSyncStore.getState();
  if (!token || !autoSync) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void useSyncStore.getState().push(repos).catch(() => {});
  }, 1500);
}
