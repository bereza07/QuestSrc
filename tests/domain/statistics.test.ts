import { describe, it, expect } from "vitest";
import {
  classifyTask,
  estimateDeltaPct,
  rangeFor,
  datesInRange,
  inRange,
} from "@/domain/statistics";

describe("classifyTask", () => {
  const today = "2026-08-12";
  it("completed / cancelled by status", () => {
    expect(classifyTask({ status: "COMPLETED", plannedDate: "2026-08-01" }, today)).toBe("completed");
    expect(classifyTask({ status: "CANCELLED", plannedDate: "2026-08-01" }, today)).toBe("cancelled");
  });
  it("open + past planned day = missed", () => {
    expect(classifyTask({ status: "TODO", plannedDate: "2026-08-11" }, today)).toBe("missed");
    expect(classifyTask({ status: "IN_PROGRESS", plannedDate: "2026-08-11" }, today)).toBe("missed");
  });
  it("open + today/future/unscheduled = pending", () => {
    expect(classifyTask({ status: "TODO", plannedDate: today }, today)).toBe("pending");
    expect(classifyTask({ status: "TODO", plannedDate: "2026-08-20" }, today)).toBe("pending");
    expect(classifyTask({ status: "TODO", plannedDate: null }, today)).toBe("pending");
  });
});

describe("estimateDeltaPct", () => {
  it("null without estimate or actual", () => {
    expect(estimateDeltaPct(null, 3600)).toBeNull();
    expect(estimateDeltaPct(60, 0)).toBeNull();
  });
  it("positive when actual exceeds estimate", () => {
    expect(estimateDeltaPct(60, 90 * 60)).toBe(50); // 90m vs 60m = +50%
  });
  it("negative when under", () => {
    expect(estimateDeltaPct(60, 30 * 60)).toBe(-50);
  });
});

describe("rangeFor", () => {
  it("week is Monday..Sunday", () => {
    // 2026-08-12 is a Wednesday
    expect(rangeFor("week", "2026-08-12")).toEqual({ from: "2026-08-10", to: "2026-08-16" });
  });
  it("month spans the whole month", () => {
    expect(rangeFor("month", "2026-08-12")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
  it("all is open-ended", () => {
    expect(rangeFor("all", "2026-08-12")).toEqual({ from: null, to: null });
  });
});

describe("datesInRange / inRange", () => {
  it("enumerates inclusive days", () => {
    expect(datesInRange("2026-08-10", "2026-08-12")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });
  it("open-ended nulls mean infinity", () => {
    expect(inRange("2026-01-01", null, null)).toBe(true);
    expect(inRange("2026-08-05", "2026-08-10", null)).toBe(false);
  });
});
