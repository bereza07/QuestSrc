import { useState } from "react";
import type { Task } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { useTimerStore } from "@/stores/timerStore";
import { useT } from "@/i18n";
import { DifficultyBadge, PriorityDot } from "./Badges";
import { IconCheck, IconPlay } from "./icons";
import { minutesToHuman, todayKey } from "@/utils/date";
import { TaskDetailModal } from "@/features/task-detail/TaskDetailModal";

interface TaskItemProps {
  task: Task;
  showDate?: boolean;
}

export function TaskItem({ task }: TaskItemProps) {
  const t = useT();
  const completeTask = useAppStore((s) => s.completeTask);
  const startTimer = useTimerStore((s) => s.start);
  const timerActive = useTimerStore((s) => s.active);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const done = task.status === "COMPLETED";
  const cancelled = task.status === "CANCELLED";
  const overdue = !done && !cancelled && !!task.plannedDate && task.plannedDate < todayKey();

  function onQuickStart() {
    void startTimer({
      taskId: task.id,
      projectId: task.projectId,
      mode: "STOPWATCH",
      targetSeconds: null,
    });
  }

  async function onComplete() {
    if (done || busy) return;
    setBusy(true);
    try {
      await completeTask(task.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2 ${
        cancelled ? "opacity-50" : ""
      } ${done ? "opacity-60" : ""}`}
    >
      <button
        onClick={onComplete}
        disabled={done || busy}
        aria-label={done ? t("tasks.completed") : t("tasks.completeAria")}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          done
            ? "border-transparent text-accent-fg"
            : "border-border text-transparent group-hover:border-fg-3 hover:text-accent"
        }`}
        style={done ? { background: "var(--accent)" } : undefined}
      >
        <IconCheck size={10} strokeWidth={2.5} />
      </button>

      <button
        onClick={() => setOpen(true)}
        className={`min-w-0 flex-1 truncate text-left text-sm hover:text-accent ${
          done ? "text-fg-3 line-through" : "text-fg"
        }`}
      >
        {task.title}
      </button>

      {/* Chips + timer button appear on hover; XP always visible. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-1.5 group-hover:flex">
          <PriorityDot priority={task.priority} />
          <DifficultyBadge difficulty={task.difficulty} />
          {task.estimatedMinutes ? (
            <span className="font-mono text-[11px] text-fg-3">
              ~{minutesToHuman(task.estimatedMinutes)}
            </span>
          ) : null}
          {overdue && (
            <span className="qf-chip-danger">
              {t("tasks.overdue")}
            </span>
          )}
          {!done && !cancelled && !timerActive && (
            <button
              onClick={onQuickStart}
              aria-label={t("timer.startFocus")}
              title={t("timer.startFocus")}
              className="rounded-md p-1 text-fg-3 transition hover:text-accent"
            >
              <IconPlay size={12} />
            </button>
          )}
        </div>
        {task.xpReward > 0 && (
          <span
            className={`font-mono text-xs ${done ? "text-fg-3" : "text-accent"}`}
          >
            +{task.xpReward}
          </span>
        )}
      </div>

      {open && <TaskDetailModal task={task} onClose={() => setOpen(false)} />}
    </div>
  );
}
