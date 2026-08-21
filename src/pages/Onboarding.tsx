import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore, LANG_LABELS, type Lang } from "@/i18n";
import { useSyncStore } from "@/stores/syncStore";

const SUGGESTED_STATS = [
  "Programming",
  "Gameplay",
  "Engineering",
  "Technical Art",
  "Shipping",
  "Career",
  "Discipline",
  "Learning",
];

export function Onboarding() {
  const t = useT();
  const createCharacter = useAppStore((s) => s.createCharacter);
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const sync = useSyncStore();
  const completeFromSync = useAppStore((s) => s.completeOnboardingFromSync);

  const [signInOpen, setSignInOpen] = useState(false);
  const [syncEmail, setSyncEmail] = useState("");
  const [syncPw, setSyncPw] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  async function doSignIn() {
    setSignInError(null);
    setSignInBusy(true);
    try {
      await sync.login(syncEmail.trim(), syncPw);
      const ok = await completeFromSync();
      if (!ok) setSignInError(t("onboarding.serverEmpty"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSignInError(msg === "__UNREACHABLE__" ? t("settings.syncUnreachable") : msg);
    } finally {
      setSignInBusy(false);
    }
  }

  const [name, setName] = useState("");
  const [characterClass, setCharacterClass] = useState("");
  const [mainQuest, setMainQuest] = useState("");
  const [selected, setSelected] = useState<string[]>([
    "Programming",
    "Discipline",
    "Learning",
  ]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preset chips show a localized label but are tracked by their English key;
  // custom stats are tracked by their raw text.
  const isPreset = (x: string) => SUGGESTED_STATS.includes(x);
  const labelFor = (x: string) => (isPreset(x) ? t(`stats.${x}`) : x);

  function toggle(stat: string) {
    setSelected((prev) =>
      prev.includes(stat) ? prev.filter((s) => s !== stat) : [...prev, stat],
    );
  }

  function addCustom() {
    const v = custom.trim();
    if (!v) return;
    if (!selected.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setSelected((prev) => [...prev, v]);
    }
    setCustom("");
  }

  async function begin() {
    setError(null);
    if (!name.trim()) {
      setError(t("onboarding.errorNameRequired"));
      return;
    }
    setBusy(true);
    try {
      await createCharacter({
        name: name.trim(),
        characterClass: characterClass.trim() || null,
        mainQuest: mainQuest.trim() || null,
        // Store the localized stat name so the sheet reads in the user's language.
        startingStats: selected.map((s) => ({ name: labelFor(s) })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const allStats = Array.from(new Set([...SUGGESTED_STATS, ...selected]));

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="flex justify-center gap-1">
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                lang === l
                  ? "bg-accent/15 text-accent"
                  : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="mt-4 text-center">
          <div className="qf-heading text-3xl text-accent-glow">
            {t("onboarding.welcome")}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t("onboarding.subtitle")}</p>
        </div>

        {/* Returning user on a new device: sign in and pull existing data. */}
        <div className="qf-card mt-6 p-4">
          {!signInOpen ? (
            <button
              onClick={() => setSignInOpen(true)}
              className="text-sm text-accent hover:underline"
            >
              {t("onboarding.haveAccount")}
            </button>
          ) : (
            <div>
              <div className="qf-label">{t("onboarding.signInSync")}</div>
              <input
                value={sync.serverUrl}
                onChange={(e) => sync.setServerUrl(e.target.value)}
                placeholder="http://localhost:4000"
                className="qf-input mt-2"
              />
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={syncEmail}
                  onChange={(e) => setSyncEmail(e.target.value)}
                  placeholder={t("settings.syncEmail")}
                  className="qf-input"
                  autoComplete="off"
                />
                <input
                  type="password"
                  value={syncPw}
                  onChange={(e) => setSyncPw(e.target.value)}
                  placeholder={t("settings.syncPassword")}
                  className="qf-input"
                  autoComplete="off"
                />
              </div>
              {signInError && (
                <div className="mt-2 text-xs text-danger">{signInError}</div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  className="qf-btn-primary"
                  onClick={doSignIn}
                  disabled={signInBusy || !syncEmail || !syncPw}
                >
                  {signInBusy ? t("settings.syncBusy") : t("settings.syncLogin")}
                </button>
                <button className="qf-btn-ghost" onClick={() => setSignInOpen(false)}>
                  {t("common.cancel")}
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-faint">{t("onboarding.orCreateNew")}</p>
            </div>
          )}
        </div>

        <div className="qf-card mt-6 p-6">
          <label className="qf-label">{t("onboarding.name")}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding.namePlaceholder")}
            className="qf-input mt-1"
          />

          <label className="qf-label mt-5 block">{t("onboarding.class")}</label>
          <input
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value)}
            placeholder={t("onboarding.classPlaceholder")}
            className="qf-input mt-1"
          />

          <label className="qf-label mt-5 block">
            {t("onboarding.mainQuest")}
          </label>
          <input
            value={mainQuest}
            onChange={(e) => setMainQuest(e.target.value)}
            placeholder={t("onboarding.mainQuestPlaceholder")}
            className="qf-input mt-1"
          />

          <label className="qf-label mt-5 block">
            {t("onboarding.chooseStats")}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {allStats.map((stat) => {
              const on = selected.includes(stat);
              return (
                <button
                  key={stat}
                  type="button"
                  onClick={() => toggle(stat)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    on
                      ? "border-accent bg-accent/15 text-accent-glow"
                      : "border-border text-ink-soft hover:border-ink-faint"
                  }`}
                >
                  {labelFor(stat)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addCustom())
              }
              placeholder={t("onboarding.addYourOwn")}
              className="qf-input"
            />
            <button type="button" onClick={addCustom} className="qf-btn-ghost">
              {t("common.add")}
            </button>
          </div>

          {error && <div className="mt-4 text-sm text-danger">{error}</div>}

          <button
            onClick={begin}
            disabled={busy}
            className="qf-btn-primary mt-6 w-full"
          >
            {busy ? t("onboarding.forging") : t("onboarding.begin")}
          </button>
          <p className="mt-3 text-center text-xs text-ink-faint">
            {t("onboarding.footnote")}
          </p>
        </div>
      </div>
    </div>
  );
}
