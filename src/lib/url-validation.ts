import dns from "dns/promises";

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT = 30_000; // 30 seconds
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SSRFBlockedError extends Error {
  constructor(message = "This URL cannot be accessed for security reasons.") {
    super(message);
    this.name = "SSRFBlockedError";
  }
}

export class SizeLimitExceededError extends Error {
  constructor(
    message = "Response too large. Maximum allowed is 10MB.",
    public readonly maxBytes = MAX_RESPONSE_SIZE,
    public readonly actualBytes?: number,
  ) {
    super(message);
    this.name = "SizeLimitExceededError";
  }
}

export class RedirectLimitExceededError extends Error {
  constructor(maxRedirects = MAX_REDIRECTS) {
    super(`Too many redirects. Maximum allowed is ${maxRedirects}.`);
    this.name = "RedirectLimitExceededError";
  }
}

export interface SafeFetchOptions extends RequestInit {
  maxResponseSize?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

// Private and reserved IPv4 ranges
const BLOCKED_IPV4_RANGES = [
  { prefix: "10.", mask: null },          // 10.0.0.0/8
  { prefix: "127.", mask: null },         // 127.0.0.0/8
  { prefix: "0.", mask: null },           // 0.0.0.0/8
  { prefix: "169.254.", mask: null },     // Link-local (AWS metadata)
  { prefix: "192.168.", mask: null },     // 192.168.0.0/16
];

function isPrivateIPv4(ip: string): boolean {
  // Simple prefix checks
  for (const range of BLOCKED_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) return true;
  }

  // 172.16.0.0/12 → 172.16.x.x through 172.31.x.x
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized.startsWith("fe80:") ||   // Link-local
    normalized.startsWith("fc") ||      // Unique local
    normalized.startsWith("fd") ||      // Unique local
    normalized === "::" ||              // Unspecified
    // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    (normalized.startsWith("::ffff:") && isPrivateIPv4(normalized.slice(7)))
  );
}

/**
 * Validate that a URL is safe to fetch (SSRF protection).
 * Checks protocol, hostname, and resolved IP addresses.
 */
export async function validateUrl(url: string): Promise<{ safe: boolean; error?: string }> {
  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, error: "Invalid URL format." };
  }

  // Only allow HTTP(S)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, error: "Only HTTP and HTTPS URLs are allowed." };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    return { safe: false, error: "This URL cannot be accessed for security reasons." };
  }

  // If hostname is an IP literal, check directly
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return { safe: false, error: "This URL cannot be accessed for security reasons." };
    }
    return { safe: true };
  }

  // IPv6 literal in brackets
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ipv6 = hostname.slice(1, -1);
    if (isPrivateIPv6(ipv6)) {
      return { safe: false, error: "This URL cannot be accessed for security reasons." };
    }
    return { safe: true };
  }

  // Resolve hostname and check all returned IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      return { safe: false, error: "Could not resolve hostname." };
    }

    for (const ip of allAddresses) {
      if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
        return { safe: false, error: "This URL cannot be accessed for security reasons." };
      }
    }
  } catch {
    return { safe: false, error: "Could not resolve hostname." };
  }

  return { safe: true };
}

/**
 * Fetch a URL with SSRF protection, timeout, and size limit.
 * Use this for any server-side fetch of a user-supplied URL.
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const {
    maxResponseSize = MAX_RESPONSE_SIZE,
    maxRedirects = MAX_REDIRECTS,
    timeoutMs = FETCH_TIMEOUT,
    signal: externalSignal,
    redirect = "follow",
    ...fetchOptions
  } = options;

  let currentUrl = url;
  let currentOptions: RequestInit = { ...fetchOptions };

  for (let redirectCount = 0; ; redirectCount += 1) {
    await assertSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromExternal = () => controller.abort();

    // Chain with any existing signal
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }

    try {
      const response = await fetch(currentUrl, {
        ...currentOptions,
        signal: controller.signal,
        // Disable Next.js fetch caching for user-supplied URLs
        cache: "no-store",
        // Follow redirects manually so each hop is re-validated.
        redirect: "manual",
      });

      checkContentLength(response, maxResponseSize);

      if (!REDIRECT_STATUSES.has(response.status)) {
        return response;
      }

      if (redirect === "manual") {
        return response;
      }
      if (redirect === "error") {
        throw new Error("Redirects are not allowed for this request.");
      }
      if (redirectCount >= maxRedirects) {
        throw new RedirectLimitExceededError(maxRedirects);
      }

      const location = response.headers.get("location");
      if (!location) {
        return response;
      }

      const nextUrl = new URL(location, currentUrl).toString();
      await assertSafeUrl(nextUrl);
      currentOptions = optionsForRedirect(currentOptions, response.status);
      currentUrl = nextUrl;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. The website may be slow or unreachable.`);
      }
      if (err instanceof TypeError && (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND"))) {
        throw new Error(`Could not connect to ${safeHostname(currentUrl)}. The website may be down or blocking requests.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }
}

async function assertSafeUrl(url: string): Promise<void> {
  const validation = await validateUrl(url);
  if (!validation.safe) {
    throw new SSRFBlockedError(validation.error || "This URL cannot be accessed for security reasons.");
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "the requested host";
  }
}

function checkContentLength(response: Response, maxResponseSize: number): void {
  const contentLength = response.headers.get("content-length");
  if (!contentLength) return;

  const parsed = parseInt(contentLength, 10);
  if (!Number.isFinite(parsed) || parsed <= maxResponseSize) return;

  throw new SizeLimitExceededError(
    `Response too large (${Math.round(parsed / 1024 / 1024)}MB). Maximum allowed is ${Math.round(maxResponseSize / 1024 / 1024)}MB.`,
    maxResponseSize,
    parsed,
  );
}

function optionsForRedirect(options: RequestInit, status: number): RequestInit {
  const method = String(options.method || "GET").toUpperCase();
  if (status !== 303 && !((status === 301 || status === 302) && method === "POST")) {
    return options;
  }

  const nextOptions: RequestInit = {
    ...options,
    method: "GET",
  };
  delete nextOptions.body;
  nextOptions.headers = removeBodyHeaders(nextOptions.headers);
  return nextOptions;
}

function removeBodyHeaders(headers: RequestInit["headers"]): RequestInit["headers"] {
  if (!headers) return headers;

  const blocked = new Set(["content-type", "content-length"]);
  if (headers instanceof Headers) {
    const next = new Headers(headers);
    for (const key of blocked) next.delete(key);
    return next;
  }

  if (Array.isArray(headers)) {
    return headers.filter(([key]) => !blocked.has(String(key).toLowerCase()));
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!blocked.has(key.toLowerCase())) next[key] = String(value);
  }
  return next;
}

/**
 * Read response body with a size limit. Use after safeFetch().
 * Streams the body and aborts if it exceeds MAX_RESPONSE_SIZE.
 */
export async function readResponseWithLimit(
  response: Response,
  maxResponseSize = MAX_RESPONSE_SIZE,
): Promise<string> {
  checkContentLength(response, maxResponseSize);

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    const size = new TextEncoder().encode(text).length;
    if (size > maxResponseSize) {
      throw new SizeLimitExceededError("Response too large. Maximum allowed is 10MB.", maxResponseSize, size);
    }
    return text;
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.length;
    if (totalSize > maxResponseSize) {
      reader.cancel();
      throw new SizeLimitExceededError("Response too large. Maximum allowed is 10MB.", maxResponseSize, totalSize);
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}
