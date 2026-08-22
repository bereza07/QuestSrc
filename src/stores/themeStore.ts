import { create } from "zustand";

// Theme toggle — controls the `.dark` class on <html>. Persisted so the choice
// survives reloads. Defaults to light (cream palette).

type Theme = "light" | "dark";
const KEY = "qf.theme";

function readInitial(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

interface State {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const initial = readInitial();
if (typeof document !== "undefined") applyTheme(initial);

export const useThemeStore = create<State>((set) => ({
  theme: initial,
  setTheme: (t) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    set({ theme: t });
  },
  toggle: () => {
    let next: Theme = "light";
    set((s) => {
      next = s.theme === "dark" ? "light" : "dark";
      return { theme: next };
    });
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
  },
}));
