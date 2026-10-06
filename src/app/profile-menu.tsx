"use client";

import { Camera, CreditCard, LogOut, UserRound, X } from "lucide-react";
import { LocationField, Region } from "@/app/planning-fields";
import { ProfessionalProfile } from "@/app/professional-profile";
import { useRef, useState } from "react";

type Role = "client" | "caregiver";
type Profile = { region?: Region | null; fullName: string; email: string; phone: string | null; city: string | null; state: string | null; avatarUrl: string | null; accessibleMode: boolean };

export function ProfileMenu({ name, role, avatarUrl, direct = false, onProfileUpdated, onLogout }: { name: string; role: Role; avatarUrl: string | null; direct?: boolean; onProfileUpdated: (profile: Profile) => void; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = name ? name.slice(0, 2).toUpperCase() : "?";

  const openEditor = async () => {
    setOpen(false); setError("");
    try {
      const response = await fetch("/api/profile");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setProfile(body.profile); setNewEmail(body.profile.email); setNewPassword(""); setEditing(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o perfil."); }
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: profile.fullName, phone: profile.phone ?? "", regionId: profile.region?.id, accessibleMode: profile.accessibleMode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const updated = { ...profile, fullName: body.profile.full_name, phone: body.profile.phone, city: body.profile.city, state: body.profile.state, accessibleMode: body.profile.accessible_mode, email: body.email ?? profile.email };
      setProfile(updated); onProfileUpdated(updated); setNewPassword(""); setEditing(false); setNotice("Perfil salvo.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o perfil."); } finally { setSaving(false); }
  };

  const uploadAvatar = async (file: File) => {
    const formData = new FormData(); formData.append("file", file);
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (profile) { const updated = { ...profile, avatarUrl: body.avatarUrl }; setProfile(updated); onProfileUpdated(updated); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a imagem."); } finally { setSaving(false); }
  };

  const credentials = async (action: "email" | "password") => {
    setSaving(true); setError(""); setNotice("");
    try { const response = await fetch("/api/profile/credentials", {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(action === "email" ? {action,email:newEmail} : {action,password:newPassword})}); const body=await response.json(); if(!response.ok) throw new Error(body.error); setNotice(body.message); setNewPassword(""); if(profile && body.email) setProfile({...profile,email:body.email}); }
    catch(cause){setError(cause instanceof Error ? cause.message : "Falha ao alterar credenciais.");} finally{setSaving(false);}
  };
  return <>{direct ? <button className="primary" onClick={() => void openEditor()}><UserRound size={16} /> Editar meu perfil</button> : <div className="profile-menu-wrap"><button className="avatar" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" aria-label="Abrir menu do perfil" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: "cover" } : undefined}>{avatarUrl ? null : initials}</button>{open && <div className="profile-menu" role="menu"><strong>{name || "Meu perfil"}</strong><button role="menuitem" onClick={() => void openEditor()}><UserRound size={16} /> Meu perfil</button><button role="menuitem" disabled title="A integração de pagamento ainda não está configurada"><CreditCard size={16} /> {role === "client" ? "Forma de pagamento" : "Forma de recebimento"}</button><button role="menuitem" className="profile-menu-danger" onClick={() => void onLogout()}><LogOut size={16} /> Sair da conta</button></div>}</div>}{notice && !editing && <p role="status">{notice}</p>}{error && !editing && <p role="alert">{error}</p>}{editing && profile && <div className="report-modal" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><div className="report-modal-card"><button className="icon-button report-close" onClick={() => setEditing(false)} aria-label="Fechar"><X size={18} /></button><h2 id="profile-dialog-title" className="display">Meu perfil</h2><div className="avatar-editor"><button className="profile-image" type="button" onClick={() => inputRef.current?.click()} aria-label="Alterar imagem de perfil" style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: "cover" } : undefined}>{profile.avatarUrl ? null : initials}<span><Camera size={16} /></span></button><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); }} /></div><label>Nome completo<input autoComplete="name" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></label><label>Telefone<input type="tel" autoComplete="tel" value={profile.phone ?? ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><LocationField value={profile.region ?? null} onChange={region => setProfile({ ...profile, region })} />{error && <p role="alert">{error}</p>}<button className="primary" disabled={saving || !profile.fullName.trim()} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar alterações"}</button><details><summary>E-mail e senha</summary><p>Estas alterações são salvas separadamente dos dados do perfil.</p><label>Novo e-mail<input type="email" value={newEmail} onChange={event=>setNewEmail(event.target.value)}/></label><button className="filter" disabled={saving || !newEmail || newEmail === profile.email} onClick={()=>void credentials("email")}>Atualizar e-mail</button><label>Nova senha<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label><button className="filter" disabled={saving || newPassword.length<8} onClick={()=>void credentials("password")}>Alterar senha</button></details>{notice && <p role="status">{notice}</p>}{role === "caregiver" && <ProfessionalProfile editable />}<p className="subtle">{role === "client" ? "Formas de pagamento serão habilitadas apenas com um provedor de pagamentos configurado." : "Formas de recebimento serão habilitadas apenas com um provedor de pagamentos configurado."}</p></div></div>}</>;
}
