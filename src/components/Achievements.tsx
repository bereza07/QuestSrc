import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { ACHIEVEMENTS } from "@/domain/achievements";

/** Grid of all achievements — built-in + custom (AI-proposed) — dimmed if locked. */
export function Achievements() {
  const t = useT();
  const unlocked = useAppStore((s) => s.achievements);
  const custom = useAppStore((s) => s.customAchievements);
  const unlockedKeys = new Set(unlocked.map((a) => a.key));

  const total = ACHIEVEMENTS.length + custom.length;

  return (
    <section className="qf-card mt-6 p-5">
      <div className="flex items-center justify-between">
        <span className="qf-label">{t("ach.title")}</span>
        <span className="text-xs text-ink-faint">
          {t("ach.unlockedOf", { done: unlockedKeys.size, total })}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACHIEVEMENTS.map((a) => {
          const on = unlockedKeys.has(a.key);
          return (
            <div
              key={a.key}
              className={`rounded-lg border p-3 text-center transition ${
                on ? "border-accent/40 bg-accent/5" : "border-border opacity-45 grayscale"
              }`}
              title={t(`ach.${a.key}_desc`)}
            >
              <div className="text-2xl">{a.icon}</div>
              <div className="mt-1 text-xs font-medium text-ink">{t(`ach.${a.key}_name`)}</div>
              <div className="mt-0.5 text-[10px] text-ink-faint">
                {on ? t(`ach.${a.key}_desc`) : t("ach.locked")}
              </div>
            </div>
          );
        })}
        {custom.map((a) => {
          const on = unlockedKeys.has(a.key);
          return (
            <div
              key={a.key}
              className={`rounded-lg border p-3 text-center transition ${
                on ? "border-arcane/50 bg-arcane/5" : "border-border opacity-45 grayscale"
              }`}
              title={a.description}
            >
              <div className="text-2xl">{a.icon ?? "🎖️"}</div>
              <div className="mt-1 text-xs font-medium text-ink">{a.name}</div>
              <div className="mt-0.5 text-[10px] text-ink-faint">
                {on ? a.description : t("ach.locked")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
