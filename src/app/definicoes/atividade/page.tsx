"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Download, KeyRound, Loader2, LogIn, LogOut, RefreshCw, Search, Send, ShieldAlert } from "lucide-react";

type Ev = { uid: string; name: string; type: string; ts: number; bookId?: string; title?: string; detail?: string; device?: string };
type Row = {
  id: string; name: string; role: string; lastLogin: number | null; lastActivity: number | null;
  logins: number; failedLogins: number; reads: number; downloads: number; searches: number;
  reading: { bookId: string; title: string; progress: number; lastRead: number }[];
};

const TYPES: Record<string, { label: string; Icon: typeof LogIn; tone?: string }> = {
  login: { label: "Entrou", Icon: LogIn },
  login_failed: { label: "PIN errado", Icon: ShieldAlert, tone: "text-error" },
  logout: { label: "Saiu", Icon: LogOut },
  read: { label: "Abriu para ler", Icon: BookOpen },
  download: { label: "Descarregou", Icon: Download },
  kobo_send: { label: "Enviou para o Kobo", Icon: Send },
  kobo_download: { label: "Descarregou no Kobo", Icon: Download },
  search: { label: "Pesquisou", Icon: Search },
  read_offline: { label: "Leu offline", Icon: BookOpen },
  share: { label: "Criou links de partilha", Icon: Send },
  share_download: { label: "Link de partilha usado", Icon: Download },
  pdf_open: { label: "Abriu um PDF", Icon: BookOpen },
  pdf_convert: { label: "Converteu PDF em EPUB", Icon: Download },
  offline_save: { label: "Guardou para offline", Icon: Download },
  admin: { label: "Ação de administração", Icon: KeyRound },
};

const fmt = (ts: number | null) =>
  ts ? new Date(ts).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function ActivityPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumo" | "registo">("resumo");
  const [user, setUser] = useState("");
  const [type, setType] = useState("");
  const [shown, setShown] = useState(100);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([fetch("/api/activity/summary", { cache: "no-store" }), fetch("/api/activity?limit=1500", { cache: "no-store" })]);
      if (s.status === 403 || e.status === 403) throw new Error("Só o administrador pode ver o registo.");
      if (!s.ok || !e.ok) throw new Error("Não foi possível carregar o registo.");
      setRows((await s.json()).summary);
      setEvents((await e.json()).events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => events.filter((e) => (!user || e.uid === user) && (!type || e.type === type)), [events, user, type]);
  const sel = "rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-6">
      <Link href="/definicoes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Definições</Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display-lg text-3xl font-bold text-primary">Atividade</h1>
        <button onClick={load} disabled={loading} aria-label="Atualizar" className="rounded-full border border-outline-variant p-2.5 text-primary disabled:opacity-50">
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">Logins, leituras, descargas e pesquisas de cada utilizador (últimos 90 dias).</p>

      {error && <p role="alert" className="mt-4 text-sm font-semibold text-error">{error}</p>}
      {!rows && !error && <Loader2 className="mt-6 animate-spin text-primary" />}

      {rows && (
        <>
          <div className="mt-5 flex gap-2" role="tablist">
            {(["resumo", "registo"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${tab === t ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface-variant"}`}>
                {t === "resumo" ? "Por utilizador" : "Registo completo"}
              </button>
            ))}
          </div>

          {tab === "resumo" && (
            <div className="mt-5 space-y-4">
              {rows.map((r) => (
                <section key={r.id} className="rounded-2xl border border-outline-variant p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-bold text-primary">{r.name}{r.role === "admin" && <span className="ml-2 text-[10px] font-bold uppercase text-outline">Admin</span>}</h2>
                    <button onClick={() => { setUser(r.id); setType(""); setTab("registo"); }} className="text-xs font-bold text-primary underline underline-offset-2">Ver registo</button>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    <div><dt className="text-[11px] uppercase text-outline">Último login</dt><dd>{fmt(r.lastLogin)}</dd></div>
                    <div><dt className="text-[11px] uppercase text-outline">Última atividade</dt><dd>{fmt(r.lastActivity)}</dd></div>
                    <div><dt className="text-[11px] uppercase text-outline">Logins</dt><dd>{r.logins}{r.failedLogins > 0 && <span className="text-error"> · {r.failedLogins} falhados</span>}</dd></div>
                    <div><dt className="text-[11px] uppercase text-outline">Livros abertos</dt><dd>{r.reads}</dd></div>
                    <div><dt className="text-[11px] uppercase text-outline">Descargas</dt><dd>{r.downloads}</dd></div>
                    <div><dt className="text-[11px] uppercase text-outline">Pesquisas</dt><dd>{r.searches}</dd></div>
                  </dl>
                  <h3 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-outline">A ler / lidos</h3>
                  {r.reading.length === 0 ? <p className="mt-1 text-sm text-on-surface-variant">Ainda sem leituras.</p> : (
                    <ul className="mt-2 space-y-2">
                      {r.reading.map((b) => (
                        <li key={b.bookId}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-semibold">{b.title}</span>
                            <span className="shrink-0 text-xs text-on-surface-variant">{b.progress >= 97 ? "Lido" : `${b.progress}%`} · {fmt(b.lastRead)}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full bg-primary" style={{ width: `${Math.min(100, b.progress)}%` }} /></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}

          {tab === "registo" && (
            <div className="mt-5">
              <div className="flex flex-wrap gap-2">
                <select aria-label="Utilizador" className={sel} value={user} onChange={(e) => { setUser(e.target.value); setShown(100); }}>
                  <option value="">Todos os utilizadores</option>
                  {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select aria-label="Tipo de evento" className={sel} value={type} onChange={(e) => { setType(e.target.value); setShown(100); }}>
                  <option value="">Todos os eventos</option>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">{filtered.length} eventos</p>
              <ul className="mt-2 divide-y divide-outline-variant rounded-2xl border border-outline-variant">
                {filtered.slice(0, shown).map((e, i) => {
                  const t = TYPES[e.type] ?? { label: e.type, Icon: KeyRound };
                  return (
                    <li key={i} className="flex gap-3 px-3 py-2.5 text-sm">
                      <t.Icon size={16} className={`mt-0.5 shrink-0 ${t.tone ?? "text-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <p><b>{e.name}</b> · <span className={t.tone}>{t.label}</span>{e.title && <> · <span className="font-semibold">{e.title}</span></>}</p>
                        {(e.detail || e.device) && <p className="truncate text-xs text-on-surface-variant">{[e.type === "search" ? `“${e.detail}”` : e.detail, e.device].filter(Boolean).join(" · ")}</p>}
                      </div>
                      <time className="shrink-0 text-xs text-on-surface-variant">{fmt(e.ts)}</time>
                    </li>
                  );
                })}
                {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-on-surface-variant">Sem eventos.</li>}
              </ul>
              {filtered.length > shown && <button onClick={() => setShown((n) => n + 100)} className="mt-3 w-full rounded-lg border border-outline-variant py-2.5 text-sm font-bold text-primary">Mostrar mais</button>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
