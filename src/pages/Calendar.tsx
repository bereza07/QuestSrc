import { useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import { DifficultyBadge } from "@/components/Badges";
import { toDateKey, todayKey, addDays } from "@/utils/date";

type Mode = "week" | "month";

/** Monday-based start of the week containing `key`. */
function startOfWeek(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -dow);
}

function startOfMonthGrid(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const first = toDateKey(new Date(y, m - 1, 1));
  return startOfWeek(first);
}

export function Calendar() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const activeTasks = useAppStore((s) => s.activeTasks);
  const reschedule = useAppStore((s) => s.rescheduleTask);

  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(todayKey());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Click-to-move: tap a task to "pick it up", then tap a day to place it.
  // Reliable everywhere (incl. touch) as a fallback to native drag&drop.
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicked(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  async function moveTo(dateKey: string | null) {
    if (!picked) return;
    const id = picked;
    setPicked(null);
    await reschedule(id, dateKey);
  }

  function onTaskClick(e: ReactMouseEvent, id: string) {
    e.stopPropagation();
    setPicked((cur) => (cur === id ? null : id));
  }

  // HTML5 DnD requires dataTransfer to be populated and a matching drop effect,
  // otherwise the browser shows the "no-drop" cursor and never fires onDrop.
  function handleDragStart(e: DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function allowDrop(e: DragEvent, key: string | null) {
    // Both dragenter and dragover must preventDefault, or the browser shows the
    // "no-drop" cursor and never fires onDrop.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const next = key ?? "none";
    setDragOver((c) => (c === next ? c : next));
  }

  const byDate = useMemo(() => {
    const map = new Map<string, typeof activeTasks>();
    for (const task of activeTasks) {
      const key = task.plannedDate ?? "none";
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [activeTasks]);

  const days = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  function shift(dir: number) {
    setAnchor((a) => addDays(a, dir * (mode === "week" ? 7 : 30)));
  }

  async function onDrop(e: DragEvent, dateKey: string | null) {
    e.preventDefault();
    // dataTransfer is the source of truth; dragId state is a fallback.
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragOver(null);
    if (!id) return;
    await reschedule(id, dateKey);
    setDragId(null);
  }

  const dow = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: "short" });
  };
  const dayNum = (k: string) => Number(k.split("-")[2]);
  const [anchorY, anchorM] = anchor.split("-").map(Number);
  const monthLabel = new Date(anchorY, anchorM - 1, 1).toLocaleDateString(lang, {
    month: "long",
    year: "numeric",
  });

  const unscheduled = byDate.get("none") ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">{t("calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-1">
            {(["week", "month"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 text-sm ${
                  mode === m ? "bg-accent text-accent-fg" : "text-fg-2 hover:text-fg"
                }`}
              >
                {t(`calendar.${m}`)}
              </button>
            ))}
          </div>
          <button className="qf-btn-ghost" onClick={() => shift(-1)}>
            ‹
          </button>
          <button className="qf-btn-ghost" onClick={() => setAnchor(todayKey())}>
            {t("calendar.today")}
          </button>
          <button className="qf-btn-ghost" onClick={() => shift(1)}>
            ›
          </button>
        </div>
      </div>

      <div className="mt-1 text-sm text-fg-3">{monthLabel}</div>
      <p className="mt-1 text-xs text-fg-3">
        {picked ? t("calendar.pickHint") : t("calendar.dropHint")}
      </p>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((k) => {
          const list = byDate.get(k) ?? [];
          const isToday = k === todayKey();
          const inMonth = mode === "week" || Number(k.split("-")[1]) === anchorM;
          const isOver = dragOver === k;
          const cellH = mode === "week" ? "min-h-[240px]" : "min-h-[132px]";
          return (
            <div
              key={k}
              onDragEnter={(e) => allowDrop(e, k)}
              onDragOver={(e) => allowDrop(e, k)}
              onDragLeave={() => setDragOver((c) => (c === k ? null : c))}
              onDrop={(e) => onDrop(e, k)}
              onClick={() => moveTo(k)}
              className={`${cellH} rounded-md border p-2.5 transition-colors ${
                isOver
                  ? "border-accent bg-accent-bg"
                  : isToday
                    ? "border-accent bg-accent-bg"
                    : "border-border bg-surface"
              } ${inMonth ? "" : "opacity-50"} ${picked ? "cursor-pointer hover:border-accent" : ""}`}
            >
              <div className="mb-1.5 flex items-baseline justify-between px-0.5">
                <span className="text-xs uppercase tracking-wide text-fg-3">
                  {dow(k)}
                </span>
                <span
                  className={`text-sm ${isToday ? "font-bold text-accent" : "text-fg-2"}`}
                >
                  {dayNum(k)}
                </span>
              </div>
              <div className="space-y-1">
                {list.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={(e) => onTaskClick(e, task.id)}
                    className={`cursor-pointer rounded-md border bg-surface-2 px-2 py-1.5 text-xs text-fg-2 ${
                      picked === task.id
                        ? "border-accent ring-1 ring-accent/50 text-accent"
                        : "border-border"
                    } ${dragId === task.id ? "opacity-50" : ""}`}
                    title={task.title}
                  >
                    <div className="truncate">{task.title}</div>
                    {mode === "week" && (
                      <DifficultyBadge difficulty={task.difficulty} className="mt-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled lane — drop here to clear the date */}
      <div
        onDragEnter={(e) => allowDrop(e, null)}
        onDragOver={(e) => allowDrop(e, null)}
        onDragLeave={() => setDragOver((c) => (c === "none" ? null : c))}
        onDrop={(e) => onDrop(e, null)}
        onClick={() => moveTo(null)}
        className={`qf-card mt-4 p-3 transition ${
          dragOver === "none" ? "ring-1 ring-accent/40" : ""
        } ${picked ? "cursor-pointer ring-1 ring-accent/30" : ""}`}
      >
        <div className="qf-label mb-2">{t("calendar.unscheduled")}</div>
        {unscheduled.length === 0 ? (
          <div className="text-xs text-fg-3">—</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragEnd={() => setDragId(null)}
                onClick={(e) => onTaskClick(e, task.id)}
                className={`cursor-pointer rounded-md border bg-surface-2 px-2 py-1 text-xs text-fg-2 ${
                  picked === task.id
                    ? "border-accent ring-1 ring-accent/50 text-accent"
                    : "border-border"
                }`}
              >
                {task.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
