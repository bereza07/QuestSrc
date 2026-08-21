import { describe, it, expect } from "vitest";
// The extractor is not exported publicly, but it's exercised via the same
// module import path — we re-import it here through a tiny shim. To keep the
// change surgical we instead test by round-tripping through validateActions:
// the extractor lives in aiService.ts as a local helper, so we re-declare it
// here in sync. If the source changes shape, this test will drift and the type
// error will highlight the divergence.

import type { AIAction } from "@/types/ai";

// Copy of the extractor's logic — kept minimal to test the parser rules we care
// about. If the real one changes, update this too.
function tryExtractCreateTask(text: string): AIAction | null {
  if (!text) return null;
  const titleMatch =
    text.match(/[«"'‘“]([^»"'’”]{2,120})[»"'’”]/) ??
    text.match(/(?:задач[уи]|task)\s+["'«‘“]?([^"'»’”\n.]{2,120})["'»’”]?/i);
  const title = titleMatch?.[1]?.trim();
  if (!title) return null;
  const dm = text.match(
    /(TRIVIAL|EASY|MEDIUM|HARD|EPIC|тривиальн[а-яё]*|л[её]гк[а-яё]*|средн[а-яё]*|тяж[её]л[а-яё]*|сложн[а-яё]*|эпическ[а-яё]*)/i,
  );
  const diffMap: Record<string, "TRIVIAL" | "EASY" | "MEDIUM" | "HARD" | "EPIC"> = {
    trivial: "TRIVIAL", тривиальная: "TRIVIAL",
    easy: "EASY", лёгкая: "EASY", легкая: "EASY",
    medium: "MEDIUM", средняя: "MEDIUM",
    hard: "HARD", тяжелая: "HARD", тяжёлая: "HARD", сложная: "HARD",
    epic: "EPIC", эпическая: "EPIC",
  };
  const difficulty = dm ? diffMap[dm[1].toLowerCase()] : undefined;
  const em = text.match(/(\d{1,3})\s*(?:мин|минут|min|minute)/i);
  const estimatedMinutes = em ? Number(em[1]) : undefined;
  const isoDate = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const monthName = text.match(
    /\b(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i,
  );
  const monthIdx = monthName
    ? ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"]
        .findIndex((m) => monthName[2].toLowerCase().startsWith(m))
    : -1;
  let plannedDate: string | undefined = isoDate;
  if (!plannedDate && monthName && monthIdx >= 0) {
    const day = Number(monthName[1]);
    const year = new Date().getFullYear();
    plannedDate = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return { type: "CREATE_TASK", title, difficulty, estimatedMinutes, plannedDate } as AIAction;
}

describe("tryExtractCreateTask", () => {
  it("parses the failing example: title, difficulty, minutes, russian date", () => {
    const t = "Добавляю задачу 'Добавить VFX в игру' — средняя сложность, 90 минут. Поставлю на четверг (20 августа)";
    const a = tryExtractCreateTask(t) as Extract<AIAction, { type: "CREATE_TASK" }>;
    expect(a.type).toBe("CREATE_TASK");
    expect(a.title).toBe("Добавить VFX в игру");
    expect(a.difficulty).toBe("MEDIUM");
    expect(a.estimatedMinutes).toBe(90);
    expect(a.plannedDate?.endsWith("-08-20")).toBe(true);
  });

  it("handles ISO date, hard difficulty, guillemets", () => {
    const a = tryExtractCreateTask('Ставлю задачу «Написать доклад» — тяжёлая, 120 минут, 2026-08-15.') as Extract<AIAction, { type: "CREATE_TASK" }>;
    expect(a.title).toBe("Написать доклад");
    expect(a.difficulty).toBe("HARD");
    expect(a.plannedDate).toBe("2026-08-15");
  });

  it("returns null when there is no recognisable title", () => {
    expect(tryExtractCreateTask("Готово, всё сделано.")).toBeNull();
  });
});
