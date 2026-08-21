import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { levelFromTotalXp, levelProgressFraction } from "@/domain/leveling";
import { ProgressBar } from "@/components/ProgressBar";
import { TaskItem } from "@/components/TaskItem";
import { TimerWidget } from "@/features/focus-timer/TimerWidget";
import { IconGoals, IconFlame } from "@/components/icons";
import { todayKey, secondsToHuman } from "@/utils/date";

export function Dashboard() {
  const t = useT();
  const character = useAppStore((s) => s.character);
  const todayTasks = useAppStore((s) => s.todayTasks);
  const mainQuest = useAppStore((s) => s.mainQuest);
  const recentXp = useAppStore((s) => s.recentXp);
  const streak = useAppStore((s) => s.streak);

  if (!character) return null;
  const progress = levelFromTotalXp(character.totalXp);

  const open = todayTasks.filter(
    (t) => t.status === "TODO" || t.status === "IN_PROGRESS",
  );
  const doneToday = todayTasks.filter((t) => t.status === "COMPLETED");

  const today = todayKey();
  const xpToday = recentXp
    .filter((x) => x.createdAt.slice(0, 10) === today)
    .reduce((sum, x) => sum + x.amount, 0);

  return (
    <div className="space-y-6">
      {/* Character banner */}
      <section className="qf-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="qf-heading text-2xl text-ink">{character.name}</div>
            <div className="mt-0.5 text-sm text-ink-soft">
              {t("dashboard.levelWord")} {progress.level}
              {character.characterClass ? ` · ${character.characterClass}` : ""}
            </div>
          </div>
          {streak && (streak.current > 0 || streak.isRestDay) ? (
            <div
              className="flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-sm text-warn"
              title={t("dashboard.freezesLeft", { n: streak.freezesRemaining })}
            >
              <IconFlame size={15} />
              <span className="font-medium">
                {streak.isRestDay && streak.current === 0
                  ? t("dashboard.restDayToday")
                  : t("dashboard.dayStreak", { n: streak.current })}
              </span>
            </div>
          ) : (
            <div className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-ink-faint">
              {t("dashboard.noStreak")}
            </div>
          )}
        </div>
        <div className="mt-5">
          <ProgressBar value={levelProgressFraction(progress)} height={12} />
          <div className="mt-1.5 flex justify-between text-xs font-mono text-ink-faint">
            <span>{progress.currentXp} / {progress.requiredXp} XP</span>
            <span>{character.totalXp} {t("common.total")}</span>
          </div>
        </div>
      </section>

      {mainQuest && (
        <section className="qf-card p-5">
          <div className="flex items-center gap-2 text-accent">
            <IconGoals size={16} />
            <span className="qf-label text-accent">{t("dashboard.mainQuest")}</span>
          </div>
          <div className="mt-2 qf-heading text-lg text-ink">
            {mainQuest.title}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Today's quests */}
        <section className="qf-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="qf-label">{t("dashboard.todaysQuests")}</span>
            <Link to="/tasks" className="text-xs text-accent hover:underline">
              {t("common.manage")}
            </Link>
          </div>

          <div className="mt-3">
            {open.length === 0 && doneToday.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-faint">
                {t("dashboard.noQuestsToday")}
                <div className="mt-3">
                  <Link to="/tasks" className="qf-btn-primary">
                    {t("dashboard.planQuest")}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                {open.map((t) => (
                  <TaskItem key={t.id} task={t} />
                ))}
                {doneToday.map((t) => (
                  <TaskItem key={t.id} task={t} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Focus timer + today at a glance + recent XP */}
        <section className="space-y-6">
          <TimerWidget />

          {streak && (
            <div className="qf-card p-5">
              <span className="qf-label">
                {streak.goal.mode === "TIME"
                  ? t("dashboard.dailyFocus")
                  : t("dashboard.dailyXp")}
              </span>
              {(() => {
                const isTime = streak.goal.mode === "TIME";
                const goalUnits = isTime ? streak.goal.value * 60 : streak.goal.value;
                const current = isTime ? streak.focusedSeconds : streak.xpEarned;
                const frac = goalUnits > 0 ? current / goalUnits : 0;
                const remaining = Math.max(0, goalUnits - current);
                return (
                  <div className="mt-3">
                    <ProgressBar value={frac} height={10} />
                    <div className="mt-1.5 flex justify-between text-xs font-mono text-ink-faint">
                      <span>
                        {isTime
                          ? `${secondsToHuman(current)} / ${secondsToHuman(goalUnits)}`
                          : `${streak.xpEarned} / ${streak.goal.value} XP`}
                      </span>
                      {streak.goalMet ? (
                        <span className="text-success">🔥 {t("dashboard.goalMet")}</span>
                      ) : (
                        <span>
                          {isTime
                            ? t("dashboard.remainingMin", { n: Math.ceil(remaining / 60) })
                            : t("dashboard.remainingXp", { n: remaining })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="qf-card p-5">
            <span className="qf-label">{t("dashboard.today")}</span>
            <div className="mt-3 space-y-3">
              <Metric label={t("dashboard.questsDone")} value={`${doneToday.length}`} />
              <Metric label={t("dashboard.remaining")} value={`${open.length}`} />
              <Metric label={t("dashboard.xpEarned")} value={`${xpToday}`} accent />
            </div>
          </div>

          <div className="qf-card p-5">
            <span className="qf-label">{t("dashboard.recentXp")}</span>
            <div className="mt-3 space-y-2">
              {recentXp.length === 0 ? (
                <div className="text-xs text-ink-faint">
                  {t("dashboard.completeToEarn")}
                </div>
              ) : (
                recentXp.slice(0, 6).map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-ink-soft">{x.reason}</span>
                    <span className="ml-2 shrink-0 font-mono text-accent">
                      +{x.amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-soft">{label}</span>
      <span
        className={`font-mono text-lg ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
