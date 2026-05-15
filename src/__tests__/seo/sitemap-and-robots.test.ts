/**
 * Sprint 19.10 — sitemap + robots SEO surface.
 */
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

describe("sitemap()", () => {
  it("includes core marketing pages", () => {
    const out = sitemap();
    const paths = out.map((entry) => entry.url);
    expect(paths.some((p) => p.endsWith("/"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/pricing"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/faq"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/agencies"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/enterprise"))).toBe(true);
  });

  it("includes the 6 feature deep-dive pages", () => {
    const out = sitemap();
    const paths = out.map((entry) => entry.url);
    expect(paths.some((p) => p.endsWith("/features/multi-agent-workflows"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/features/agency-billing"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/features/white-label-sub-orgs"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/features/byok-mcp-a2a"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/features/self-learning-rag"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/features/multi-channel"))).toBe(true);
  });

  it("includes legal pages", () => {
    const out = sitemap();
    const paths = out.map((entry) => entry.url);
    expect(paths.some((p) => p.endsWith("/privacy"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/terms"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/dpa"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/impressum"))).toBe(true);
  });

  it("does NOT include auth-walled or internal routes", () => {
    const out = sitemap();
    const paths = out.map((entry) => entry.url);
    expect(paths.some((p) => p.includes("/dashboard"))).toBe(false);
    expect(paths.some((p) => p.includes("/api"))).toBe(false);
    expect(paths.some((p) => p.includes("/sign-in"))).toBe(false);
  });

  it("uses an absolute URL with a recognised scheme as the base", () => {
    const out = sitemap();
    const root = out.find((e) => e.url.endsWith("/")) ?? out[0];
    expect(root.url).toMatch(/^https?:\/\//);
  });

  it("each entry has lastModified + changeFrequency + priority", () => {
    const out = sitemap();
    for (const entry of out) {
      expect(entry.lastModified).toBeDefined();
      expect(entry.changeFrequency).toBeDefined();
      expect(typeof entry.priority).toBe("number");
    }
  });

  it("/ has the highest priority (1.0)", () => {
    const out = sitemap();
    const root = out.find((e) => e.url.endsWith("/"));
    expect(root?.priority).toBe(1.0);
  });

  it("/pricing has higher priority than /faq", () => {
    const out = sitemap();
    const pricing = out.find((e) => e.url.endsWith("/pricing"));
    const faq = out.find((e) => e.url.endsWith("/faq"));
    expect((pricing?.priority ?? 0) > (faq?.priority ?? 0)).toBe(true);
  });
});

describe("robots()", () => {
  it("allows /", () => {
    const out = robots();
    const rule = Array.isArray(out.rules) ? out.rules[0] : out.rules!;
    expect(rule.allow).toBe("/");
  });

  it("disallows /dashboard and /api", () => {
    const out = robots();
    const rule = Array.isArray(out.rules) ? out.rules[0] : out.rules!;
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    expect(disallow).toContain("/dashboard");
    expect(disallow).toContain("/api/");
  });

  it("disallows sign-in/sign-up + agency-entry custom-domain routes", () => {
    const out = robots();
    const rule = Array.isArray(out.rules) ? out.rules[0] : out.rules!;
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    expect(disallow).toContain("/sign-in");
    expect(disallow).toContain("/sign-up");
    expect(disallow).toContain("/a/_agency-entry");
  });

  it("points to the sitemap.xml", () => {
    const out = robots();
    expect(out.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
