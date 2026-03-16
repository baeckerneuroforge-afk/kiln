import dns from "dns/promises";

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT = 30_000; // 30 seconds

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
  options: RequestInit = {}
): Promise<Response> {
  const validation = await validateUrl(url);
  if (!validation.safe) {
    throw new Error(validation.error || "This URL cannot be accessed for security reasons.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  // Chain with any existing signal
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    // Check Content-Length header
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      throw new Error(`Response too large (${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB). Maximum allowed is 10MB.`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read response body with a size limit. Use after safeFetch().
 * Streams the body and aborts if it exceeds MAX_RESPONSE_SIZE.
 */
export async function readResponseWithLimit(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.length;
    if (totalSize > MAX_RESPONSE_SIZE) {
      reader.cancel();
      throw new Error("Response too large. Maximum allowed is 10MB.");
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}
