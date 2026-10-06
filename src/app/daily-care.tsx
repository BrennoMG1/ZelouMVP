"use client";
import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function CareHelp({ navigate }: { navigate: (view: string) => void }) {
  const contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "contato.suporte@zeloucuidados.com";
  return <section className="panel daily-care"><h2>Pedir ajuda</h2><p>Para combinar horários, avisar atraso ou falar sobre o atendimento, converse com a outra pessoa pelo site.</p><button className="primary" onClick={()=>navigate("Mensagens")}>Conversar sobre meu atendimento</button><h3>Ajuda com o Zelou!</h3>{contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? <a className="primary" href={`mailto:${contact}?subject=Ajuda%20com%20o%20Zelou`}>Enviar e-mail ao suporte</a> : <p>O canal de suporte da plataforma ainda não foi configurado. Esta tela não envia uma solicitação à equipe.</p>}<p>O chat e o suporte não são monitorados como serviço de emergência.</p><CancellationGuide navigate={navigate}/></section>;
}

export function CancellationGuide({ navigate }: { navigate: (view: string) => void }) {
  return <CareInfoDialog trigger="Atrasos, cancelamentos e substituição" title="Atrasos, cancelamentos e substituição"><ol><li>Avise a outra pessoa na conversa assim que souber do imprevisto.</li><li>Na Agenda, abra o plantão e registre o motivo ao cancelar ou reagendar. Essas opções ficam disponíveis antes do registro de entrada.</li><li>O cuidador pode solicitar substituição; a família pode publicar uma vaga de substituição. O pedido não garante que outro profissional esteja disponível.</li><li>Cancelar um plantão não cancela automaticamente o contrato nem gera reembolso. Confira as condições assinadas e combine os próximos passos.</li></ol><p>Não há multa ou prazo de cancelamento universal definido nesta tela. Pagamentos no site continuam em ambiente de teste, sem cobrança real.</p><div className="contract-actions"><button className="filter" onClick={()=>navigate("Agenda")}>Abrir agenda</button><button className="filter" onClick={()=>navigate("Meus contratos")}>Consultar contrato</button></div></CareInfoDialog>;
}

function CareInfoDialog({ trigger, title, children }: { trigger: string; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" className="care-info-trigger" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>{trigger}<ChevronDown size={16} /></button>
    <dialog className="contract-dialog care-info-dialog" ref={dialog} aria-labelledby={titleId} onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <header className="contract-dialog-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label="Fechar"><X size={20} /></button></header>
      <div className="contract-dialog-content"><section>{children}</section></div>
    </dialog>
  </>;
}

type Appointment = { id:string; contract_id:string; title:string; starts_at:string; ends_at:string; status:string; checked_in_at?:string|null; contracts?:{service_snapshot?:{approximate_region?:string}} };
type Contract = { id:string; status:string; caregiver_name:string; client_name:string };
export function DailyCare({ role, navigate, openContract }: { role:"client"|"caregiver"; navigate:(view:string)=>void; openContract:(id:string)=>void }) {
  const [data,setData]=useState<{appointment:Appointment|null;contracts:Contract[]}|null>(null);
  const [error,setError]=useState(""); const [retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;async function load(){try{const results=await Promise.all([fetch('/api/appointments',{cache:'no-store'}),fetch('/api/contracts',{cache:'no-store'})]);const bodies=await Promise.all(results.map(r=>r.json()));if(results.some(r=>!r.ok))throw new Error('Não foi possível carregar seus atendimentos.');const contracts:Contract[]=bodies[1].contracts;const appointments:Appointment[]=bodies[0].appointments;const appointment=appointments.filter(a=>a.status==='scheduled' && new Date(a.ends_at).getTime()>Date.now()).sort((a,b)=>Number(!!b.checked_in_at)-Number(!!a.checked_in_at)||Date.parse(a.starts_at)-Date.parse(b.starts_at))[0]??null;if(live){setError('');setData({appointment,contracts});}}catch(cause){if(live)setError(cause instanceof Error?cause.message:'Falha ao carregar.');}}void load();const timer=setInterval(()=>void load(),60000);return()=>{live=false;clearInterval(timer);};},[retry]);
  const next=data?.appointment;const contract=data?.contracts.find(c=>c.id===next?.contract_id);const region=next?.contracts?.service_snapshot?.approximate_region;
  return <section className="panel daily-care" aria-label="Seu próximo atendimento">
    <h2>{role === "caregiver" ? "Meu próximo plantão" : "Próximo atendimento"}</h2>
    {error ? <p role="alert">{error} <button className="filter" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p> : !data ? <p role="status">Carregando atendimento…</p> : next ? <>
      <h3>{next.title}</h3>
      <p><strong>{next.checked_in_at ? "Em atendimento · " : ""}{new Date(next.starts_at).toLocaleString("pt-BR")}</strong> até {new Date(next.ends_at).toLocaleString("pt-BR")}</p>
      <p>Horários no fuso deste dispositivo.</p>
      <p>{role === "caregiver" ? "Família / responsável" : "Cuidador"}: {role === "caregiver" ? contract?.client_name ?? "Consulte o contrato" : contract?.caregiver_name ?? "Consulte o contrato"}</p>
      {region && <p>Região: {region}</p>}
      <div className="contract-actions"><button className="primary" onClick={() => navigate("Agenda")}>Ver atendimento na agenda</button><button className="filter" onClick={() => openContract(next.contract_id)}>Ver tarefas, endereço e contato</button></div>
      {role === "caregiver" && <CareInfoDialog trigger="Planejar deslocamento" title="Planejar deslocamento"><p>Confira o endereço privado no contrato e combine o ponto de chegada na conversa. Reserve tempo para o trajeto; o site não calcula trânsito nem distância.</p>{region && <p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(region)}`} target="_blank" rel="noopener noreferrer">Consultar região aproximada no Google Maps</a></p>}<p>Este link abre um serviço externo com a região aproximada. O endereço privado não é enviado.</p></CareInfoDialog>}
    </> : <p>Nenhum próximo atendimento agendado. Confira seus contratos e combine uma data.</p>}
    {role === "client" && !!data && <CareInfoDialog trigger="Meu cuidador" title="Meu cuidador">{data.contracts.filter(contract => contract.status === "active").length ? data.contracts.filter(contract => contract.status === "active").map(contract => <p key={contract.id}>{contract.caregiver_name} <button className="filter" onClick={() => openContract(contract.id)}>Ver contrato e cuidados</button></p>) : <p>Você ainda não tem um cuidador com contrato ativo.</p>}</CareInfoDialog>}
  </section>;
}
