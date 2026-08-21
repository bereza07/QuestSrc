import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore } from "@/i18n";
import type { Stat, XpTransaction } from "@/types";
import { levelFromTotalXp, xpForLevel } from "@/domain/leveling";
import { ProgressBar } from "@/components/ProgressBar";
import { IconPlus } from "@/components/icons";
import { STAT_SOFT_CAP } from "@/services/character/statService";
import { Achievements } from "@/components/Achievements";
import { relativeDayLabel } from "@/utils/date";

export function Character() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const character = useAppStore((s) => s.character);
  const stats = useAppStore((s) => s.stats);
  const repos = useAppStore((s) => s.repos);
  const createStat = useAppStore((s) => s.createStat);
  const refresh = useAppStore((s) => s.refresh);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Stat | null>(null);
  const [recent, setRecent] = useState<XpTransaction[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (selected && repos) {
      repos.xp.listForStat(selected.id, 12).then((rows) => {
        if (!cancelled) setRecent(rows);
      });
    } else {
      setRecent([]);
    }
    return () => {
      cancelled = true;
    };
  }, [selected, repos]);

  if (!character) return null;
  const progress = levelFromTotalXp(character.totalXp);

  async function addStat() {
    setError(null);
    try {
      await createStat(newName, newDesc || undefined);
      setNewName("");
      setNewDesc("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add stat.");
    }
  }

  async function saveAvatar(dataUrl: string | null) {
    if (!repos || !character) return;
    await repos.character.setAvatar(character.id, dataUrl);
    await refresh();
  }

  function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Downscale to a 256px square so the data-URL stays small.
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        void saveAvatar(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <h1 className="qf-heading text-2xl text-ink">{t("character.title")}</h1>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Portrait + level */}
        <section className="qf-card p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              title={t("character.changeAvatar")}
              className="group relative h-24 w-24 overflow-hidden rounded-full border border-accent/40 bg-bg-soft shadow-glow"
            >
              {character.avatar ? (
                <img
                  src={character.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl text-accent-glow qf-heading">
                  {character.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-bg/80 py-0.5 text-[10px] text-ink-soft opacity-0 transition group-hover:opacity-100">
                {t("character.changeAvatar")}
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickAvatar}
            />
            {character.avatar && (
              <button
                onClick={() => saveAvatar(null)}
                className="mt-1 text-[11px] text-ink-faint hover:text-danger"
              >
                {t("character.removeAvatar")}
              </button>
            )}
            <div className="mt-3 qf-heading text-xl text-ink">
              {character.name}
            </div>
            {character.characterClass && (
              <div className="text-sm text-ink-soft">
                {character.characterClass}
              </div>
            )}
            <div className="mt-1 text-sm text-accent">
              {t("character.level")} {progress.level}
            </div>
          </div>
          <div className="mt-5">
            <ProgressBar
              value={progress.currentXp / progress.requiredXp}
              height={10}
            />
            <div className="mt-1 flex justify-between text-xs font-mono text-ink-faint">
              <span>
                {progress.currentXp} / {progress.requiredXp}
              </span>
              <span>{character.totalXp} {t("common.total")}</span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="qf-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="qf-label">{t("character.stats")}</span>
            <button
              className="qf-btn-ghost px-3 py-1 text-xs"
              onClick={() => setAdding((v) => !v)}
            >
              <IconPlus size={14} /> {t("character.addStat")}
            </button>
          </div>

          {adding && (
            <div className="mt-3 rounded-lg border border-border bg-bg-soft/50 p-3">
              {stats.length >= STAT_SOFT_CAP && (
                <div className="mb-2 text-xs text-warn">
                  {t("character.softCapWarning", { count: stats.length })}
                </div>
              )}
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("character.statNamePlaceholder")}
                className="qf-input"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder={t("character.descPlaceholder")}
                className="qf-input mt-2"
              />
              {error && <div className="mt-2 text-sm text-danger">{error}</div>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="qf-btn-ghost px-3 py-1 text-xs"
                  onClick={() => setAdding(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="qf-btn-primary px-3 py-1 text-xs"
                  onClick={addStat}
                >
                  {t("common.add")}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {stats.length === 0 && (
              <div className="text-sm text-ink-faint">
                {t("character.noStatsYet")}
              </div>
            )}
            {stats.map((stat) => (
              <button
                key={stat.id}
                onClick={() => setSelected(stat)}
                className={`rounded-lg border p-3 text-left transition ${
                  selected?.id === stat.id
                    ? "border-accent/50 bg-accent/5"
                    : "border-border hover:border-ink-faint"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">
                    {stat.name}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {t("character.level")} {stat.level}
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  value={stat.currentXp / xpForLevel(stat.level)}
                  height={6}
                  tone="arcane"
                />
                <div className="mt-1 text-right text-[11px] font-mono text-ink-faint">
                  {stat.currentXp} / {xpForLevel(stat.level)}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Selected stat detail */}
      {selected && (
        <section className="qf-card mt-6 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="qf-heading text-lg text-ink">{selected.name}</div>
              {selected.description && (
                <div className="text-sm text-ink-soft">
                  {selected.description}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-ink-soft">
              {t("character.level")} {selected.level} · {selected.totalXp} XP{" "}
              {t("common.total")}
            </div>
          </div>
          <div className="mt-4">
            <span className="qf-label">{t("character.recentXp")}</span>
            <div className="mt-2 space-y-1.5">
              {recent.length === 0 ? (
                <div className="text-xs text-ink-faint">{t("character.noXpYet")}</div>
              ) : (
                recent.map((x) => (
                  <div
                    key={x.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate text-ink-soft">{x.reason}</span>
                    <span className="ml-3 flex shrink-0 items-center gap-3">
                      <span className="text-[11px] text-ink-faint">
                        {relativeDayLabel(x.createdAt.slice(0, 10), t, lang)}
                      </span>
                      <span className="font-mono text-accent">+{x.amount}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <Achievements />
    </div>
  );
}
