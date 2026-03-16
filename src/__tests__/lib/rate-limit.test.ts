import { describe, expect, it } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";

function uniqueKey(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = uniqueKey("under-limit");

    const first = checkRateLimit(key);
    const second = checkRateLimit(key);
    const third = checkRateLimit(key);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(97);
  });

  it("blocks requests over the limit", () => {
    const key = uniqueKey("over-limit");

    for (let index = 0; index < 100; index++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
