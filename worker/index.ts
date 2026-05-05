/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("push", (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        vibrate: [200, 100, 200],
        data: {
          url: data.url || "/",
        },
      };

      event.waitUntil(sw.registration.showNotification(data.title, options));
    } catch (e) {
      console.error("Error parsing push notification data:", e);
      event.waitUntil(
        sw.registration.showNotification("KIMP Alert", {
          body: event.data.text(),
          icon: "/icon-192x192.png",
        })
      );
    }
  }
});

sw.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    sw.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      if (sw.clients.openWindow) {
        return sw.clients.openWindow(urlToOpen);
      }
    })
  );
});
