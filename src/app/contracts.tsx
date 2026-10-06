"use client";

import { ContractCare } from "@/app/contract-care";
import { ContractPayments } from "@/app/stripe-payments";
import { ContractMedications } from "@/app/medications";
import { RequestReference } from "@/app/request-reference";
import { Check, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Role = "client" | "caregiver";
type Contract = {
  id: string; opportunity_id: string; client_id: string; caregiver_id: string; client_name: string; caregiver_name: string;
  gross_amount: number; platform_fee: number; caregiver_net_amount: number;
  starts_at: string; ends_at: string | null; created_at: string; status: string;
  document_version: number; snapshot_legacy: boolean; terms: Record<string, unknown>; client_signed_at: string | null; caregiver_signed_at: string | null;
  opportunities: { title: string; description: string; care_type: string; approximate_region: string; schedule: Record<string, unknown>; requirements: string | null } | null;
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const statuses: Record<string, string> = { draft: "Rascunho", pending_signatures: "Aguardando assinaturas", active: "Ativo", cancelled: "Cancelado", completed: "Concluído" };

export function ContractsView({ role, initialContractId = null }: { role: Role; initialContractId?: string | null }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialContractId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const load = async () => {
    const response = await fetch("/api/contracts", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar contratos.");
    setContracts(body.contracts);
  };
  useEffect(() => { void Promise.resolve().then(load).catch(cause => setError(cause.message)).finally(() => setLoading(false)); }, []);
  const action = async (id: string, actionName: "sign" | "cancel" | "complete") => {
    setSavingId(id); setError("");
    try {
      const response = await fetch(`/api/contracts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar o contrato."); }
    finally { setSavingId(null); }
  };
  const selected = contracts.find(contract => contract.id === selectedId);
  return <section className="contract-page">
    <div className="section-heading"><div><h2 className="panel-title">Meus contratos</h2><p className="subtle">Abra um contrato para consultar os detalhes, as assinaturas e a rotina de medicamentos.</p></div><span className="status">{contracts.filter(contract => contract.status === "active").length} ativos</span></div>
    {error && !selected && <p role="alert">{error}</p>}
    {loading && <p className="agenda-empty">Carregando contratos...</p>}
    {!loading && !contracts.length && !error && <section className="panel"><p className="agenda-empty">Nenhum contrato registrado.</p></section>}
    {contracts.map(contract => <button type="button" className="contract-card contract-summary" key={contract.id} onClick={() => { setError(""); setSelectedId(contract.id); }} aria-haspopup="dialog">
      <span className="contract-card-head"><span className="contract-icon"><FileText size={20} /></span><span className="contract-title"><strong>{contract.opportunities?.title ?? "Contrato"}</strong><small>{contract.opportunities?.approximate_region}</small></span><span className="status">{statuses[contract.status] ?? contract.status}</span></span>
      <RequestReference id={contract.opportunity_id} />
      <span className="contract-summary-bottom"><span>Início: {new Date(contract.starts_at).toLocaleDateString("pt-BR")}</span><strong>{currency.format(Number(role === "caregiver" ? contract.caregiver_net_amount : contract.gross_amount))}</strong><span className="link">Ver contrato completo →</span></span>
    </button>)}
    {selected && <ContractDialog contract={selected} role={role} error={error} saving={savingId === selected.id} onClose={() => setSelectedId(null)} onChanged={load} onAction={name => void action(selected.id, name)} />}
  </section>;
}

function ContractDialog({ contract, role, error, saving, onClose, onAction, onChanged }: { contract: Contract; role: Role; error: string; saving: boolean; onClose: () => void; onChanged: () => Promise<void>; onAction: (action: "sign" | "cancel" | "complete") => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previous; opener?.focus(); };
  }, []);
  const ownSignature = role === "client" ? contract.client_signed_at : contract.caregiver_signed_at;
  const pending = ["draft", "pending_signatures"].includes(contract.status);
  const opportunity = contract.opportunities;
  return <dialog ref={ref} className="contract-dialog" aria-labelledby="contract-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="contract-dialog-header"><div><span className="status">{statuses[contract.status] ?? contract.status}</span><h2 id="contract-dialog-title">{opportunity?.title ?? "Contrato de cuidado"}</h2><RequestReference id={contract.opportunity_id} /></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar contrato"><X size={22} /></button></header>
    <div className="contract-dialog-content">
      {error && <p role="alert">{error}</p>}
      <section><h3>Identificação do contrato · Versão {contract.document_version}</h3>{contract.snapshot_legacy && <p className="subtle">Contrato anterior ao versionamento. Os dados do serviço foram preservados na atualização do sistema e podem não representar o texto original da assinatura.</p>}<p className="contract-reference">Contrato <code>CTR-{contract.id}</code></p><p className="subtle">Vinculado à requisição acima · Criado em {date(contract.created_at)}</p><div className="contract-meta"><Data label="Cliente / responsável" value={contract.client_name} /><Data label="Cuidador" value={contract.caregiver_name} /></div></section>
      <section><h3>Serviço e período</h3><div className="contract-meta"><Data label="Tipo de cuidado" value={opportunity?.care_type ?? "Não informado"} /><Data label="Região" value={opportunity?.approximate_region ?? "Não informada"} /><Data label="Início" value={date(contract.starts_at)} /><Data label="Término" value={contract.ends_at ? date(contract.ends_at) : "Não definido"} /></div><p className="contract-text">{opportunity?.description || "Descrição não informada."}</p><h4>Horários combinados</h4><DetailsValue value={opportunity?.schedule} /><h4>Requisitos</h4><p className="contract-text">{opportunity?.requirements || "Nenhum requisito adicional informado."}</p></section>
      <section><h3>Valores</h3><div className="contract-finance"><Data label="Valor bruto" value={currency.format(Number(contract.gross_amount))} /><Data label="Taxa Zelou!" value={currency.format(Number(contract.platform_fee))} /><Data label="Valor líquido do cuidador" value={currency.format(Number(contract.caregiver_net_amount))} /></div></section>
      <ContractPayments key={contract.id} contractId={contract.id} role={role} status={contract.status} />
      <section><h3>Condições do contrato</h3><DetailsValue value={contract.terms} /></section>
      <section><h3>Assinaturas</h3><div className="contract-meta"><Data label="Cliente / responsável" value={contract.client_signed_at ? `Assinado em ${date(contract.client_signed_at)}` : "Aguardando assinatura"} /><Data label="Cuidador" value={contract.caregiver_signed_at ? `Assinado em ${date(contract.caregiver_signed_at)}` : "Aguardando assinatura"} /></div>{pending && <div className="contract-actions"><button className="primary" disabled={saving || !!ownSignature} onClick={() => onAction("sign")}><Check size={16} />{ownSignature ? "Você já assinou" : saving ? "Salvando..." : "Assinar contrato"}</button><button className="filter" disabled={saving} onClick={() => onAction("cancel")}><X size={16} /> Cancelar contrato</button></div>}</section>
      {contract.status === "active" && role === "client" && <section><h3>Concluir atendimento</h3><p>Ao concluir, novos registros de doses serão encerrados e a oportunidade será fechada.</p><button className="primary" disabled={saving} onClick={() => { if (window.confirm("Confirmar a conclusão deste contrato?")) onAction("complete"); }}>Concluir contrato</button></section>}<ContractCare contractId={contract.id} role={role} status={contract.status} schedule={opportunity?.schedule} amount={contract.gross_amount} onChanged={onChanged} /><ContractMedications contractId={contract.id} role={role} status={contract.status} />
    </div>
  </dialog>;
}
function Data({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function DetailsValue({ value }: { value: unknown }) {
  if (value == null || value === "" || (typeof value === "object" && !Object.keys(value).length)) return <p className="subtle">Não informado.</p>;
  if (Array.isArray(value)) return <ul>{value.map((item, index) => <li key={index}><DetailsValue value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl className="contract-terms">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key === "summary" ? "Resumo" : key.replace(/_/g, " ")}</dt><dd><DetailsValue value={item} /></dd></div>)}</dl>;
  return <p className="contract-text">{typeof value === "boolean" ? value ? "Sim" : "Não" : String(value)}</p>;
}
