"use client";

import { useCallback, useEffect, useState } from "react";

type Medication = { id: string; contract_id: string; name: string; dosage: string; instructions: string; interval_hours: number; next_due_at: string; ends_at: string | null; active: boolean; contracts: { status: string; starts_at: string; ends_at: string | null } };
type Administration = { id: string; medication_id: string; scheduled_at: string; administered_at: string; outcome: string; notes: string };
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR");
function due(m: Medication, now: number) {
  return m.active && m.contracts.status === "active" && Date.parse(m.contracts.starts_at) <= now && (!m.contracts.ends_at || Date.parse(m.contracts.ends_at) >= now) && Date.parse(m.next_due_at) <= now;
}

export function ContractMedications({ contractId, role, status }: { contractId: string; role: "client" | "caregiver"; status: string }) {
  const [items, setItems] = useState<Medication[]>([]);
  const [history, setHistory] = useState<Administration[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch(`/api/medications?contractId=${contractId}&page=${page}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setItems(body.medications); setHistory(body.administrations); setNow(Date.now()); setLoadError(""); setHistoryError(body.historyError ?? ""); setHasMore(body.hasMore);
  }, [contractId, page]);
  useEffect(() => {
    const refresh = () => { if (document.hidden) return; void load().catch(cause => setLoadError(cause.message)).finally(() => setLoading(false)); };
    refresh(); const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const save = async (payload: object, method: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/medications", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load(); window.dispatchEvent(new Event("medications-changed")); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); return false; }
    finally { setBusy(false); }
  };
  return <section className="medication-section"><h3>Medicamentos e horários</h3><p className="subtle">Registre a rotina conforme a prescrição: medicamento, dose e orientações. Horários exibidos no fuso deste dispositivo. Os lembretes são atualizados a cada 30 segundos com o site aberto.</p>
    {loadError && <p role="alert">{loadError} <button className="link" onClick={() => void load().catch(cause => setLoadError(cause.message))}>Tentar novamente</button></p>}{historyError && <p role="alert">{historyError}</p>}{error && <p role="alert">{error}</p>}{loading && <p>Carregando medicamentos...</p>}
    {role === "client" && !["cancelled", "completed"].includes(status) && <details><summary>Adicionar medicamento</summary><form className="opportunity-form" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      const saved = await save({ contractId, name: data.get("name"), dosage: data.get("dosage"), instructions: data.get("instructions"), intervalHours: Number(data.get("interval")), startsAt: new Date(String(data.get("start"))).toISOString(), endsAt: data.get("end") ? new Date(String(data.get("end"))).toISOString() : null }, "POST");
      if (saved) form.reset();
    }}><label>Medicamento<input name="name" required maxLength={160} /></label><label>Dose prescrita<input name="dosage" required maxLength={160} placeholder="Ex.: 1 comprimido" /></label><label>Intervalo em horas<input name="interval" type="number" min={1} max={720} step={1} required /></label><label>Primeiro horário<input name="start" type="datetime-local" required /></label><label>Fim da rotina (opcional)<input name="end" type="datetime-local" /></label><label className="opportunity-form-full">Orientações e cuidados<textarea name="instructions" maxLength={3000} /></label><button className="primary" disabled={busy}>Salvar medicamento</button></form></details>}
    {!loading && !error && !items.length && <p className="subtle">Nenhum medicamento cadastrado neste contrato.</p>}
    {items.map(m => <article className="medication-item" key={m.id}><h4>{m.name} · {m.dosage}</h4><p>A cada {m.interval_hours} horas · {m.active ? `Próximo horário: ${dateLabel(m.next_due_at)}` : "Rotina encerrada"}</p>{m.ends_at && <p>Fim: {dateLabel(m.ends_at)}</p>}<p className="medication-instructions">{m.instructions}</p>
      {due(m, now) && <p className="status">Horário pendente de registro</p>}
      {role === "client" && m.active && <button className="link" disabled={busy} onClick={() => void save({ action: "stop", medicationId: m.id }, "PATCH")}>Encerrar rotina</button>}
      {role === "caregiver" && due(m, now) && <form className="opportunity-form" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        const saved = await save({ action: "record", medicationId: m.id, scheduledAt: m.next_due_at, administeredAt: new Date(String(data.get("actual"))).toISOString(), outcome: data.get("outcome"), notes: data.get("notes") }, "PATCH");
        if (saved) form.reset();
      }}><p className="opportunity-form-full subtle">Registre o que aconteceu neste horário. Doses não administradas devem ser justificadas; o próximo horário mantém o intervalo cadastrado.</p><label>Resultado<select name="outcome"><option value="given">Administrado</option><option value="skipped">Não administrado</option></select></label><label>Horário da administração ou da ocorrência<input name="actual" type="datetime-local" required /></label><label className="opportunity-form-full">Observações / motivo<textarea name="notes" maxLength={1000} /></label><button className="primary" disabled={busy}>Registrar dose</button></form>}
    </article>)}
    {(history.length > 0 || page > 0) && <details><summary>Histórico de doses · Página {page + 1}</summary>{history.map(h => <div className="medication-item" key={h.id}><strong>{items.find(m => m.id === h.medication_id)?.name} · {h.outcome === "given" ? "Administrado" : "Não administrado"}</strong><p>Previsto: {dateLabel(h.scheduled_at)} · Ocorrido: {dateLabel(h.administered_at)}</p><p>{h.notes}</p></div>)}<button className="filter" disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}>Mais recentes</button><button className="filter" disabled={!hasMore || busy} onClick={() => setPage(value => value + 1)}>Mais antigos</button></details>}
  </section>;
}
