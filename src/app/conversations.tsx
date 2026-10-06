"use client";

import { Search, Send, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { scheduleSummary } from "@/lib/care-planning";
import { confirmNavigation } from "@/lib/hooks/use-unsaved-navigation";

type Conversation = { id: string; opportunity_id: string; contact_name: string; opportunity_title: string; unread: number; last_body: string; blocked: boolean; peer_read_at: string | null };
type Message = { id: string; sender_id: string; body: string; created_at: string; kind?: string };

export function ConversationsViewClean({ initialConversationId = null, onOpenContract }: { initialConversationId?: string | null; onOpenContract?: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  const [currentUserId, setCurrentUserId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState<{ before: string; beforeId: string } | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const historyLoaded = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const selection = useRef(selectedId);
  const sendVersion = useRef(0);

  useEffect(() => {
    let live = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch("/api/conversations", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (live) {
          setConversations(body.conversations); setCurrentUserId(body.currentUserId); setListError("");
          const next = body.conversations.some((item: Conversation) => item.id === selection.current) ? selection.current : body.conversations[0]?.id ?? null;
          if (next !== selection.current) {
            selection.current = next; sendVersion.current += 1; historyLoaded.current = false;
            setMessages([]); setDraft(""); setNextCursor(null); setError(""); setLoadingMessages(!!next); setSelectedId(next);
          }
        }
      } catch (cause) { if (live) setListError(cause instanceof Error ? cause.message : "Não foi possível carregar conversas."); }
      finally { pending = false; if (live) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refresh);
    return () => { live = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    selection.current = selectedId;
    if (!selectedId) return;
    let live = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      const version = sendVersion.current;
      try {
        const response = await fetch(`/api/conversations/${selectedId}/messages`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        // An older response must not erase a message just sent.
        if (live && selection.current === selectedId && version === sendVersion.current) {
          if (body.currentUserId) setCurrentUserId(body.currentUserId);
          setMessages(current => [...new Map([...current, ...body.messages].map((message: Message) => [message.id, message])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
          if (!historyLoaded.current) setNextCursor(body.nextCursor); setError("");
          if (!document.hidden && document.hasFocus() && body.messages.length) await fetch("/api/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selectedId, action: "read", seenMessageId: body.messages.at(-1).id }) });
        }
      } catch (cause) { if (live) setError(cause instanceof Error ? cause.message : "Não foi possível carregar mensagens."); }
      finally { pending = false; if (live) setLoadingMessages(false); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    window.addEventListener("focus", refresh);
    return () => { live = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [selectedId]);

  const select = (id: string) => {
    if (id === selectedId) return;
    if (!confirmNavigation()) return;
    sendVersion.current += 1;
    selection.current = id; historyLoaded.current = false; setNextCursor(null); setSelectedId(id); setMessages([]); setDraft(""); setError(""); setLoadingMessages(true);
  };
  const send = async () => {
    if (!selectedId || !draft.trim() || sending) return;
    const targetId = selectedId;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/conversations/${targetId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      sendVersion.current += 1;
      if (selection.current === targetId) {
        setMessages(current => current.some(message => message.id === body.message.id) ? current : [...current, body.message]); setDraft(""); document.querySelector('.chat-composer')?.dispatchEvent(new Event('zelou:saved', { bubbles: true })); bottom.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (cause) { if (selection.current === targetId) setError(cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem."); }
    finally { setSending(false); }
  };
  const visible = conversations.filter(item => `${item.contact_name} ${item.opportunity_title}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const selected = conversations.find(item => item.id === selectedId);
  async function manage(action: string) {
    const reason = action === "report" ? window.prompt("Descreva o motivo da denúncia (mínimo 10 caracteres):") : undefined;
    if (action === "report" && !reason) return;
    try { const response = await fetch("/api/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selectedId, action, reason }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); if (action === "report") window.alert("Denúncia registrada para análise."); else setConversations(current => current.map(item => item.id === selectedId ? { ...item, blocked: action === "block" } : item)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a conversa."); }
  }
  async function earlier() {
    if (!nextCursor || !selectedId) return;
    const target = selectedId; setLoadingEarlier(true);
    try { const response = await fetch(`/api/conversations/${target}/messages?${new URLSearchParams(nextCursor)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); if (selection.current === target) { historyLoaded.current = true; setMessages(current => [...new Map([...body.messages, ...current].map((message: Message) => [message.id, message])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))); setNextCursor(body.nextCursor); } } catch (cause) { if (selection.current === target) setError(cause instanceof Error ? cause.message : "Falha ao carregar histórico."); } finally { setLoadingEarlier(false); }
  }
  return <section className="chat-shell">
    <aside className="chat-list"><div className="chat-list-head"><div><h2 className="panel-title">Mensagens</h2><p className="subtle">Contatos das suas oportunidades</p></div></div>
      <div className="chat-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contato ou oportunidade" aria-label="Pesquisar conversas" /></div>
      {loading && <p className="agenda-empty">Carregando contatos...</p>}
      {listError && <p role="alert" className="agenda-empty">{listError} Tentaremos novamente automaticamente.</p>}
      {visible.map(item => <button key={item.id} className={`chat-contact ${selectedId === item.id ? "active" : ""}`} onClick={() => select(item.id)}><span className="chat-avatar">{item.contact_name.slice(0, 2).toUpperCase()}</span><span className="chat-contact-copy"><strong>{item.contact_name} {item.unread > 0 && <span className="status">{item.unread} não lidas</span>}</strong><small>{item.opportunity_title}</small><small>{item.last_body?.slice(0, 80)}</small></span></button>)}
      {!loading && !listError && !visible.length && <p className="agenda-empty">{search ? "Nenhum contato encontrado." : "Nenhuma conversa. Abra uma conversa pelas oportunidades ou candidaturas."}</p>}
    </aside>
    <div className="chat-window">{error && <p role="alert" className="agenda-empty">{error}</p>}{selected ? <>
      <header className="chat-header"><span className="chat-avatar">{selected.contact_name.slice(0, 2).toUpperCase()}</span><div><strong>{selected.contact_name}</strong><small>{selected.opportunity_title}</small><small>Requisição: {selected.opportunity_id}</small></div><button className="filter" onClick={() => void manage(selected.blocked ? "unblock" : "block")}>{selected.blocked ? "Desbloquear" : "Bloquear"}</button><button className="filter" onClick={() => void manage("report")}>Denunciar</button></header>
      <ConversationContext key={selected.id} id={selected.id} onOpenContract={onOpenContract} />
      <div className="chat-notice"><ShieldCheck size={14} /> Use a área privada do contrato para endereço, contato de emergência e orientações de cuidado.</div>
      <div className="chat-messages" role="log" aria-label="Mensagens da conversa" aria-live="polite">{nextCursor && <button className="filter" disabled={loadingEarlier} onClick={() => void earlier()}>Carregar mensagens anteriores</button>}{loadingMessages && <p className="agenda-empty">Carregando mensagens...</p>}{!loadingMessages && !messages.length && !error && <p className="agenda-empty">Conversa iniciada. Envie a primeira mensagem.</p>}{messages.map(message => <div className={`chat-message ${message.kind === "system" ? "system" : message.sender_id === currentUserId ? "mine" : "theirs"}`} key={message.id}><strong className="chat-sender">{message.kind === "system" ? "Zelou!" : message.sender_id === currentUserId ? "Você" : selected.contact_name}</strong><span>{message.body}</span><small>{new Date(message.created_at).toLocaleString("pt-BR")}{message.sender_id === currentUserId && selected.peer_read_at && Date.parse(message.created_at) <= Date.parse(selected.peer_read_at) ? " · Lida" : ""}</small></div>)}<div ref={bottom} /></div>
      <form key={selectedId} className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}><input value={draft} disabled={sending || selected.blocked} maxLength={5000} onChange={event => setDraft(event.target.value)} placeholder={selected.blocked ? "Conversa bloqueada" : "Digite uma mensagem"} aria-label="Mensagem" /><button className="chat-send" disabled={sending || selected.blocked || !draft.trim()} aria-label="Enviar mensagem"><Send size={18} /></button></form>
    </> : <p className="agenda-empty">Selecione uma conversa.</p>}</div>
  </section>;
}

function ConversationContext({ id, onOpenContract }: { id: string; onOpenContract?: (id: string) => void }) {
  const [context, setContext] = useState<{ opportunity: { title: string; description: string; approximate_region: string; schedule: unknown; requirements: string } | null; contracts: { id: string; status: string }[] } | null>(null);
  const [error, setError] = useState("");
  return <details className="chat-context" onToggle={event => { if (!event.currentTarget.open) return; void fetch(`/api/conversations/${id}/context`).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setContext(body); setError(""); }).catch(cause => setError(cause.message)); }}><summary>Ver vaga e contratos desta conversa</summary>{error && <p role="alert">{error}</p>}{context?.opportunity && <><strong>{context.opportunity.title}</strong><p>{context.opportunity.approximate_region}</p><p>{scheduleSummary(context.opportunity.schedule)}</p><p>{context.opportunity.description}</p><p>{context.opportunity.requirements}</p></>}{context?.contracts.map(contract => <button className="filter" key={contract.id} onClick={() => onOpenContract?.(contract.id)}>Abrir contrato · {contract.status}</button>)}{context?.contracts.length === 0 && <p>Ainda não há contrato nesta conversa.</p>}</details>;
}
