"use client";
/**
 * useArcadeRun — the demo run engine.
 *
 * A run is an ordered list of "beats" (pure state transforms) played on a
 * timer. The driver pauses at approval "gates" until a human approves, which
 * is what makes the human-in-the-loop story real rather than cosmetic.
 *
 * The same state shape (ArcadeState) would be produced by a real agent
 * backend; only the source of the beats would change.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ArcadeState, TerminalLine } from "./types";
import { applyBeat, buildBeats, freshState, type Beat, type RunPlan } from "./engine";

interface RunState {
  s: ArcadeState;
  cursor: number;
  running: boolean;
  /** The beats being played — the demo by default, a live plan once loaded. */
  beats: Beat[];
  /** The state a reset returns to (matches the current plan). */
  initial: ArcadeState;
  /** True once a real assessment plan has been loaded. */
  live: boolean;
}

type Action =
  | { type: "APPLY"; beat: Beat }
  | { type: "ADVANCE" }
  | { type: "START" }
  | { type: "SET_RUNNING"; running: boolean }
  | { type: "RESET" }
  | { type: "LOAD_DEMO" }
  | { type: "LOAD_PLAN"; plan: RunPlan; autostart?: boolean }
  | { type: "APPROVE"; id: string }
  | { type: "REJECT"; id: string }
  | { type: "REQUEST_DESTRUCTIVE" }
  | { type: "SET_PROVIDER"; id: string; connected: boolean };

/** Omit that keeps a union a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function demoState(): RunState {
  return { s: freshState(), cursor: 0, running: false, beats: buildBeats(), initial: freshState(), live: false };
}

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "START":
      return { ...state, running: true };
    case "SET_RUNNING":
      return { ...state, running: action.running };
    case "ADVANCE":
      return { ...state, cursor: state.cursor + 1 };
    case "APPLY":
      return { ...state, s: applyBeat(state.s, action.beat) };
    case "RESET":
      // Back to this plan's starting state, keeping the loaded beats.
      return { ...state, s: state.initial, cursor: 0, running: false };
    case "LOAD_DEMO":
      // Discard any live plan and return to the scripted sample.
      return demoState();
    case "LOAD_PLAN":
      return { s: action.plan.initial, initial: action.plan.initial, beats: action.plan.beats, cursor: 0, running: !!action.autostart, live: true };
    case "APPROVE":
      return {
        ...state,
        running: true,
        s: {
          ...state.s,
          approvals: state.s.approvals.map((a) => (a.id === action.id ? { ...a, status: "approved" } : a)),
        },
      };
    case "REJECT":
      // Drop the approval and pause. Resuming re-creates the gate's pending
      // approval, so a reject sends you back to the decision rather than a
      // dead end. (For a destructive request, this simply cancels it.)
      return {
        ...state,
        running: false,
        s: {
          ...state.s,
          approvals: state.s.approvals.filter((a) => a.id !== action.id),
        },
      };
    case "REQUEST_DESTRUCTIVE":
      if (state.s.approvals.some((a) => a.id === "reset-sandbox" && a.status === "pending")) return state;
      return {
        ...state,
        s: {
          ...state.s,
          approvals: [
            ...state.s.approvals,
            {
              id: "reset-sandbox",
              kind: "destructive",
              status: "pending",
              title: "Reset the isolated test environment",
              reason: "The attacker agent wants to delete and rebuild the disposable sandbox database.",
              target: "sandbox-7f2c · postgres (disposable)",
            },
          ],
        },
      };
    case "SET_PROVIDER":
      return {
        ...state,
        s: {
          ...state.s,
          providers: state.s.providers.map((p) => (p.id === action.id ? { ...p, connected: action.connected } : p)),
        },
      };
    default:
      return state;
  }
}

export function useArcadeRun() {
  const [state, dispatch] = useReducer(reducer, undefined, demoState);
  const beats = state.beats;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!state.running) return;
    if (state.cursor >= beats.length) {
      dispatch({ type: "SET_RUNNING", running: false });
      return;
    }
    const beat = beats[state.cursor];

    // Pause at a gate whose approval has not been granted yet.
    if (beat.t === "gate") {
      const appr = state.s.approvals.find((a) => a.id === beat.approvalId);
      if (!appr) {
        // create the pending approval, then stop and wait
        dispatch({ type: "APPLY", beat });
        dispatch({ type: "SET_RUNNING", running: false });
        return;
      }
      if (appr.status === "pending") {
        dispatch({ type: "SET_RUNNING", running: false });
        return;
      }
      if (appr.status === "rejected") {
        dispatch({ type: "SET_RUNNING", running: false });
        return;
      }
      // approved → skip past the gate
      dispatch({ type: "ADVANCE" });
      return;
    }

    timer.current = setTimeout(() => {
      dispatch({ type: "APPLY", beat });
      dispatch({ type: "ADVANCE" });
    }, beat.delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.running, state.cursor, state.s.approvals, beats]);

  const start = useCallback(() => dispatch({ type: "START" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const resetDemo = useCallback(() => dispatch({ type: "LOAD_DEMO" }), []);
  const loadPlan = useCallback((plan: RunPlan, autostart = true) => dispatch({ type: "LOAD_PLAN", plan, autostart }), []);
  const approve = useCallback((id: string) => dispatch({ type: "APPROVE", id }), []);
  const reject = useCallback((id: string) => dispatch({ type: "REJECT", id }), []);
  const requestDestructive = useCallback(() => dispatch({ type: "REQUEST_DESTRUCTIVE" }), []);
  const dismissApproval = useCallback((id: string) => dispatch({ type: "APPROVE", id }), []);
  const setProvider = useCallback(
    (id: string, connected: boolean) => dispatch({ type: "SET_PROVIDER", id, connected }),
    [],
  );

  /** Write a real line into the terminal — output from something that actually ran, not a scripted beat. */
  const appendTerminal = useCallback((line: TerminalLine) => dispatch({ type: "APPLY", beat: { t: "term", line, delay: 0 } }), []);
  /**
   * Apply one state change immediately. This is how a real driver (a git commit, an agent
   * turn, a test run) reports what actually happened, using the same vocabulary the demo plays.
   */
  const apply = useCallback((beat: DistributiveOmit<Beat, "delay">) => dispatch({ type: "APPLY", beat: { ...beat, delay: 0 } as Beat }), []);

  const pendingApproval = state.s.approvals.find((a) => a.status === "pending");
  const progress = Math.min(1, state.cursor / Math.max(1, beats.length));
  const done = state.cursor >= beats.length;

  return {
    state: state.s,
    running: state.running,
    progress,
    pendingApproval,
    /** True once a real assessment plan has been loaded (vs the demo). */
    live: state.live,
    /** All beats have played. */
    done,
    start,
    reset,
    resetDemo,
    loadPlan,
    approve,
    reject,
    requestDestructive,
    setProvider,
    dismissApproval,
    appendTerminal,
    apply,
  };
}

export type ArcadeRun = ReturnType<typeof useArcadeRun>;
