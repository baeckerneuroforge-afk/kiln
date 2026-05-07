import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMaskedApiKey, testProviderApiKey } from "@/lib/api-key-testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api key connection testing", () => {
  it("tests OpenAI keys with a lightweight models request", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testProviderApiKey("openai", "sk-test")).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-test" },
      }),
    );
  });

  it("returns provider errors without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "invalid_api_key" } }), { status: 401 }),
    ));

    await expect(testProviderApiKey("openai", "sk-invalid")).resolves.toEqual({
      success: false,
      error: "invalid_api_key",
    });
  });

  it("formats provider-aware masked keys", () => {
    expect(formatMaskedApiKey("anthropic", "sk-ant-123456xy12")).toBe("sk-ant-***xy12");
    expect(formatMaskedApiKey("openai", "sk-abcdefzz99")).toBe("sk-***zz99");
  });
});
