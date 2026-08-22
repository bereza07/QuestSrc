import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import { Modal } from "@/components/Modal";
import { secondsToHuman } from "@/utils/date";
import type { WorkSession } from "@/types";

type Range = "today" | "thisWeek" | "thisMonth";

function rangeStartIso(range: Range): string {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === "thisWeek") {
    const dow = (now.getDay() + 6) % 7; // Monday-based
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    return d.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function FocusHistoryModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const repos = useAppStore((s) => s.repos);
  const activeTasks = useAppStore((s) => s.activeTasks);

  const [range, setRange] = useState<Range>("today");
  const [sessions, setSessions] = useState<WorkSession[]>([]);

  useEffect(() => {
    if (!repos) return;
    repos.workSessions.list({ since: rangeStartIso(range) }).then(setSessions);
  }, [repos, range]);

  const stats = useMemo(() => {
    const total = sessions.reduce((a, s) => a + s.durationSeconds, 0);
    const count = sessions.length;
    const longest = sessions.reduce((a, s) => Math.max(a, s.durationSeconds), 0);
    return { total, count, average: count ? total / count : 0, longest };
  }, [sessions]);

  const taskTitle = (id: string | null) =>
    activeTasks.find((tk) => tk.id === id)?.title ?? t("timer.noQuest");

  return (
    <Modal title={t("timer.history")} onClose={onClose} wide>
      <div className="inline-flex rounded-lg border border-border p-1">
        {(["today", "thisWeek", "thisMonth"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1 text-sm ${
              range === r ? "bg-accent text-accent-fg" : "text-fg-2 hover:text-fg"
            }`}
          >
            {t(`timer.${r}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("timer.total")} value={secondsToHuman(stats.total)} />
        <Stat label={t("timer.sessions")} value={String(stats.count)} />
        <Stat label={t("timer.average")} value={secondsToHuman(stats.average)} />
        <Stat label={t("timer.longest")} value={secondsToHuman(stats.longest)} />
      </div>

      <div className="mt-5 space-y-1">
        {sessions.length === 0 && (
          <div className="py-8 text-center text-sm text-fg-3">
            {t("timer.noSessions")}
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-fg">{taskTitle(s.taskId)}</div>
              <div className="text-xs text-fg-3">
                {new Date(s.startedAt).toLocaleString(lang, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {t(`timer.${s.mode.toLowerCase()}`)}
              </div>
            </div>
            <div className="font-mono text-sm text-accent">
              {secondsToHuman(s.durationSeconds)}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className="mt-1 font-mono text-lg text-fg">{value}</div>
    </div>
  );
}
