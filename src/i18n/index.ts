import { useMemo } from "react";
import { create } from "zustand";
import { en } from "./en";
import { ru } from "./ru";

export type Lang = "ru" | "en";

const dicts: Record<Lang, unknown> = { en, ru };

export const LANG_LABELS: Record<Lang, string> = {
  ru: "Русский",
  en: "English",
};

const STORAGE_KEY = "qf.lang";

function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

export type TVars = Record<string, string | number>;

/** Pure translation lookup with `{var}` interpolation and English fallback. */
export function translate(lang: Lang, key: string, vars?: TVars): string {
  let value = getPath(dicts[lang], key);
  if (typeof value !== "string") value = getPath(dicts.en, key);
  if (typeof value !== "string") {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  let out = value;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return out;
}

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "ru") return v;
  } catch {
    /* ignore */
  }
  return "ru"; // default to Russian
}

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: readStoredLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      /* ignore */
    }
    set({ lang });
  },
}));

export type TFn = (key: string, vars?: TVars) => string;

/** Hook returning a translation function bound to the current language. */
export function useT(): TFn {
  const lang = useI18nStore((s) => s.lang);
  return useMemo<TFn>(() => (key, vars) => translate(lang, key, vars), [lang]);
}
