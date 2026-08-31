import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useTimerStore } from "@/stores/timerStore";
import { scheduleStartupCheck } from "@/services/system/desktopUpdater";
import { TimerRecoveryModal } from "@/features/focus-timer/TimerRecoveryModal";
import { useT } from "@/i18n";
import { Layout } from "@/components/Layout";
import { Welcome } from "@/pages/Welcome";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Character } from "@/pages/Character";
import { Settings } from "@/pages/Settings";
import { Goals } from "@/pages/Goals";
import { Calendar } from "@/pages/Calendar";
import { Assistant } from "@/pages/Assistant";
import { Statistics } from "@/pages/Statistics";

function Splash({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-3">
      <div className="qf-heading text-2xl text-accent">QuestForge</div>
      <div className="text-sm text-fg-3">{message}</div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const t = useT();
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="qf-heading text-2xl text-danger">
        {t("app.dbUnavailableTitle")}
      </div>
      <p className="max-w-md text-sm text-fg-2">{error}</p>
      <p className="max-w-md text-xs text-fg-3">{t("app.dbUnavailableHint")}</p>
    </div>
  );
}

export default function App() {
  const t = useT();
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
    // In the desktop app, quietly check GitHub Releases 5 s after launch and
    // surface any update via the Settings → Updates card. No-op on web/PWA.
    scheduleStartupCheck(5000);
  }, [init]);

  useEffect(() => {
    if (status === "ready") void useTimerStore.getState().init();
  }, [status]);

  if (status === "loading") return <Splash message={t("app.loading")} />;
  if (status === "error")
    return <ErrorScreen error={error ?? t("app.dbUnavailableBody")} />;
  if (status === "needs-onboarding") return <Welcome />;

  return (
    <>
      <TimerRecoveryModal />
      <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="goals" element={<Goals />} />
        <Route path="character" element={<Character />} />
        <Route path="settings" element={<Settings />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="assistant" element={<Assistant />} />
      </Route>
      </Routes>
    </>
  );
}
