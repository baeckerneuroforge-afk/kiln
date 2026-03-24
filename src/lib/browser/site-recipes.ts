/**
 * Site Recipes — Pre-built extraction strategies for known websites.
 * For known sites: 0 LLM calls, pure DOM extraction, 2-5 seconds total.
 * Falls back gracefully to the normal LLM loop if a recipe fails.
 */

import type { BrowserSession } from "@/lib/browser-service";
import {
  executeScript,
  clickElement,
  typeText,
  getCurrentBrowserUrl,
} from "@/lib/browser-service";

/* ── Types ── */

export interface SiteRecipe {
  /** CSS selectors for search functionality */
  search?: {
    selector: string;
    submitSelector: string | null;
  };
  /** CSS selectors for product page data */
  product?: Record<string, string>;
  /** CSS selectors for search result items */
  searchResults?: {
    items: string;
    itemTitle: string;
    itemPrice?: string;
    itemLink?: string;
    itemImage?: string;
    itemSnippet?: string;
  };
  /** CSS selectors for shop/listing pages */
  shopPage?: {
    items: string;
    itemTitle: string;
    itemPrice?: string;
    itemLink?: string;
  };
  /** CSS selectors for obstacles on this site */
  obstacles?: {
    cookieBanner?: string;
    captcha?: string;
  };
}

export interface RecipeExtractionResult {
  success: boolean;
  data: Record<string, unknown>;
  items?: Array<Record<string, string | null>>;
  method: "recipe";
  recipeDomain: string;
  fieldsFound: string[];
  durationMs: number;
}

/* ── Recipe Database ── */

const SITE_RECIPES: Record<string, SiteRecipe> = {
  "amazon.de": {
    search: { selector: "#twotabsearchtextbox", submitSelector: "#nav-search-submit-button" },
    product: {
      title: "#productTitle",
      price: ".a-price .a-offscreen",
      availability: "#availability span",
      rating: "#acrPopover .a-icon-alt",
      image: "#landingImage",
      shipping: "#deliveryBlockMessage",
    },
    searchResults: {
      items: '[data-component-type="s-search-result"]',
      itemTitle: "h2 a span",
      itemPrice: ".a-price .a-offscreen",
      itemLink: "h2 a",
      itemImage: ".s-image",
    },
    obstacles: { cookieBanner: "#sp-cc-accept" },
  },
  "amazon.com": {
    search: { selector: "#twotabsearchtextbox", submitSelector: "#nav-search-submit-button" },
    product: {
      title: "#productTitle",
      price: ".a-price .a-offscreen",
      availability: "#availability span",
      rating: "#acrPopover .a-icon-alt",
      image: "#landingImage",
    },
    searchResults: {
      items: '[data-component-type="s-search-result"]',
      itemTitle: "h2 a span",
      itemPrice: ".a-price .a-offscreen",
      itemLink: "h2 a",
      itemImage: ".s-image",
    },
    obstacles: { cookieBanner: "#sp-cc-accept" },
  },
  "mediamarkt.de": {
    search: { selector: "#query", submitSelector: 'button[type="submit"]' },
    product: {
      title: '[data-test="product-title"]',
      price: '[data-test="branded-price"]',
      availability: '[data-test="availability"]',
    },
    searchResults: {
      items: '[data-test="mms-search-srp-productlist-item"]',
      itemTitle: '[data-test="product-title"]',
      itemPrice: '[data-test="branded-price"]',
      itemLink: 'a[href*="/product/"]',
    },
    obstacles: { cookieBanner: "#privacy-layer-accept-all-button" },
  },
  "saturn.de": {
    search: { selector: "#query", submitSelector: 'button[type="submit"]' },
    product: {
      title: '[data-test="product-title"]',
      price: '[data-test="branded-price"]',
      availability: '[data-test="availability"]',
    },
    searchResults: {
      items: '[data-test="mms-search-srp-productlist-item"]',
      itemTitle: '[data-test="product-title"]',
      itemPrice: '[data-test="branded-price"]',
      itemLink: 'a[href*="/product/"]',
    },
    obstacles: { cookieBanner: "#privacy-layer-accept-all-button" },
  },
  "apple.com": {
    product: {
      title: ".rf-flagship-hero-copy h1, .rf-bfe-header h1, h1",
      price: ".rf-flagship-hero-copy .rf-flagship-price, .rc-prices-fullprice",
      variants: ".rf-bfe-dimension-option",
    },
    shopPage: {
      items: ".rf-serp-product-image-link, .as-shop-product-tile",
      itemTitle: ".rf-serp-productname, .as-shop-product-tile-title",
      itemPrice: ".rf-serp-price-regular, .rf-serp-price-inline, .as-shop-product-tile-price",
    },
  },
  "ebay.de": {
    search: { selector: "#gh-ac", submitSelector: "#gh-btn" },
    searchResults: {
      items: ".s-item",
      itemTitle: ".s-item__title",
      itemPrice: ".s-item__price",
      itemLink: ".s-item__link",
    },
  },
  "ebay.com": {
    search: { selector: "#gh-ac", submitSelector: "#gh-btn" },
    searchResults: {
      items: ".s-item",
      itemTitle: ".s-item__title",
      itemPrice: ".s-item__price",
      itemLink: ".s-item__link",
    },
  },
  "idealo.de": {
    search: { selector: "#search-input, input[name=q]", submitSelector: "#search-button, button[type=submit]" },
    product: {
      title: ".oopStage-title, h1",
      price: ".productOffers-listItemOfferPrice",
      availability: ".productOffers-listItemAvailability",
    },
  },
  "google.com": {
    search: { selector: '#APjFqb, textarea[name="q"]', submitSelector: null },
    searchResults: {
      items: ".g",
      itemTitle: "h3",
      itemSnippet: ".VwiC3b",
      itemLink: "a[href]",
    },
  },
  "otto.de": {
    search: { selector: "#search-input, input[name=q]", submitSelector: 'button[type="submit"]' },
    product: {
      title: '[data-qa="productTitle"], h1',
      price: '[data-qa="price"], .prd_price__main',
      availability: '[data-qa="availability"]',
    },
    obstacles: { cookieBanner: "#onetrust-accept-btn-handler" },
  },
  "zalando.de": {
    search: { selector: 'input[name="q"]', submitSelector: null },
    product: {
      title: 'h1, [data-testid="product-name"]',
      price: '[data-testid="price"], .z-price',
      brand: '[data-testid="brand-name"]',
    },
    obstacles: { cookieBanner: "#uc-btn-accept-banner" },
  },
};

/* ── Recipe Matcher ── */

/**
 * Returns the recipe for a given URL's domain, or null if no recipe exists.
 */
export function getRecipeForUrl(url: string): { recipe: SiteRecipe; domain: string } | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Exact match first
    if (SITE_RECIPES[hostname]) {
      return { recipe: SITE_RECIPES[hostname], domain: hostname };
    }
    // Subdomain match (e.g., smile.amazon.de → amazon.de)
    for (const [domain, recipe] of Object.entries(SITE_RECIPES)) {
      if (hostname.endsWith(`.${domain}`) || hostname === domain) {
        return { recipe, domain };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ── Recipe Executor ── */

/**
 * Executes a product page extraction using a recipe.
 * Pure DOM selectors, 0 LLM calls.
 */
export async function executeRecipeProductExtraction(
  session: BrowserSession,
  url: string,
  recipe: SiteRecipe,
  domain: string,
): Promise<RecipeExtractionResult> {
  const start = Date.now();
  const selectors = recipe.product;
  if (!selectors || Object.keys(selectors).length === 0) {
    return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
  }

  // Dismiss cookie banner first
  if (recipe.obstacles?.cookieBanner) {
    await dismissObstacle(session, url, recipe.obstacles.cookieBanner);
  }

  const selectorEntries = Object.entries(selectors)
    .map(([field, sel]) => `${JSON.stringify(field)}: ${JSON.stringify(sel)}`)
    .join(", ");

  const script = `
    return (function() {
      const selectors = {${selectorEntries}};
      const result = {};
      for (const [field, sel] of Object.entries(selectors)) {
        try {
          // Try comma-separated selectors
          const sels = sel.split(', ');
          for (const s of sels) {
            const el = document.querySelector(s.trim());
            if (el) {
              result[field] = (el.getAttribute('content') || el.textContent || '').trim().slice(0, 1000);
              break;
            }
          }
        } catch {}
      }
      result._url = window.location.href;
      return result;
    })();
  `;

  try {
    const execResult = await executeScript(session, url, script);
    const raw = execResult.result as Record<string, string> | null;
    if (!raw) {
      return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
    }

    const data: Record<string, unknown> = {};
    const fieldsFound: string[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith("_")) continue;
      if (value && value.length > 0) {
        data[key] = value;
        fieldsFound.push(key);
      }
    }

    return {
      success: fieldsFound.length > 0,
      data,
      method: "recipe",
      recipeDomain: domain,
      fieldsFound,
      durationMs: Date.now() - start,
    };
  } catch {
    return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
  }
}

/**
 * Executes a search + extraction using a recipe.
 * Navigates to the site, searches, and extracts results.
 */
export async function executeRecipeSearch(
  session: BrowserSession,
  url: string,
  recipe: SiteRecipe,
  domain: string,
  query: string,
): Promise<RecipeExtractionResult> {
  const start = Date.now();

  if (!recipe.search || !recipe.searchResults) {
    return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
  }

  try {
    // 1. Dismiss cookie banner
    if (recipe.obstacles?.cookieBanner) {
      await dismissObstacle(session, url, recipe.obstacles.cookieBanner);
      await sleep(400);
    }

    // 2. Type in search
    const currentUrl = await getCurrentBrowserUrl(session).catch(() => url);
    await clickElement(session, currentUrl, recipe.search.selector);
    await sleep(200);
    await typeText(session, currentUrl, recipe.search.selector, query);
    await sleep(200);

    // 3. Submit
    if (recipe.search.submitSelector) {
      await clickElement(session, currentUrl, recipe.search.submitSelector);
    } else {
      // Press Enter via script
      await executeScript(session, currentUrl, `
        const el = document.querySelector(${JSON.stringify(recipe.search.selector)});
        if (el) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      `);
    }

    // 4. Wait for results
    await sleep(2000);

    // 5. Extract results
    const resultUrl = await getCurrentBrowserUrl(session).catch(() => currentUrl);
    const itemSel = recipe.searchResults.items;
    const titleSel = recipe.searchResults.itemTitle;
    const priceSel = recipe.searchResults.itemPrice || "null";
    const linkSel = recipe.searchResults.itemLink || "null";
    const snippetSel = recipe.searchResults.itemSnippet || "null";

    const script = `
      return (function() {
        const items = document.querySelectorAll(${JSON.stringify(itemSel)});
        return Array.from(items).slice(0, 10).map(el => ({
          title: el.querySelector(${JSON.stringify(titleSel)})?.textContent?.trim() || null,
          price: ${priceSel !== "null" ? `el.querySelector(${JSON.stringify(priceSel)})?.textContent?.trim() || null` : "null"},
          link: ${linkSel !== "null" ? `el.querySelector(${JSON.stringify(linkSel)})?.href || null` : "null"},
          snippet: ${snippetSel !== "null" ? `el.querySelector(${JSON.stringify(snippetSel)})?.textContent?.trim() || null` : "null"}
        })).filter(item => item.title);
      })();
    `;

    const execResult = await executeScript(session, resultUrl, script);
    const items = execResult.result as Array<Record<string, string | null>> | null;

    if (!items || items.length === 0) {
      return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
    }

    // Build data summary
    const data: Record<string, unknown> = {
      query,
      resultCount: items.length,
      sourceUrl: resultUrl,
    };

    // First result as primary data
    if (items[0]) {
      if (items[0].title) data.title = items[0].title;
      if (items[0].price) data.price = items[0].price;
      if (items[0].link) data.link = items[0].link;
    }

    // All results
    data.results = items;

    const fieldsFound = Object.keys(data).filter((k) => k !== "results" && data[k] != null);

    return {
      success: true,
      data,
      items,
      method: "recipe",
      recipeDomain: domain,
      fieldsFound,
      durationMs: Date.now() - start,
    };
  } catch {
    return { success: false, data: {}, method: "recipe", recipeDomain: domain, fieldsFound: [], durationMs: Date.now() - start };
  }
}

/* ── Helpers ── */

async function dismissObstacle(session: BrowserSession, url: string, selector: string): Promise<void> {
  try {
    await executeScript(session, url, `
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) el.click();
    `);
  } catch {
    // Ignorieren — obstacle may not be present
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a search query from the task description.
 * Returns null if no clear search intent is found.
 */
export function extractSearchQuery(task: string): string | null {
  // "search for X", "find X", "look for X"
  const searchMatch = task.match(
    /(?:search|find|look)\s+(?:for\s+)?["']?([^"'\n]{3,80})["']?/i
  );
  if (searchMatch) return searchMatch[1].trim();

  // "X on amazon.de" / "X price"
  const onSiteMatch = task.match(
    /["']?([^"'\n]{3,60})["']?\s+(?:on|at|from|bei|auf)\s+\S+/i
  );
  if (onSiteMatch) return onSiteMatch[1].trim();

  return null;
}

/**
 * Determines whether the current page is likely a product page vs. search results.
 * Uses URL patterns rather than LLM calls.
 */
export function isProductPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      /\/dp\//.test(path) ||          // Amazon product
      /\/product\//.test(path) ||     // Generic product
      /\/p\//.test(path) ||           // Short product path
      /\/item\//.test(path) ||        // eBay item
      /\/offer\//.test(path) ||       // Idealo offer
      /\/-p-/.test(path) ||           // MediaMarkt/Saturn
      /\/artikel\//.test(path)        // German article/product
    );
  } catch {
    return false;
  }
}
