"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

type Report = { id: string; contract_id: string; report_type: string; week_start: string; content: { title: string; summary: string; final?: boolean }; created_at: string };
type Contract = { id: string; opportunities: { title: string } | null };

export function FamilyReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const [reportsResponse, contractsResponse] = await Promise.all([fetch("/api/reports"), fetch("/api/contracts")]);
    const reportsBody = await reportsResponse.json(); const contractsBody = await contractsResponse.json();
    if (!reportsResponse.ok) setError(reportsBody.error ?? "Não foi possível carregar relatórios."); else setReports(reportsBody.reports ?? []);
    if (contractsResponse.ok) setContracts((contractsBody.contracts ?? []).filter((contract: { status: string }) => ["active", "completed"].includes(contract.status)));
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(() => setError("Não foi possível conectar ao servidor.")); }, 0); return () => window.clearTimeout(timer); }, []);
  const canCreate = contracts.length > 0;

  return <section className="family-reports-page"><div className="section-heading"><div><h2 className="panel-title">Relatórios</h2><p className="subtle">Registros persistidos e compartilhados apenas entre as partes do contrato.</p></div><button className="primary" disabled={!canCreate} title={!canCreate ? "É necessário ter um contrato ativo ou concluído para registrar um relatório." : undefined} aria-describedby={!canCreate ? "report-contract-hint" : undefined} onClick={() => setOpen(true)}><Plus size={16} /> Novo relatório</button></div>{!canCreate && <p id="report-contract-hint" className="subtle">A criação de relatórios será liberada quando houver um contrato ativo ou concluído.</p>}{error && <p role="alert">{error}</p>}{!error && reports.length === 0 && <section className="panel"><p className="agenda-empty">Nenhum relatório registrado.</p></section>}{reports.map((report) => <article className="panel family-report-card" key={report.id}><div className="report-entry-top"><strong>{report.content.title}</strong><small>{report.report_type === "client" ? "Família" : "Cuidador"} · semana de {new Date(`${report.week_start}T12:00:00`).toLocaleDateString("pt-BR")}</small></div><p>{report.content.summary}</p>{report.content.final && <span className="tag">Relatório final</span>}</article>)}{open && <ReportComposer contracts={contracts} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void load(); }} />}</section>;
}

function ReportComposer({ contracts, onClose, onSaved }: { contracts: Contract[]; onClose: () => void; onSaved: () => void }) {
  const [contractId, setContractId] = useState(contracts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [final, setFinal] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contractId, weekStart: new Date().toISOString().slice(0, 10), content: { title, summary, final } }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o relatório."); } finally { setSaving(false); }
  };
  return <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title"><div className="report-modal-card"><button className="icon-button report-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button><h2 id="report-dialog-title" className="display">Novo relatório</h2><label>Contrato<select value={contractId} onChange={(event) => setContractId(event.target.value)}>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.opportunities?.title ?? "Contrato"}</option>)}</select></label><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Resumo<textarea value={summary} rows={5} onChange={(event) => setSummary(event.target.value)} /></label><label className="check-label"><input type="checkbox" checked={final} onChange={(event) => setFinal(event.target.checked)} /> Relatório final</label>{error && <p role="alert">{error}</p>}<button className="primary" disabled={saving || !title.trim() || !summary.trim()} onClick={() => void submit()}>{saving ? "Salvando..." : "Salvar relatório"}</button></div></div>;
}
