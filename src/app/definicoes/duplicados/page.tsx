"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Wand2 } from "lucide-react";

type B = { id: string; title: string; author: string | null; filesize: number | null; created_at: string | null; cover_url: string | null; hidden: boolean; dup_ok: boolean; folder: string | null };
type Data = { groups: { key: string; books: B[] }[]; hidden: B[]; total: number };

async function post(body: unknown) {
  const res = await fetch("/api/duplicates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Erro");
  return d as { changed: number };
}

const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(1)} MB` : "—");
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-PT") : "—");
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50";

function Row({ b, children }: { b: B; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border border-outline-variant p-2.5 ${b.hidden ? "opacity-60" : ""}`}>
      {b.cover_url ? <img src={b.cover_url} alt="" className="h-16 w-11 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-16 w-11 shrink-0 rounded bg-surface-container" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-primary">{b.title}</p>
        <p className="truncate text-xs text-on-surface-variant">{b.author ?? "Autor desconhecido"}</p>
        <p className="mt-0.5 text-[11px] text-on-surface-variant">{mb(b.filesize)} · {b.folder ?? "pasta desconhecida"} · adicionado a {day(b.created_at)}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">{children}</div>
    </li>
  );
}

export default function DuplicatesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/duplicates", { cache: "no-store" });
    if (!res.ok) { setErr(res.status === 403 ? "Só o administrador pode ver esta página." : "Erro ao carregar."); return; }
    setData(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: unknown, text: string) {
    setBusy(true); setMsg(null);
    try { await post(body); setMsg(text); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-20 pt-6">
      <Link href="/definicoes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Definições</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Livros repetidos</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        São livros com o mesmo título e autor. <b>Esconder</b> tira o livro da biblioteca, das pesquisas e das listas (o ficheiro no Drive não é apagado e a sincronização não o volta a mostrar). <b>Manter</b> deixa-o como está e deixa de o assinalar como repetido.
      </p>
      {err && <p role="alert" className="mt-4 text-sm font-semibold text-error">{err}</p>}
      {!data && !err && <Loader2 className="mt-6 animate-spin text-primary" />}

      {data && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-on-surface-variant">{data.groups.length} grupo{data.groups.length !== 1 ? "s" : ""} por decidir · {data.hidden.length} escondido{data.hidden.length !== 1 ? "s" : ""}</span>
            {data.groups.length > 0 && (
              <button disabled={busy} className={`${btn} bg-primary text-on-primary`} onClick={() => { if (confirm(`Em cada grupo mantém-se o ficheiro maior e escondem-se os outros (${data.groups.reduce((n, g) => n + g.books.length - 1, 0)} livros). Continuar?`)) act({ action: "auto" }, "Repetidos escondidos (ficou o maior de cada grupo)."); }}>
                <Wand2 size={14} /> Resolver tudo automaticamente
              </button>
            )}
          </div>
          {msg && <p role="status" className="mt-3 text-sm font-semibold text-primary">{msg}</p>}

          <ul className="mt-5 space-y-5">
            {data.groups.map((g) => (
              <li key={g.key} className="rounded-2xl border border-outline-variant p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-on-surface-variant">{g.books.length} cópias</p>
                  <button disabled={busy} className={`${btn} border border-outline-variant text-primary`} onClick={() => act({ action: "keep", ids: g.books.map((b) => b.id) }, "Mantidos todos.")}><Check size={14} /> Manter todos</button>
                </div>
                <ul className="space-y-2">
                  {g.books.map((b) => (
                    <Row key={b.id} b={b}>
                      {b.hidden ? (
                        <button disabled={busy} className={`${btn} border border-outline-variant`} onClick={() => act({ action: "unhide", ids: [b.id] }, "Livro reposto.")}><Eye size={14} /> Repor</button>
                      ) : (
                        <>
                          <button disabled={busy} className={`${btn} bg-primary text-on-primary`} onClick={() => act({ action: "hide", ids: g.books.filter((x) => x.id !== b.id && !x.hidden).map((x) => x.id) }, "Ficou só esta cópia.")}>Manter só esta</button>
                          <button disabled={busy} className={`${btn} border border-outline-variant text-error`} onClick={() => act({ action: "hide", ids: [b.id] }, "Livro escondido.")}><EyeOff size={14} /> Esconder</button>
                        </>
                      )}
                    </Row>
                  ))}
                </ul>
              </li>
            ))}
            {data.groups.length === 0 && <li className="rounded-xl border border-outline-variant p-4 text-sm text-on-surface-variant">Não há livros repetidos por decidir. 🎉</li>}
          </ul>

          {data.hidden.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Escondidos da app ({data.hidden.length})</h2>
              <ul className="mt-3 space-y-2">
                {data.hidden.map((b) => (
                  <Row key={b.id} b={b}>
                    <button disabled={busy} className={`${btn} border border-outline-variant`} onClick={() => act({ action: "unhide", ids: [b.id] }, "Livro reposto.")}><Eye size={14} /> Repor</button>
                  </Row>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
