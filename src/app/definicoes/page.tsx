"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Copy, FileOutput, FolderPlus, KeyRound, Loader2, LogOut, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { logoutAndWipe } from "@/lib/user-session";

type User = { id: string; name: string; role: "admin" | "user" };
type Me = { id: string; name: string; role: "admin" | "user" } | null;

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Erro");
  return d;
}

const field = "w-full rounded-lg border border-outline-variant bg-background px-3 py-2.5 text-base outline-none focus:border-primary";
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-50";

export default function SettingsPage() {
  const [me, setMe] = useState<Me>(null);
  const [protectedApp, setProtectedApp] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; pin: string } | null>(null);
  const [curPin, setCurPin] = useState("");
  const [myPin, setMyPin] = useState("");
  const [drive, setDrive] = useState<{ folders: { id: string; name: string; label?: string }[]; envFolders: string[]; serviceEmail: string } | null>(null);
  const [link, setLink] = useState("");
  const [linkName, setLinkName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    const st = await fetch("/api/auth/status", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setProtectedApp(!!st?.protected);
    setMe(st?.user ?? null);
    if (st?.user?.role === "admin") {
      const d = await fetch("/api/users", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ users: [] }));
      setUsers(d.users ?? []);
      const dv = await fetch("/api/drive-folders", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setDrive(dv);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = me?.role === "admin";

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-20 pt-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Biblioteca</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Definições</h1>
      {loading && <Loader2 className="mt-6 animate-spin text-primary" />}

      {!loading && !protectedApp && (
        <p className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm">
          A app está aberta, sem utilizadores. Para ativar vários utilizadores define a variável <b>APP_PIN</b> na Vercel (é o PIN do administrador) e faz um novo deploy.
        </p>
      )}

      {!loading && protectedApp && me && (
        <section className="mt-6 rounded-2xl border border-outline-variant p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Sessão atual</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-lg font-bold text-primary">{me.name} {isAdmin && <span className="flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase"><ShieldCheck size={11} /> Admin</span>}</p>
            <button onClick={() => logoutAndWipe()} className={`${btn} border border-outline-variant text-primary`}><LogOut size={16} /> Mudar de utilizador</button>
          </div>

          {!isAdmin && (
            <form className="mt-5 space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/users/me", "PATCH", { currentPin: curPin, pin: myPin }); setCurPin(""); setMyPin(""); return "PIN alterado."; }); }}>
              <p className="flex items-center gap-2 text-sm font-bold text-on-surface-variant"><KeyRound size={16} /> Alterar o meu PIN</p>
              <input className={field} type="password" inputMode="numeric" placeholder="PIN atual" value={curPin} onChange={(e) => setCurPin(e.target.value)} />
              <input className={field} type="password" inputMode="numeric" placeholder="Novo PIN (4 a 12 dígitos)" value={myPin} onChange={(e) => setMyPin(e.target.value)} />
              <button disabled={busy || !curPin || !myPin} className={`${btn} bg-primary text-on-primary`}>Guardar PIN</button>
            </form>
          )}
        </section>
      )}

      {isAdmin && (
        <Link href="/definicoes/converter" className="mt-6 flex items-center gap-3 rounded-2xl border border-outline-variant p-4 hover:bg-surface-container-low">
          <FileOutput size={22} className="shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-primary">Converter PDF em EPUB</span>
            <span className="text-sm text-on-surface-variant">Transforma PDFs com texto em livros EPUB, no teu browser, e descarrega-os.</span>
          </span>
        </Link>
      )}

      {isAdmin && (
        <Link href="/definicoes/duplicados" className="mt-6 flex items-center gap-3 rounded-2xl border border-outline-variant p-4 hover:bg-surface-container-low">
          <Copy size={22} className="shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-primary">Livros repetidos</span>
            <span className="text-sm text-on-surface-variant">Vê os livros que aparecem mais de uma vez e escolhe quais manter ou esconder da app.</span>
          </span>
        </Link>
      )}

      {isAdmin && (
        <Link href="/definicoes/atividade" className="mt-6 flex items-center gap-3 rounded-2xl border border-outline-variant p-4 hover:bg-surface-container-low">
          <Activity size={22} className="shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-primary">Registo de atividade</span>
            <span className="text-sm text-on-surface-variant">Logins, leituras, descargas e pesquisas de cada utilizador.</span>
          </span>
        </Link>
      )}

      {isAdmin && drive && (
        <section className="mt-6 rounded-2xl border border-outline-variant p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Pastas do Google Drive</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Os livros (EPUB) de todas estas pastas aparecem na mesma estante. Partilha cada pasta, como <b>Leitor</b>, com:</p>
          <p className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-container px-3 py-2 text-xs font-semibold">
            <span className="break-all">{drive.serviceEmail}</span>
            <button type="button" className="shrink-0 underline" onClick={() => navigator.clipboard?.writeText(drive.serviceEmail)}>Copiar</button>
          </p>
          <ul className="mt-4 space-y-2">
            {[...new Set([...drive.envFolders, ...drive.folders.map((f) => f.id)])].map((id) => {
              const st = drive.folders.find((f) => f.id === id);
              const fromEnv = drive.envFolders.includes(id);
              const shown = st?.label || (fromEnv ? "Pasta principal" : st?.name ?? id);
              return (
                <li key={id} className="rounded-xl border border-outline-variant p-3 text-sm">
                  {renaming?.id === id ? (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/drive-folders", "PATCH", { id, label: renaming.label }); setRenaming(null); return "Nome guardado."; }); }}>
                      <input autoFocus className={field} maxLength={40} placeholder="Nome (ex.: Livros do Zé)" aria-label="Nome da pasta" value={renaming.label} onChange={(e) => setRenaming({ id, label: e.target.value })} />
                      <button disabled={busy} className={`${btn} bg-primary text-on-primary`}>Guardar</button>
                      <button type="button" onClick={() => setRenaming(null)} className={`${btn} border border-outline-variant`}>Cancelar</button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <a className="block truncate font-bold text-primary underline-offset-2 hover:underline" href={`https://drive.google.com/drive/folders/${id}`} target="_blank" rel="noreferrer">{shown}</a>
                        <span className="block truncate text-xs text-on-surface-variant">{st?.label && st.name !== st.label ? `Drive: ${st.name} · ` : ""}{fromEnv ? "definida na Vercel" : id.slice(0, 10) + "…"}</span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button aria-label={`Dar nome a ${shown}`} onClick={() => setRenaming({ id, label: st?.label ?? "" })} className="rounded-lg p-2 hover:bg-surface-container"><Pencil size={17} /></button>
                        {!fromEnv && st && (
                          <button aria-label={`Remover ${shown}`} disabled={busy} onClick={() => { if (confirm(`Deixar de sincronizar "${shown}"? Os livros já importados mantêm-se.`)) run(async () => { await api(`/api/drive-folders?id=${id}`, "DELETE"); return "Pasta removida."; }); }} className="rounded-lg p-2 text-error hover:bg-surface-container"><Trash2 size={17} /></button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            {drive.envFolders.length + drive.folders.length === 0 && <li className="text-sm text-on-surface-variant">Sem pasta definida: a app procura EPUBs em toda a Drive acessível.</li>}
          </ul>
          <form className="mt-4 space-y-2 border-t border-outline-variant pt-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api("/api/drive-folders", "POST", { link, label: linkName }); setLink(""); setLinkName(""); return `Pasta "${linkName.trim() || r.added.name}" adicionada. Volta à biblioteca e carrega em sincronizar.`; }); }}>
            <p className="flex items-center gap-2 text-sm font-bold text-on-surface-variant"><FolderPlus size={16} /> Adicionar pasta</p>
            <input className={field} placeholder="https://drive.google.com/drive/folders/…" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link da pasta do Drive" />
            <input className={field} maxLength={40} placeholder="Nome para a reconheceres (opcional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} aria-label="Nome da nova pasta" />
            <button disabled={busy || link.trim().length < 10} className={`${btn} bg-primary text-on-primary`}><Plus size={16} /> Adicionar</button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section className="mt-6 rounded-2xl border border-outline-variant p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Utilizadores ({users.length - 1}/20)</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Cada utilizador tem a sua posição de leitura, marcadores, destaques, seleção, coleções e preferências. A biblioteca e as capas são partilhadas.</p>

          <ul className="mt-4 space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border border-outline-variant p-3">
                {editing?.id === u.id ? (
                  <form className="space-y-2" onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const patch: { name?: string; pin?: string } = {};
                      if (editing.name.trim() && editing.name.trim() !== u.name) patch.name = editing.name;
                      if (editing.pin) patch.pin = editing.pin;
                      if (Object.keys(patch).length) await api(`/api/users/${u.id}`, "PATCH", patch);
                      setEditing(null);
                      return "Guardado.";
                    });
                  }}>
                    <input className={field} value={editing.name} maxLength={30} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nome" />
                    {u.role !== "admin" ? (
                      <input className={field} type="password" inputMode="numeric" placeholder="Novo PIN (deixa vazio para manter)" value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} aria-label="Novo PIN" />
                    ) : (
                      <p className="text-xs text-on-surface-variant">O PIN do administrador define-se em APP_PIN na Vercel.</p>
                    )}
                    <div className="flex gap-2">
                      <button disabled={busy} className={`${btn} bg-primary text-on-primary`}>Guardar</button>
                      <button type="button" onClick={() => setEditing(null)} className={`${btn} border border-outline-variant`}>Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 font-bold text-primary"><span className="truncate">{u.name}</span>{u.role === "admin" && <ShieldCheck size={14} className="shrink-0" aria-label="Administrador" />}</p>
                    <div className="flex shrink-0 gap-1">
                      <button aria-label={`Editar ${u.name}`} onClick={() => setEditing({ id: u.id, name: u.name, pin: "" })} className="rounded-lg p-2 hover:bg-surface-container"><Pencil size={17} /></button>
                      {u.role !== "admin" && (
                        <button aria-label={`Apagar ${u.name}`} disabled={busy} onClick={() => { if (confirm(`Apagar "${u.name}" e todos os seus dados de leitura?`)) run(async () => { await api(`/api/users/${u.id}`, "DELETE"); return `"${u.name}" apagado.`; }); }} className="rounded-lg p-2 text-error hover:bg-surface-container"><Trash2 size={17} /></button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <form className="mt-5 space-y-2 border-t border-outline-variant pt-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/users", "POST", { name: newName, pin: newPin }); setNewName(""); setNewPin(""); return "Utilizador criado."; }); }}>
            <p className="flex items-center gap-2 text-sm font-bold text-on-surface-variant"><UserPlus size={16} /> Novo utilizador</p>
            <input className={field} placeholder="Nome" maxLength={30} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nome do novo utilizador" />
            <input className={field} type="password" inputMode="numeric" placeholder="PIN (4 a 12 dígitos)" value={newPin} onChange={(e) => setNewPin(e.target.value)} aria-label="PIN do novo utilizador" />
            <button disabled={busy || newName.trim().length < 2 || !/^\d{4,12}$/.test(newPin) || users.length - 1 >= 20} className={`${btn} bg-primary text-on-primary`}><Plus size={16} /> Criar utilizador</button>
          </form>
        </section>
      )}

      {msg && <p role="status" className={`mt-4 text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>{msg.text}</p>}
    </main>
  );
}
