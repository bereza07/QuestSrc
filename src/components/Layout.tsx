import { NavLink, Outlet } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { levelFromTotalXp, levelProgressFraction } from "@/domain/leveling";
import { ProgressBar } from "./ProgressBar";
import { Toasts } from "./Toasts";
import {
  IconDashboard,
  IconTasks,
  IconCalendar,
  IconGoals,
  IconCharacter,
  IconStats,
  IconChat,
  IconSettings,
} from "./icons";

const nav = [
  { to: "/", key: "nav.dashboard", icon: IconDashboard, end: true },
  { to: "/tasks", key: "nav.tasks", icon: IconTasks },
  { to: "/calendar", key: "nav.calendar", icon: IconCalendar },
  { to: "/goals", key: "nav.goals", icon: IconGoals },
  { to: "/character", key: "nav.character", icon: IconCharacter },
  { to: "/statistics", key: "nav.statistics", icon: IconStats },
  { to: "/assistant", key: "nav.assistant", icon: IconChat },
  { to: "/settings", key: "nav.settings", icon: IconSettings },
];

export function Layout() {
  const t = useT();
  const character = useAppStore((s) => s.character);
  const progress = character ? levelFromTotalXp(character.totalXp) : null;

  return (
    <div className="flex h-full min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-soft/50">
        <div className="px-5 py-6">
          <div className="qf-heading text-xl text-accent-glow">QuestForge</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            {t("nav.questLog")}
          </div>
        </div>

        <nav className="flex-1 px-3">
          {nav.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-bg-card text-ink shadow-card"
                    : "text-ink-soft hover:bg-bg-card/60 hover:text-ink"
                }`
              }
            >
              <Icon size={18} />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        {character && progress && (
          <div className="border-t border-border p-4">
            <div className="flex items-baseline justify-between">
              <span className="truncate text-sm font-medium text-ink">
                {character.name}
              </span>
              <span className="text-xs text-ink-faint">
                {t("dashboard.levelWord")} {progress.level}
              </span>
            </div>
            <ProgressBar
              className="mt-2"
              value={levelProgressFraction(progress)}
              height={6}
            />
            <div className="mt-1 text-right text-[11px] font-mono text-ink-faint">
              {progress.currentXp} / {progress.requiredXp} XP
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>

      <Toasts />
    </div>
  );
}
