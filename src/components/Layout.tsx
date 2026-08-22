import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useThemeStore } from "@/stores/themeStore";
import { useT } from "@/i18n";
import { levelFromTotalXp, levelProgressFraction } from "@/domain/leveling";
import { Toasts } from "./Toasts";
import {
  IconDashboard, IconTasks, IconCalendar, IconGoals, IconCharacter,
  IconStats, IconChat, IconSettings, IconChevronLeft, IconChevronRight,
  IconFlame, IconZap, IconSun, IconMoon,
} from "./icons";

// Left sidebar layout, redesigned per the new visual system.
//   - Warm cream / warm-dark palette (see index.css).
//   - Collapsible to a 52px icon rail.
//   - Persistent theme toggle in the footer.
//   - Header shows the user's avatar/initials, name, level, and thin XP bar.
//   - Streak + total XP pills sit under the header when expanded.

const nav = [
  { to: "/",            key: "nav.dashboard",  icon: IconDashboard, end: true },
  { to: "/tasks",       key: "nav.tasks",      icon: IconTasks },
  { to: "/calendar",    key: "nav.calendar",   icon: IconCalendar },
  { to: "/goals",       key: "nav.goals",      icon: IconGoals },
  { to: "/character",   key: "nav.character",  icon: IconCharacter },
  { to: "/statistics",  key: "nav.statistics", icon: IconStats },
  { to: "/assistant",   key: "nav.assistant",  icon: IconChat },
];

const COLLAPSE_KEY = "qf.sidebar.collapsed";

export function Layout() {
  const t = useT();
  const character = useAppStore((s) => s.character);
  const streak = useAppStore((s) => s.streak);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  const progress = character ? levelFromTotalXp(character.totalXp) : null;
  const xpPct = progress ? Math.round(levelProgressFraction(progress) * 100) : 0;

  return (
    <div className="flex h-full min-h-screen bg-bg text-fg">
      <aside
        className="flex shrink-0 flex-col border-r border-border bg-sidebar"
        style={{ width: collapsed ? 68 : 260 }}
      >
        {/* Header: avatar + name + XP bar. Fixed min-height so collapsing the
            streak/xp pills below never causes the header to jump. */}
        <div
          className={`flex items-center gap-3 border-b border-border px-4 py-4 shrink-0 ${
            collapsed ? "justify-center px-2" : ""
          }`}
        >
          <div
            className="shrink-0 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md text-sm font-semibold text-accent-fg"
            style={{ background: "var(--accent)" }}
            title={character?.name}
          >
            {character?.avatar ? (
              <img src={character.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (character?.name ?? "?").slice(0, 2).toUpperCase()
            )}
          </div>
          {!collapsed && character && progress && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium leading-tight text-fg">
                {character.name}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-fg-3">
                  Lv.{progress.level}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${xpPct}%`, background: "var(--accent)" }}
                  />
                </div>
                <span className="font-mono text-[11px] text-fg-3">{xpPct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Streak + total XP pills — always rendered so collapsing doesn't
            change the sidebar's vertical layout. When collapsed, we show a
            compact stack of two icon-only chips centered in the rail. */}
        {character && (
          <div
            className={`flex shrink-0 border-b border-border py-2 ${
              collapsed ? "flex-col items-center gap-1.5 px-1" : "flex-row gap-2 px-4"
            }`}
          >
            <div
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              title={`${streak?.current ?? 0} day streak`}
            >
              <IconFlame size={12} />
              {!collapsed && <span className="font-mono">{streak?.current ?? 0}d</span>}
            </div>
            <div
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs"
              style={{ background: "var(--surface-2)", color: "var(--fg-2)" }}
              title={`${character.totalXp.toLocaleString()} XP total`}
            >
              <IconZap size={12} />
              {!collapsed && (
                <span className="font-mono">{character.totalXp.toLocaleString()} XP</span>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {nav.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? t(key) : undefined}
              className={({ isActive }) =>
                `mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors duration-100 ${
                  isActive
                    ? "bg-surface text-fg"
                    : "text-fg-2 hover:bg-surface hover:text-fg"
                } ${collapsed ? "justify-center px-0" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`shrink-0 ${isActive ? "text-accent" : ""}`}>
                    <Icon size={17} />
                  </span>
                  {!collapsed && <span>{t(key)}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer: settings / theme / collapse */}
        <div className="flex flex-col gap-0.5 border-t border-border px-2 py-2 shrink-0">
          <NavLink
            to="/settings"
            title={collapsed ? t("nav.settings") : undefined}
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-fg-2 transition-colors hover:bg-surface hover:text-fg ${
                isActive ? "bg-surface text-fg" : ""
              } ${collapsed ? "justify-center px-0" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? "text-accent" : ""}>
                  <IconSettings size={17} />
                </span>
                {!collapsed && <span>{t("nav.settings")}</span>}
              </>
            )}
          </NavLink>

          <button
            onClick={toggleTheme}
            title={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-fg-2 transition-colors hover:bg-surface hover:text-fg ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
            {!collapsed && (
              <span>{theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}</span>
            )}
          </button>

          <button
            onClick={toggleCollapse}
            title={collapsed ? t("nav.expand") : t("nav.collapse")}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-fg-3 transition-colors hover:bg-surface hover:text-fg ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {collapsed ? <IconChevronRight size={17} /> : <IconChevronLeft size={17} />}
            {!collapsed && <span>{t("nav.collapse")}</span>}
          </button>
        </div>
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
