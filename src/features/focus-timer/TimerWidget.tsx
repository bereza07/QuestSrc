import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTimerStore } from "@/stores/timerStore";
import { useT } from "@/i18n";
import { IconPlay, IconPause, IconStop, IconRotateCCW } from "@/components/icons";
import { secondsToClock } from "@/utils/date";
import type { TimerMode } from "@/types";
import { SessionCompleteModal } from "./SessionCompleteModal";
import { FocusHistoryModal } from "./FocusHistoryModal";

// Compact focus-timer widget with a circular progress ring, inline-editable
// duration, and a task selector for the session. Fits into the dashboard card
// (~320px wide) and grows gracefully on wider surfaces.

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

  const [mode, setMode] = useState<TimerMode>("POMODORO");
  const [pomodoro, setPomodoro] = useState(25);
  const [countdownMin, setCountdownMin] = useState(45);
  const [pickTaskId, setPickTaskId] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editStr, setEditStr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if ((justCompleted || (!active && lastSessionId)) && !showComplete) {
    setShowComplete(true);
  }

  const isTimed = mode === "POMODORO" || mode === "COUNTDOWN";
  const currentMin = mode === "POMODORO" ? pomodoro : countdownMin;
  const setCurrentMin = mode === "POMODORO" ? setPomodoro : setCountdownMin;

  function beginTimer() {
    const picked = activeTasks.find((task) => task.id === pickTaskId);
    const target = mode === "POMODORO" ? pomodoro * 60 : mode === "COUNTDOWN" ? countdownMin * 60 : null;
    void start({
      taskId: picked?.id ?? null,
      projectId: picked?.projectId ?? null,
      mode,
      targetSeconds: target,
    });
  }

  const runningTask = activeTasks.find((task) => task.id === taskId);
  const remaining = targetSeconds ? Math.max(0, targetSeconds - focusedSeconds) : null;
  const clockSeconds = active
    ? remaining ?? focusedSeconds
    : isTimed
      ? currentMin * 60
      : 0;
  const totalSeconds = active
    ? targetSeconds ?? focusedSeconds
    : isTimed
      ? currentMin * 60
      : 0;
  const progress = totalSeconds > 0
    ? Math.min(1, active ? focusedSeconds / totalSeconds : 0)
    : 0;

  // SVG ring geometry — matches the Figma mock's 120px canvas.
  const R = 52;
  const circumference = 2 * Math.PI * R;
  const offset = circumference * (1 - progress);

  function commitEdit() {
    const n = Math.max(1, Math.min(600, Math.round(Number(editStr) || currentMin)));
    setCurrentMin(n);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mode tabs — segmented pills. Disabled while a session is active. */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md bg-surface-2 p-0.5 text-xs">
          {(["STOPWATCH", "POMODORO", "COUNTDOWN"] as TimerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => !active && setMode(m)}
              disabled={active}
              className={`rounded px-2.5 py-1 transition-colors ${
                mode === m
                  ? "bg-surface text-fg shadow-sm"
                  : "text-fg-2 hover:text-fg disabled:opacity-50"
              }`}
            >
              {t(`timer.${m.toLowerCase()}`)}
            </button>
          ))}
        </div>
        <button
          className="text-xs text-fg-3 hover:text-fg"
          onClick={() => setShowHistory(true)}
        >
          {t("timer.history")}
        </button>
      </div>

      {/* Ring + clock. Ring is the SVG, clock lives centered on top; the whole
          area is clickable when idle+timed to enter edit mode. */}
      <div className="flex items-center justify-center">
        <div className="relative h-[120px] w-[120px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="var(--border-c)"
              strokeWidth="6"
            />
            {totalSeconds > 0 && (
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
            )}
          </svg>
          <button
            type="button"
            disabled={active || !isTimed}
            onClick={() => {
              setEditStr(String(currentMin));
              setEditing(true);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 disabled:cursor-default"
            title={isTimed && !active ? t("timer.editMinutes") : undefined}
          >
            {editing ? (
              <input
                ref={inputRef}
                type="number"
                min={1}
                max={600}
                value={editStr}
                onChange={(e) => setEditStr(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-20 border-0 bg-transparent text-center font-mono text-3xl font-medium text-accent outline-none"
              />
            ) : (
              <span
                className={`font-mono text-2xl font-medium tabular-nums ${
                  running ? "text-accent" : "text-fg"
                }`}
              >
                {secondsToClock(clockSeconds)}
              </span>
            )}
            {!active && isTimed && !editing && (
              <span className="text-[10px] uppercase tracking-wider text-fg-3">
                {t("timer.tapToEdit")}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Pomodoro presets — visible only when setting up a timed session. */}
      {!active && mode === "POMODORO" && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {POMODORO_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPomodoro(p)}
              className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                pomodoro === p
                  ? "border-accent bg-accent-bg text-accent"
                  : "border-border text-fg-2 hover:text-fg"
              }`}
            >
              {p} {t("timer.minutesShort")}
            </button>
          ))}
        </div>
      )}

      {/* Task selector — shown always so the running task is visible too. */}
      {active ? (
        <div className="rounded-md bg-surface-2 px-2.5 py-1.5 text-center text-xs text-fg-2">
          {runningTask ? runningTask.title : t("timer.freeFocus")}
        </div>
      ) : (
        <select
          value={pickTaskId}
          onChange={(e) => setPickTaskId(e.target.value)}
          className="qf-input text-sm"
        >
          <option value="">{t("timer.freeFocus")}</option>
          {activeTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-1.5">
        {!active ? (
          <button className="qf-btn-primary flex-1 justify-center" onClick={beginTimer}>
            <IconPlay size={13} /> {t("timer.start")}
          </button>
        ) : (
          <>
            {running ? (
              <button className="qf-btn-ghost flex-1 justify-center" onClick={() => void pause()}>
                <IconPause size={13} /> {t("timer.pause")}
              </button>
            ) : (
              <button className="qf-btn-primary flex-1 justify-center" onClick={() => void resume()}>
                <IconPlay size={13} /> {t("timer.resume")}
              </button>
            )}
            <button
              className="qf-btn-ghost"
              onClick={() => void stop()}
              title={t("timer.stop")}
            >
              <IconStop size={13} />
            </button>
            <button
              className="qf-btn-ghost"
              onClick={() => void stop()}
              title={t("timer.reset")}
            >
              <IconRotateCCW size={13} />
            </button>
          </>
        )}
      </div>

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
