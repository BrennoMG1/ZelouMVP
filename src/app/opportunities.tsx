"use client";

import { ProfessionalProfile } from "@/app/professional-profile";
import { ContractProposal } from "@/app/contract-proposal";
import { RequestReference } from "@/app/request-reference";
import { Check, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { LocationField, Region, ScheduleFields, emptySchedule } from "@/app/planning-fields";
import { CareSchedule, scheduleEstimate, scheduleSchema, scheduleSummary } from "@/lib/care-planning";

type Opportunity = { id: string; title: string; description: string; care_type: string; approximate_region: string; verified_regions: Region | null; requirements: string | null; schedule: Record<string, unknown>; hourly_rate: number; status: string; created_at: string };
type Application = { id: string; opportunity_id: string; caregiver_id?: string; status: string; created_at: string; opportunities?: { title: string; approximate_region: string } | null };

const careCategories = ["Acompanhamento e companhia", "Higiene e mobilidade", "Alimentação", "Medicação e rotina", "Pós-operatório", "Cuidados noturnos", "Demência e Alzheimer", "Outro"];

function scheduleText(schedule: Record<string, unknown>) {
  return scheduleSummary(schedule);
}

export function OpportunitiesView({ onOpenMessages }: { onOpenMessages: (conversationId: string) => void }) {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState(""); const [category, setCategory] = useState(""); const [minimumRate, setMinimumRate] = useState(""); const [day, setDay] = useState("");
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetch("/api/opportunities"), fetch("/api/applications")])
      .then(async ([opportunitiesResponse, applicationsResponse]) => {
        const opportunitiesBody = await opportunitiesResponse.json();
        const applicationsBody = await applicationsResponse.json();
        if (!opportunitiesResponse.ok) throw new Error(opportunitiesBody.error);
        setItems(opportunitiesBody.opportunities ?? []);
        if (applicationsResponse.ok) setApplied(new Set((applicationsBody.applications ?? []).map((item: { opportunity_id: string }) => item.opportunity_id)));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar oportunidades."))
      .finally(() => setLoading(false));
  }, []);

  const apply = async (opportunityId: string) => {
    if (startingId) return;
    setStartingId(opportunityId); setError("");
    try {
      if (!applied.has(opportunityId)) {
        const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId }) });
        const body = await response.json();
        if (!response.ok && response.status !== 409) throw new Error(body.error ?? "Não foi possível registrar a candidatura.");
        setApplied((current) => new Set(current).add(opportunityId));
      }
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Candidatura registrada. Tente abrir a conversa novamente.");
      onOpenMessages(body.conversation.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao servidor."); }
    finally { setStartingId(null); }
  };
  const visible = items.filter((item) => `${item.title} ${item.approximate_region} ${item.care_type}`.toLowerCase().includes(query.toLowerCase()) && (!city || item.verified_regions?.municipality_id === city) && (!category || item.care_type === category) && (!minimumRate || Number(item.hourly_rate) >= Number(minimumRate)) && (!day || (item.schedule.kind === "once" ? new Date(String(item.schedule.startDate)).getUTCDay() === Number(day) : Array.isArray(item.schedule.days) && item.schedule.days.includes(Number(day)))));
  return <section className="panel"><div className="panel-head"><div><h2 className="panel-title">Oportunidades</h2><p className="subtle">Região aproximada; o endereço completo permanece privado.</p></div></div><div className="search-row"><div className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar oportunidades" aria-label="Buscar oportunidades" /></div></div><details className="opportunity-filters"><summary>Filtrar por cidade, categoria, valor e dia</summary><div className="opportunity-form"><label>Cidade<select value={city} onChange={e => setCity(e.target.value)}><option value="">Todas</option>{[...new Map(items.filter(item => item.verified_regions).map(item => [item.verified_regions!.municipality_id, item.verified_regions!])).values()].map(region => <option key={region.id} value={region.municipality_id}>{region.city}/{region.state}</option>)}</select></label><label>Categoria<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(items.map(item => item.care_type))].map(value => <option key={value}>{value}</option>)}</select></label><label>Valor a partir de (R$/h)<input type="number" min="0" value={minimumRate} onChange={e => setMinimumRate(e.target.value)} /></label><label>Dia da semana<select value={day} onChange={e => setDay(e.target.value)}><option value="">Todos</option>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((label,index) => <option key={index} value={index}>{label}</option>)}</select></label></div></details>{error && <p role="alert" className="agenda-empty">{error}</p>}{loading && <p className="agenda-empty">Carregando oportunidades...</p>}{!loading && !error && visible.length === 0 && <p className="agenda-empty">Nenhuma oportunidade disponível.</p>}{visible.map((item) => <article className="opportunity" key={item.id}><div className="opp-main"><h3 className="opp-title">{item.title}</h3><RequestReference id={item.id} /><div className="opp-meta"><span>{item.approximate_region}</span><span>{scheduleText(item.schedule)}</span></div><span className="tag">{item.care_type}</span><p className="subtle">{item.description}</p>{item.requirements && <p><strong>Tarefas e requisitos: </strong>{item.requirements}</p>}<small>Estimativa do período: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(scheduleEstimate(item.schedule, Number(item.hourly_rate)))}</small></div><div className="opp-price"><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.hourly_rate))}/h</strong><button className="link" disabled={startingId !== null} onClick={() => void apply(item.id)}>{applied.has(item.id) ? <><Check size={15} /> Abrir conversa</> : "Demonstrar interesse"}</button></div></article>)}</section>;
}

export function ClientOpportunitiesView() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState<Region | null>(null);
  const [schedule, setSchedule] = useState<CareSchedule>(emptySchedule);
  const [requirements, setRequirements] = useState("");
  const [step, setStep] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [careType, setCareType] = useState("");
  const [customCareType, setCustomCareType] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedCareType = careType === "Outro" ? customCareType.trim() : careType;

  const load = async () => { const response = await fetch("/api/opportunities"); const body = await response.json(); if (!response.ok) { setError(body.error ?? "Não foi possível carregar oportunidades."); return; } setItems(body.opportunities ?? []); };
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(() => setError("Não foi possível conectar ao servidor.")); }, 0); return () => window.clearTimeout(timer); }, []);
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const valid = scheduleSchema.safeParse(schedule); if (!valid.success) throw new Error(valid.error.issues.map(issue => issue.message).join(" "));
      const response = await fetch("/api/opportunities", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, title, description, careType: selectedCareType, regionId: region?.id, schedule, requirements, hourlyRate: Number(rate) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.fields ? Object.values(body.fields).flat().join(" ") : body.error);
      setTitle(""); setDescription(""); setRegion(null); setCareType(""); setCustomCareType(""); setRate(""); setSchedule(emptySchedule); setRequirements(""); setEditingId(null); setStep(0); document.querySelector('form.opportunity-form')?.dispatchEvent(new Event('zelou:saved', { bubbles: true })); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível publicar a oportunidade."); } finally { setSaving(false); }
  };

  return <section className="panel"><h2 className="panel-title">{editingId ? "Editar oportunidade" : "Publicar oportunidade"}</h2><p className="subtle">Não informe endereço completo ou dados pessoais na descrição.</p>
    <p role="status">Etapa {step + 1} de 3: {["Necessidade de cuidado", "Local, agenda e valor", "Revisar e publicar"][step]}</p><form className="opportunity-form" onSubmit={event => { event.preventDefault(); if(step < 2) { if(step === 1 && (!region || !scheduleSchema.safeParse(schedule).success)) {setError("Selecione uma cidade e confira as datas e horários.");return;}setError("");setStep(step+1); } else void submit(); }}>
      <fieldset className="wizard-step" hidden={step!==0} disabled={step!==0}><legend>Qual cuidado você precisa?</legend>
      <label>Título<input required minLength={5} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Tipo de cuidado<select required value={careType} onChange={event => setCareType(event.target.value)}><option value="">Selecione</option>{careCategories.map(category => <option key={category}>{category}</option>)}</select></label>
      {careType === "Outro" && <label>Outro tipo de cuidado<input required minLength={2} maxLength={80} value={customCareType} onChange={event => setCustomCareType(event.target.value)} /></label>}
      <label className="opportunity-form-full">Descrição<textarea required minLength={10} maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label className="opportunity-form-full">Tarefas e requisitos<textarea maxLength={3000} value={requirements} onChange={event => setRequirements(event.target.value)} /></label>
      </fieldset><fieldset className="wizard-step" hidden={step!==1} disabled={step!==1}><legend>Onde e quando?</legend><LocationField value={region} onChange={setRegion} /><ScheduleFields value={schedule} onChange={setSchedule} />
      <label>Valor por hora (R$)<input type="number" required min="0.01" max="10000" step="0.01" value={rate} onChange={event => setRate(event.target.value)} /></label>
      </fieldset>{step === 2 && <section className="wizard-review"><h3>Confira antes de publicar</h3><p><strong>{title}</strong> ? {selectedCareType}</p><p>{description}</p><p>Tarefas: {requirements || "A combinar"}</p><p>{region?.label} ? {scheduleText(schedule)}</p><p>R$ {rate}/hora ? Estimativa: {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(scheduleEstimate(schedule,Number(rate)))}</p><p>Publicar não contrata nem cobra. Depois, conheça os candidatos, converse e revise o contrato antes de assinar.</p></section>}
      {step > 0 && <button type="button" className="filter" onClick={()=>setStep(step-1)}>Voltar</button>}{step < 2 && <button type="submit" className="primary">Continuar</button>}
      {step === 2 && <button className="primary" disabled={saving || !region?.id || !selectedCareType} type="submit"><Plus size={16} />{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Publicar"}</button>}
      {editingId && <button className="filter" type="button" onClick={() => { setEditingId(null); setTitle(""); setDescription(""); setRegion(null); setSchedule(emptySchedule); setRequirements(""); setRate(""); setCareType(""); }}>Cancelar edição</button>}
    </form>{error && <p role="alert">{error}</p>}
    <div className="mini-list">{items.map(item => <div className="mini-row" key={item.id}><div><p>{item.title}</p><RequestReference id={item.id} /><small>{item.approximate_region} · {item.status}</small></div>
      {["published", "paused", "draft"].includes(item.status) && <div className="contract-actions"><button className="filter" onClick={() => { setStep(0); setEditingId(item.id); setTitle(item.title); setDescription(item.description); setRegion(item.verified_regions); const parsed = scheduleSchema.safeParse(item.schedule); setSchedule(parsed.success ? parsed.data : emptySchedule); setRequirements(item.requirements ?? ""); setRate(String(item.hourly_rate)); setCareType(careCategories.includes(item.care_type) ? item.care_type : "Outro"); setCustomCareType(item.care_type); }}>Editar</button>
        {[item.status === "paused" ? "published" : "paused", "closed"].map(status => <button key={status} className="filter" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { const response = await fetch("/api/opportunities", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar a vaga."); } finally { setSaving(false); } }}>{status === "published" ? "Republicar" : status === "paused" ? "Pausar" : "Encerrar"}</button>)}
      </div>}</div>)}</div>
  </section>;
}

export function ApplicationsViewReal({ role, onOpenMessages }: { role: "client" | "caregiver"; onOpenMessages: (conversationId: string) => void }) {
  const [proposal, setProposal] = useState<Application | null>(null);
  const [items, setItems] = useState<Application[]>([]); const [error, setError] = useState(""); const [startingId, setStartingId] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/applications").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.applications ?? []); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar candidaturas.")); }, []);
  const startConversation = async (item: Application) => { setStartingId(item.id); setError(""); try { const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: item.opportunity_id, participantId: item.caregiver_id }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); onOpenMessages(body.conversation.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a conversa."); } finally { setStartingId(null); } };
  return <section className="panel"><div className="panel-head"><div><h2 className="panel-title">{role === "client" ? "Candidaturas recebidas" : "Minhas candidaturas"}</h2><p className="subtle">{items.length ? `${items.length} ${items.length === 1 ? "candidatura" : "candidaturas"}` : "Acompanhe suas conexões por aqui."}</p></div></div>{error && <p role="alert" className="agenda-empty">{error}</p>}{!error && !items.length && <p className="agenda-empty">Nenhuma candidatura por enquanto.</p>}<div className="application-list">{items.map((item) => <article className="application-card" key={item.id}><div className="application-summary"><div className="application-copy"><h3>{item.opportunities?.title ?? "Oportunidade"}</h3><p>{item.opportunities?.approximate_region || "Região não informada"} <span aria-hidden="true">·</span> {new Date(item.created_at).toLocaleDateString("pt-BR")}</p></div><span className={`status application-status ${item.status === "rejected" || item.status === "withdrawn" ? "is-closed" : ""}`}>{item.status === "pending" ? "Em análise" : item.status === "shortlisted" ? "Selecionada" : item.status === "rejected" ? "Recusada" : item.status === "withdrawn" ? "Retirada" : item.status}</span></div><div className="application-actions">{role === "client" && item.caregiver_id && ["pending", "shortlisted"].includes(item.status) && <button className="primary" onClick={() => setProposal(item)}>Propor contrato</button>}{(role === "caregiver" || item.caregiver_id) && <button className="filter" disabled={startingId === item.id} onClick={() => void startConversation(item)}>{startingId === item.id ? "Abrindo..." : "Conversar"}</button>}{["pending","shortlisted"].includes(item.status) && <button className="filter application-secondary-action" onClick={async () => { try { const response = await fetch("/api/applications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: role === "caregiver" ? "withdrawn" : "rejected" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(current => current.map(a => a.id === item.id ? { ...a, status: role === "caregiver" ? "withdrawn" : "rejected" } : a)); } catch(cause) { setError(cause instanceof Error ? cause.message : "Falha ao alterar candidatura."); } }}>{role === "caregiver" ? "Retirar candidatura" : "Recusar"}</button>}</div>{role === "client" && item.caregiver_id && <details className="application-profile"><summary>Ver perfil profissional</summary><ProfessionalProfile caregiverId={item.caregiver_id} /></details>}</article>)}</div>{proposal?.caregiver_id && <ContractProposal opportunityId={proposal.opportunity_id} caregiverId={proposal.caregiver_id} title={proposal.opportunities?.title ?? "Oportunidade"} onClose={() => setProposal(null)} />}</section>;
}
