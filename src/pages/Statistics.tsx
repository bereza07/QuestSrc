import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import { ProgressBar } from "@/components/ProgressBar";
import { xpForLevel } from "@/domain/leveling";
import { addDays, toDateKey, todayKey, secondsToHuman } from "@/utils/date";
import type { StatPeriod } from "@/domain/statistics";
import {
  computeStatistics,
  type StatisticsResult,
} from "@/services/statistics/statisticsService";
import type { DailyActivity } from "@/data/repositories/activityRepo";

const C = {
  accent: "#d9a441",
  arcane: "#6f8cff",
  success: "#5bbf82",
  danger: "#d3596b",
  faint: "#5f6883",
  border: "#272e42",
};

export function Statistics() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const repos = useAppStore((s) => s.repos);
  const stats = useAppStore((s) => s.stats);
  const projects = useAppStore((s) => s.projects);
  const goals = useAppStore((s) => s.goals);

  const [period, setPeriod] = useState<StatPeriod>("week");
  const [anchor, setAnchor] = useState(todayKey());
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [res, setRes] = useState<StatisticsResult | null>(null);
  const [activity, setActivity] = useState<Map<string, DailyActivity>>(new Map());

  useEffect(() => {
    if (!repos) return;
    void computeStatistics(repos, {
      period,
      anchor,
      projectId: projectId || null,
      goalId: goalId || null,
    }).then(setRes);
  }, [repos, period, anchor, projectId, goalId]);

  useEffect(() => {
    if (!repos) return;
    void repos.activity.listRecent(90).then((rows) => {
      setActivity(new Map(rows.map((a) => [a.date, a])));
    });
  }, [repos]);

  function shift(dir: number) {
    if (period === "week") return setAnchor((a) => addDays(a, dir * 7));
    const [y, m] = anchor.split("-").map(Number);
    setAnchor(toDateKey(new Date(y, m - 1 + dir, 1)));
  }

  const rangeLabel = useMemo(() => {
    if (period === "all") return t("statistics.period_all");
    const [y, m] = anchor.split("-").map(Number);
    if (period === "month")
      return new Date(y, m - 1, 1).toLocaleDateString(lang, {
        month: "long",
        year: "numeric",
      });
    return new Date(y, m - 1, Number(anchor.split("-")[2])).toLocaleDateString(lang, {
      day: "numeric",
      month: "short",
    });
  }, [period, anchor, lang, t]);

  return (
    <div>
      <h1 className="qf-heading text-2xl text-ink">{t("statistics.title")}</h1>

      {/* Filter bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-1">
          {(["week", "month", "all"] as StatPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-sm ${
                period === p ? "bg-accent text-bg" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t(`statistics.period_${p}`)}
            </button>
          ))}
        </div>
        {period !== "all" && (
          <div className="flex items-center gap-1">
            <button className="qf-btn-ghost" onClick={() => shift(-1)}>‹</button>
            <span className="min-w-[7rem] text-center text-sm text-ink-soft">
              {rangeLabel}
            </span>
            <button className="qf-btn-ghost" onClick={() => shift(1)}>›</button>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="qf-input py-1.5 text-sm"
            >
              <option value="">{t("statistics.allProjects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {goals.length > 0 && (
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="qf-input py-1.5 text-sm"
            >
              <option value="">{t("statistics.allGoals")}</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {res && (
        <>
          {/* Tiles */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label={t("statistics.completionRate")}
              value={res.completionRate == null ? "—" : `${res.completionRate}%`}
            />
            <Tile label={t("statistics.completed")} value={String(res.completed)} />
            <Tile label={t("statistics.missed")} value={String(res.missed)} tone="danger" />
            <Tile label={t("statistics.focusedTotal")} value={secondsToHuman(res.focusedSeconds)} />
          </div>

          {/* Quest completion breakdown */}
          <Card title={t("statistics.completionTitle")} hint={t("statistics.completionHint")}>
            <StackBar
              segments={[
                { value: res.completed, color: C.success, label: t("statistics.completed") },
                { value: res.missed, color: C.danger, label: t("statistics.missed") },
                { value: res.pending, color: C.arcane, label: t("statistics.pending") },
                { value: res.cancelled, color: C.faint, label: t("statistics.cancelled") },
              ]}
            />
          </Card>

          {/* Focus per day + average */}
          <Card title={t("statistics.focusPerDay")}>
            <FocusBars
              data={res.focusByDay}
              avgSeconds={res.avgPerWorkingDaySeconds}
              lang={lang}
            />
            <div className="mt-2 flex justify-between text-xs text-ink-faint">
              <span>{t("statistics.avgPerDayHint")}</span>
              <span className="font-mono text-accent">
                {t("statistics.avgPerDay")}: {secondsToHuman(res.avgPerWorkingDaySeconds)}
              </span>
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Estimate accuracy */}
            <Card title={t("statistics.estimateTitle")}>
              {res.estimate.count === 0 ? (
                <div className="text-sm text-ink-faint">{t("statistics.estEmpty")}</div>
              ) : (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-2xl text-accent">
                      {res.estimate.avgDeltaPct! > 0 ? "+" : ""}
                      {res.estimate.avgDeltaPct}%
                    </span>
                    <span className="text-xs text-ink-faint">
                      {t("statistics.estAvg")} · {t("statistics.estOnN", { n: res.estimate.count })}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span className="text-danger">{t("statistics.over")}: {res.estimate.over}</span>
                    <span className="text-success">{t("statistics.accurate")}: {res.estimate.accurate}</span>
                    <span className="text-arcane">{t("statistics.under")}: {res.estimate.under}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Focus sessions + questionnaire outcomes (#14) */}
            <Card title={t("statistics.sessionsTitle")}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Row label={t("statistics.sesCount")} value={String(res.sessions.count)} />
                <Row label={t("statistics.avgSession")} value={secondsToHuman(res.sessions.avgSeconds)} />
                <Row label={t("statistics.longest")} value={secondsToHuman(res.sessions.longestSeconds)} />
                <Row
                  label={t("statistics.avgDifficulty")}
                  value={res.sessions.avgDifficulty == null ? "—" : `${res.sessions.avgDifficulty}/5`}
                />
              </div>
              {res.sessions.count > 0 && (
                <div className="mt-3">
                  <div className="qf-label mb-1">{t("statistics.progressTitle")}</div>
                  <StackBar
                    segments={[
                      { value: res.sessions.progress.COMPLETED, color: C.success, label: t("statistics.prog_COMPLETED") },
                      { value: res.sessions.progress.SOME, color: C.accent, label: t("statistics.prog_SOME") },
                      { value: res.sessions.progress.NONE, color: C.faint, label: t("statistics.prog_NONE") },
                    ]}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* Focus by project */}
          {res.focusByProject.length > 0 && (
            <Card title={t("statistics.byProjectTitle")}>
              <div className="space-y-2">
                {res.focusByProject.map((p) => {
                  const max = res.focusByProject[0].seconds || 1;
                  return (
                    <div key={p.projectId ?? "none"}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="text-ink-soft">{p.name}</span>
                        <span className="font-mono text-ink-faint">{secondsToHuman(p.seconds)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-bg-soft">
                        <div
                          className="h-full rounded"
                          style={{ width: `${(p.seconds / max) * 100}%`, background: C.arcane }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Stat progression (all-time) */}
      <Card title={t("statistics.statProgression")}>
        {stats.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("statistics.noData")}</div>
        ) : (
          <div className="space-y-3">
            {[...stats].sort((a, b) => b.totalXp - a.totalXp).map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-ink">{s.name}</span>
                  <span className="font-mono text-ink-faint">Lv.{s.level} · {s.totalXp} XP</span>
                </div>
                <ProgressBar value={s.currentXp / xpForLevel(s.level)} height={6} tone="arcane" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* All-time heatmap */}
      <Card title={t("statistics.heatmap")}>
        <Heatmap activity={activity} />
      </Card>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="qf-card mt-4 p-5">
      <div className="qf-label">{title}</div>
      {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="qf-card p-4 text-center">
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-1 font-mono text-xl ${tone === "danger" ? "text-danger" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-faint">{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </div>
  );
}

function StackBar({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div className="text-sm text-ink-faint">—</div>;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((s, i) =>
          s.value > 0 ? (
            <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 text-ink-soft">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="font-mono text-ink-faint">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FocusBars({
  data,
  avgSeconds,
  lang,
}: {
  data: { date: string; seconds: number }[];
  avgSeconds: number;
  lang: string;
}) {
  const max = Math.max(1, avgSeconds, ...data.map((d) => d.seconds));
  const W = 640;
  const H = 120;
  const gap = data.length > 40 ? 1 : 3;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const avgY = H - (avgSeconds / max) * (H - 6);
  const label = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang, { day: "numeric" });
  };
  const fullLabel = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(lang, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };
  const human = (s: number) =>
    s <= 0 ? "0m" : secondsToHuman(s);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full min-w-[520px]">
        {data.map((d, i) => {
          const h = (d.seconds / max) * (H - 6);
          return (
            <g key={d.date}>
              <rect
                x={i * (bw + gap)}
                y={H - h}
                width={bw}
                height={Math.max(d.seconds > 0 ? 2 : 0, h)}
                rx={1.5}
                fill={C.accent}
                opacity={d.seconds > 0 ? 0.85 : 0.12}
              />
              {data.length <= 31 && (
                <text
                  x={i * (bw + gap) + bw / 2}
                  y={H + 12}
                  textAnchor="middle"
                  fontSize="8"
                  fill={C.faint}
                >
                  {label(d.date)}
                </text>
              )}
              {/* Full-column transparent hover target → per-day tooltip. */}
              <rect
                x={i * (bw + gap)}
                y={0}
                width={bw + gap}
                height={H}
                fill="transparent"
                style={{ cursor: "help" }}
              >
                <title>{`${fullLabel(d.date)}: ${human(d.seconds)}`}</title>
              </rect>
            </g>
          );
        })}
        {avgSeconds > 0 && (
          <line x1="0" y1={avgY} x2={W} y2={avgY} stroke={C.arcane} strokeWidth="1" strokeDasharray="4 3" />
        )}
      </svg>
    </div>
  );
}

function Heatmap({ activity }: { activity: Map<string, DailyActivity> }) {
  const weeks = 12;
  const today = todayKey();
  const [ty, tm, td] = today.split("-").map(Number);
  const dow = (new Date(ty, tm - 1, td).getDay() + 6) % 7;
  const start = addDays(addDays(today, -dow), -7 * (weeks - 1));

  const cells: { date: string; mins: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      cells.push({ date, mins: (activity.get(date)?.focusedSeconds ?? 0) / 60 });
    }
  }
  const shade = (m: number) =>
    m <= 0 ? "#272e42" : m < 15 ? "#8a6e38" : m < 45 ? "#b98a34" : m < 90 ? "#d9a441" : "#f0c264";

  const size = 13;
  const gap = 3;
  return (
    <div className="overflow-x-auto">
      <svg width={weeks * (size + gap)} height={7 * (size + gap)} className="min-w-full">
        {cells.map((c, i) => {
          const w = Math.floor(i / 7);
          const d = i % 7;
          const future = c.date > today;
          return (
            <rect
              key={c.date}
              x={w * (size + gap)}
              y={d * (size + gap)}
              width={size}
              height={size}
              rx={2.5}
              fill={future ? "transparent" : shade(c.mins)}
              opacity={future ? 0.2 : 1}
            >
              <title>{`${c.date}: ${Math.round(c.mins)}m`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
