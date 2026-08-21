// Date helpers. Planned dates are stored as local calendar days (YYYY-MM-DD)
// so "today" matches the user's wall clock, not UTC.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

/** Human-friendly duration, e.g. 95 -> "1h 35m", 40 -> "40m". */
export function minutesToHuman(mins: number | null | undefined): string {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Seconds → clock string. 95 -> "01:35", 3725 -> "1:02:05". */
export function secondsToClock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/** Seconds → compact human string, e.g. 3725 -> "1h 2m", 95 -> "1m". */
export function secondsToHuman(total: number): string {
  return minutesToHuman(Math.round(total / 60));
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * "Today"/"Tomorrow"/… or a short date label for a date key. Pass the `t`
 * translator (and optional locale) to localize; without it, falls back to
 * English words.
 */
export function relativeDayLabel(
  dateKey: string | null,
  t?: Translate,
  locale?: string,
): string {
  const word = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (!dateKey) return word("common.someday", "Someday");
  if (dateKey === todayKey()) return word("common.today", "Today");
  if (dateKey === addDays(todayKey(), 1)) return word("common.tomorrow", "Tomorrow");
  if (dateKey === addDays(todayKey(), -1))
    return word("common.yesterday", "Yesterday");
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}
