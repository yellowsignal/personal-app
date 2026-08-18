self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let raw = {};
      try {
        if (event.data) raw = event.data.json();
      } catch {
        /* ignore */
      }

      const declarative = raw && raw.web_push === 8030 && raw.notification ? raw.notification : null;
      const title = (declarative && declarative.title) || raw.title || "すみっチョぐらし";
      const body = (declarative && declarative.body) || raw.body || "";
      const navigate = (declarative && declarative.navigate) || raw.url || "/calendar";
      const tag = (declarative && declarative.tag) || raw.tag || "calendar-reminder";
      const silent = Boolean(declarative && declarative.silent);
      const unreadCount = typeof raw.unreadCount === "number" ? raw.unreadCount : null;

      if (unreadCount != null && self.navigator && "setAppBadge" in self.navigator) {
        try {
          if (unreadCount > 0) await self.navigator.setAppBadge(unreadCount);
          else await self.navigator.clearAppBadge();
        } catch {
          /* badge unsupported / denied */
        }
      }

      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192-v2.png",
        badge: "/icon-192-v2.png",
        tag,
        renotify: true,
        silent,
        vibrate: silent ? undefined : [180, 80, 180],
        requireInteraction: false,
        data: { url: navigate },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/calendar";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(target);
              return;
            } catch {
              /* fall through */
            }
          }
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
