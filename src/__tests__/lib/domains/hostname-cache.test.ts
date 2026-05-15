/**
 * Sprint 19.8 — hostname → subOrgId TTL cache.
 */
import { describe, expect, it } from "vitest";
import { createHostnameCache } from "@/lib/domains/hostname-cache";

describe("createHostnameCache", () => {
  it("stores and returns a resolved mapping", () => {
    const cache = createHostnameCache();
    cache.set("ai.x.de", { subOrgId: "sub_1", status: "ACTIVE" });
    expect(cache.get("ai.x.de")).toMatchObject({
      subOrgId: "sub_1",
      status: "ACTIVE",
    });
  });

  it("normalises hostname to lower-case on get/set/delete", () => {
    const cache = createHostnameCache();
    cache.set("AI.X.DE", { subOrgId: "sub_1", status: "ACTIVE" });
    expect(cache.get("ai.x.de")).not.toBeNull();
    cache.delete("Ai.X.De");
    expect(cache.get("ai.x.de")).toBeNull();
  });

  it("expires entries after the TTL", () => {
    let now = 1_000_000;
    const cache = createHostnameCache({ ttlMs: 1_000, now: () => now });
    cache.set("ai.x.de", { subOrgId: "sub_1", status: "ACTIVE" });
    expect(cache.get("ai.x.de")).not.toBeNull();
    now += 1_500;
    expect(cache.get("ai.x.de")).toBeNull();
  });

  it("caches negative results (subOrgId=null)", () => {
    const cache = createHostnameCache();
    cache.set("typo.example.com", { subOrgId: null, status: null });
    const cached = cache.get("typo.example.com");
    expect(cached).not.toBeNull();
    expect(cached?.subOrgId).toBeNull();
  });

  it("evicts the oldest entry when maxEntries is exceeded", () => {
    const cache = createHostnameCache({ maxEntries: 2 });
    cache.set("a.com", { subOrgId: "1", status: "ACTIVE" });
    cache.set("b.com", { subOrgId: "2", status: "ACTIVE" });
    cache.set("c.com", { subOrgId: "3", status: "ACTIVE" });
    expect(cache.size()).toBeLessThanOrEqual(2);
    expect(cache.get("a.com")).toBeNull(); // oldest evicted
    expect(cache.get("c.com")).not.toBeNull();
  });

  it("clear empties the entire cache", () => {
    const cache = createHostnameCache();
    cache.set("a.com", { subOrgId: "1", status: "ACTIVE" });
    cache.set("b.com", { subOrgId: "2", status: "ACTIVE" });
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("a.com")).toBeNull();
  });
});
