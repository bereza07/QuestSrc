import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT, useI18nStore, LANG_LABELS, type Lang } from "@/i18n";
import {
  getDailyGoal,
  setDailyGoal,
  getWorkDays,
  setWorkDays,
} from "@/services/streak/streakService";
import type { DailyGoal } from "@/domain/streak";
import { secretStore } from "@/services/ai/secretStore";
import { soundService, SOUND_EVENTS, type SoundEvent } from "@/services/sound/soundService";
import { exportData, importData, isBackupFile } from "@/services/system/dataTransfer";
import { useToastStore } from "@/stores/toastStore";
import { useSyncStore, checkServer } from "@/stores/syncStore";

const AI_PROVIDERS = ["deepseek", "openai", "anthropic", "custom"];
const DEFAULTS = {
  provider: "deepseek",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
};
const RESET_WORD = "RESET";

export function Settings() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);

  const repos = useAppStore((s) => s.repos);
  const resetProgress = useAppStore((s) => s.resetProgress);

  const [provider, setProvider] = useState(DEFAULTS.provider);
  const [model, setModel] = useState(DEFAULTS.model);
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [thoroughness, setThoroughness] = useState(50);
  const [agentMode, setAgentMode] = useState(false);
  const [saved, setSaved] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!repos) return;
    repos.settings.getAll().then((all) => {
      setProvider(all["ai.provider"] ?? DEFAULTS.provider);
      setModel(all["ai.model"] ?? DEFAULTS.model);
      setBaseUrl(all["ai.baseUrl"] ?? DEFAULTS.baseUrl);
      const th = Number(all["ai.thoroughness"]);
      setThoroughness(Number.isFinite(th) ? th : 50);
      setAgentMode(all["ai.mode"] === "agent");
    });
    setApiKey(secretStore.getApiKey() ?? "");
  }, [repos]);

  async function saveAi() {
    if (!repos) return;
    await repos.settings.set("ai.provider", provider);
    await repos.settings.set("ai.model", model);
    await repos.settings.set("ai.baseUrl", baseUrl);
    await repos.settings.set("ai.thoroughness", String(thoroughness));
    await repos.settings.set("ai.mode", agentMode ? "agent" : "envelope");
    await secretStore.setApiKey(apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function changeLang(next: Lang) {
    setLang(next);
    // Persist the UI language into the local DB too, so it survives a
    // localStorage wipe and can be read by non-UI code later.
    if (repos) await repos.settings.set("ui.lang", next);
  }

  async function doReset() {
    setResetting(true);
    try {
      await resetProgress();
    } finally {
      setResetting(false);
      setConfirmText("");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-fg">{t("settings.title")}</h1>

      {/* Language */}
      <section className="qf-card mt-4 p-5">
        <div className="qf-label">{t("settings.language")}</div>
        <label className="mt-3 block text-sm text-fg-2">
          {t("settings.languageLabel")}
        </label>
        <div className="mt-2 inline-flex rounded-lg border border-border p-1">
          {(Object.keys(LANG_LABELS) as Lang[]).map((code) => (
            <button
              key={code}
              onClick={() => void changeLang(code)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${
                lang === code
                  ? "bg-accent text-accent-fg"
                  : "text-fg-2 hover:text-fg"
              }`}
            >
              {LANG_LABELS[code]}
            </button>
          ))}
        </div>
      </section>

      {/* Daily goal & availability */}
      <GoalSettings />

      {/* AI */}
      <section className="qf-card mt-6 p-5">
        <div className="qf-label">{t("settings.aiProvider")}</div>
        <p className="mt-1 text-xs text-fg-3">{t("settings.aiProviderBlurb")}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="qf-label">{t("settings.provider")}</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="qf-input mt-1"
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="qf-label">{t("settings.model")}</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="qf-input mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="qf-label">{t("settings.baseUrl")}</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="qf-input mt-1"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="qf-label">{t("settings.apiKey")}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            className="qf-input mt-1"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-fg-3">{t("settings.apiKeyNote")}</p>
        </div>

        <div className="mt-5">
          <label className="qf-label">{t("settings.aiThoroughness")}</label>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={thoroughness}
            onChange={(e) => setThoroughness(Number(e.target.value))}
            className="mt-2 w-full accent-accent"
          />
          <div className="mt-1 flex justify-between text-[11px] text-fg-3">
            <span>{t("settings.aiThoroughnessLow")}</span>
            <span>{t("settings.aiThoroughnessHigh")}</span>
          </div>
          <p className="mt-1 text-xs text-fg-3">{t("settings.aiThoroughnessHint")}</p>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agentMode}
              onChange={(e) => setAgentMode(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-fg">{t("settings.aiAgentMode")}</div>
              <div className="mt-0.5 text-xs text-fg-3">
                {t("settings.aiAgentModeHint")}
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="qf-btn-primary" onClick={saveAi}>
            {t("settings.saveAi")}
          </button>
          {saved && <span className="text-xs text-success">{t("common.saved")} ✓</span>}
        </div>
      </section>

      {/* Sounds */}
      <SoundSettings />

      {/* LAN sync */}
      <SyncSettings />

      {/* Data backup */}
      <DataSettings />

      {/* Danger zone */}
      <section className="qf-card mt-6 border-danger p-5">
        <div className="qf-label text-danger">{t("settings.dangerZone")}</div>
        <p className="mt-1 text-sm text-fg-2">{t("settings.resetBlurb")}</p>
        <p className="mt-3 text-xs text-fg-3">
          {t("settings.typeReset", { word: RESET_WORD })}
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={RESET_WORD}
            className="qf-input max-w-[160px]"
          />
          <button
            className="qf-btn-danger"
            disabled={confirmText !== RESET_WORD || resetting}
            onClick={doReset}
          >
            {resetting ? t("settings.resetting") : t("settings.resetBtn")}
          </button>
        </div>
      </section>
    </div>
  );
}

function SoundSettings() {
  const t = useT();
  const [cfg, setCfg] = useState(() => soundService.getConfig());
  const refresh = () => setCfg(soundService.getConfig());

  function uploadFor(event: SoundEvent) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        soundService.setCustom(event, reader.result as string);
        refresh();
        soundService.play(event);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return (
    <section className="qf-card mt-6 p-5">
      <div className="qf-label">{t("settings.soundTitle")}</div>
      <p className="mt-1 text-xs text-fg-3">{t("settings.soundBlurb")}</p>

      <label className="mt-3 flex items-center gap-2 text-sm text-fg-2">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => {
            soundService.setEnabled(e.target.checked);
            refresh();
          }}
        />
        {t("settings.soundEnabled")}
      </label>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-fg-3">{t("settings.soundVolume")}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={cfg.volume}
          onChange={(e) => {
            soundService.setVolume(Number(e.target.value));
            refresh();
          }}
          className="flex-1"
        />
      </div>

      <div className="mt-4 space-y-2">
        {SOUND_EVENTS.map((ev) => (
          <div key={ev} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-fg-2">
              {t(`settings.sound_${ev}`)}
              {soundService.hasCustom(ev) && (
                <span className="ml-2 text-[10px] uppercase text-accent">•</span>
              )}
            </span>
            <div className="flex shrink-0 gap-1">
              <button className="qf-btn-ghost px-2 py-1 text-xs" onClick={() => soundService.play(ev)}>
                {t("settings.soundPreview")}
              </button>
              <button className="qf-btn-ghost px-2 py-1 text-xs" onClick={() => uploadFor(ev)}>
                {t("settings.soundUpload")}
              </button>
              {soundService.hasCustom(ev) && (
                <button
                  className="qf-btn-ghost px-2 py-1 text-xs"
                  onClick={() => {
                    soundService.setCustom(ev, null);
                    refresh();
                  }}
                >
                  {t("settings.soundReset")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SyncSettings() {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const refresh = useAppStore((s) => s.refresh);
  const push = useToastStore((s) => s.push);
  const sync = useSyncStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkResult, setCheckResult] = useState<null | boolean>(null);

  const when = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleString()
    : t("settings.syncNever");

  async function auth(kind: "login" | "register") {
    try {
      if (kind === "register") await sync.register(email.trim(), password);
      else await sync.login(email.trim(), password);
      setPassword("");
      // On first sign-in, pull if the server has data, otherwise seed it.
      if (repos) {
        const had = await sync.pull(repos);
        if (had) await refresh();
        else await sync.push(repos);
      }
    } catch {
      /* error surfaced via sync.error */
    }
  }

  async function doPush() {
    if (!repos) return;
    try {
      await sync.push(repos);
      push({ kind: "info", title: t("settings.syncPushed") });
    } catch {
      /* surfaced */
    }
  }

  async function doPull() {
    if (!repos) return;
    try {
      const had = await sync.pull(repos);
      if (had) {
        await refresh();
        push({ kind: "info", title: t("settings.syncPulled") });
      } else {
        push({ kind: "info", title: t("settings.syncPullEmpty") });
      }
    } catch {
      /* surfaced */
    }
  }

  return (
    <section className="qf-card mt-6 p-5">
      <div className="qf-label">{t("settings.syncTitle")}</div>
      <p className="mt-1 text-xs text-fg-3">{t("settings.syncBlurb")}</p>

      <label className="qf-label mt-4 block">{t("settings.syncServerUrl")}</label>
      <input
        value={sync.serverUrl}
        onChange={(e) => {
          sync.setServerUrl(e.target.value);
          setCheckResult(null);
        }}
        placeholder="http://localhost:4000"
        className="qf-input mt-1"
        disabled={!!sync.token}
      />
      <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
        {t("settings.syncServerHint")}
      </p>
      {!sync.token && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="qf-btn-ghost text-xs"
            onClick={async () => setCheckResult(await checkServer(sync.serverUrl))}
          >
            {t("settings.syncCheck")}
          </button>
          {checkResult === true && (
            <span className="text-xs text-success">{t("settings.syncOnline")}</span>
          )}
          {checkResult === false && (
            <span className="text-xs text-danger">{t("settings.syncUnreachable")}</span>
          )}
        </div>
      )}

      {!sync.token ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("settings.syncEmail")}
              className="qf-input"
              autoComplete="off"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("settings.syncPassword")}
              className="qf-input"
              autoComplete="off"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="qf-btn-primary"
              onClick={() => auth("login")}
              disabled={sync.status === "syncing" || !email || !password}
            >
              {t("settings.syncLogin")}
            </button>
            <button
              className="qf-btn-ghost"
              onClick={() => auth("register")}
              disabled={sync.status === "syncing" || !email || !password}
            >
              {t("settings.syncRegister")}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 text-sm text-fg">
            {t("settings.syncSignedInAs", { email: sync.email ?? "" })}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-fg-2">
            <input
              type="checkbox"
              checked={sync.autoSync}
              onChange={(e) => sync.setAutoSync(e.target.checked)}
            />
            {t("settings.syncAutoSync")}
            <span className="text-xs text-fg-3">— {t("settings.syncAutoSyncHint")}</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="qf-btn-primary" onClick={doPush} disabled={sync.status === "syncing"}>
              {t("settings.syncPush")}
            </button>
            <button className="qf-btn-ghost" onClick={doPull} disabled={sync.status === "syncing"}>
              {t("settings.syncPull")}
            </button>
            <button className="qf-btn-ghost" onClick={() => sync.logout()}>
              {t("settings.syncLogout")}
            </button>
          </div>
          <div className="mt-2 text-xs text-fg-3">
            {t("settings.syncLastSynced", { when })}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <button
              className="text-xs text-danger hover:underline"
              onClick={async () => {
                if (!window.confirm(t("settings.syncWipeConfirm"))) return;
                await sync.wipeServerData();
                push({ kind: "info", title: t("settings.syncWiped") });
              }}
            >
              {t("settings.syncWipe")}
            </button>
            <span className="mx-2 text-fg-3">·</span>
            <button
              className="text-xs text-danger hover:underline"
              onClick={async () => {
                if (!window.confirm(t("settings.syncDeleteAccountConfirm"))) return;
                await sync.deleteAccount();
                push({ kind: "info", title: t("settings.syncDeletedAccount") });
              }}
            >
              {t("settings.syncDeleteAccount")}
            </button>
          </div>
        </>
      )}

      {sync.status === "syncing" && (
        <div className="mt-2 text-xs text-accent">{t("settings.syncBusy")}</div>
      )}
      {sync.error === "__CONFLICT__" ? (
        <div className="mt-3 rounded-lg border border-warn bg-warn-bg p-3 text-xs">
          <div className="text-warn">{t("settings.syncConflict")}</div>
          <div className="mt-2 flex gap-2">
            <button
              className="qf-btn-primary text-xs"
              onClick={async () => {
                if (!repos) return;
                try {
                  const had = await sync.pull(repos);
                  if (had) await refresh();
                  push({ kind: "info", title: t("settings.syncPulled") });
                } catch { /* surfaced */ }
              }}
            >
              {t("settings.syncPull")}
            </button>
            <button
              className="qf-btn-ghost text-xs"
              onClick={async () => {
                if (!repos) return;
                try {
                  await sync.forcePush(repos);
                  push({ kind: "info", title: t("settings.syncPushed") });
                } catch { /* surfaced */ }
              }}
            >
              {t("settings.syncForcePush")}
            </button>
          </div>
        </div>
      ) : sync.error ? (
        <div className="mt-2 text-xs text-danger">
          {sync.error === "__UNREACHABLE__" ? t("settings.syncUnreachable") : sync.error}
        </div>
      ) : null}
    </section>
  );
}

function DataSettings() {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const push = useToastStore((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    if (!repos) return;
    try {
      const data = await exportData(repos);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      push({ kind: "info", title: t("settings.exported") });
    } catch (err) {
      push({
        kind: "error",
        title: t("settings.importBadFile"),
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !repos) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      push({ kind: "error", title: t("settings.importBadFile") });
      return;
    }
    if (!isBackupFile(parsed)) {
      push({ kind: "error", title: t("settings.importBadFile") });
      return;
    }
    if (!window.confirm(t("settings.importConfirm"))) return;
    await importData(repos, parsed);
    push({ kind: "info", title: t("settings.imported") });
    // Re-open cleanly so every store reflects the restored data.
    setTimeout(() => window.location.reload(), 400);
  }

  return (
    <section className="qf-card mt-6 p-5">
      <div className="qf-label">{t("settings.dataTitle")}</div>
      <p className="mt-1 text-xs text-fg-3">{t("settings.dataBlurb")}</p>
      <div className="mt-3 flex gap-2">
        <button className="qf-btn-ghost" onClick={doExport}>
          {t("settings.exportBtn")}
        </button>
        <button className="qf-btn-ghost" onClick={() => fileRef.current?.click()}>
          {t("settings.importBtn")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </section>
  );
}

function GoalSettings() {
  const t = useT();
  const repos = useAppStore((s) => s.repos);
  const refresh = useAppStore((s) => s.refresh);

  const [goal, setGoal] = useState<DailyGoal>({ mode: "TIME", value: 20 });
  const [workDays, setDays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!repos) return;
    void (async () => {
      setGoal(await getDailyGoal(repos));
      setDays(await getWorkDays(repos));
    })();
  }, [repos]);

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function save() {
    if (!repos) return;
    await setDailyGoal(repos, goal);
    await setWorkDays(repos, workDays);
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="qf-card mt-6 p-5">
      <div className="qf-label">{t("settingsGoal.title")}</div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="qf-label">{t("settingsGoal.goalType")}</label>
          <select
            value={goal.mode}
            onChange={(e) => setGoal((g) => ({ ...g, mode: e.target.value as DailyGoal["mode"] }))}
            className="qf-input mt-1"
          >
            <option value="TIME">{t("settingsGoal.time")}</option>
            <option value="XP">{t("settingsGoal.xp")}</option>
          </select>
        </div>
        <div>
          <label className="qf-label">
            {goal.mode === "TIME" ? t("settingsGoal.goalValueMin") : t("settingsGoal.goalValueXp")}
          </label>
          <input
            type="number"
            min={1}
            value={goal.value}
            onChange={(e) => setGoal((g) => ({ ...g, value: Number(e.target.value) || 1 }))}
            className="qf-input mt-1"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="qf-label">{t("settingsGoal.workDays")}</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                workDays.has(d)
                  ? "border-accent bg-accent-bg text-accent"
                  : "border-border text-fg-3 hover:border-border-strong"
              }`}
            >
              {t(`settingsGoal.weekday${d}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="qf-btn-primary" onClick={save}>
          {t("settingsGoal.saveGoal")}
        </button>
        {saved && <span className="text-xs text-success">{t("common.saved")} ✓</span>}
      </div>
    </section>
  );
}
