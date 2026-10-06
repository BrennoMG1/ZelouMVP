"use client";

import { FileText, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { StripeConnectSettings } from "@/app/stripe-payments";

type Role = "client" | "caregiver";
type Contract = { id: string; gross_amount: number; caregiver_net_amount: number; status: string; opportunities: { title: string } | null };

export function FinancialView({ role, onOpenContract }: { role: Role; onOpenContract: () => void }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/contracts").then(async (response) => { const body = await response.json(); if (!response.ok) setError(body.error ?? "Não foi possível carregar dados financeiros."); else setContracts(body.contracts); }).catch(() => setError("Não foi possível conectar ao servidor.")); }, []);
  const active = contracts.filter((contract) => contract.status === "active");
  const total = active.reduce((sum, contract) => sum + (role === "caregiver" ? Number(contract.caregiver_net_amount) : Number(contract.gross_amount)), 0);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return <section className="finance-page"><div className="section-heading"><div><h2 className="panel-title">Financeiro</h2><p className="subtle">Valores contratuais; não representam pagamento liquidado.</p></div><WalletCards size={25} color="#328c6c" /></div><div className="finance-summary"><div><small>{role === "caregiver" ? "A receber em contratos ativos" : "Comprometido em contratos ativos"}</small><strong>{currency.format(total)}</strong></div><div><small>Contratos ativos</small><strong>{String(active.length).padStart(2, "0")}</strong></div></div>{error ? <p role="alert">{error}</p> : <div className="panel finance-table"><div className="panel-head"><h3 className="panel-title">Contratos financeiros</h3></div>{contracts.length ? contracts.map((contract) => <button className="finance-row finance-row-button" key={contract.id} onClick={onOpenContract}><div><strong><FileText size={15} /> {contract.opportunities?.title ?? "Contrato"}</strong><small>{contract.status}</small></div><strong>{currency.format(role === "caregiver" ? Number(contract.caregiver_net_amount) : Number(contract.gross_amount))}</strong></button>) : <p className="agenda-empty">Nenhum contrato registrado.</p>}</div>}{role === "caregiver" && <StripeConnectSettings />}</section>;
}
