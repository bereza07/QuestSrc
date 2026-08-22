import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTimerStore } from "@/stores/timerStore";
import { useT } from "@/i18n";
import { Modal } from "@/components/Modal";
import { secondsToHuman } from "@/utils/date";
import type { ProgressRating } from "@/types";

const PROGRESS: ProgressRating[] = ["NONE", "SOME", "COMPLETED"];

export function SessionCompleteModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const seconds = useTimerStore((s) => s.lastSessionSeconds);
  const taskId = useTimerStore((s) => s.lastSessionTaskId);
  const rateLastSession = useTimerStore((s) => s.rateLastSession);
  const completeTask = useAppStore((s) => s.completeTask);

  const [progress, setProgress] = useState<ProgressRating>("SOME");
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await rateLastSession(progress, difficulty);
      // If the user marks the task done here, award XP through the normal path.
      if (progress === "COMPLETED" && taskId) {
        await completeTask(taskId);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("timer.sessionComplete")} onClose={onClose}>
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-fg-3">
          {t("timer.focused")}
        </div>
        <div className="mt-1 font-mono text-3xl text-accent">
          {secondsToHuman(seconds)}
        </div>
      </div>

      <div className="mt-5">
        <div className="qf-label">{t("timer.progressQuestion")}</div>
        <div className="mt-2 flex flex-col gap-2">
          {PROGRESS.map((p) => (
            <button
              key={p}
              onClick={() => setProgress(p)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                progress === p
                  ? "border-accent bg-accent-bg text-accent"
                  : "border-border text-fg-2 hover:border-border-strong"
              }`}
            >
              {t(`timer.progress${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="qf-label">{t("timer.difficultyQuestion")}</div>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setDifficulty(n)}
              className={`h-9 w-9 rounded-lg border text-sm ${
                difficulty === n
                  ? "border-accent bg-accent-bg text-accent"
                  : "border-border text-fg-2 hover:border-border-strong"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button className="qf-btn-ghost" onClick={onClose} disabled={busy}>
          {t("timer.skip")}
        </button>
        <button className="qf-btn-primary" onClick={save} disabled={busy}>
          {t("timer.saveSession")}
        </button>
      </div>
    </Modal>
  );
}
