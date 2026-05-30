/**
 * Sprint 20.2 P2 — apiError standardisierte Fehler-Antwort.
 */
import { describe, it, expect } from "vitest";
import { apiError } from "@/lib/api/response";

describe("apiError", () => {
  it("liefert { error } als String mit Status", async () => {
    const res = apiError("Unauthorized", 401);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("ergänzt code additiv; error bleibt String", async () => {
    const res = apiError("Forbidden", 403, "FORBIDDEN");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
    expect(typeof body.error).toBe("string");
  });

  it("setzt den Content-Type auf JSON", () => {
    const res = apiError("x", 400);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
