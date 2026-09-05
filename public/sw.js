// Notification-only service worker.
//
// Chrome delivers notifications posted through a service worker registration to
// the macOS Notification Center far more reliably than ones built with
// `new Notification()` from a page — it is the same path WhatsApp Web uses.
//
// There is deliberately no fetch handler here: this worker must never cache the
// app, or a stale build could outlive a deploy.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.location.origin));
    if (open) {
      await open.focus();
      open.postMessage({ type: "open-chat", channelId: event.notification.data?.channelId ?? null });
      return;
    }
    await self.clients.openWindow("/");
  })());
});
