"use client";
import { Bell } from "lucide-react";
import { useState } from "react";
export function PushSettings() {
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function change(enable: boolean) {
    setBusy(true); setNotice("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Este navegador não oferece notificações push.");
      const registration = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        const response = await fetch("/api/push"); const body = await response.json(); if (!response.ok) throw new Error(body.error);
        if (!body.publicKey) throw new Error("Os lembretes externos ainda não foram habilitados pela plataforma.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Permita notificações nas configurações do navegador.");
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: body.publicKey });
        const saved = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        const result = await saved.json(); if (!saved.ok) throw new Error(result.error); setNotice("Notificações ativadas neste navegador.");
      } else {
        if (subscription) { const response = await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); if (!response.ok) throw new Error("Não foi possível desativar as notificações."); await subscription.unsubscribe(); }
        setNotice("Notificações desativadas neste navegador.");
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Não foi possível alterar as notificações."); } finally { setBusy(false); }
  }
  return <section className="push-settings"><div className="push-settings-copy"><span className="push-settings-icon"><Bell size={19} /></span><div><h2>Este dispositivo</h2><p>Lembretes de mensagens e agenda, mesmo com a página fechada.</p></div></div><div className="push-settings-actions"><button className="primary" disabled={busy} onClick={() => void change(true)}>{busy ? "Aguarde..." : "Ativar"}</button><button className="filter" disabled={busy} onClick={() => void change(false)}>Desativar</button></div>{notice && <p className="push-notice" role="status">{notice}</p>}</section>;
}
