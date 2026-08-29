import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSyncStore, checkServer, getServerPolicy, type ServerPolicy } from "@/stores/syncStore";
import { useT, useI18nStore, LANG_LABELS, type Lang } from "@/i18n";
import { Onboarding } from "./Onboarding";

// First-launch chooser: create a new character locally, or sign in to an existing
// account and pull the shared data down. Wraps <Onboarding /> so the user can
// still just start fresh — sign-in is purely additive (§3 in the follow-up list).
export function Welcome() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const repos = useAppStore((s) => s.repos);
  const refresh = useAppStore((s) => s.refresh);
  const completeFromSync = useAppStore((s) => s.completeOnboardingFromSync);
  const sync = useSyncStore();

  const [mode, setMode] = useState<"choose" | "new" | "signin">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [check, setCheck] = useState<null | boolean>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<ServerPolicy | null>(null);

  // Pull server policy so we know whether to show the invite field.
  useEffect(() => {
    if (mode !== "signin") return;
    let cancelled = false;
    void getServerPolicy(sync.serverUrl).then((p) => {
      if (!cancelled) setPolicy(p);
    });
    return () => { cancelled = true; };
  }, [mode, sync.serverUrl]);

  async function signIn(kind: "login" | "register") {
    if (!repos) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "register") await sync.register(email.trim(), password, invite.trim() || undefined);
      else await sync.login(email.trim(), password);
      sync.setAutoSync(true);
      // completeOnboardingFromSync pulls + flips app status → "ready" (or stays
      // needs-onboarding if the server had no data). Without it, we'd stay
      // stuck on the Welcome screen even after a successful login.
      const ok = await completeFromSync();
      if (ok) return; // app re-renders into the main layout
      // Server was empty — send the user into normal onboarding; auto-sync will
      // push their new character up after they finish.
      await refresh();
      setMode("new");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message === "__UNREACHABLE__"
            ? t("settings.syncUnreachable")
            : e.message
          : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  if (mode === "new") return <Onboarding />;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center gap-1">
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                lang === l ? "bg-accent-bg text-accent" : "text-fg-3 hover:text-fg-2"
              }`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>

        <div className="mt-8 text-center">
          <div className="text-3xl font-semibold tracking-tight text-fg">QuestForge</div>
          <p className="mt-2 text-sm text-fg-2">{t("welcome.subtitle")}</p>
        </div>

        {mode === "choose" && (
          <div className="qf-card mt-8 space-y-3 p-6">
            <button
              className="qf-btn-primary w-full justify-center"
              onClick={() => setMode("new")}
            >
              {t("welcome.createNew")}
            </button>
            <button className="qf-btn-ghost w-full justify-center" onClick={() => setMode("signin")}>
              {t("welcome.signIn")}
            </button>
            <p className="text-center text-[11px] text-fg-3">{t("welcome.hint")}</p>
          </div>
        )}

        {mode === "signin" && (
          <div className="qf-card mt-8 space-y-3 p-6">
            <label className="qf-label">{t("settings.syncServerUrl")}</label>
            <input
              value={sync.serverUrl}
              onChange={(e) => {
                sync.setServerUrl(e.target.value);
                setCheck(null);
              }}
              placeholder="http://localhost:4000"
              className="qf-input"
            />
            <p className="text-[11px] leading-relaxed text-fg-3">
              {t("settings.syncServerHint")}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="qf-btn-ghost text-xs"
                onClick={async () => setCheck(await checkServer(sync.serverUrl))}
              >
                {t("settings.syncCheck")}
              </button>
              {check === true && (
                <span className="text-xs text-success">{t("settings.syncOnline")}</span>
              )}
              {check === false && (
                <span className="text-xs text-danger">{t("settings.syncUnreachable")}</span>
              )}
            </div>

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
            {policy?.inviteRequired && policy.registrationEnabled && (
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder={t("settings.syncInvitePlaceholder")}
                className="qf-input"
                autoComplete="off"
              />
            )}
            {policy && !policy.registrationEnabled && (
              <p className="text-xs text-warn">{t("settings.syncRegistrationDisabled")}</p>
            )}
            {error && <div className="text-xs text-danger">{error}</div>}
            <div className="flex flex-col gap-2">
              <button
                className="qf-btn-primary w-full justify-center"
                disabled={busy || !email || !password}
                onClick={() => signIn("login")}
              >
                {t("settings.syncLogin")}
              </button>
              <button
                className="qf-btn-ghost w-full justify-center"
                disabled={
                  busy || !email || !password ||
                  (policy?.registrationEnabled === false) ||
                  (policy?.inviteRequired === true && !invite.trim())
                }
                onClick={() => signIn("register")}
              >
                {t("settings.syncRegister")}
              </button>
              <button
                className="text-xs text-fg-3 hover:text-fg-2"
                onClick={() => setMode("choose")}
              >
                {t("common.back")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
