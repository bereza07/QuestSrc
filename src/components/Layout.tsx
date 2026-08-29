import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useThemeStore } from "@/stores/themeStore";
import { useT } from "@/i18n";
import { levelFromTotalXp, levelProgressFraction } from "@/domain/leveling";
import { Toasts } from "./Toasts";
import {
  IconDashboard, IconTasks, IconCalendar, IconGoals, IconCharacter,
  IconStats, IconChat, IconSettings, IconChevronLeft, IconChevronRight,
  IconFlame, IconZap, IconSun, IconMoon, IconMenu,
} from "./icons";

// Sidebar layout with responsive behaviour.
//   - Desktop (≥ md, 768px): a fixed sidebar that can collapse to a 68px rail.
//   - Mobile/tablet (< md): the sidebar hides off-screen; a top bar with a
//     hamburger opens it as a drawer over a backdrop. It auto-closes when the
//     route changes or the user taps the backdrop.
// The sidebar's own content is identical in both modes.

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
  const location = useLocation();
  const character = useAppStore((s) => s.character);
  const streak = useAppStore((s) => s.streak);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  // Desktop-only collapse (persisted). Ignored on mobile — the drawer is
  // always shown at its full width when open there.
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

  // Mobile drawer state. Closes on route change and on Escape.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Live drag offset (px) while a swipe is in progress. Positive = drawer is
  // being pulled RIGHT from -100%. When null, the drawer sits at its resting
  // position dictated by `drawerOpen`. Extracted so a partially-open drag
  // survives re-renders and its transform stays smooth.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const drawerWidthRef = useRef(260);
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  // Prevent body scroll behind the drawer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = drawerOpen ? "hidden" : prev;
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  // Edge-swipe / drag gestures for the drawer. Uses pointer events so it also
  // works for mouse drags (dev/testing). Only reacts to touch/pen on mobile
  // widths — desktop has its own sidebar. Rules:
  //   - Drawer CLOSED: touchstart within ~24px of the left edge = start pull.
  //     Follow the finger up to the drawer width. On release, snap open if
  //     dragged past 40% OR fast right-swipe.
  //   - Drawer OPEN: touchstart anywhere on the drawer surface = start drag
  //     left. Follow the finger; on release, snap closed if dragged past 40%
  //     OR fast left-swipe.
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    startOpen: boolean;
    active: boolean;
    horizontal: boolean;
    pointerId: number;
  } | null>(null);

  function isMobileViewport(): boolean {
    // Match the md breakpoint (768px) used everywhere else.
    return typeof window !== "undefined" && window.innerWidth < 768;
  }

  function onGlobalPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isMobileViewport()) return;
    // Only touch/pen; mouse drags on desktop are noise.
    if (e.pointerType === "mouse") return;
    const closedEdge = !drawerOpen && e.clientX <= 24;
    const openOnDrawer = drawerOpen && e.clientX <= drawerWidthRef.current;
    if (!closedEdge && !openOnDrawer) return;
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      startOpen: drawerOpen,
      active: false,
      horizontal: false,
      pointerId: e.pointerId,
    };
  }

  function onGlobalPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    // Direction lock — decide horizontal vs vertical after ~8 px of movement.
    if (!g.horizontal && !g.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        g.horizontal = true;
        g.active = true;
      } else {
        // Vertical scroll — abandon the gesture and let the page scroll.
        gestureRef.current = null;
        return;
      }
    }
    if (!g.active) return;
    const w = drawerWidthRef.current;
    // Resting offset: -w when closed, 0 when open. Clamp to [-w, 0].
    const raw = g.startOpen ? dx : dx - 0; // when open, dx negative = closing
    const closedStart = -w;
    const nextOffset = g.startOpen
      ? Math.max(closedStart, Math.min(0, dx)) // open: 0..-w
      : Math.max(closedStart, Math.min(0, closedStart + Math.max(0, raw))); // closed: -w..0
    setDragOffset(nextOffset);
  }

  function onGlobalPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gestureRef.current = null;
    if (!g.active) {
      setDragOffset(null);
      return;
    }
    const w = drawerWidthRef.current;
    const dx = e.clientX - g.startX;
    const dt = Math.max(1, e.timeStamp - g.startTime);
    const velocity = dx / dt; // px per ms
    if (g.startOpen) {
      // Snap closed on fast left-swipe or >40% pulled left.
      const shouldClose = velocity < -0.5 || dx < -w * 0.4;
      setDrawerOpen(!shouldClose);
    } else {
      // Snap open on fast right-swipe or >40% pulled right.
      const shouldOpen = velocity > 0.5 || dx > w * 0.4;
      setDrawerOpen(shouldOpen);
    }
    // Clear the drag offset on the next tick so the CSS transition takes over
    // for the snap. Without the microtask defer, React can flush both changes
    // in the same commit and the transition doesn't animate. setTimeout works
    // even when rAF is throttled (hidden tab / background pane).
    setTimeout(() => setDragOffset(null), 0);
  }

  // Live drawer transform while dragging, otherwise let the CSS class dictate.
  const drawerTransform =
    dragOffset != null
      ? `translateX(${dragOffset}px)`
      : undefined;
  // Backdrop opacity tracks drag progress so the scrim fades in with the pull.
  const backdropOpacity =
    dragOffset != null
      ? Math.max(0, Math.min(1, 1 + dragOffset / drawerWidthRef.current))
      : undefined;

  const progress = character ? levelFromTotalXp(character.totalXp) : null;
  const xpPct = progress ? Math.round(levelProgressFraction(progress) * 100) : 0;

  // On mobile the drawer forces the full 260px look regardless of collapse.
  const drawerContent = (
    <SidebarContent
      collapsed={false}
      t={t}
      character={character}
      streak={streak}
      progress={progress}
      xpPct={xpPct}
      theme={theme}
      toggleTheme={toggleTheme}
      onToggleCollapse={undefined}
    />
  );

  const drawerDragging = dragOffset != null;

  return (
    <div
      className="flex h-full min-h-screen bg-bg text-fg"
      onPointerDown={onGlobalPointerDown}
      onPointerMove={onGlobalPointerMove}
      onPointerUp={onGlobalPointerUp}
      onPointerCancel={onGlobalPointerUp}
    >
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? 68 : 260 }}
      >
        <SidebarContent
          collapsed={collapsed}
          t={t}
          character={character}
          streak={streak}
          progress={progress}
          xpPct={xpPct}
          theme={theme}
          toggleTheme={toggleTheme}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Mobile drawer + backdrop. Backdrop is visible whenever the drawer is
          open OR partially dragged; opacity tracks the pull. */}
      {(drawerOpen || drawerDragging) && (
        <button
          type="button"
          aria-label={t("nav.closeMenu")}
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          style={backdropOpacity != null ? { opacity: backdropOpacity } : undefined}
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-2xl ${
          drawerDragging ? "" : "transition-transform duration-200 ease-out"
        } ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-hidden={!drawerOpen}
        style={{
          paddingTop: "env(safe-area-inset-top, 0)",
          paddingLeft: "env(safe-area-inset-left, 0)",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
          ...(drawerTransform ? { transform: drawerTransform } : {}),
        }}
      >
        {drawerContent}
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile top bar. `paddingTop` respects the iOS status bar / Android
            gesture area so the hamburger + avatar sit BELOW system chrome. */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-bg/90 px-3 pb-2 backdrop-blur"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0) + 0.5rem)" }}
        >
          <button
            type="button"
            aria-label={t("nav.openMenu")}
            onClick={() => setDrawerOpen(true)}
            // 44×44 hit area matches Apple HIG / Material touch target minimum.
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-fg-2 hover:bg-surface hover:text-fg active:bg-surface-2"
          >
            <IconMenu size={20} />
          </button>
          <NavLink to="/character" className="flex min-w-0 flex-1 items-center gap-2 py-1">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[11px] font-semibold text-accent-fg"
              style={{ background: "var(--accent)" }}
            >
              {character?.avatar ? (
                <img src={character.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                (character?.name ?? "?").slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="truncate text-sm font-medium text-fg">{character?.name ?? "QuestForge"}</div>
          </NavLink>
          {progress && (
            <span className="font-mono text-[11px] text-fg-3">Lv.{progress.level}</span>
          )}
        </div>

        {/* Page container. Padding scales with viewport so mobile users get more
            usable width; desktop keeps the roomy layout. */}
        <div
          key={location.pathname}
          className="mx-auto max-w-5xl animate-fade-in px-4 py-4 md:px-8 md:py-8"
        >
          <Outlet />
        </div>
      </main>

      <Toasts />
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  t: ReturnType<typeof useT>;
  character: ReturnType<typeof useAppStore.getState>["character"];
  streak: ReturnType<typeof useAppStore.getState>["streak"];
  progress: ReturnType<typeof levelFromTotalXp> | null;
  xpPct: number;
  theme: "light" | "dark";
  toggleTheme: () => void;
  /** Undefined = we're in the mobile drawer (no collapse control there). */
  onToggleCollapse: (() => void) | undefined;
}

function SidebarContent({
  collapsed,
  t,
  character,
  streak,
  progress,
  xpPct,
  theme,
  toggleTheme,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <>
      <NavLink
        to="/character"
        className={`flex items-center gap-3 border-b border-border px-4 py-4 shrink-0 transition-colors hover:bg-surface ${
          collapsed ? "justify-center px-2" : ""
        }`}
        title={character?.name}
      >
        <div
          className="shrink-0 flex h-10 w-10 items-center justify-center overflow-hidden rounded-md text-sm font-semibold text-accent-fg"
          style={{ background: "var(--accent)" }}
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
      </NavLink>

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

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? t("nav.expand") : t("nav.collapse")}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-fg-3 transition-colors hover:bg-surface hover:text-fg ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {collapsed ? <IconChevronRight size={17} /> : <IconChevronLeft size={17} />}
            {!collapsed && <span>{t("nav.collapse")}</span>}
          </button>
        )}
      </div>

    </>
  );
}
