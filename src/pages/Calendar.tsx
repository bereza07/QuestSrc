import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore, type TFn } from "@/i18n";
import { DifficultyBadge } from "@/components/Badges";
import { TaskItem } from "@/components/TaskItem";
import { toDateKey, todayKey, addDays } from "@/utils/date";
import type { Task } from "@/types";

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
  // Mobile-only single-day focus. Kept separate from `anchor` so switching
  // breakpoints doesn't jump the desktop grid.
  const [dayFocus, setDayFocus] = useState<string>(todayKey());
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

  // Desktop grid days.
  const days = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [mode, anchor]);

  // Mobile 7-day strip: the week containing `dayFocus`.
  const mobileWeek = useMemo(() => {
    const start = startOfWeek(dayFocus);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [dayFocus]);

  // Mobile 6-week month grid: 42 cells covering the month that contains
  // `dayFocus`, aligned to the Monday-of-first-week. Used by the mobile
  // "month" mode as an overview of workload — tap a day to jump to week mode
  // focused on it.
  const mobileMonth = useMemo(() => {
    const start = startOfMonthGrid(dayFocus);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [dayFocus]);
  const focusMonth = Number(dayFocus.split("-")[1]);

  function shiftDesktop(dir: number) {
    setAnchor((a) => addDays(a, dir * (mode === "week" ? 7 : 30)));
  }
  function shiftMobile(dir: number) {
    setDayFocus((d) => addDays(d, dir));
  }

  async function onDrop(e: DragEvent, dateKey: string | null) {
    e.preventDefault();
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
  // Long-form label for the mobile single-day header ("Friday, 28 August").
  const focusDateLabel = (() => {
    const [y, m, d] = dayFocus.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  })();

  const focusTasks = byDate.get(dayFocus) ?? [];
  const unscheduled = byDate.get("none") ?? [];

  // Horizontal-swipe on the mobile day view. Left swipe = next day, right
  // swipe = previous day. Direction-locked so a vertical scroll on the panel
  // is not stolen. Same UX pattern as Google/Apple Calendar's day view.
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    active: boolean;
    horizontal: boolean;
    pointerId: number;
  } | null>(null);
  function onSwipeStart(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    swipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      active: false,
      horizontal: false,
      pointerId: e.pointerId,
    };
  }
  function onSwipeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = swipeRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.horizontal) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      g.horizontal = true;
      g.active = true;
    } else {
      // Vertical intent — abandon so the page scrolls naturally.
      swipeRef.current = null;
    }
  }
  function onSwipeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const g = swipeRef.current;
    swipeRef.current = null;
    if (!g || e.pointerId !== g.pointerId || !g.active) return;
    const dx = e.clientX - g.startX;
    const dt = Math.max(1, e.timeStamp - g.startTime);
    const velocity = dx / dt;
    // Distance OR velocity trips the shift, whichever comes first.
    const threshold = 48;
    if (dx > threshold || velocity > 0.4) shiftMobile(-1);
    else if (dx < -threshold || velocity < -0.4) shiftMobile(1);
  }

  return (
    <div>
      {/* Header. Title + mode toggle + arrows. Wraps freely on small widths. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">{t("calendar.title")}</h1>

        {/* Desktop-only mode toggle + week/month arrows. */}
        <div className="hidden md:flex items-center gap-2">
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
          <button className="qf-btn-ghost" onClick={() => shiftDesktop(-1)}>‹</button>
          <button className="qf-btn-ghost" onClick={() => setAnchor(todayKey())}>
            {t("calendar.today")}
          </button>
          <button className="qf-btn-ghost" onClick={() => shiftDesktop(1)}>›</button>
        </div>

        {/* Mobile-only nav: mode toggle (Week/Month) + prev / today / next.
            In week mode prev/next shift by 1 day; in month mode by 1 month so
            the user can flip through months for an overview of load. */}
        <div className="md:hidden flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["week", "month"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-0.5 text-xs ${
                  mode === m ? "bg-accent text-accent-fg" : "text-fg-2 hover:text-fg"
                }`}
              >
                {t(`calendar.${m}`)}
              </button>
            ))}
          </div>
          <button
            className="qf-btn-ghost"
            onClick={() => (mode === "week" ? shiftMobile(-1) : setDayFocus(addDays(dayFocus, -30)))}
            aria-label={t("calendar.prevDay")}
          >
            ‹
          </button>
          <button
            className="qf-btn-ghost"
            onClick={() => setDayFocus(todayKey())}
          >
            {t("calendar.switchToToday")}
          </button>
          <button
            className="qf-btn-ghost"
            onClick={() => (mode === "week" ? shiftMobile(1) : setDayFocus(addDays(dayFocus, 30)))}
            aria-label={t("calendar.nextDay")}
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-1 text-sm text-fg-3 md:block">
        <span className="md:hidden">{focusDateLabel}</span>
        <span className="hidden md:inline">{monthLabel}</span>
      </div>
      <p className="mt-1 text-xs text-fg-3">
        <span className="md:hidden">
          {picked ? t("calendar.pickHint") : t("calendar.tapPickHint")}
        </span>
        <span className="hidden md:inline">
          {picked ? t("calendar.pickHint") : t("calendar.dropHint")}
        </span>
      </p>

      {/* ─────────── MOBILE view ─────────────────────────────────────────── */}
      {mode === "week" ? (
      <div
        className="md:hidden touch-pan-y"
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeEnd}
      >
        <div className="mt-3 grid grid-cols-7 gap-1">
          {mobileWeek.map((k) => {
            const list = byDate.get(k) ?? [];
            const isToday = k === todayKey();
            const isFocused = k === dayFocus;
            const isOver = dragOver === k;
            const count = list.length;
            return (
              <button
                key={k}
                type="button"
                onDragEnter={(e) => allowDrop(e, k)}
                onDragOver={(e) => allowDrop(e, k)}
                onDragLeave={() => setDragOver((c) => (c === k ? null : c))}
                onDrop={(e) => onDrop(e, k)}
                onClick={() => {
                  if (picked) void moveTo(k);
                  else setDayFocus(k);
                }}
                className={`flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-xs transition-colors ${
                  isOver
                    ? "border-accent bg-accent-bg"
                    : isFocused
                      ? "border-accent bg-accent text-accent-fg"
                      : isToday
                        ? "border-accent bg-accent-bg text-accent"
                        : "border-border bg-surface text-fg-2"
                }`}
              >
                <span
                  className={`text-[10px] uppercase tracking-wide ${
                    isFocused ? "text-accent-fg opacity-80" : "text-fg-3"
                  }`}
                >
                  {dow(k)}
                </span>
                <span className={`text-sm font-semibold ${isToday && !isFocused ? "text-accent" : ""}`}>
                  {dayNum(k)}
                </span>
                {/* Quest count indicator: a filled dot for 1-2 tasks,
                    a numeric pill for 3+ so busy days stand out. */}
                {count > 0 && (
                  count >= 3 ? (
                    <span
                      className={`mt-0.5 min-w-[16px] rounded-full px-1 text-[9px] font-semibold leading-[14px] ${
                        isFocused
                          ? "bg-accent-fg text-accent"
                          : "bg-accent text-accent-fg"
                      }`}
                    >
                      {count}
                    </span>
                  ) : (
                    <span
                      className={`mt-1 h-1 w-1 rounded-full ${
                        isFocused ? "bg-accent-fg" : "bg-accent"
                      }`}
                    />
                  )
                )}
              </button>
            );
          })}
        </div>

        <SingleDayPanel
          date={dayFocus}
          tasks={focusTasks}
          picked={picked}
          onMoveHere={() => void moveTo(dayFocus)}
          onTaskClick={onTaskClick}
          t={t}
        />
      </div>
      ) : (
      // ─── Mobile MONTH view: compact 6-week grid ────────────────────────
      // Cells show the day number and a small dot / numeric pill for load,
      // no task titles — the purpose is workload overview. Tap a day to
      // switch back to Week mode focused on that day.
      <div className="md:hidden">
        {/* Weekday header row (Пн–Вс) — helps read the grid without extra
            chrome inside each cell. */}
        <div className="mt-3 grid grid-cols-7 gap-1 px-0.5">
          {mobileWeek.map((k) => (
            <div key={k} className="text-center text-[10px] uppercase tracking-wide text-fg-3">
              {dow(k)}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {mobileMonth.map((k) => {
            const list = byDate.get(k) ?? [];
            const isToday = k === todayKey();
            const inMonth = Number(k.split("-")[1]) === focusMonth;
            const count = list.length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (picked) void moveTo(k);
                  else {
                    setDayFocus(k);
                    setMode("week");
                  }
                }}
                onDragEnter={(e) => allowDrop(e, k)}
                onDragOver={(e) => allowDrop(e, k)}
                onDragLeave={() => setDragOver((c) => (c === k ? null : c))}
                onDrop={(e) => onDrop(e, k)}
                className={`flex min-h-[52px] flex-col items-center justify-start rounded-md border py-1 text-xs transition-colors ${
                  dragOver === k
                    ? "border-accent bg-accent-bg"
                    : isToday
                      ? "border-accent bg-accent-bg text-accent"
                      : "border-border bg-surface text-fg-2"
                } ${inMonth ? "" : "opacity-40"}`}
              >
                <span className={`text-[13px] leading-none ${isToday ? "font-bold" : ""}`}>
                  {dayNum(k)}
                </span>
                {count > 0 && (
                  count >= 3 ? (
                    <span className="mt-1 min-w-[16px] rounded-full bg-accent px-1 text-[9px] font-semibold leading-[14px] text-accent-fg">
                      {count}
                    </span>
                  ) : (
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-accent" />
                  )
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-fg-3">
          {t("calendar.monthTapHint")}
        </p>
      </div>
      )}

      {/* ─────────── DESKTOP view: 7-column week/month grid ────────────────── */}
      <div className="hidden md:grid mt-4 grid-cols-7 gap-2">
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

      {/* Unscheduled lane — drop here to clear the date. Same for both views. */}
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

// Single-day panel used in the mobile view. Renders full-size TaskItem cards
// (same as the Dashboard's "Today" list) so tasks are actually readable, plus
// a small "Move" button under each so the day-chip strip above can serve as
// the drop target for click-to-move.
function SingleDayPanel({
  date,
  tasks,
  picked,
  onMoveHere,
  onTaskClick,
  t,
}: {
  date: string;
  tasks: Task[];
  picked: string | null;
  onMoveHere: () => void;
  onTaskClick: (e: ReactMouseEvent, id: string) => void;
  t: TFn;
}) {
  const isEmpty = tasks.length === 0;
  const countLabel = tasks.length === 0
    ? t("calendar.quests_zero")
    : t(tasks.length === 1 ? "calendar.quests_one" : "calendar.quests_other", { n: tasks.length });

  return (
    <div
      onClick={() => picked && onMoveHere()}
      className={`qf-card mt-3 p-3 transition ${
        picked ? "cursor-pointer ring-1 ring-accent/40 hover:border-accent" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="qf-label">{countLabel}</div>
        {date === todayKey() && (
          <span className="rounded-full bg-accent-bg px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            {t("calendar.today")}
          </span>
        )}
      </div>
      {isEmpty ? (
        <div className="py-8 text-center text-sm text-fg-3">
          {picked ? t("calendar.dayEmptyPicked") : t("calendar.dayEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isPicked = picked === task.id;
            return (
              <div
                key={task.id}
                className={`rounded-lg transition ${
                  isPicked ? "ring-1 ring-accent/60 bg-accent-bg" : ""
                }`}
              >
                <TaskItem task={task} />
                <div className="mt-1.5 flex justify-end px-1">
                  <button
                    type="button"
                    onClick={(e) => onTaskClick(e, task.id)}
                    className={`text-[11px] transition ${
                      isPicked ? "text-accent font-medium" : "text-fg-3 hover:text-accent"
                    }`}
                  >
                    {isPicked ? "✕ " + t("calendar.pickCancel") : "↔ " + t("calendar.pickToMove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
