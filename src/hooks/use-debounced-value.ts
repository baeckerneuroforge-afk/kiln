"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a debounced copy of the input that only updates `delayMs`
 * after the input stopped changing. Used to keep an expensive derived
 * value (validation, schema-mismatch) from recomputing on every
 * keystroke.
 *
 * Behaviour:
 *  - First render returns the initial value immediately (no flash).
 *  - Subsequent changes wait `delayMs` of stillness before propagating.
 *  - The "currently debouncing" flag lets the UI show a subtle "..."
 *    indicator instead of disappearing the previous result.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): {
  debouncedValue: T;
  isDebouncing: boolean;
} {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsDebouncing(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
      setIsDebouncing(false);
      timerRef.current = null;
    }, delayMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delayMs]);

  return { debouncedValue, isDebouncing };
}
