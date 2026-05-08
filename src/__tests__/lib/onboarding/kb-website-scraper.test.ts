import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchUrlContent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag", () => ({
  fetchUrlContent: mockFetchUrlContent,
}));

import { scrapeWebsitePages } from "@/lib/onboarding/kb-website-scraper";

describe("kb website scraper", () => {
  beforeEach(() => {
    mockFetchUrlContent.mockReset();
  });

  it("scrapes and strips html", async () => {
    mockFetchUrlContent.mockResolvedValueOnce("<html><head><title>FAQ</title></head><body><script>x</script><h1>Hello</h1><p>World</p></body></html>");
    const result = await scrapeWebsitePages(["https://x.test/faq"]);
    expect(result[0]).toMatchObject({ title: "FAQ", content: "FAQ Hello World" });
  });

  it("handles invalid urls gracefully", async () => {
    const result = await scrapeWebsitePages(["ftp://x.test/file"]);
    expect(result[0].error).toContain("Only http");
  });

  it("limits scrape batch to 20 urls", async () => {
    mockFetchUrlContent.mockResolvedValue("<title>X</title><p>Content</p>");
    const urls = Array.from({ length: 25 }, (_, index) => `https://x.test/${index}`);
    const result = await scrapeWebsitePages(urls);
    expect(result).toHaveLength(20);
  });
});
