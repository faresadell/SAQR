"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  TASBEEH_STORAGE_KEY,
  initialTasbeeh,
  parseStoredTasbeeh,
  serializeTasbeeh,
  tasbeehReducer,
  type TasbeehAction,
  type TasbeehState,
} from "./tasbeeh-state";

export interface UseTasbeeh {
  state: TasbeehState;
  dispatch: (action: TasbeehAction) => void;
  /** False until the saved counter was read in the browser. */
  hydrated: boolean;
  /** False when the browser refuses storage (private mode, blocked). The counter still works for this visit. */
  storageAvailable: boolean;
}

/** Tasbeeh state with best-effort persistence to THIS device only (localStorage). Never talks to a server. */
export function useTasbeeh(): UseTasbeeh {
  const [state, dispatch] = useReducer(tasbeehReducer, initialTasbeeh);
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    try {
      dispatch({ type: "hydrate", state: parseStoredTasbeeh(window.localStorage.getItem(TASBEEH_STORAGE_KEY)) });
    } catch {
      setStorageAvailable(false);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.localStorage.setItem(TASBEEH_STORAGE_KEY, serializeTasbeeh(state));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, [state, hydrated]);

  const stableDispatch = useCallback((action: TasbeehAction) => dispatch(action), []);
  return { state, dispatch: stableDispatch, hydrated, storageAvailable };
}
