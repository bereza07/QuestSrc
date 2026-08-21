// Pure validation of AI-proposed actions (spec §17, §50). This is the safety
// gate that stops the AI from breaking the XP economy or doing bulk-destructive
// operations silently. It NEVER applies anything — it only cleans, clamps, and
// flags. The UI still requires an explicit Confirm.

import { XP_BANDS } from "./xp";
import type { Difficulty } from "@/types";
import type {
  AIAction,
  AIStatRewardByName,
  AIWarning,
  ValidatedActions,
} from "@/types/ai";

const MAX_ACTIONS = 30;
const BULK_DELETE_WARN = 5;
const BULK_COMPLETE_WARN = 10;

/** Clamp named stat rewards so their total stays within the difficulty band. */
export function clampNamedRewards(
  rewards: AIStatRewardByName[],
  difficulty: Difficulty,
): { rewards: AIStatRewardByName[]; clamped: boolean } {
  const cleaned = rewards
    .map((r) => ({ statName: r.statName, xp: Math.round(r.xp) }))
    .filter((r) => r.statName && r.xp > 0);
  if (cleaned.length === 0) return { rewards: cleaned, clamped: false };

  const band = XP_BANDS[difficulty];
  const total = cleaned.reduce((s, r) => s + r.xp, 0);
  if (total <= band.max) return { rewards: cleaned, clamped: false };

  const scale = band.max / total;
  const scaled = cleaned.map((r) => ({
    ...r,
    xp: Math.max(1, Math.round(r.xp * scale)),
  }));
  let over = scaled.reduce((s, r) => s + r.xp, 0) - band.max;
  for (let i = 0; over > 0 && i < scaled.length; i++) {
    const take = Math.min(scaled[i].xp - 1, over);
    scaled[i].xp -= take;
    over -= take;
  }
  return { rewards: scaled, clamped: true };
}

export function validateActions(actions: AIAction[]): ValidatedActions {
  const warnings: AIWarning[] = [];
  let list = Array.isArray(actions) ? actions : [];

  if (list.length > MAX_ACTIONS) {
    warnings.push({
      code: "too_many_actions",
      params: { count: list.length, max: MAX_ACTIONS },
    });
    list = list.slice(0, MAX_ACTIONS);
  }

  const out: AIAction[] = [];
  let deletes = 0;
  let completes = 0;

  for (const a of list) {
    switch (a?.type) {
      case "CREATE_TASK": {
        if (!a.title?.trim()) {
          warnings.push({ code: "skipped_no_title" });
          break;
        }
        const difficulty: Difficulty = a.difficulty ?? "MEDIUM";
        const { rewards, clamped } = clampNamedRewards(a.statRewards ?? [], difficulty);
        if (clamped) {
          warnings.push({ code: "clamped_xp", params: { title: a.title, difficulty } });
        }
        out.push({ ...a, difficulty, statRewards: rewards });
        break;
      }
      case "CREATE_GOAL":
        if (!a.title?.trim()) warnings.push({ code: "skipped_no_title" });
        else out.push(a);
        break;
      case "CREATE_PROJECT":
        if (!a.name?.trim()) warnings.push({ code: "skipped_no_name" });
        else out.push({ ...a, name: a.name.trim() });
        break;
      case "ASK_CHOICES": {
        const qs = Array.isArray(a.questions) ? a.questions : [];
        const cleaned = qs
          .filter((q) => typeof q?.prompt === "string" && q.prompt.trim())
          .slice(0, 6) // cap: never render more than 6 questions at once
          .map((q) => ({
            prompt: q.prompt.trim(),
            options: Array.isArray(q.options)
              ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 8)
              : [],
            allowMultiple: !!q.allowMultiple,
            allowCustom: q.allowCustom !== false, // default true
          }));
        if (cleaned.length === 0) warnings.push({ code: "skipped_no_name" });
        else out.push({ type: "ASK_CHOICES", questions: cleaned });
        break;
      }
      case "CREATE_STAT":
        if (!a.name?.trim()) warnings.push({ code: "skipped_no_name" });
        else out.push(a);
        break;
      case "CREATE_ACHIEVEMENT": {
        const validMetrics = new Set([
          "completedCount",
          "currentStreak",
          "longestStreak",
          "characterLevel",
          "focusedSeconds",
        ]);
        const key = a.key?.trim();
        const at = Number(a.condition?.atLeast);
        if (!key || !a.name?.trim() || !a.description?.trim()) {
          warnings.push({ code: "skipped_no_name" });
        } else if (!validMetrics.has(a.condition?.metric) || !(at > 0)) {
          warnings.push({ code: "unknown_action" });
        } else {
          out.push({
            ...a,
            key: key.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40),
          });
        }
        break;
      }
      case "MOVE_TASK":
        if (!a.taskId) warnings.push({ code: "skipped_no_task" });
        else out.push(a);
        break;
      case "UPDATE_TASK":
        if (!a.taskId) warnings.push({ code: "skipped_no_task" });
        else out.push(a);
        break;
      case "COMPLETE_TASK":
        if (!a.taskId) warnings.push({ code: "skipped_no_task" });
        else {
          completes++;
          out.push(a);
        }
        break;
      case "DELETE_TASK":
        if (!a.taskId) warnings.push({ code: "skipped_no_task" });
        else {
          deletes++;
          out.push(a);
        }
        break;
      case "CREATE_RULE":
        if (!a.text?.trim()) warnings.push({ code: "skipped_no_name" });
        else out.push({ ...a, text: a.text.trim().slice(0, 500) });
        break;
      case "UPDATE_RULE":
        if (!a.ruleId || !a.text?.trim()) warnings.push({ code: "skipped_no_task" });
        else out.push({ ...a, text: a.text.trim().slice(0, 500) });
        break;
      case "DELETE_RULE":
        if (!a.ruleId) warnings.push({ code: "skipped_no_task" });
        else out.push(a);
        break;
      default:
        warnings.push({ code: "unknown_action" });
    }
  }

  if (deletes > BULK_DELETE_WARN) {
    warnings.push({ code: "bulk_delete", params: { count: deletes } });
  }
  if (completes > BULK_COMPLETE_WARN) {
    warnings.push({ code: "bulk_complete", params: { count: completes } });
  }

  return { actions: out, warnings };
}
