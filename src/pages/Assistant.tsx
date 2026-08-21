import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import { useToastStore } from "@/stores/toastStore";
import { useChatDraftStore } from "@/stores/chatDraftStore";
import { RulesModal } from "@/features/ai/RulesModal";
import { useT, useI18nStore } from "@/i18n";
import { IconChat, IconCheck } from "@/components/icons";
import type { AIAction, AIWarning } from "@/types/ai";
import type { ChatMessage } from "@/services/ai/provider";
import { AIError } from "@/services/ai/provider";
import {
  isAIConfigured,
  sendAIMessage,
  applyAIActions,
} from "@/services/ai/aiService";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  warnings?: AIWarning[];
  applied?: boolean;
  error?: boolean;
}

export function Assistant() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const repos = useAppStore((s) => s.repos);
  const refresh = useAppStore((s) => s.refresh);
  const activeTasks = useAppStore((s) => s.activeTasks);
  const push = useToastStore((s) => s.push);

  const [configured] = useState(isAIConfigured());
  const [messages, setMessages] = useState<UiMessage[]>([]);
  // Draft lives in a store so unmounting on navigation doesn't lose the typed
  // text — the user can jump between pages and come back mid-message.
  const input = useChatDraftStore((s) => s.draft);
  const setInput = useChatDraftStore((s) => s.setDraft);
  const clearInput = useChatDraftStore((s) => s.clearDraft);
  // busy + reloadTick live in a store so they survive unmount — after switching
  // tabs mid-request, coming back still shows "Думает…" and picks up the reply.
  const busy = useChatDraftStore((s) => s.busy);
  const setBusy = useChatDraftStore((s) => s.setBusy);
  const bumpReload = useChatDraftStore((s) => s.bumpReload);
  const reloadTick = useChatDraftStore((s) => s.reloadTick);
  const [lastUserText, setLastUserText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the composer up to a cap so long paragraphs stay readable
  // without turning the whole chat into a form. Cap matches Tailwind max-h-40.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, 240);
    el.style.height = `${capped}px`;
  }, [input]);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (!repos) return;
    repos.chat.list().then((rows) =>
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          // Strip any leaked "[Proposed actions were APPLIED/DISMISSED …]" tag
          // that legacy history may have baked into the visible content.
          content: r.content.replace(/\s*\[Proposed actions were [^\]]+\]\s*/g, "").trim(),
          actions: r.actions ?? undefined,
          applied: r.applied,
        })),
      ),
    );
    // reloadTick is in deps: after an inflight AI request completes we bump it
    // so the (possibly re-mounted) page re-reads the fresh assistant message.
  }, [repos, reloadTick]);

  // Scroll the messages panel to the newest item. We keep two anchors:
  //  - `stickToBottom`: was the user near the bottom before the update? If yes,
  //    stay pinned; if they scrolled up to read history, DON'T yank them.
  //  - `forceScrollTo`: when the count changes (user sent OR reply arrived) we
  //    always jump to the bottom regardless — matches every chat app.
  const stickToBottom = useRef(true);
  const prevCount = useRef(0);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => {
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    if (!grew && !stickToBottom.current && !busy) return;
    // Two rAFs: one for React commit, one for browser layout — so the newly
    // appended message's height is included before we snap.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }, [messages, busy]);

  const taskTitle = useMemo(() => {
    const map = new Map(activeTasks.map((tk) => [tk.id, tk.title]));
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [activeTasks]);

  // Runs the AI on `userText` and appends the assistant reply (or an error
  // message with a Retry). Does NOT append the user bubble — send() does that.
  async function callAI(userText: string, history: ChatMessage[]) {
    if (!repos) return;
    setBusy(true);
    try {
      const scopeProjectId = useChatDraftStore.getState().scopeProjectId;
      const { message, validated } = await sendAIMessage(
        repos, lang, history, userText, scopeProjectId,
      );
      // Persist first so the UI message carries the real DB id — this is what
      // lets confirm/cancel mark the row and prevents duplicate-apply on reload.
      const row = await repos.chat.append(
        "assistant",
        message,
        validated.actions.length ? validated.actions : null,
      );
      setMessages((m) => [
        ...m,
        {
          id: row.id,
          role: "assistant",
          content: message || (validated.actions.length ? "" : t("ai.emptyReply")),
          actions: validated.actions.length ? validated.actions : undefined,
          warnings: validated.warnings.length ? validated.warnings : undefined,
        },
      ]);
    } catch (err) {
      const kind = err instanceof AIError ? err.kind : "network";
      const msg =
        kind === "auth"
          ? t("ai.authError")
          : kind === "no-key"
            ? t("ai.noKeyBody")
            : t("ai.networkError");
      push({ kind: "info", title: t("ai.unavailable"), detail: msg });
      // Not persisted — it's a transient error the user can retry.
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: `⚠ ${msg}`, error: true },
      ]);
    } finally {
      setBusy(false);
      // Also nudge the messages hook to re-read from DB — covers the case where
      // the Assistant page was unmounted mid-request and re-mounted after the
      // reply landed but before this component saw it in local state.
      bumpReload();
    }
  }

  async function send(text: string) {
    if (!repos || !text.trim() || busy) return;
    const userText = text.trim();
    clearInput();
    setLastUserText(userText);
    // Cap history so a long chat doesn't push the model to return empty replies
    // (context bloat + JSON-mode). Keep the last 12 turns; the app also sends
    // the current CONTEXT snapshot, so full memory of every message isn't needed.
    const history = buildHistoryForApi(messages);
    const userRow = await repos.chat.append("user", userText);
    setMessages((m) => [...m, { id: userRow.id, role: "user", content: userText }]);
    await callAI(userText, history);
  }

  // Resend the last user message (e.g. after a VPN/network error). Drops any
  // trailing error bubbles first so the transcript stays clean.
  async function retry() {
    if (!repos || busy || !lastUserText) return;
    const cleaned = messages.filter((m) => !m.error);
    setMessages(cleaned);
    const history = buildHistoryForApi(cleaned.slice(0, -1));
    await callAI(lastUserText, history);
  }

  // Build the API history from UI messages. CRITICAL: when we replay past
  // assistant turns that carried actions, we must tell the model those actions
  // are already RESOLVED (applied / dismissed). Otherwise in agent mode the
  // model looks at its own past turn — "I proposed CREATE_TASK" — sees no tool
  // completion, and re-emits the same tool call on every subsequent user turn.
  function buildHistoryForApi(list: UiMessage[]): ChatMessage[] {
    const out: ChatMessage[] = [];
    const filtered = list
      .filter((m) => !m.error && (m.content?.trim() || (m.actions && m.actions.length)))
      .slice(-8);
    for (const m of filtered) {
      out.push({ role: m.role, content: m.content || "" });
      // Status marker goes in a SEPARATE system message right after the assistant
      // turn — sending it as part of `content` (as before) leaked "[Proposed
      // actions were APPLIED…]" back to the user in the chat bubble.
      if (m.role === "assistant" && m.actions && m.actions.length) {
        const status = m.applied ? "APPLIED" : "DISMISSED";
        const kinds = m.actions.map((a) => a.type).join(", ");
        out.push({
          role: "system",
          content: `[note: those proposed actions were ${status} by the user — do NOT propose them again: ${kinds}]`,
        });
      }
    }
    return out;
  }

  async function confirmActions(msgId: string, actions: AIAction[]) {
    if (!repos) return;
    // Mark applied FIRST (persisted) so a reload can't offer the same actions
    // again (was causing duplicate task creation) and the ✓ state survives.
    await repos.chat.markApplied(msgId);
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, applied: true } : x)));
    const res = await applyAIActions(repos, actions);
    await refresh();
    const n = res.created + res.updated + res.completed + res.deleted;
    push({ kind: "xp", title: t("ai.applied", { n }) });
  }

  async function cancelActions(msgId: string) {
    if (repos) await repos.chat.clearActions(msgId);
    setMessages((m) =>
      m.map((x) => (x.id === msgId ? { ...x, actions: undefined, warnings: undefined } : x)),
    );
  }

  async function clearChat() {
    if (!repos) return;
    await repos.chat.clear();
    setMessages([]);
  }

  if (!configured) {
    return (
      <div>
        <h1 className="qf-heading text-2xl text-ink">{t("ai.title")}</h1>
        <div className="qf-card mt-6 p-8 text-center">
          <IconChat size={28} className="mx-auto text-ink-faint" />
          <div className="mt-3 qf-heading text-lg text-ink">{t("ai.noKeyTitle")}</div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{t("ai.noKeyBody")}</p>
          <Link to="/settings" className="qf-btn-primary mt-4 inline-flex">
            {t("ai.goToSettings")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    // Fixed chat panel: only the messages list scrolls; the composer is pinned
    // to the bottom. Height derives from the viewport minus the app top padding.
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="qf-heading text-2xl text-ink">{t("ai.title")}</h1>
          <p className="mt-0.5 text-xs text-ink-faint">{t("ai.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectScopeSelector />
          <button className="qf-btn-ghost text-xs" onClick={() => setShowRules(true)}>
            📜 {t("ai.rules")}
          </button>
          {messages.length > 0 && (
            <button className="qf-btn-ghost text-xs" onClick={clearChat}>
              {t("ai.clear")}
            </button>
          )}
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="qf-heading text-lg text-ink-soft">{t("ai.emptyTitle")}</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["ai.suggest1", "ai.suggest2", "ai.suggest3"].map((k) => (
                <button
                  key={k}
                  onClick={() => send(t(k))}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const askChoices = m.actions?.find((a) => a.type === "ASK_CHOICES") as
            | Extract<AIAction, { type: "ASK_CHOICES" }> | undefined;
          const applyableActions = (m.actions ?? []).filter((a) => a.type !== "ASK_CHOICES");
          const showActions = applyableActions.length > 0 && !m.applied;
          // Skip bubbles with nothing to show (e.g. an applied/cancelled action
          // message reloaded from history with an empty text) — was an empty strip.
          if (!m.content && !showActions && !askChoices && !m.applied && !m.error) return null;
          return (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-accent/15 text-ink"
                  : "border border-border bg-bg-soft/50 text-ink-soft"
              }`}
            >
              {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}

              {/* Inline quick-reply chips (Claude-style). When the assistant
                  message is a question with numbered options ("1) 30 min ·
                  2) 60 min · …"), render clickable chips so the user can pick
                  without typing. Only rendered on the latest assistant turn. */}
              {m.role === "assistant" &&
                !showActions &&
                !askChoices &&
                !m.applied &&
                i === messages.length - 1 &&
                extractQuickReplies(m.content).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {extractQuickReplies(m.content).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => void send(opt)}
                        disabled={busy}
                        className="rounded-full border border-accent/40 bg-accent/5 px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

              {showActions && (
                <ActionPreview
                  actions={applyableActions}
                  warnings={m.warnings ?? []}
                  taskTitle={taskTitle}
                  onConfirm={() => confirmActions(m.id, applyableActions)}
                  onCancel={() => cancelActions(m.id)}
                />
              )}
              {askChoices && !m.applied && i === messages.length - 1 && (
                <ChoicesForm
                  questions={askChoices.questions}
                  disabled={busy}
                  onSubmit={(answersText) => void send(answersText)}
                />
              )}
              {m.applied && (
                <div className="mt-2 flex items-center gap-1 text-xs text-success">
                  <IconCheck size={13} /> {t("ai.appliedBadge")}
                </div>
              )}
              {/* Assistant replied but proposed nothing to apply — clarify it's
                  a chat/question reply, not a broken action panel. */}
              {m.role === "assistant" && !showActions && !m.applied && !m.error && m.content && (
                <div className="mt-1 text-[10px] italic text-ink-faint">
                  {t("ai.noActionsHint")}
                </div>
              )}
              {m.error && (
                <button
                  onClick={retry}
                  disabled={busy}
                  className="mt-2 rounded-md border border-danger/50 px-2.5 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  ↻ {t("ai.retry")}
                </button>
              )}
            </div>
          </div>
          );
        })}

        {busy && <TypingIndicator label={t("ai.thinking")} />}
      </div>

      <form
        className="mt-3 flex items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={composerRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            // Enter alone SUBMITS. Shift+Enter continues a paragraph AND, if the
            // current line is a list item ("1. ", "- ", "* "), auto-continues
            // the list on the next line (or ends it if the item is empty).
            if (e.key === "Enter") {
              if (!e.shiftKey) {
                e.preventDefault();
                void send(input);
                return;
              }
              // Shift+Enter list continuation.
              const pos = el.selectionStart ?? input.length;
              const before = input.slice(0, pos);
              const after = input.slice(el.selectionEnd ?? pos);
              const lineStart = before.lastIndexOf("\n") + 1;
              const currentLine = before.slice(lineStart);
              // "1. foo" / "- foo" / "* foo"
              const m = /^(\s*)(\d+)\.\s(.*)$/.exec(currentLine) ??
                        /^(\s*)([-*])\s(.*)$/.exec(currentLine);
              if (!m) return; // let the default newline happen
              e.preventDefault();
              const [, indent, marker, rest] = m;
              if (!rest.trim()) {
                // Empty item — terminate the list by removing the marker.
                const newBefore = before.slice(0, lineStart) + indent;
                const next = newBefore + "\n" + after;
                setInput(next);
                requestAnimationFrame(() => {
                  el.selectionStart = el.selectionEnd = newBefore.length + 1;
                });
                return;
              }
              const nextMarker = /^\d+$/.test(marker) ? `${Number(marker) + 1}.` : marker;
              const insert = `\n${indent}${nextMarker} `;
              const next = before + insert + after;
              setInput(next);
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = before.length + insert.length;
              });
            }
          }}
          rows={1}
          placeholder={t("ai.placeholder")}
          className="qf-input max-h-60 min-h-[2.75rem] flex-1 resize-none overflow-y-auto py-2.5 leading-relaxed"
          disabled={busy}
        />
        <button className="qf-btn-primary shrink-0" disabled={busy || !input.trim()}>
          {t("ai.send")}
        </button>
      </form>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-faint" aria-label={label}>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

function ActionPreview({
  actions,
  warnings,
  taskTitle,
  onConfirm,
  onCancel,
}: {
  actions: AIAction[];
  warnings: AIWarning[];
  taskTitle: (id: string) => string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  function describe(a: AIAction): string {
    switch (a.type) {
      case "CREATE_TASK": {
        const total = (a.statRewards ?? []).reduce((s, r) => s + r.xp, 0);
        const date = a.plannedDate ? ` · ${a.plannedDate}` : "";
        return `${a.title}${date}${total ? ` · +${total} XP` : ""}`;
      }
      case "CREATE_GOAL":
        return a.title;
      case "CREATE_PROJECT":
        return `📁 ${a.name}`;
      case "CREATE_STAT":
        return a.name;
      case "CREATE_ACHIEVEMENT":
        return `${a.icon ?? "🎖️"}  ${a.name} · ${a.condition.metric} ≥ ${a.condition.atLeast}`;
      case "MOVE_TASK":
        return `${taskTitle(a.taskId)} → ${a.plannedDate ?? "—"}`;
      case "UPDATE_TASK":
        return taskTitle(a.taskId);
      case "COMPLETE_TASK":
      case "DELETE_TASK":
        return taskTitle(a.taskId);
      case "CREATE_RULE":
        return `📜 ${a.text}`;
      case "UPDATE_RULE":
        return `📜 ${a.text}`;
      case "DELETE_RULE":
        return `📜 (${a.ruleId.slice(0, 6)}…)`;
      case "ASK_CHOICES":
        // Never rendered here — questionnaires get their own <ChoicesForm />.
        return "";
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-accent/30 bg-bg/40 p-3">
      <div className="qf-label text-accent">{t("ai.proposedChanges")}</div>
      <ul className="mt-2 space-y-1">
        {actions.map((a, i) => (
          <li key={i} className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 rounded bg-bg-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
              {t(`ai.action${a.type}`)}
            </span>
            <span className="text-ink-soft">{describe(a)}</span>
          </li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="text-[11px] text-warn">
              {t(`ai.warn_${w.code}`, w.params)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <button className="qf-btn-primary text-xs" onClick={onConfirm}>
          <IconCheck size={13} /> {t("ai.confirm")}
        </button>
        <button className="qf-btn-ghost text-xs" onClick={onCancel}>
          {t("ai.cancel")}
        </button>
      </div>
    </div>
  );
}

// Persistent "active project" selector in the chat header. When set, the AI
// service tells the model to route new tasks into this project by default so
// the model doesn't have to guess from context every turn.
function ProjectScopeSelector() {
  const t = useT();
  const projects = useAppStore((s) => s.projects);
  const scope = useChatDraftStore((s) => s.scopeProjectId);
  const setScope = useChatDraftStore((s) => s.setScopeProjectId);
  return (
    <select
      value={scope ?? ""}
      onChange={(e) => setScope(e.target.value || null)}
      className="qf-input h-8 w-auto min-w-[8rem] max-w-full py-0.5 text-xs"
      title={t("ai.scopeHint")}
      aria-label={t("ai.scope")}
    >
      <option value="">{t("ai.scopeAny")}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {t("ai.scope")}: {p.name}
        </option>
      ))}
    </select>
  );
}

// Inline questionnaire form rendered when the model calls the `ask_choices`
// tool. Handles single-select (radio), multi-select (checkbox) and an optional
// "Other…" free-text field per question. On submit, we compose the answers as a
// plain-text user message so the model can read them in the next turn.
function ChoicesForm({
  questions,
  disabled,
  onSubmit,
}: {
  questions: {
    prompt: string;
    options?: string[];
    allowMultiple?: boolean;
    allowCustom?: boolean;
  }[];
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const t = useT();
  const [state, setState] = useState<Record<number, { picks: Set<string>; custom: string }>>(() => {
    const init: Record<number, { picks: Set<string>; custom: string }> = {};
    questions.forEach((_, i) => (init[i] = { picks: new Set(), custom: "" }));
    return init;
  });

  function toggle(qi: number, opt: string, multi: boolean) {
    setState((prev) => {
      const cur = prev[qi];
      const picks = new Set(cur.picks);
      if (multi) picks.has(opt) ? picks.delete(opt) : picks.add(opt);
      else {
        picks.clear();
        picks.add(opt);
      }
      return { ...prev, [qi]: { ...cur, picks } };
    });
  }

  function submit() {
    // Compose a text block the model can parse naturally.
    const lines: string[] = [];
    questions.forEach((q, i) => {
      const s = state[i];
      const parts: string[] = [];
      s.picks.forEach((p) => parts.push(p));
      if (s.custom.trim()) parts.push(s.custom.trim());
      if (parts.length === 0) return;
      lines.push(`${i + 1}. ${q.prompt} — ${parts.join(", ")}`);
    });
    const text = lines.join("\n");
    if (text) onSubmit(text);
  }

  const anyAnswered = Object.values(state).some((s) => s.picks.size > 0 || s.custom.trim());

  return (
    <div className="mt-2 rounded-xl border border-accent/30 bg-bg-elevated/40 p-3">
      <div className="qf-label text-accent mb-2">{t("ai.questionnaire")}</div>
      <div className="space-y-3">
        {questions.map((q, qi) => {
          const multi = !!q.allowMultiple;
          const hasOptions = (q.options ?? []).length > 0;
          const allowCustom = q.allowCustom !== false;
          const s = state[qi];
          return (
            <div key={qi}>
              <div className="text-sm text-ink">{q.prompt}</div>
              {hasOptions && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(q.options ?? []).map((opt) => {
                    const on = s.picks.has(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(qi, opt, multi)}
                        disabled={disabled}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          on
                            ? "border-accent bg-accent/15 text-accent-glow"
                            : "border-border text-ink-soft hover:border-ink-faint"
                        } disabled:opacity-50`}
                      >
                        {multi ? (on ? "☑" : "☐") : on ? "●" : "○"} {opt}
                      </button>
                    );
                  })}
                </div>
              )}
              {(allowCustom || !hasOptions) && (
                <input
                  value={s.custom}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, [qi]: { ...prev[qi], custom: e.target.value } }))
                  }
                  placeholder={hasOptions ? t("ai.qOther") : t("ai.qFreeAnswer")}
                  disabled={disabled}
                  className="qf-input mt-1.5 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !anyAnswered}
          className="qf-btn-primary text-xs"
        >
          {t("ai.qSubmit")}
        </button>
      </div>
    </div>
  );
}

// Pull "1) foo · 2) bar · 3) baz" (or numbered lines) out of an assistant reply
// so we can render quick-reply chips under a question. Returns [] when the text
// isn't a mini-questionnaire — we intentionally over-restrict to avoid rendering
// chips for random enumerations in a long paragraph.
function extractQuickReplies(text: string | undefined): string[] {
  if (!text || !/[?？]/.test(text)) return [];
  // Prefer newline-separated numbered lists, up to 6 entries, each short-ish.
  const lines: string[] = [];
  const linePattern = /^\s*(?:\(?(\d+)[.)\]]|[-*•])\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = linePattern.exec(text)) !== null) {
    const item = m[2].trim();
    if (item.length >= 1 && item.length <= 80) lines.push(item);
    if (lines.length >= 6) break;
  }
  if (lines.length >= 2) return lines;
  // Fallback: inline "1) foo · 2) bar" on a single line separated by • / · / |.
  const inline = text.match(/(?:\(?\d+[.)\]]\s*[^·•|\n]+(?:\s*[·•|]\s*|$)){2,}/);
  if (!inline) return [];
  const parts = inline[0]
    .split(/\s*[·•|]\s*/)
    .map((s) => s.replace(/^\(?\d+[.)\]]\s*/, "").trim())
    .filter((s) => s.length >= 1 && s.length <= 80);
  return parts.length >= 2 ? parts.slice(0, 6) : [];
}
