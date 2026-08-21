import { describe, it, expect } from "vitest";
import { validateActions, clampNamedRewards } from "@/domain/aiValidation";
import type { AIAction } from "@/types/ai";

describe("clampNamedRewards", () => {
  it("keeps rewards within the band untouched", () => {
    const { rewards, clamped } = clampNamedRewards(
      [{ statName: "Programming", xp: 40 }],
      "MEDIUM",
    );
    expect(clamped).toBe(false);
    expect(rewards[0].xp).toBe(40);
  });

  it("scales down an over-band total (no 1000 XP button)", () => {
    const { rewards, clamped } = clampNamedRewards(
      [{ statName: "Programming", xp: 1000 }],
      "MEDIUM",
    );
    expect(clamped).toBe(true);
    const total = rewards.reduce((s, r) => s + r.xp, 0);
    expect(total).toBeLessThanOrEqual(60); // MEDIUM max
  });

  it("drops non-positive rewards", () => {
    const { rewards } = clampNamedRewards(
      [{ statName: "X", xp: 0 }, { statName: "Y", xp: -5 }],
      "EASY",
    );
    expect(rewards).toHaveLength(0);
  });
});

describe("validateActions", () => {
  it("clamps a CREATE_TASK with absurd XP and warns", () => {
    const actions: AIAction[] = [
      { type: "CREATE_TASK", title: "Fix a button", difficulty: "TRIVIAL", statRewards: [{ statName: "Programming", xp: 1000 }] },
    ];
    const { actions: out, warnings } = validateActions(actions);
    const task = out[0] as Extract<AIAction, { type: "CREATE_TASK" }>;
    const total = (task.statRewards ?? []).reduce((s, r) => s + r.xp, 0);
    expect(total).toBeLessThanOrEqual(10); // TRIVIAL max
    expect(warnings.some((w) => w.code === "clamped_xp")).toBe(true);
  });

  it("drops a titleless task", () => {
    const { actions } = validateActions([{ type: "CREATE_TASK", title: "  " } as AIAction]);
    expect(actions).toHaveLength(0);
  });

  it("drops entity-mutating actions without a taskId", () => {
    const { actions } = validateActions([
      { type: "COMPLETE_TASK", taskId: "" } as AIAction,
      { type: "MOVE_TASK", taskId: "", plannedDate: null } as AIAction,
    ]);
    expect(actions).toHaveLength(0);
  });

  it("flags bulk deletes", () => {
    const many: AIAction[] = Array.from({ length: 6 }, (_, i) => ({
      type: "DELETE_TASK",
      taskId: `t${i}`,
    }));
    const { warnings } = validateActions(many);
    expect(warnings.some((w) => w.code === "bulk_delete")).toBe(true);
  });

  it("caps a runaway action batch", () => {
    const many: AIAction[] = Array.from({ length: 50 }, (_, i) => ({
      type: "CREATE_TASK",
      title: `Task ${i}`,
    }));
    const { actions, warnings } = validateActions(many);
    expect(actions.length).toBe(30);
    expect(warnings.some((w) => w.code === "too_many_actions")).toBe(true);
  });

  it("defaults difficulty to MEDIUM on create", () => {
    const { actions } = validateActions([{ type: "CREATE_TASK", title: "Do a thing" }]);
    const task = actions[0] as Extract<AIAction, { type: "CREATE_TASK" }>;
    expect(task.difficulty).toBe("MEDIUM");
  });

  it("accepts CREATE_RULE, trims text, drops empty", () => {
    const { actions } = validateActions([
      { type: "CREATE_RULE", text: "  Don't exceed 4h/day  " } as AIAction,
      { type: "CREATE_RULE", text: "" } as AIAction,
    ]);
    expect(actions).toHaveLength(1);
    expect((actions[0] as Extract<AIAction, { type: "CREATE_RULE" }>).text).toBe("Don't exceed 4h/day");
  });

  it("drops UPDATE_RULE / DELETE_RULE without id", () => {
    const { actions } = validateActions([
      { type: "UPDATE_RULE", ruleId: "", text: "x" } as AIAction,
      { type: "DELETE_RULE", ruleId: "" } as AIAction,
      { type: "DELETE_RULE", ruleId: "r1" } as AIAction,
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("DELETE_RULE");
  });
});
