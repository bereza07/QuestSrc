import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTimerStore } from "@/stores/timerStore";
import { useT } from "@/i18n";
import { ProgressBar } from "@/components/ProgressBar";
import { IconPlay, IconPause, IconStop, IconClock } from "@/components/icons";
import { secondsToClock } from "@/utils/date";
import type { TimerMode } from "@/types";
import { SessionCompleteModal } from "./SessionCompleteModal";
import { FocusHistoryModal } from "./FocusHistoryModal";

const POMODORO_PRESETS = [25, 50, 90];

export function TimerWidget() {
  const t = useT();
  const activeTasks = useAppStore((s) => s.activeTasks);

  const active = useTimerStore((s) => s.active);
  const running = useTimerStore((s) => s.running);
  const focusedSeconds = useTimerStore((s) => s.focusedSeconds);
  const targetSeconds = useTimerStore((s) => s.targetSeconds);
  const taskId = useTimerStore((s) => s.taskId);
  const start = useTimerStore((s) => s.start);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);
  const stop = useTimerStore((s) => s.stop);
  const justCompleted = useTimerStore((s) => s.justCompletedSession);
  const lastSessionId = useTimerStore((s) => s.lastSessionId);

  const [mode, setMode] = useState<TimerMode>("STOPWATCH");
  const [pomodoro, setPomodoro] = useState(50);
  const [countdownMin, setCountdownMin] = useState(30);
  const [pickTaskId, setPickTaskId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  // Surface the post-session form when a timer stops with a saved session.
  if ((justCompleted || (!active && lastSessionId)) && !showComplete) {
    setShowComplete(true);
  }

  function beginTimer() {
    const picked = activeTasks.find((task) => task.id === pickTaskId);
    const target =
      mode === "POMODORO" ? pomodoro * 60 : mode === "COUNTDOWN" ? countdownMin * 60 : null;
    void start({
      taskId: picked?.id ?? null,
      projectId: picked?.projectId ?? null,
      mode,
      targetSeconds: target,
    });
  }

  const runningTask = activeTasks.find((task) => task.id === taskId);
  const remaining = targetSeconds ? Math.max(0, targetSeconds - focusedSeconds) : null;
  const clock = remaining != null ? remaining : focusedSeconds;
  const frac = targetSeconds ? focusedSeconds / targetSeconds : 0;

  return (
    <div className="qf-card p-5">
      <div className="flex items-center justify-between">
        <div className="qf-label flex items-center gap-2">
          <IconClock size={14} /> {t("timer.title")}
        </div>
        <button
          className="text-xs text-ink-faint hover:text-ink"
          onClick={() => setShowHistory(true)}
        >
          {t("timer.history")}
        </button>
      </div>

      {active ? (
        <div className="mt-3 text-center">
          <div className="truncate text-sm text-ink-soft">
            {runningTask ? runningTask.title : t("timer.freeFocus")}
          </div>
          <div
            className={`mt-1 font-mono text-4xl tabular-nums ${
              running ? "text-accent-glow" : "text-ink-faint"
            }`}
          >
            {secondsToClock(clock)}
          </div>
          {targetSeconds && <ProgressBar className="mx-auto mt-2 max-w-xs" value={frac} height={5} />}
          <div className="mt-3 flex justify-center gap-2">
            {running ? (
              <button className="qf-btn-ghost" onClick={() => void pause()}>
                <IconPause size={14} /> {t("timer.pause")}
              </button>
            ) : (
              <button className="qf-btn-primary" onClick={() => void resume()}>
                <IconPlay size={14} /> {t("timer.resume")}
              </button>
            )}
            <button className="qf-btn-danger" onClick={() => void stop()}>
              <IconStop size={14} /> {t("timer.stop")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="inline-flex rounded-lg border border-border p-1">
            {(["STOPWATCH", "POMODORO", "COUNTDOWN"] as TimerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 text-xs ${
                  mode === m ? "bg-accent text-bg" : "text-ink-soft hover:text-ink"
                }`}
              >
                {t(`timer.${m.toLowerCase()}`)}
              </button>
            ))}
          </div>

          {mode === "POMODORO" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {POMODORO_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPomodoro(p)}
                  className={`rounded-md border px-3 py-1 text-xs ${
                    pomodoro === p
                      ? "border-accent text-accent-glow"
                      : "border-border text-ink-soft"
                  }`}
                >
                  {p} {t("timer.minutes")}
                </button>
              ))}
              <span className="text-ink-faint">·</span>
              <input
                type="number"
                min={1}
                max={600}
                value={pomodoro}
                onChange={(e) =>
                  setPomodoro(Math.max(1, Math.min(600, Number(e.target.value) || 1)))
                }
                aria-label={t("timer.customMinutes")}
                title={t("timer.customMinutes")}
                className={`qf-input w-20 ${
                  POMODORO_PRESETS.includes(pomodoro) ? "" : "border-accent text-accent-glow"
                }`}
              />
              <span className="text-xs text-ink-faint">{t("timer.minutes")}</span>
            </div>
          )}
          {mode === "COUNTDOWN" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={countdownMin}
                onChange={(e) => setCountdownMin(Number(e.target.value) || 1)}
                className="qf-input w-24"
              />
              <span className="text-xs text-ink-faint">{t("timer.minutes")}</span>
            </div>
          )}

          <select
            value={pickTaskId}
            onChange={(e) => setPickTaskId(e.target.value)}
            className="qf-input mt-3"
          >
            <option value="">{t("timer.freeFocus")}</option>
            {activeTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>

          <button className="qf-btn-primary mt-3 w-full justify-center" onClick={beginTimer}>
            <IconPlay size={15} /> {t("timer.start")}
          </button>
        </div>
      )}

      {showComplete && (
        <SessionCompleteModal
          onClose={() => {
            setShowComplete(false);
            useTimerStore.getState().clearJustCompleted();
          }}
        />
      )}
      {showHistory && <FocusHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}
