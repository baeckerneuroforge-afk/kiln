import { describe, expect, it } from "vitest";

import { MAX_CSS_LENGTH, sanitizeCss } from "@/lib/css-sanitizer";

describe("sanitizeCss", () => {
  it("allows normal CSS", () => {
    const css = "body { font-family: Arial; color: #333; }";

    expect(sanitizeCss(css)).toBe(css);
  });

  it("strips @import rules", () => {
    const sanitized = sanitizeCss("@import url('https://evil.com/theme.css'); body { color: red; }");

    expect(sanitized).not.toContain("@import");
    expect(sanitized).toContain("body { color: red; }");
  });

  it("strips javascript URLs", () => {
    const sanitized = sanitizeCss('body { background-image: url("javascript:alert(1)"); }');

    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain('url("javascript:alert(1)")');
  });

  it("strips expression() calls", () => {
    const sanitized = sanitizeCss("div { width: expression(alert('x')); color: red; }");

    expect(sanitized).not.toContain("expression(");
    expect(sanitized).toContain("color: red");
  });

  it("strips HTML tags", () => {
    const sanitized = sanitizeCss("<style>body { color: red; }</style><script>alert(1)</script>");

    expect(sanitized).toContain("body { color: red; }");
    expect(sanitized).not.toContain("<style>");
    expect(sanitized).not.toContain("<script>");
  });

  it("truncates at 50000 chars", () => {
    const sanitized = sanitizeCss(`body { color: red; }${"a".repeat(MAX_CSS_LENGTH + 100)}`);

    expect(sanitized).toHaveLength(MAX_CSS_LENGTH);
  });
});
