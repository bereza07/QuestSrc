import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import { levelFromTotalXp, levelProgressFraction } from "@/domain/leveling";
import { TaskItem } from "@/components/TaskItem";
import { TimerWidget } from "@/features/focus-timer/TimerWidget";
import { IconTarget, IconFlame, IconZap, IconTimer } from "@/components/icons";
import { todayKey, addDays } from "@/utils/date";
import type { DailyActivity } from "@/data/repositories/activityRepo";

// Redesigned dashboard. Layout mirrors the new mock:
//   - Top: page title + date, pill row with streak / XP-this-level.
//   - Grid: [main quest (2col)] [character card row-span-2] [today's quests] [focus timer]
//   - Bottom: focus last 14 days mini heatmap.
// Data is all real — no mocks. Everything comes from stores + repos.

export function Dashboard() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const character = useAppStore((s) => s.character);
  const todayTasks = useAppStore((s) => s.todayTasks);
  const mainQuest = useAppStore((s) => s.mainQuest);
  const recentXp = useAppStore((s) => s.recentXp);
  const streak = useAppStore((s) => s.streak);
  const repos = useAppStore((s) => s.repos);

  const [activity, setActivity] = useState<Map<string, DailyActivity>>(new Map());
  useEffect(() => {
    if (!repos) return;
    void repos.activity.listRecent(14).then((rows) => {
      setActivity(new Map(rows.map((r) => [r.date, r])));
    });
  }, [repos]);

  const last14 = useMemo(() => {
    const today = todayKey();
    return Array.from({ length: 14 }, (_, i) => addDays(today, -(13 - i)));
  }, []);
  const focusByDay = last14.map((d) => (activity.get(d)?.focusedSeconds ?? 0) / 60);
  const todayFocus = focusByDay[focusByDay.length - 1];
  const focusMax = Math.max(1, ...focusByDay);

  if (!character) return null;
  const progress = levelFromTotalXp(character.totalXp);

  const open = todayTasks.filter((x) => x.status === "TODO" || x.status === "IN_PROGRESS");
  const doneToday = todayTasks.filter((x) => x.status === "COMPLETED");
  const dateStr = new Date().toLocaleDateString(lang, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">{t("nav.dashboard")}</h1>
          <p className="mt-0.5 text-sm text-fg-3">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-fg-2">
            <IconFlame size={14} className="text-accent" />
            <span className="font-mono font-medium text-fg">{streak?.current ?? 0}</span>
            <span>{t("dashboard.dayStreakUnit")}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-sm text-fg-2">
            <IconZap size={14} className="text-accent" />
            <span className="font-mono font-medium text-fg">
              {progress.currentXp.toLocaleString()}
            </span>
            <span>{t("dashboard.xpThisLevel")}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr 320px" }}>
        {/* Main goal — spans two columns of the left/middle. */}
        <div className="qf-card col-span-2 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <IconTarget size={14} className="text-accent" />
                <span className="qf-label">{t("dashboard.mainQuest")}</span>
              </div>
              {mainQuest ? (
                <>
                  <h2 className="truncate text-base font-semibold text-fg">
                    {mainQuest.title}
                  </h2>
                  {mainQuest.description && (
                    <p className="mt-0.5 text-sm text-fg-2">{mainQuest.description}</p>
                  )}
                </>
              ) : (
                <div className="text-sm text-fg-3">{t("dashboard.noMainQuest")}</div>
              )}
            </div>
            {mainQuest && (
              <Link
                to="/goals"
                className="shrink-0 text-xs text-accent hover:underline"
              >
                {t("common.manage")}
              </Link>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.round(levelProgressFraction(progress) * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>

        {/* Character card — spans two rows on the right. */}
        <div className="qf-card row-span-2 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-lg text-xl font-semibold text-accent-fg"
              style={{ background: "var(--accent)" }}
            >
              {character.avatar ? (
                <img src={character.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                character.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-fg">{character.name}</div>
              {character.characterClass && (
                <div className="truncate text-xs text-fg-2">{character.characterClass}</div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-xs text-fg-3">
                  {t("dashboard.levelWord")} {progress.level}
                </span>
                <span className="font-mono text-xs text-fg-3">
                  {progress.currentXp} / {progress.requiredXp}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(levelProgressFraction(progress) * 100)}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Tile label={t("dashboard.totalXp")} value={character.totalXp.toLocaleString()} />
              <Tile label={t("dashboard.dayStreakShort")} value={String(streak?.current ?? 0)} />
            </div>
          </div>

          <div className="mt-5">
            <div className="qf-label mb-2">{t("dashboard.recentXp")}</div>
            <div className="space-y-2">
              {recentXp.length === 0 ? (
                <div className="text-xs text-fg-3">{t("dashboard.completeToEarn")}</div>
              ) : (
                recentXp.slice(0, 6).map((x) => (
                  <div key={x.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-fg">{x.reason}</div>
                      <div className="truncate text-[11px] text-fg-3">
                        {new Date(x.createdAt).toLocaleTimeString(lang, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-xs text-accent">+{x.amount}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Focus last 14 days — inline heatmap bars, mini card. */}
        <div className="qf-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">{t("dashboard.focusLast14")}</h3>
            <span className="font-mono text-xs text-fg-3">
              {Math.round(todayFocus ?? 0)}m
            </span>
          </div>
          <div className="flex h-12 items-end gap-1">
            {focusByDay.map((v, i) => {
              const h = Math.max(2, (v / focusMax) * 48);
              const isToday = i === focusByDay.length - 1;
              return (
                <div key={i} className="flex flex-1 items-end" title={`${Math.round(v)}m`}>
                  <div
                    className="w-full rounded-sm transition-[height] duration-300"
                    style={{
                      height: h,
                      background: isToday
                        ? "var(--accent)"
                        : v === 0
                          ? "var(--surface-2)"
                          : "color-mix(in srgb, var(--accent) 45%, transparent)",
                      opacity: v === 0 ? 0.5 : 1,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-fg-3">
            <span>{t("dashboard.daysAgo", { n: 14 })}</span>
            <span>{t("dashboard.today")}</span>
          </div>
        </div>

        {/* Focus timer */}
        <div className="qf-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <IconTimer size={14} className="text-fg-3" />
            <h3 className="text-sm font-semibold text-fg">{t("dashboard.focusTimer")}</h3>
          </div>
          <TimerWidget />
        </div>
      </div>

      {/* Today's quests — full width below so the list is easy to read. */}
      <div className="qf-card mt-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">{t("dashboard.todaysQuests")}</h3>
          <span className="font-mono text-xs text-fg-3">
            {doneToday.length}/{todayTasks.length} {t("dashboard.doneShort")}
          </span>
        </div>
        {todayTasks.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-3">
            {t("dashboard.noQuestsToday")}
            <div className="mt-3">
              <Link to="/tasks" className="qf-btn-primary">
                {t("dashboard.planQuest")}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {open.map((x) => <TaskItem key={x.id} task={x} />)}
            {doneToday.map((x) => <TaskItem key={x.id} task={x} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-2.5">
      <div className="font-mono text-base font-semibold text-fg">{value}</div>
      <div className="mt-0.5 text-xs text-fg-3">{label}</div>
    </div>
  );
}
