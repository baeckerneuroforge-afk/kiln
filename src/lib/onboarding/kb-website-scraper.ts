import { fetchUrlContent } from "@/lib/rag";

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  error?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || fallback;
}

export async function scrapeWebsitePages(urls: string[]): Promise<ScrapedPage[]> {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean))).slice(0, 20);
  return Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { url, title: url, content: "", error: "Only http and https URLs are supported" };
        }
        const html = await fetchUrlContent(url);
        return {
          url,
          title: extractTitle(html, parsed.hostname),
          content: stripHtml(html).slice(0, 50000),
        };
      } catch (err) {
        return {
          url,
          title: url,
          content: "",
          error: err instanceof Error ? err.message : "URL scrape failed",
        };
      }
    })
  );
}
