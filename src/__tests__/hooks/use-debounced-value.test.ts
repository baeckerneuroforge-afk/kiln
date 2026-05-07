// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("first", 300));
    expect(result.current.debouncedValue).toBe("first");
  });

  it("does not propagate the new value before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    // 200ms < 300ms — still old value
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.debouncedValue).toBe("first");
    expect(result.current.isDebouncing).toBe(true);

    // After full 300ms — new value, no longer debouncing
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.debouncedValue).toBe("second");
    expect(result.current.isDebouncing).toBe(false);
  });

  it("resets the timer on rapid changes (debounce, not throttle)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    // Burst of 3 changes within 100ms each — debounced value never updates
    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "d" });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Total elapsed = 300ms but each rerender reset the timer.
    expect(result.current.debouncedValue).toBe("a");

    // Now wait the full 300ms after the last change.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.debouncedValue).toBe("d");
  });

  it("flags isDebouncing while waiting", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "x" } },
    );

    // Initial render kicks off debounce timer too — but value matches.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.isDebouncing).toBe(false);

    rerender({ value: "y" });
    expect(result.current.isDebouncing).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.isDebouncing).toBe(false);
  });
});
