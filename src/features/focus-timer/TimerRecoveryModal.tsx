import { useTimerStore } from "@/stores/timerStore";
import { useT, useI18nStore } from "@/i18n";
import { Modal } from "@/components/Modal";

/** Shown once at startup if an active timer was persisted (spec §75). */
export function TimerRecoveryModal() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const recovery = useTimerStore((s) => s.recovery);
  const recoveryResume = useTimerStore((s) => s.recoveryResume);
  const recoveryStopSave = useTimerStore((s) => s.recoveryStopSave);
  const recoveryDiscard = useTimerStore((s) => s.recoveryDiscard);

  if (!recovery) return null;

  const time = new Date(recovery.startedAt).toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Modal title={t("timer.recoveryTitle")} onClose={() => void recoveryDiscard()}>
      <p className="text-sm text-ink-soft">{t("timer.recoveryBody", { time })}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button className="qf-btn-primary justify-center" onClick={() => void recoveryResume()}>
          {t("timer.recoveryResume")}
        </button>
        <button className="qf-btn-ghost justify-center" onClick={() => void recoveryStopSave()}>
          {t("timer.recoveryStopSave")}
        </button>
        <button className="qf-btn-ghost justify-center" onClick={() => void recoveryDiscard()}>
          {t("timer.recoveryDiscard")}
        </button>
      </div>
    </Modal>
  );
}
