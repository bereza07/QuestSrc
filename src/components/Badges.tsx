import type { Difficulty, TaskPriority } from "@/types";
import { useT } from "@/i18n";

const difficultyStyle: Record<Difficulty, string> = {
  TRIVIAL: "text-ink-faint border-border",
  EASY: "text-success border-success/30",
  MEDIUM: "text-accent border-accent/30",
  HARD: "text-warn border-warn/40",
  EPIC: "text-arcane border-arcane/40",
};

export function DifficultyBadge({
  difficulty,
  className = "",
}: {
  difficulty: Difficulty;
  className?: string;
}) {
  const t = useT();
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${difficultyStyle[difficulty]} ${className}`}
    >
      {t(`difficulty.${difficulty}`)}
    </span>
  );
}

const priorityStyle: Record<TaskPriority, string> = {
  LOW: "text-ink-faint",
  NORMAL: "text-ink-soft",
  HIGH: "text-warn",
  CRITICAL: "text-danger",
};

export function PriorityDot({ priority }: { priority: TaskPriority }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  return (
    <span
      className={`text-xs font-semibold ${priorityStyle[priority]}`}
      title={`${priority} priority`}
    >
      {priority === "CRITICAL" ? "!!" : "!"}
    </span>
  );
}
