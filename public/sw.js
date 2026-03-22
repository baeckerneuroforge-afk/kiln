// KILN Push Notification Service Worker
// Empfängt Web Push Notifications und zeigt sie als System-Benachrichtigung an.

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
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-72.png",
    data: { url: data.url || "/dashboard" },
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "Anzeigen" },
      { action: "dismiss", title: "Verwerfen" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "KILN", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Wenn schon ein KILN-Tab offen ist, fokussieren
      for (const client of windowClients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Neuen Tab öffnen
      return clients.openWindow(url);
    })
  );
});
