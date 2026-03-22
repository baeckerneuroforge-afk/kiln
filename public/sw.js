// KILN Service Worker — PWA + Push Notifications
// Handles caching, offline fallback, and push notifications.

const CACHE_NAME = "kiln-v1";
const STATIC_CACHE = "kiln-static-v1";
const API_CACHE = "kiln-api-v1";

// Static assets to pre-cache for offline shell
const PRECACHE_URLS = [
  "/offline",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── Install: Pre-cache critical assets ──────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: Clean old caches ──────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first for API, cache-first for static ───

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip Clerk/auth requests
  if (url.pathname.startsWith("/api/auth") || url.hostname.includes("clerk")) return;

  // API requests: network-first, cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request, API_CACHE));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // HTML pages: network-first, offline fallback
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      networkFirstStrategy(request, CACHE_NAME).catch(() =>
        caches.match("/offline").then((r) => r || new Response("Offline", { status: 503 }))
      )
    );
    return;
  }
});

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/.test(pathname) ||
    pathname.startsWith("/_next/static/");
}

async function networkFirstStrategy(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Network and cache both failed");
  }
}

async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 503 });
  }
}

// ── Push Notifications ──────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "KILN", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192x192.png",
    badge: data.badge || "/badge-72.png",
    image: data.image || undefined,
    data: { url: data.url || "/dashboard" },
    vibrate: [100, 50, 100],
    tag: data.tag || "kiln-notification",
    renotify: !!data.tag,
    actions: data.actions || [
      { action: "open", title: "Anzeigen" },
      { action: "dismiss", title: "Verwerfen" },
    ],
  };

  // Approval-specific actions
  if (data.type === "approval_request" && data.approvalId) {
    options.actions = [
      { action: "approve", title: "Genehmigen" },
      { action: "reject", title: "Ablehnen" },
    ];
    options.data.approvalId = data.approvalId;
    options.data.type = "approval_request";
    options.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "KILN", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const data = event.notification.data || {};

  // Handle approval actions inline
  if (data.type === "approval_request" && data.approvalId) {
    if (event.action === "approve" || event.action === "reject") {
      event.waitUntil(
        fetch(`/api/approvals/${data.approvalId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: event.action }),
        }).catch(() => {
          // If offline, open the approval page instead
          return openUrl("/dashboard/operations");
        })
      );
      return;
    }
  }

  const url = data.url || "/dashboard";
  event.waitUntil(openUrl(url));
});

async function openUrl(url) {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Focus existing KILN tab if open
  for (const client of windowClients) {
    if (client.url.includes("/dashboard") && "focus" in client) {
      client.navigate(url);
      return client.focus();
    }
  }

  // Open new tab
  return self.clients.openWindow(url);
}
