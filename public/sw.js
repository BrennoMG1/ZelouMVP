self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Use generic notification. */ }
  event.waitUntil(self.registration.showNotification("Zelou!", { body: "Você tem uma atualização ou horário pendente. Abra o Zelou! para conferir.", tag: data.tag ?? "zelou", data: { url: "/" } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) return client.focus();
    return self.clients.openWindow("/");
  }));
});
