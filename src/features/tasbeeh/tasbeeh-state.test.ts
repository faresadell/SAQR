import { describe, expect, it } from "vitest";
import {
  DEFAULT_GOAL,
  MIN_TAP_GAP_MS,
  initialTasbeeh,
  parseStoredTasbeeh,
  serializeTasbeeh,
  tasbeehReducer as reduce,
  type TasbeehState,
} from "./tasbeeh-state";

const T0 = 1_700_000_000_000;
function taps(state: TasbeehState, n: number, start = T0): TasbeehState {
  let s = state;
  for (let i = 0; i < n; i++) s = reduce(s, { type: "tap", now: start + i * 200 });
  return s;
}

describe("counting", () => {
  it("adds one per accepted tap", () => {
    expect(taps(initialTasbeeh, 5).count).toBe(5);
  });

  it("ignores duplicate events fired within the minimum gap", () => {
    let s = reduce(initialTasbeeh, { type: "tap", now: T0 });
    s = reduce(s, { type: "tap", now: T0 + 5 });
    s = reduce(s, { type: "tap", now: T0 + MIN_TAP_GAP_MS - 1 });
    expect(s.count).toBe(1);
    s = reduce(s, { type: "tap", now: T0 + MIN_TAP_GAP_MS });
    expect(s.count).toBe(2);
  });

  it("undo removes one, never goes negative, and allows an immediate next tap", () => {
    let s = taps(initialTasbeeh, 2);
    s = reduce(s, { type: "undo" });
    expect(s.count).toBe(1);
    s = reduce(s, { type: "undo" });
    s = reduce(s, { type: "undo" });
    expect(s.count).toBe(0);
    expect(s.startedAt).toBeNull();
    s = reduce(s, { type: "tap", now: T0 + 1 });
    expect(s.count).toBe(1);
  });
});

describe("goal", () => {
  it("opens the celebration exactly when the goal is reached", () => {
    let s = taps(initialTasbeeh, DEFAULT_GOAL - 1);
    expect(s.goalPrompt).toBe(false);
    s = reduce(s, { type: "tap", now: T0 + 10_000 });
    expect(s.count).toBe(DEFAULT_GOAL);
    expect(s.goalPrompt).toBe(true);
  });

  it("continue keeps counting without celebrating again", () => {
    let s = taps(initialTasbeeh, DEFAULT_GOAL);
    s = reduce(s, { type: "continue" });
    s = reduce(s, { type: "tap", now: T0 + 20_000 });
    expect(s.count).toBe(DEFAULT_GOAL + 1);
    expect(s.goalPrompt).toBe(false);
  });

  it("new cycle saves the finished session and starts again at zero", () => {
    let s = taps(initialTasbeeh, DEFAULT_GOAL);
    s = reduce(s, { type: "newCycle", now: T0 + 30_000 });
    expect(s.count).toBe(0);
    expect(s.goalPrompt).toBe(false);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ count: DEFAULT_GOAL, completed: true });
  });

  it("accepts presets and custom goals but rejects invalid ones", () => {
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: 99 }).goal).toBe(99);
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: 250 }).goal).toBe(250);
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: 0 }).goal).toBe(DEFAULT_GOAL);
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: -5 }).goal).toBe(DEFAULT_GOAL);
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: 2.5 }).goal).toBe(DEFAULT_GOAL);
    expect(reduce(initialTasbeeh, { type: "setGoal", goal: 10_000_000 }).goal).toBe(DEFAULT_GOAL);
  });

  it("changing the goal never resets the count", () => {
    const s = reduce(taps(initialTasbeeh, 10), { type: "setGoal", goal: 100 });
    expect(s.count).toBe(10);
  });
});

describe("reset and dhikr change", () => {
  it("reset zeroes the counter and keeps a record of what was counted", () => {
    const s = reduce(taps(initialTasbeeh, 12), { type: "reset", now: T0 + 40_000 });
    expect(s.count).toBe(0);
    expect(s.history[0]).toMatchObject({ count: 12, completed: false });
  });

  it("reset on an empty counter adds no history entry", () => {
    expect(reduce(initialTasbeeh, { type: "reset", now: T0 }).history).toHaveLength(0);
  });

  it("changing dhikr with 'keep' continues the same session", () => {
    const s = reduce(taps(initialTasbeeh, 7), { type: "changeDhikr", dhikrId: "hamd", mode: "keep", now: T0 + 50_000 });
    expect(s.dhikrId).toBe("hamd");
    expect(s.count).toBe(7);
    expect(s.history).toHaveLength(0);
  });

  it("changing dhikr with 'new' saves the old session and starts at zero", () => {
    const s = reduce(taps(initialTasbeeh, 7), { type: "changeDhikr", dhikrId: "akbar", mode: "new", now: T0 + 50_000 });
    expect(s.dhikrId).toBe("akbar");
    expect(s.count).toBe(0);
    expect(s.history[0]).toMatchObject({ count: 7, dhikrLabel: "سبحان الله" });
  });

  it("a custom dhikr needs text, and its text is cleaned and capped", () => {
    expect(reduce(initialTasbeeh, { type: "changeDhikr", dhikrId: "custom", customText: "   ", mode: "keep", now: T0 }).dhikrId).toBe("subhan");
    const s = reduce(initialTasbeeh, { type: "changeDhikr", dhikrId: "custom", customText: `ذكر\n\n  طويل ${"ا".repeat(200)}`, mode: "keep", now: T0 });
    expect(s.dhikrId).toBe("custom");
    expect(s.customText.length).toBeLessThanOrEqual(60);
    expect(s.customText).not.toContain("\n");
  });
});

describe("history and storage", () => {
  it("clears history only when asked", () => {
    let s = reduce(taps(initialTasbeeh, 3), { type: "reset", now: T0 + 1000 });
    expect(s.history).toHaveLength(1);
    s = reduce(s, { type: "clearHistory" });
    expect(s.history).toHaveLength(0);
  });

  it("round-trips the durable state and drops the transient parts", () => {
    const s = reduce(taps(initialTasbeeh, DEFAULT_GOAL), { type: "setGoal", goal: 33 });
    const back = parseStoredTasbeeh(serializeTasbeeh({ ...s, goalPrompt: true }));
    expect(back.count).toBe(s.count);
    expect(back.goalPrompt).toBe(false);
    expect(back.lastTapAt).toBe(0);
  });

  it("falls back to a fresh counter for corrupt or tampered data", () => {
    expect(parseStoredTasbeeh(null)).toEqual(initialTasbeeh);
    expect(parseStoredTasbeeh("{bad json")).toEqual(initialTasbeeh);
    expect(parseStoredTasbeeh(JSON.stringify({ v: 2 }))).toEqual(initialTasbeeh);
    expect(parseStoredTasbeeh(JSON.stringify({ v: 1, dhikrId: "nope" }))).toEqual(initialTasbeeh);
    const negative = parseStoredTasbeeh(JSON.stringify({ v: 1, dhikrId: "subhan", customText: "", goal: 33, count: -4, history: [] }));
    expect(negative.count).toBe(0);
    const badGoal = parseStoredTasbeeh(JSON.stringify({ v: 1, dhikrId: "subhan", customText: "", goal: 0, count: 3, history: [] }));
    expect(badGoal.goal).toBe(DEFAULT_GOAL);
  });
});
