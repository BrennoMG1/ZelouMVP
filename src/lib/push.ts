export function allowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}
