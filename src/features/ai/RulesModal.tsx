import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useT } from "@/i18n";
import { Modal } from "@/components/Modal";
import { IconPlus, IconTrash } from "@/components/icons";
import type { AIRule } from "@/data/repositories/aiRuleRepo";

// Пользовательские правила ассистента — постоянная память. Они инжектятся в
// системный промпт до контекста; ассистент обязан их соблюдать. Пользователь
// может добавлять/редактировать/удалять правила прямо из чата.
export function RulesModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const repos = useAppStore((s) => s.repos);

  const [rules, setRules] = useState<AIRule[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  async function reload() {
    if (!repos) return;
    setRules(await repos.aiRules.list());
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  async function add() {
    const v = draft.trim();
    if (!v || !repos) return;
    await repos.aiRules.add(v);
    setDraft("");
    await reload();
  }

  async function save(id: string) {
    if (!repos) return;
    const v = editingText.trim();
    if (v) await repos.aiRules.update(id, v);
    setEditingId(null);
    setEditingText("");
    await reload();
  }

  async function remove(id: string) {
    if (!repos) return;
    await repos.aiRules.remove(id);
    await reload();
  }

  return (
    <Modal title={t("ai.rulesTitle")} onClose={onClose} wide>
      <p className="text-xs text-fg-3">{t("ai.rulesBlurb")}</p>

      <div className="mt-4 space-y-2">
        {rules.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-fg-3">
            {t("ai.rulesEmpty")}
          </div>
        )}
        {rules.map((r) => (
          <div
            key={r.id}
            className="group flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
          >
            {editingId === r.id ? (
              <>
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={2}
                  className="qf-input flex-1 resize-none text-sm"
                  autoFocus
                />
                <button className="qf-btn-primary shrink-0 text-xs" onClick={() => save(r.id)}>
                  {t("ai.rulesEdit")}
                </button>
                <button
                  className="qf-btn-ghost shrink-0 text-xs"
                  onClick={() => {
                    setEditingId(null);
                    setEditingText("");
                  }}
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditingId(r.id);
                    setEditingText(r.text);
                  }}
                  className="flex-1 text-left text-sm text-fg-2 hover:text-fg"
                  title={t("common.edit")}
                >
                  {r.text}
                </button>
                <button
                  onClick={() => remove(r.id)}
                  title={t("ai.rulesRemove")}
                  className="shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100 hover:text-danger"
                >
                  <IconTrash size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2 border-t border-border pt-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={t("ai.rulesPlaceholder")}
          rows={2}
          className="qf-input flex-1 resize-none text-sm"
        />
        <button
          className="qf-btn-primary shrink-0"
          onClick={add}
          disabled={!draft.trim()}
        >
          <IconPlus size={14} /> {t("ai.rulesAdd")}
        </button>
      </div>

      <div className="mt-3 text-right text-[11px] text-fg-3">
        {t("ai.rulesCount", { count: rules.length })}
      </div>
    </Modal>
  );
}
