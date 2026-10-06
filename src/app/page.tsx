"use client";
import { confirmNavigation, useUnsavedNavigation } from "@/lib/hooks/use-unsaved-navigation";
import { PrivacySettings } from "@/app/privacy-settings";
import { DailyCare, CareHelp, CancellationGuide } from "@/app/daily-care";
import { MobileSwipe } from "@/app/mobile-swipe";


import { useEffect, useState } from "react";
import { Bell, CalendarDays, ClipboardList, FileText, HeartHandshake, Home, MessageCircle, Plus, Settings, ShieldCheck, Sparkles, UserRound, WalletCards, X } from "lucide-react";
import { registrationSchema, type RegistrationData } from "@/lib/validation";
import { ContractsView as DetailedContractsView } from "@/app/contracts";
import { FinancialView } from "@/app/financial";
import { FamilyReportsView } from "@/app/reports";
import { ConversationsViewClean } from "@/app/conversations";
import { AgendaView as InteractiveAgendaView } from "@/app/agenda";
import { ProfileMenu } from "@/app/profile-menu";
import { ApplicationsViewReal, ClientOpportunitiesView, OpportunitiesView } from "@/app/opportunities";
import { useModalAccessibility } from "@/lib/hooks/use-modal-accessibility";
import { DashboardView } from "@/app/dashboard";
import { DiaryViewReal } from "@/app/diary";

import { NotificationsViewReal } from "@/app/notifications";

type View = "Pedir ajuda" | "Início" | "Encontrar oportunidades" | "Minhas candidaturas" | "Candidaturas recebidas" | "Meus contratos" | "Agenda" | "Diário de bordo" | "Relatórios" | "Financeiro" | "Mensagens" | "Notificações" | "Meu perfil" | "Configurações" | "Publicar oportunidade";
const navGroups = [
  { label: "Visão geral", items: [[Home, "Início"], [Sparkles, "Encontrar oportunidades"]] },
  { label: "Meu trabalho", items: [[ClipboardList, "Minhas candidaturas"], [FileText, "Meus contratos"], [CalendarDays, "Agenda"], [HeartHandshake, "Diário de bordo"], [WalletCards, "Financeiro"]] },
  { label: "Comunicação", items: [[MessageCircle, "Mensagens"], [Bell, "Notificações"]] },
  { label: "Conta", items: [[UserRound, "Meu perfil"], [Settings, "Configurações"], [HeartHandshake, "Pedir ajuda"]] },
] as const;
const clientNavGroups = [
  { label: "Visão geral", items: [[Home, "Início"], [Plus, "Publicar oportunidade"]] },
  { label: "Acompanhamento", items: [[ClipboardList, "Candidaturas recebidas"], [FileText, "Meus contratos"], [CalendarDays, "Agenda"], [ClipboardList, "Relatórios"], [WalletCards, "Financeiro"]] },
  { label: "Comunicação", items: [[MessageCircle, "Mensagens"], [Bell, "Notificações"]] },
  { label: "Conta", items: [[UserRound, "Meu perfil"], [Settings, "Configurações"], [HeartHandshake, "Pedir ajuda"]] },
] as const;

function PublicEntry({
  onRegister,
  onLogin,
  registration,
  login,
  forgotPassword,
}: {
  onRegister: (role?: "client" | "caregiver") => void;
  onLogin: () => void;
  registration: React.ReactNode;
  login: React.ReactNode;
  forgotPassword: React.ReactNode;
}) {
  const steps = [[FileText, "1. Publique ou candidate-se", "A família descreve a rotina de cuidado. O cuidador encontra oportunidades compatíveis."], [MessageCircle, "2. Converse com segurança", "Chat interno do Zelou!, sem expor endereço exato nem dados sensíveis de saúde."], [CalendarDays, "3. Contrate e acompanhe", "Contrato intermediado pelo Zelou!, agenda, relatórios semanais e avaliações."]];
  const pillars = [[ShieldCheck, "Segurança", "Documentos analisados e endereço protegido até a contratação."], [HeartHandshake, "Carinho", "Cuidado humano, respeito e centrado na pessoa idosa."], [UserRound, "Conexão", "Famílias e cuidadores profissionais no mesmo lugar."], [Sparkles, "Autonomia", "Rotinas que fortalecem independência e bem-estar."]];
  return <div className="landing-page"><header className="landing-header"><div className="landing-logo"><span className="landing-logo-mark">♡</span><span>Zelou<span style={{ color: "#6ed6a7" }}>!</span></span></div><nav><button className="landing-link" onClick={onLogin}>Entrar</button><button className="landing-cta" onClick={() => onRegister()}>Criar conta</button></nav></header><main><section className="landing-hero"><div className="landing-hero-copy"><span className="landing-eyebrow"><ShieldCheck size={15} /> Plataforma de cuidado com privacidade</span><h1 className="display">Cuidado que acolhe, protege e fortalece a autonomia.</h1><p>O Zelou! conecta famílias e responsáveis a cuidadores profissionais verificados, com oportunidades, conversa segura, contrato intermediado e acompanhamento do cuidado do início ao fim.</p><div className="landing-actions"><button className="landing-cta" onClick={() => onRegister("client")}>Sou família e preciso de cuidador</button><button className="landing-secondary" onClick={() => onRegister("caregiver")}>Sou cuidador(a) profissional</button></div></div><div className="landing-visual"><div className="landing-heart">♡<span>●</span></div><div className="landing-visual-items"><span><ShieldCheck size={23} /> SEGURANÇA</span><span><HeartHandshake size={23} /> CARINHO</span><span><UserRound size={23} /> CONEXÃO</span><span><Sparkles size={23} /> AUTONOMIA</span></div></div></section><section className="landing-section"><h2 className="display">Como o Zelou! funciona</h2><p>Um caminho simples e transparente, pensado para famílias e para profissionais do cuidado.</p><div className="landing-grid landing-steps">{steps.map(([Icon, title, text]) => <article key={title as string}><span className="landing-icon"><Icon size={22} /></span><h3>{title as string}</h3><p>{text as string}</p></article>)}</div></section><section className="landing-section landing-pillars"><h2 className="display">Nossos pilares</h2><div className="landing-grid landing-pillar-grid">{pillars.map(([Icon, title, text]) => <article key={title as string}><Icon size={25} /><h3>{title as string}</h3><p>{text as string}</p></article>)}</div></section><section className="landing-final"><h2 className="display">Comece agora, sem custo para criar sua conta</h2><p>Crie sua conta como família ou cuidador. Seus dados são tratados conforme a LGPD e informações sensíveis nunca ficam públicas.</p><button className="landing-cta" onClick={() => onRegister()}>Criar minha conta</button></section></main><footer className="landing-footer"><span>♡ &nbsp; Cuidado que acolhe, protege e fortalece a autonomia.</span><span>© 2026 Zelou! · Dados tratados conforme a LGPD.</span></footer>{registration}{login}{forgotPassword}</div>;
}

export default function HomePage() {
  useModalAccessibility();
  useUnsavedNavigation();
  const [active, setActive] = useState<View>("Início");
  const [simple, setSimple] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationRole, setRegistrationRole] = useState<"client" | "caregiver">("caregiver");
  const [showLogin, setShowLogin] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<"client" | "caregiver">("caregiver");
  const [authenticated, setAuthenticated] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"not_submitted" | "under_review" | "approved" | "rejected" | "needs_correction">("not_submitted");

  useEffect(() => {
    fetch("/api/auth/session").then(async (response) => { if (!response.ok) return; const body = await response.json(); if (body.authenticated) { setAuthenticated(true); setProfileName(body.profile.name); setProfileRole(body.profile.role); setProfileAvatarUrl(body.profile.avatarUrl ?? null); setVerificationStatus(body.profile.verificationStatus); setAccessible(Boolean(body.profile.accessibleMode)); } }).catch(() => undefined);
  }, []);
  const [contractId, setContractId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  useEffect(() => {
    // A return URL only selects the screen. Payment confirmation comes from Stripe.
    const params = new URLSearchParams(window.location.search);
    const stripeReturn = params.get("stripe"); const id = params.get("contract");
    void Promise.resolve().then(() => {
      if (stripeReturn?.startsWith("connect")) setActive("Financeiro");
      else if (["return", "cancel"].includes(stripeReturn ?? "") && id && /^[0-9a-f-]{36}$/i.test(id)) {
        setContractId(id); setActive("Meus contratos");
      }
    });
  }, []);
  const openMessages = (id: string) => { if (!confirmNavigation()) return; setConversationId(id); setActive("Mensagens"); };
  const navigate = (view: View) => { if (view === active || !confirmNavigation()) return; setActive(view); };
  const logout = async () => {
    if (!confirmNavigation()) return;
    try { const response = await fetch("/api/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("Falha ao sair. Sua conta continua conectada; tente novamente.");
      setSimple(false); setAuthenticated(false); setProfileName(""); setProfileAvatarUrl(null); setAccessible(false); setProfileRole("caregiver"); setVerificationStatus("not_submitted"); setContractId(null); setConversationId(null); setActive("Início");
    } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Falha ao sair. Tente novamente."); }
  };
  const saveProfile = (profile: RegistrationData) => { setProfileName(profile.name); setProfileRole(profile.role); setShowRegistration(false); };

  if (!authenticated) return (
  <PublicEntry
    onRegister={(role = "caregiver") => {
      setRegistrationRole(role);
      setShowRegistration(true);
    }}

    onLogin={() => setShowLogin(true)}

    forgotPassword={
      showForgotPassword ? (
        <ForgotPasswordDialog
          onClose={() => setShowForgotPassword(false)}
        />
      ) : null
    }

    registration={
      showRegistration ? (
        <RegistrationDialog
          initialName=""
          initialRole={registrationRole}
          onClose={() => setShowRegistration(false)}
          onSaved={(profile) => {
            saveProfile(profile);
            setVerificationStatus("not_submitted");
            setAuthenticated(true);
          }}
        />
      ) : null
    }

    login={
      showLogin ? (
        <LoginDialog
          onClose={() => setShowLogin(false)}

          onForgotPassword={() => {
            setShowLogin(false);
            setShowForgotPassword(true);
          }}

          onLoggedIn={(profile) => {
            setProfileName(profile.name);
            setProfileAvatarUrl(profile.avatarUrl ?? null); setAccessible(Boolean(profile.accessibleMode)); setContractId(null); setConversationId(null); setActive("Início");
            setProfileRole(profile.role);
            setVerificationStatus(profile.verificationStatus);
            setShowLogin(false);
            setAuthenticated(true);
          }}
        />
      ) : null
    }
  />
  );
  if (profileRole === "caregiver" && verificationStatus !== "under_review" && verificationStatus !== "approved") return <VerificationRequiredReal onSubmitted={() => setVerificationStatus("under_review")} onLogout={logout} />;
  return <div className={`${accessible || simple ? "shell large-type" : "shell"}${simple ? " simple-shell" : ""}`}>
    <aside className="sidebar">
      <div className="logo"><span className="logo-mark">♡</span><span>Zelou<span style={{ color: "#6ed6a7" }}>!</span></span></div>
      {(profileRole === "client" ? clientNavGroups : navGroups).map((group) => <div key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(([Icon, label]) => <button key={label} className={`nav-item ${active === label ? "active" : ""}`} onClick={() => navigate(label as View)}><Icon size={17} strokeWidth={1.8} />{label}</button>)}</div>)}
      <div className="sidebar-footer"><div className="user-row"><div><strong style={{ fontSize: 12 }}>{profileName || "Meu perfil"}</strong><div style={{ color: "#8b9da1", fontSize: 11 }}>Configurações da conta</div></div><ProfileMenu name={profileName} role={profileRole} avatarUrl={profileAvatarUrl} onProfileUpdated={(profile) => { setProfileName(profile.fullName); setProfileAvatarUrl(profile.avatarUrl); }} onLogout={logout} /></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Área do {profileRole === "client" ? "cliente" : "cuidador"} <span style={{ margin: "0 8px" }}>/</span> <strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Mensagens" onClick={() => navigate("Mensagens")}><MessageCircle size={19} /></button><button className="icon-button" aria-label="Notificações" onClick={() => navigate("Notificações")}><Bell size={19} /></button><ProfileMenu name={profileName} role={profileRole} avatarUrl={profileAvatarUrl} onProfileUpdated={(profile) => { setProfileName(profile.fullName); setProfileAvatarUrl(profile.avatarUrl); }} onLogout={logout} /></div></header>
      {profileRole === "client" && <button className="filter simple-toggle" aria-pressed={simple} onClick={()=>{if(confirmNavigation()){setSimple(!simple);setActive("Início");}}}>{simple ? "Usar painel completo" : "Usar modo simples"}</button>}
      {simple && <nav className="simple-actions" aria-label="Atalhos de cuidado">{[["Meus contratos","Meu cuidador"],["Agenda","Próximo atendimento"],["Mensagens","Conversar"],["Pedir ajuda","Pedir ajuda"],["Início","Voltar ao início"]].map(([view,label])=><button className="primary" key={view} onClick={()=>navigate(view as View)}>{label}</button>)}</nav>}
      <MobileSwipe key={active} onSwipe={direction => { const tabs: View[] = ["Início", profileRole === "client" ? "Publicar oportunidade" : "Encontrar oportunidades", "Mensagens", "Agenda", "Meu perfil"]; const index = tabs.indexOf(active); const next = tabs[index + direction]; if (index >= 0 && next) { navigate(next); window.scrollTo({ top: 0 }); } }}><div className="greeting"><div><h1 className="display">{profileName ? `Bom dia, ${profileName.split(" ")[0]}` : "Seu painel de cuidado"} <span aria-hidden="true"></span></h1><p className="subtle">{profileName ? "Gerencie suas conexões e sua rotina de cuidado." : "Crie seu perfil para personalizar oportunidades e proteger seus dados."}</p></div></div>
        {active === "Início" && <><DailyCare role={profileRole} navigate={view=>navigate(view as View)} openContract={id=>{setContractId(id);navigate("Meus contratos");}} />{!simple && <><DashboardView role={profileRole} onNavigate={view=>navigate(view as View)} /><CancellationGuide navigate={view=>navigate(view as View)}/></>}</>}
        {active === "Pedir ajuda" && <CareHelp navigate={view=>navigate(view as View)}/>} 
        {active === "Encontrar oportunidades" && profileRole === "caregiver" && <OpportunitiesView onOpenMessages={openMessages} />}
        {active === "Minhas candidaturas" && profileRole === "caregiver" && <ApplicationsViewReal role="caregiver" onOpenMessages={openMessages} />}
        {active === "Candidaturas recebidas" && profileRole === "client" && <ApplicationsViewReal role="client" onOpenMessages={openMessages} />}
        {active === "Meus contratos" && <DetailedContractsView role={profileRole} initialContractId={contractId} />}
        {active === "Agenda" && <InteractiveAgendaView />}
        {active === "Diário de bordo" && <DiaryViewReal />}
        {active === "Relatórios" && <FamilyReportsView />}
        {active === "Financeiro" && <FinancialView role={profileRole} onOpenContract={() => navigate("Meus contratos")} />}
        {active === "Publicar oportunidade" && <ClientOpportunitiesView />}
        {active === "Mensagens" && <ConversationsViewClean initialConversationId={conversationId} onOpenContract={id => { if (!confirmNavigation()) return; setContractId(id); setActive("Meus contratos"); }} />}
        {active === "Notificações" && <NotificationsViewReal />}
        {active === "Meu perfil" && <ProfileView name={profileName} avatarUrl={profileAvatarUrl} role={profileRole} editor={<ProfileMenu name={profileName} role={profileRole} avatarUrl={profileAvatarUrl} direct onProfileUpdated={(profile) => { setProfileName(profile.fullName); setProfileAvatarUrl(profile.avatarUrl); }} onLogout={logout} />} />}
        {active === "Configurações" && <SettingsView accessible={accessible} setAccessible={setAccessible} />}
      </MobileSwipe>
        <MobileNav active={active} role={profileRole} navigate={navigate} />
    </main>
    {showRegistration && <RegistrationDialog initialName={profileName} initialRole={profileRole} onClose={() => setShowRegistration(false)} onSaved={saveProfile} />}
  </div>;
}

function MobileNav({ active, role, navigate }: { active: View; role: "client" | "caregiver"; navigate: (view: View) => void }) {
  const [more, setMore] = useState(false);
  const groups = role === "client" ? clientNavGroups : navGroups;
  const items: [typeof Home, View][] = [[Home, "Início"], [Sparkles, role === "client" ? "Publicar oportunidade" : "Encontrar oportunidades"], [MessageCircle, "Mensagens"], [CalendarDays, "Agenda"]];
  return <><nav className="mobile-nav" aria-label="Navegação principal">{items.map(([Icon, label]) => <button key={label} className={active === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={18} /><span>{label === "Encontrar oportunidades" ? "Vagas" : label === "Publicar oportunidade" ? "Minhas vagas" : label}</span></button>)}<button className={!items.some(([,label])=>label===active) ? "active" : ""} aria-expanded={more} onClick={() => setMore(true)}><Settings size={18} /><span>Mais</span></button></nav>{more && <div className="mobile-more-backdrop" onClick={() => setMore(false)}><section role="dialog" aria-modal="true" aria-label="Todas as seções" className="mobile-more" onClick={event=>event.stopPropagation()}><button className="filter" onClick={()=>setMore(false)}>Fechar menu</button>{groups.map(group => <div key={group.label}><h3>{group.label}</h3>{group.items.map(([Icon,label])=><button className="nav-item" key={label} onClick={()=>{navigate(label as View);setMore(false);}}><Icon size={20}/>{label}</button>)}</div>)}</section></div>}</>;
}

function ProfileView({ name, role, editor, avatarUrl }: { name: string; avatarUrl: string | null; role: string; editor: React.ReactNode }) { return <Panel title="Meu perfil" subtitle="Altere sua foto, dados de contato, e-mail e senha em um único lugar."><div className="profile-hero"><div className="profile-avatar" role="img" aria-label="Foto do perfil" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{avatarUrl ? null : name ? name.slice(0, 2).toUpperCase() : "?"}</div><div><h3>{name || "Perfil não preenchido"}</h3><p>{role === "caregiver" ? "Cuidador profissional" : "Familiar ou responsável"}</p></div></div><div style={{ paddingTop: 18 }}>{editor}</div><p className="subtle" style={{ padding: "16px 0 0" }}>O selo de verificação só é exibido após a aprovação administrativa dos documentos profissionais e das checagens obrigatórias.</p></Panel>; }

function SettingsView({ accessible, setAccessible }: { accessible: boolean; setAccessible: (value: boolean) => void }) { return <Panel title="Configurações" subtitle="Suas preferências e seus dados."><div className="settings-list"><section className="settings-row"><div className="settings-label"><h3>Modo acessível</h3><p>Amplia textos e controles.</p></div><button className={`settings-toggle ${accessible ? "is-active" : ""}`} role="switch" aria-checked={accessible} onClick={() => setAccessible(!accessible)}><span />{accessible ? "Ativo" : "Inativo"}</button></section><section className="settings-row settings-privacy"><PrivacySettings /></section><section className="settings-row"><div className="settings-label"><h3>Notificações</h3><p>Mensagens e alertas de contratos.</p></div><span className="status">Ativas</span></section></div></Panel>; }

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="panel"><div className="panel-head"><div><h2 className="panel-title">{title}</h2><p className="subtle" style={{ marginTop: 5, fontSize: 12 }}>{subtitle}</p></div></div><div className="mini-list">{children}</div></section>; }

function VerificationRequiredReal({ onSubmitted, onLogout }: { onSubmitted: () => void; onLogout: () => void }) { const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const submit = async () => { if (!file) { setError("Anexe um diploma ou certificado para continuar."); return; } if (!/[.]((pdf)|(jpg)|(jpeg)|(png))$/i.test(file.name) || file.size > 10 * 1024 * 1024) { setError("Use PDF, JPG ou PNG de até 10 MB."); return; } setSaving(true); const data = new FormData(); data.append("file", file); const response = await fetch("/api/verification/documents", { method: "POST", body: data }); const body = await response.json(); setSaving(false); if (!response.ok) { setError(body.error ?? "Não foi possível enviar o documento."); return; } onSubmitted(); }; return <div style={{ minHeight: "100vh", background: "#f4f8f8", display: "grid", placeItems: "center", padding: 24 }}><div className="panel" style={{ maxWidth: 560, width: "100%", padding: 32 }}><div className="logo" style={{ padding: 0, marginBottom: 25 }}><span className="logo-mark">♡</span><span>Zelou<span style={{ color: "#6ed6a7" }}>!</span></span></div><span className="tag" style={{ marginTop: 0 }}>Etapa obrigatória</span><h1 className="display" style={{ fontSize: 27, margin: "15px 0 8px" }}>Envie sua formação profissional</h1><p className="subtle" style={{ lineHeight: 1.6 }}>Antes de acessar oportunidades, o Zelou! precisa receber pelo menos um diploma ou certificado para análise administrativa.</p><label style={{ display: "grid", gap: 8, margin: "25px 0", fontSize: 13, fontWeight: 700 }}>Diploma ou certificado<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} style={{ border: "1px dashed #9bb8b5", borderRadius: 9, padding: 22, background: "#f8fbfb" }} />{file && <small style={{ color: "#328c6c" }}>{file.name} selecionado. Será enviado para análise.</small>}{error && <small style={{ color: "#c45f50" }}>{error}</small>}</label><p className="subtle" style={{ fontSize: 12 }}>O documento ficará privado. O status será “Em análise” e somente um administrador poderá aprová-lo. O envio não comprova autenticidade.</p><button className="primary" onClick={submit} disabled={saving} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}>{saving ? "Enviando..." : "Enviar para análise"}</button><button className="link" onClick={onLogout} style={{ display: "block", margin: "18px auto 0" }}>Sair da conta</button></div></div>; }

function LoginDialog({
  onClose,
  onForgotPassword,
  onLoggedIn,
}: {
  onClose: () => void;
  onForgotPassword: () => void;
  onLoggedIn: (profile: {
    name: string;
    avatarUrl?: string | null; accessibleMode?: boolean;
    role: "client" | "caregiver";
    verificationStatus: "not_submitted" | "under_review" | "approved" | "rejected" | "needs_correction";
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const body = await response.json();

    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Não foi possível entrar.");
      return;
    }

    onLoggedIn(body.profile);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "#103f4b55",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 30,
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: 430,
          width: "100%",
          padding: 24,
          position: "relative",
        }}
      >
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
          }}
        >
          <X size={18} />
        </button>

        <span className="tag" style={{ marginTop: 0 }}>
          Login seguro
        </span>

        <h2
          className="display"
          style={{
            fontSize: 23,
            margin: "15px 0 6px",
          }}
        >
          Acesse sua conta
        </h2>

        <p className="subtle">
          O acesso a oportunidades exige uma conta autenticada.
        </p>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 22,
          }}
        >
          <label
            style={{
              display: "grid",
              gap: 5,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            E-mail

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 11,
              }}
            />
          </label>

          <label
            style={{
              display: "grid",
              gap: 5,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Senha

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 11,
              }}
            />
          </label>

          <button
            type="button"
            className="link"
            onClick={onForgotPassword}
            style={{
              justifySelf: "end",
              fontSize: 12,
              padding: 0,
            }}
          >
            Esqueci minha senha
          </button>

          {error && (
            <p
              role="alert"
              style={{
                color: "#c45f50",
                fontSize: 12,
              }}
            >
              {error}
            </p>
          )}

          <button
            className="primary"
            onClick={submit}
            disabled={saving}
            style={{
              justifyContent: "center",
            }}
          >
            {saving ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Informe seu e-mail.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Não foi possível solicitar a recuperação.");
        return;
      }

      setMessage(
        body.message ??
          "Se existir uma conta com esse e-mail, enviaremos um link para redefinir sua senha."
      );
    } catch {
      setError(
        "Não foi possível conectar ao servidor. Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "#103f4b55",
        display: "grid",
        placeItems: "center",
        padding: 20,
        zIndex: 40,
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: 430,
          width: "100%",
          padding: 24,
          position: "relative",
        }}
      >
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
          }}
        >
          <X size={18} />
        </button>

        <span className="tag" style={{ marginTop: 0 }}>
          Recuperação de acesso
        </span>

        <h2
          className="display"
          style={{
            fontSize: 23,
            margin: "15px 0 6px",
          }}
        >
          Esqueceu sua senha?
        </h2>

        <p
          className="subtle"
          style={{
            lineHeight: 1.6,
          }}
        >
          Informe o e-mail usado no seu cadastro. Se houver uma conta
          associada, enviaremos um link para criar uma nova senha.
        </p>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 22,
          }}
        >
          <label
            style={{
              display: "grid",
              gap: 5,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            E-mail

            <input
              type="email"
              value={email}
              placeholder="voce@email.com"
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
                setMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submit();
                }
              }}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 11,
                outline: 0,
              }}
            />
          </label>

          {error && (
            <p
              role="alert"
              style={{
                color: "#c45f50",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              style={{
                color: "#328c6c",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          )}

          <button
            className="primary"
            onClick={submit}
            disabled={saving}
            style={{
              justifyContent: "center",
            }}
          >
            {saving ? "Enviando..." : "Enviar link de recuperação"}
          </button>

          <button
            className="link"
            onClick={onClose}
            style={{
              justifySelf: "center",
              fontSize: 12,
            }}
          >
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistrationDialog({ initialName, initialRole, onClose, onSaved }: { initialName: string; initialRole: "client" | "caregiver"; onClose: () => void; onSaved: (profile: RegistrationData) => void }) { const [form, setForm] = useState({ name: initialName, cpf: "", email: "", phone: "", password: "", role: initialRole, acceptedTerms: false }); const [errors, setErrors] = useState<Record<string, string>>({}); const [serverError, setServerError] = useState(""); const [saving, setSaving] = useState(false); const update = (field: string, value: string | boolean) => setForm((current) => ({ ...current, [field]: value })); const submit = async () => { const result = registrationSchema.safeParse(form); if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; } setSaving(true); setServerError(""); try { const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data) }); const body = await response.json(); if (!response.ok) { setServerError(body.error ?? "Não foi possível concluir o cadastro."); return; } onSaved(result.data); } catch { setServerError("Não foi possível conectar ao servidor. Tente novamente."); } finally { setSaving(false); } }; return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "#103f4b55", display: "grid", placeItems: "center", padding: 20, zIndex: 30 }}><div className="panel" style={{ maxWidth: 520, width: "100%", padding: 24, position: "relative", maxHeight: "92vh", overflowY: "auto" }}><button className="icon-button" onClick={onClose} aria-label="Fechar" style={{ position: "absolute", top: 14, right: 14 }}><X size={18} /></button><span className="tag" style={{ marginTop: 0 }}>Cadastro seguro</span><h2 className="display" style={{ fontSize: 23, margin: "15px 0 6px" }}>Como você deseja utilizar o Zelou!?</h2><p className="subtle">Seus dados ficam protegidos e só serão compartilhados com autorização.</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, margin: "20px 0" }}>{[["caregiver", "Sou cuidador"], ["client", "Sou familiar/responsável"]].map(([value, label]) => <button key={value} onClick={() => update("role", value)} style={{ border: `1px solid ${form.role === value ? "#6ed6a7" : "var(--line)"}`, background: form.role === value ? "#e9f8f1" : "#fff", borderRadius: 9, padding: 13, color: "var(--ink)", fontWeight: 700 }}>{label}</button>)}</div><div style={{ display: "grid", gap: 12 }}>{[["name", "Nome completo", "Seu nome"], ["cpf", "CPF", "000.000.000-00"], ["email", "E-mail", "voce@email.com"], ["phone", "Telefone", "(00) 00000-0000"], ["password", "Senha", "Mínimo de 8 caracteres"]].map(([field, label, placeholder]) => <label key={field} style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 700 }}>{label}<input value={form[field as keyof typeof form] as string} type={field === "password" ? "password" : field === "email" ? "email" : "text"} placeholder={placeholder} onChange={(event) => update(field, event.target.value)} style={{ border: `1px solid ${errors[field] ? "#dd7c6c" : "var(--line)"}`, borderRadius: 8, padding: "11px 12px", outline: 0 }} />{errors[field] && <span style={{ color: "#c45f50", fontSize: 11 }}>{errors[field]}</span>}</label>)}</div><label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "16px 0", color: "#62767b", fontSize: 12 }}><input type="checkbox" checked={form.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} /> Aceito os Termos de Uso e a Política de Privacidade do Zelou!.<span style={{ color: "#c45f50" }}>{errors.acceptedTerms}</span></label>{serverError && <p role="alert" style={{ color: "#c45f50", fontSize: 12 }}>{serverError}</p>}<button className="primary" onClick={submit} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>{saving ? "Criando conta..." : "Validar e criar perfil"}</button></div></div>; }
