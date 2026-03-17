export const MAX_CSS_LENGTH = 50_000;

const HTML_TAG_PATTERN = /<[^>]*>/g;
const IMPORT_RULE_PATTERN = /@import[\s\S]*?(?:;|$)/gi;
const JAVASCRIPT_PATTERN = /javascript\s*:/gi;
const EXPRESSION_PATTERN = /expression\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi;
const MOZ_BINDING_PATTERN = /-moz-binding\s*:[^;}{]+;?/gi;
const URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function isSafeHttpsUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

export function sanitizeCss(rawCss: string): string {
  if (typeof rawCss !== "string" || rawCss.length === 0) {
    return "";
  }

  let sanitized = rawCss
    .replace(HTML_TAG_PATTERN, "")
    .replace(IMPORT_RULE_PATTERN, "")
    .replace(JAVASCRIPT_PATTERN, "")
    .replace(EXPRESSION_PATTERN, "")
    .replace(MOZ_BINDING_PATTERN, "")
    .replace(URL_PATTERN, (_match, quote: string, value: string) => {
      const normalized = value.trim();
      return isSafeHttpsUrl(normalized) ? `url(${quote}${normalized}${quote})` : "";
    })
    .replace(/\0/g, "");

  if (sanitized.length > MAX_CSS_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CSS_LENGTH);
  }

  return sanitized.trim();
}
