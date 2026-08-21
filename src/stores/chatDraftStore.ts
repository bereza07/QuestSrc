import { create } from "zustand";

// Draft text for the AI composer. Kept in a store (not component state) so it
// survives navigation between pages — the user can start typing, jump to Tasks,
// come back and pick up where they left off.

const KEY = "qf.chat.draft";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

interface State {
  draft: string;
  setDraft: (v: string) => void;
  clearDraft: () => void;
  // "Думает…" indicator survives navigating away and back. Also bumped whenever
  // an inflight request finishes so the Assistant page knows to reload messages.
  busy: boolean;
  setBusy: (v: boolean) => void;
  reloadTick: number;
  bumpReload: () => void;
  scopeProjectId: string | null;
  setScopeProjectId: (id: string | null) => void;
}

export const useChatDraftStore = create<State>((set) => ({
  draft: read(),
  setDraft: (v) => {
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ draft: v });
  },
  clearDraft: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ draft: "" });
  },
  busy: false,
  setBusy: (v) => set({ busy: v }),
  reloadTick: 0,
  bumpReload: () => set((s) => ({ reloadTick: s.reloadTick + 1 })),
  // Optional "active project" scope. When set, aiService tells the model to
  // route new quests into this project by default. Persisted per-device.
  scopeProjectId: (() => {
    try { return localStorage.getItem("qf.chat.scopeProject") ?? null; } catch { return null; }
  })(),
  setScopeProjectId: (id: string | null) => {
    try {
      if (id) localStorage.setItem("qf.chat.scopeProject", id);
      else localStorage.removeItem("qf.chat.scopeProject");
    } catch { /* ignore */ }
    set({ scopeProjectId: id });
  },
}));
