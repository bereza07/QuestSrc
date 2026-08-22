import type { Difficulty, TaskPriority } from "@/types";
import { useT } from "@/i18n";

// Difficulty chip — filled soft background + text tinted per band. Uses inline
// CSS variables so it stays correct across light and dark themes.
const difficultyBg: Record<Difficulty, { bg: string; fg: string }> = {
  TRIVIAL: { bg: "var(--surface-2)", fg: "var(--fg-3)" },
  EASY:    { bg: "var(--success-bg)", fg: "var(--success)" },
  MEDIUM:  { bg: "var(--warn-bg)",    fg: "var(--warn)" },
  HARD:    { bg: "var(--accent-bg)",  fg: "var(--accent)" },
  EPIC:    { bg: "var(--danger-bg)",  fg: "var(--danger)" },
};

export function DifficultyBadge({
  difficulty,
  className = "",
}: {
  difficulty: Difficulty;
  className?: string;
}) {
  const t = useT();
  const style = difficultyBg[difficulty];
  return (
    <span
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-mono ${className}`}
      style={{ background: style.bg, color: style.fg }}
    >
      {t(`difficulty.${difficulty}`)}
    </span>
  );
}

// Priority is shown as an arrow character. LOW/NORMAL suppressed so the row
// stays quiet unless it's important.
const priorityGlyph: Record<TaskPriority, { char: string; color: string }> = {
  LOW:      { char: "↓", color: "var(--fg-3)" },
  NORMAL:   { char: "→", color: "var(--fg-3)" },
  HIGH:     { char: "↑", color: "var(--warn)" },
  CRITICAL: { char: "‼", color: "var(--danger)" },
};

export function PriorityDot({ priority }: { priority: TaskPriority }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  const g = priorityGlyph[priority];
  return (
    <span
      className="inline-flex items-center font-mono text-xs"
      style={{ color: g.color }}
      title={`${priority} priority`}
    >
      {g.char}
    </span>
  );
}
