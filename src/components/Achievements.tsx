import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { ACHIEVEMENTS } from "@/domain/achievements";
import {
  IconTrophy,
  IconFlame,
  IconStar,
  IconBook,
  IconTarget,
  IconZap,
  IconCheck,
  type IconProps,
} from "@/components/icons";
import type { ComponentType } from "react";

// Map built-in achievement keys → real vector icons (no emoji anywhere).
const BUILTIN_ICON: Record<string, ComponentType<IconProps>> = {
  first_quest:  IconStar,
  ten_quests:   IconCheck,
  fifty_quests: IconTrophy,
  boss_slayer:  IconTarget,
  week_warrior: IconFlame,
  unstoppable:  IconFlame,
  deep_work:    IconBook,
  level_five:   IconZap,
};

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
        <span className="text-xs text-fg-3">
          {t("ach.unlockedOf", { done: unlockedKeys.size, total })}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACHIEVEMENTS.map((a) => {
          const on = unlockedKeys.has(a.key);
          const Icon = BUILTIN_ICON[a.key] ?? IconTrophy;
          return (
            <div
              key={a.key}
              className={`rounded-md border p-3 text-center transition ${
                on ? "border-accent bg-accent-bg" : "border-border opacity-50"
              }`}
              title={t(`ach.${a.key}_desc`)}
            >
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center ${
                  on ? "text-accent" : "text-fg-3"
                }`}
              >
                <Icon size={20} />
              </div>
              <div className="mt-1 text-xs font-medium text-fg">
                {t(`ach.${a.key}_name`)}
              </div>
              <div className="mt-0.5 text-[10px] text-fg-3">
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
              className={`rounded-md border p-3 text-center transition ${
                on ? "border-accent bg-accent-bg" : "border-border opacity-50"
              }`}
              title={a.description}
            >
              <div
                className={`mx-auto flex h-8 w-8 items-center justify-center ${
                  on ? "text-accent" : "text-fg-3"
                }`}
              >
                <IconTrophy size={20} />
              </div>
              <div className="mt-1 text-xs font-medium text-fg">{a.name}</div>
              <div className="mt-0.5 text-[10px] text-fg-3">
                {on ? a.description : t("ach.locked")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
