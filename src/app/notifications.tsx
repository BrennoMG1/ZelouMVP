"use client";
import { PushSettings } from "@/app/push-settings";

import { useEffect, useState } from "react";

type Notification = { id: string; title: string; body: string; read_at: string | null; created_at: string };

export function NotificationsViewReal() {
  const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/notifications").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.notifications ?? []); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar notificações.")); }, []);
  const markRead = async (notificationId: string) => { const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId }) }); if (response.ok) setItems((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item)); };
  return <div className="notification-page"><PushSettings /><section className="panel"><div className="panel-head"><div><h2 className="panel-title">Notificações</h2><p className="subtle">Mensagens e atualizações dos seus contratos.</p></div></div>{error && <p role="alert" className="agenda-empty">{error}</p>}{!error && !items.length && <p className="agenda-empty">Tudo em dia. Nenhuma notificação.</p>}<div className="mini-list">{items.map((item) => <div className="mini-row notification-row" key={item.id}><div><p>{item.title}</p><small>{item.body} · {new Date(item.created_at).toLocaleDateString("pt-BR")}</small></div>{item.read_at ? <span className="status">Lida</span> : <button className="link" onClick={() => void markRead(item.id)}>Marcar como lida</button>}</div>)}</div></section></div>;
}
