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
      className={`group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5
        hover:border-border hover:bg-bg-soft/60 transition ${
          cancelled ? "opacity-50" : ""
        }`}
    >
      <button
        onClick={onComplete}
        disabled={done || busy}
        aria-label={done ? t("tasks.completed") : t("tasks.completeAria")}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition
          ${
            done
              ? "border-success bg-success/20 text-success"
              : "border-ink-faint text-transparent hover:border-accent hover:text-accent"
          }`}
      >
        <IconCheck size={13} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className={`truncate text-left text-sm hover:text-accent-glow ${
              done ? "text-ink-faint line-through" : "text-ink"
            }`}
          >
            {task.title}
          </button>
          <PriorityDot priority={task.priority} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
          <DifficultyBadge difficulty={task.difficulty} />
          {task.estimatedMinutes ? (
            <span>~{minutesToHuman(task.estimatedMinutes)}</span>
          ) : null}
          {overdue && (
            <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
              {t("tasks.overdue")}
            </span>
          )}
        </div>
      </div>

      {!done && !cancelled && !timerActive && (
        <button
          onClick={onQuickStart}
          aria-label={t("timer.startFocus")}
          title={t("timer.startFocus")}
          className="shrink-0 rounded-md p-1 text-ink-faint opacity-0 transition hover:text-accent group-hover:opacity-100"
        >
          <IconPlay size={14} />
        </button>
      )}

      {task.xpReward > 0 && (
        <span
          className={`shrink-0 text-xs font-mono ${
            done ? "text-ink-faint" : "text-accent"
          }`}
        >
          +{task.xpReward} XP
        </span>
      )}

      {open && <TaskDetailModal task={task} onClose={() => setOpen(false)} />}
    </div>
  );
}
