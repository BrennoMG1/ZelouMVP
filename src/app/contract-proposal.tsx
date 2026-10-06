"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { RequestReference } from "@/app/request-reference";
import { ScheduleFields, emptySchedule } from "@/app/planning-fields";
import { scheduleEstimate, scheduleSchema } from "@/lib/care-planning";

export function ContractProposal({ opportunityId, caregiverId, title, onClose }: { opportunityId: string; caregiverId: string; title: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [schedule, setSchedule] = useState(emptySchedule);
  const [amount, setAmount] = useState("");
  useEffect(() => { let live = true; void fetch("/api/opportunities").then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); const item = body.opportunities.find((item: { id: string }) => item.id === opportunityId); if (!live || !item) return; const parsed = scheduleSchema.safeParse(item.schedule); if (parsed.success) { setSchedule(parsed.data); setAmount(String(scheduleEstimate(parsed.data, Number(item.hourly_rate)))); } }).catch(cause => { if (live) setError(cause.message); }); return () => { live = false; }; }, [opportunityId]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className="contract-dialog" ref={dialog} aria-labelledby="proposal-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header className="contract-dialog-header"><div><h2 id="proposal-title">Propor contrato</h2><p>{title}</p><RequestReference id={opportunityId} /></div><button className="icon-button" disabled={saving} onClick={onClose} aria-label="Fechar proposta"><X /></button></header>
    <div className="contract-dialog-content"><section>{created ? <div role="status"><h3>Proposta enviada</h3><p>O contrato está disponível em Meus contratos para você e o cuidador. As duas partes precisam assinar.</p><button className="primary" onClick={onClose}>Concluir</button></div> : <>
      <p className="subtle">O cuidador precisa ter documentação aprovada. O valor abaixo corresponde ao período inteiro; a taxa da plataforma é de 10%.</p>
      <form className="opportunity-form" onSubmit={async event => {
        event.preventDefault(); const values = new FormData(event.currentTarget); setSaving(true); setError("");
        try {
          const parsed = scheduleSchema.safeParse(schedule); if (!parsed.success) throw new Error(parsed.error.issues.map(issue => issue.message).join(" "));
          const response = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId, caregiverId, grossAmount: Number(amount), terms: { conditions: values.get("terms"), schedule } }) });
          const body = await response.json(); if (!response.ok) throw new Error(body.error); setCreated(true);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a proposta."); } finally { setSaving(false); }
      }}><ScheduleFields value={schedule} onChange={setSchedule} /><label>Valor total do período (R$)<input name="amount" value={amount} onChange={event => setAmount(event.target.value)} type="number" min="0.01" max="1000000" step="0.01" required /></label><label className="opportunity-form-full">Tarefas, condições e forma de pagamento combinadas<textarea name="terms" required minLength={10} maxLength={5000} /></label><p className="subtle opportunity-form-full">Os plantões serão gerados após as duas assinaturas. O valor é uma proposta para o período inteiro; esta tela não executa pagamentos.</p>{error && <p role="alert" className="opportunity-form-full">{error}</p>}<button className="primary" disabled={saving}>{saving ? "Enviando..." : "Enviar proposta"}</button></form>
    </>}</section></div>
  </dialog>;
}
