"use client";

import { useCallback, useEffect, useState } from "react";

type Payment = { id: string; contract_version: number; amount_cents: number; fee_cents: number; refunded_cents: number; status: string; created_at: string };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { creating: "Preparando checkout", open: "Aguardando pagamento", paid: "Pagamento de teste confirmado", expired: "Checkout encerrado", partially_refunded: "Reembolso parcial de teste", refunded: "Reembolso de teste concluído" };

export function StripeConnectSettings() {
  const [state, setState] = useState<{ enabled: boolean; ready: boolean; registered?: boolean } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/stripe/connect", { cache: "no-store" }); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setState(body);
  }, []);
  useEffect(() => { void Promise.resolve().then(load).catch(cause => setError(cause.message)); }, [load]);
  const act = async (onboard: boolean) => {
    setBusy(true); setError("");
    try {
      if (onboard) {
        const response = await fetch("/api/stripe/connect", { method: "POST" }); const body = await response.json();
        if (!response.ok) throw new Error(body.error); window.location.assign(body.url);
      } else await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o cadastro."); }
    finally { setBusy(false); }
  };
  return <section className="panel stripe-test-panel"><h3>Recebimentos de teste</h3><p>Ambiente de teste da Stripe. Nenhum dinheiro real será recebido.</p>
    {error && <p role="alert">{error}</p>}
    {!state && !error && <p>Consultando cadastro...</p>}
    {state && (!state.enabled ? <p className="subtle">Os testes de pagamento ainda não foram ativados pela plataforma.</p> : <>
      <p role="status">{state.ready ? "Cadastro pronto para receber pagamentos de teste." : "Conclua o cadastro de teste na Stripe para a família testar o pagamento do contrato."}</p>
      <div className="contract-actions"><button className="primary" disabled={busy} onClick={() => void act(true)}>{state.registered ? "Continuar cadastro de teste" : "Configurar recebimentos de teste"}</button><button className="filter" disabled={busy} onClick={() => void act(false)}>Atualizar cadastro</button></div>
    </>)}
  </section>;
}

export function ContractPayments({ contractId, role, status }: { contractId: string; role: "client" | "caregiver"; status: string }) {
  const [payments, setPayments] = useState<Payment[]>([]); const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/contracts/${contractId}/payments`, { cache: "no-store" }); const body = await response.json();
    if (!response.ok) throw new Error(body.error); setPayments(body.payments ?? []); setEnabled(body.enabled === true);
  }, [contractId]);
  useEffect(() => { void Promise.resolve().then(load).catch(cause => setError(cause.message)).finally(() => setLoading(false)); }, [load]);
  const pending = payments.some(payment => ["creating", "open"].includes(payment.status));
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => { void load().catch(() => undefined); }, 5000);
    return () => clearInterval(interval);
  }, [load, pending]);
  const action = async (name: "checkout" | "refresh" | "expire" | "refund", paymentId?: string) => {
    if (name === "refund" && !window.confirm("Reembolsar integralmente este pagamento de teste, incluindo a comissão e o repasse de teste?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, paymentId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (body.url) { window.location.assign(body.url); return; }
      await load(); setNotice(name === "refund" && body.status !== "refunded" ? "Reembolso solicitado. Atualize o status para acompanhar a confirmação." : "Status consultado na Stripe.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir o teste."); await load().catch(() => undefined); }
    finally { setBusy(false); }
  };
  const outstanding = payments.find(payment => !["expired", "refunded"].includes(payment.status));
  return <section className="stripe-test-panel"><h3>Pagamento do contrato · Teste</h3>
    <p>Nenhum dinheiro real será cobrado ou repassado. Use somente os dados de teste da Stripe.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p>Consultando pagamentos...</p>}
    {!loading && !error && !enabled && <p className="subtle">Os testes de pagamento ainda não foram ativados pela plataforma.</p>}
    {enabled && role === "caregiver" && <p className="subtle">Configure seus recebimentos de teste em Financeiro. A família inicia o pagamento neste contrato.</p>}
    {enabled && role === "client" && ["active", "completed"].includes(status) && (!outstanding || ["creating", "open"].includes(outstanding.status)) && <button className="primary" disabled={busy || loading} onClick={() => void action("checkout")}>{outstanding ? "Continuar pagamento de teste" : "Testar pagamento com cartão"}</button>}
    {enabled && !["active", "completed", "cancelled"].includes(status) && <p className="subtle">O teste de pagamento fica disponível após as duas assinaturas.</p>}
    {payments.map(payment => <article className="stripe-test-record" key={payment.id}><strong>{labels[payment.status] ?? payment.status}</strong><p>Versão {payment.contract_version} · {new Date(payment.created_at).toLocaleString("pt-BR")}</p>
      <p>Total: {money(payment.amount_cents)} · Comissão Zelou: {money(payment.fee_cents)} · Cuidador: {money(payment.amount_cents - payment.fee_cents)}</p>
      {payment.refunded_cents > 0 && <p>Reembolsado no teste: {money(payment.refunded_cents)}</p>}
      {enabled && <div className="contract-actions"><button className="filter" disabled={busy} onClick={() => void action("refresh", payment.id)}>Atualizar pagamento</button>
        {role === "client" && ["creating", "open"].includes(payment.status) && <button className="filter" disabled={busy} onClick={() => void action("expire", payment.id)}>Encerrar checkout de teste</button>}
        {role === "client" && ["paid", "partially_refunded"].includes(payment.status) && <button className="filter" disabled={busy} onClick={() => void action("refund", payment.id)}>Reembolsar teste</button>}
      </div>}
    </article>)}
    {enabled && <p className="subtle">A comissão é separada do custo do provedor. O repasse simulado vai ao saldo Stripe do cuidador; não comprova depósito bancário. Encerrar o contrato não reembolsa automaticamente o pagamento.</p>}
  </section>;
}
