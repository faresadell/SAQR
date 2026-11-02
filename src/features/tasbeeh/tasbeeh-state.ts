/**
 * Electronic tasbeeh (dhikr counter): pure state logic, no React and no browser APIs.
 *
 * Rules that this module guarantees:
 *  - one accepted tap adds exactly one (taps closer than MIN_TAP_GAP_MS are treated as duplicate events);
 *  - the count never goes below zero;
 *  - the count is never reset by anything except an explicit reset / new-cycle / "new session" action;
 *  - nothing here knows about SAQR stars, packages, orders or money. It is a personal counter.
 */

export const DHIKR_OPTIONS = [
  { id: "subhan", label: "سبحان الله", text: "سبحان الله" },
  { id: "hamd", label: "الحمد لله", text: "الحمد لله" },
  { id: "akbar", label: "الله أكبر", text: "الله أكبر" },
  { id: "istighfar", label: "أستغفر الله", text: "أستغفر الله" },
  { id: "tahlil", label: "لا إله إلا الله", text: "لا إله إلا الله" },
  { id: "salat", label: "الصلاة على النبي ﷺ", text: "اللهم صلِّ وسلِّم على نبينا محمد" },
  { id: "custom", label: "ذكر مخصص", text: "" },
] as const;

export type DhikrId = (typeof DHIKR_OPTIONS)[number]["id"];

export const GOAL_PRESETS = [33, 99, 100, 1000] as const;
export const DEFAULT_GOAL = 33;
export const MIN_GOAL = 1;
export const MAX_GOAL = 100_000;
export const MAX_COUNT = 1_000_000;
export const MAX_CUSTOM_LENGTH = 60;
export const MAX_HISTORY = 100;
/** Touch screens can deliver several events for one physical tap; a human cannot tap faster than this. */
export const MIN_TAP_GAP_MS = 80;
export const TASBEEH_STORAGE_KEY = "saqr.tasbeeh.v1";

export interface SessionRecord {
  id: string;
  dhikrLabel: string;
  count: number;
  goal: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface TasbeehState {
  dhikrId: DhikrId;
  customText: string;
  goal: number;
  count: number;
  /** Epoch ms of the last accepted tap (0 = none). Used only for duplicate-event protection. */
  lastTapAt: number;
  startedAt: string | null;
  /** The user chose to keep going past the goal, so do not celebrate again for this goal. */
  goalContinued: boolean;
  /** Celebration dialog is open (transient; never stored). */
  goalPrompt: boolean;
  history: SessionRecord[];
}

export type TasbeehAction =
  | { type: "tap"; now: number }
  | { type: "undo" }
  | { type: "reset"; now: number }
  | { type: "setGoal"; goal: number }
  | { type: "changeDhikr"; dhikrId: DhikrId; customText?: string; mode: "keep" | "new"; now: number }
  | { type: "continue" }
  | { type: "newCycle"; now: number }
  | { type: "clearHistory" }
  | { type: "hydrate"; state: TasbeehState };

export const initialTasbeeh: TasbeehState = {
  dhikrId: "subhan",
  customText: "",
  goal: DEFAULT_GOAL,
  count: 0,
  lastTapAt: 0,
  startedAt: null,
  goalContinued: false,
  goalPrompt: false,
  history: [],
};

export function dhikrLabel(state: Pick<TasbeehState, "dhikrId" | "customText">): string {
  if (state.dhikrId === "custom") return state.customText.trim() || "ذكر مخصص";
  return DHIKR_OPTIONS.find((d) => d.id === state.dhikrId)?.label ?? "ذكر";
}

export function dhikrText(state: Pick<TasbeehState, "dhikrId" | "customText">): string {
  if (state.dhikrId === "custom") return state.customText.trim();
  return DHIKR_OPTIONS.find((d) => d.id === state.dhikrId)?.text ?? "";
}

export function isValidGoal(goal: number): boolean {
  return Number.isInteger(goal) && goal >= MIN_GOAL && goal <= MAX_GOAL;
}

export function cleanCustomText(raw: string): string {
  // Drop control characters, collapse whitespace, cap the length. React escapes output, this keeps stored data tidy.
  return raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_LENGTH);
}

function archive(state: TasbeehState, now: number): SessionRecord[] {
  if (state.count <= 0) return state.history;
  const endedAt = new Date(now).toISOString();
  const record: SessionRecord = {
    id: `${now}-${state.history.length}`,
    dhikrLabel: dhikrLabel(state),
    count: state.count,
    goal: state.goal,
    completed: state.count >= state.goal,
    startedAt: state.startedAt ?? endedAt,
    endedAt,
  };
  return [record, ...state.history].slice(0, MAX_HISTORY);
}

function cleared(state: TasbeehState): TasbeehState {
  return { ...state, count: 0, lastTapAt: 0, startedAt: null, goalContinued: false, goalPrompt: false };
}

export function tasbeehReducer(state: TasbeehState, action: TasbeehAction): TasbeehState {
  switch (action.type) {
    case "tap": {
      if (state.lastTapAt > 0 && action.now - state.lastTapAt < MIN_TAP_GAP_MS && action.now >= state.lastTapAt) return state;
      if (state.count >= MAX_COUNT) return state;
      const count = state.count + 1;
      return {
        ...state,
        count,
        lastTapAt: action.now,
        startedAt: state.startedAt ?? new Date(action.now).toISOString(),
        goalPrompt: !state.goalContinued && count === state.goal ? true : state.goalPrompt,
      };
    }
    case "undo": {
      if (state.count <= 0) return state;
      const count = state.count - 1;
      return {
        ...state,
        count,
        lastTapAt: 0,
        goalPrompt: false,
        goalContinued: count < state.goal ? false : state.goalContinued,
        startedAt: count === 0 ? null : state.startedAt,
      };
    }
    case "reset":
      return { ...cleared(state), history: archive(state, action.now) };
    case "setGoal": {
      if (!isValidGoal(action.goal)) return state;
      return { ...state, goal: action.goal, goalPrompt: false, goalContinued: state.count >= action.goal };
    }
    case "changeDhikr": {
      const customText = action.dhikrId === "custom" ? cleanCustomText(action.customText ?? "") : "";
      if (action.dhikrId === "custom" && customText === "") return state;
      if (action.dhikrId === state.dhikrId && customText === state.customText) return state;
      const base = action.mode === "new" ? { ...cleared(state), history: archive(state, action.now) } : state;
      return { ...base, dhikrId: action.dhikrId, customText, goalPrompt: false };
    }
    case "continue":
      return { ...state, goalPrompt: false, goalContinued: true };
    case "newCycle":
      return { ...cleared(state), history: archive({ ...state, goal: state.goal }, action.now) };
    case "clearHistory":
      return { ...state, history: [] };
    case "hydrate":
      return action.state;
  }
}

// ───────────── storage (strict parsing, no throwing) ─────────────

function isRecord(v: unknown): v is SessionRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" && r.id.length <= 64 &&
    typeof r.dhikrLabel === "string" && r.dhikrLabel.length <= MAX_CUSTOM_LENGTH + 20 &&
    typeof r.count === "number" && Number.isInteger(r.count) && r.count >= 0 && r.count <= MAX_COUNT &&
    typeof r.goal === "number" && isValidGoal(r.goal) &&
    typeof r.completed === "boolean" &&
    typeof r.startedAt === "string" && !Number.isNaN(Date.parse(r.startedAt)) &&
    typeof r.endedAt === "string" && !Number.isNaN(Date.parse(r.endedAt))
  );
}

/** Only the durable part is stored: the current counter and the session history. */
export function serializeTasbeeh(state: TasbeehState): string {
  const { dhikrId, customText, goal, count, startedAt, goalContinued, history } = state;
  return JSON.stringify({ v: 1, dhikrId, customText, goal, count, startedAt, goalContinued, history });
}

export function parseStoredTasbeeh(raw: string | null): TasbeehState {
  if (!raw) return initialTasbeeh;
  try {
    const p: unknown = JSON.parse(raw);
    if (typeof p !== "object" || p === null) return initialTasbeeh;
    const o = p as Record<string, unknown>;
    if (o.v !== 1) return initialTasbeeh;
    const dhikrId = DHIKR_OPTIONS.find((d) => d.id === o.dhikrId)?.id;
    if (!dhikrId) return initialTasbeeh;
    const customText = typeof o.customText === "string" ? cleanCustomText(o.customText) : "";
    if (dhikrId === "custom" && customText === "") return initialTasbeeh;
    const goal = typeof o.goal === "number" && isValidGoal(o.goal) ? o.goal : DEFAULT_GOAL;
    const count = typeof o.count === "number" && Number.isInteger(o.count) && o.count >= 0 && o.count <= MAX_COUNT ? o.count : 0;
    const history = Array.isArray(o.history) ? o.history.filter(isRecord).slice(0, MAX_HISTORY) : [];
    const startedAt = typeof o.startedAt === "string" && !Number.isNaN(Date.parse(o.startedAt)) && count > 0 ? o.startedAt : null;
    return {
      dhikrId,
      customText: dhikrId === "custom" ? customText : "",
      goal,
      count,
      lastTapAt: 0,
      startedAt,
      goalContinued: o.goalContinued === true && count >= goal,
      goalPrompt: false,
      history,
    };
  } catch {
    return initialTasbeeh;
  }
}
