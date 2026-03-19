/**
 * Screenshot Service
 * Nimmt Screenshots von URLs via screenshotone.com API.
 * Fallback: Kein Screenshot wenn kein API Key konfiguriert.
 */

const SCREENSHOT_CACHE = new Map<string, { base64: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Screenshot-Optionen
 */
interface ScreenshotOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  format?: "png" | "jpeg";
  fullPage?: boolean;
}

/**
 * Nimmt einen Screenshot einer URL.
 * Gibt base64-kodierten PNG zurück, oder null wenn kein API Key.
 */
export async function takeScreenshot(
  url: string,
  options: ScreenshotOptions = {}
): Promise<string | null> {
  const apiKey = process.env.SCREENSHOT_API_KEY;
  if (!apiKey) {
    return null; // HTML-only Modus
  }

  // Cache prüfen
  const cacheKey = `${url}:${options.viewportWidth || 1280}:${options.viewportHeight || 800}`;
  const cached = SCREENSHOT_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.base64;
  }

  const {
    viewportWidth = 1280,
    viewportHeight = 800,
    format = "png",
    fullPage = false,
  } = options;

  try {
    const params = new URLSearchParams({
      access_key: apiKey,
      url,
      format,
      viewport_width: String(viewportWidth),
      viewport_height: String(viewportHeight),
      full_page: String(fullPage),
      block_ads: "true",
      block_cookie_banners: "true",
      timeout: "15",
    });

    const response = await fetch(
      `https://api.screenshotone.com/take?${params.toString()}`,
      { signal: AbortSignal.timeout(20000) }
    );

    if (!response.ok) {
      console.error(`[Screenshot] API error: ${response.status} for ${url}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Cache speichern
    SCREENSHOT_CACHE.set(cacheKey, { base64, timestamp: Date.now() });

    // Cache aufräumen (max 50 Einträge)
    if (SCREENSHOT_CACHE.size > 50) {
      const entries = Array.from(SCREENSHOT_CACHE.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toDelete = entries.slice(0, SCREENSHOT_CACHE.size - 50);
      for (const entry of toDelete) {
        SCREENSHOT_CACHE.delete(entry[0]);
      }
    }

    return base64;
  } catch (err) {
    console.error(`[Screenshot] Failed for ${url}:`, err);
    return null;
  }
}

/**
 * Prüft ob der Screenshot-Service konfiguriert ist.
 */
export function isScreenshotServiceAvailable(): boolean {
  return !!process.env.SCREENSHOT_API_KEY;
}
