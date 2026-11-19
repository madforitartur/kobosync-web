"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, ListChecks, Loader2, Wand2, X } from "lucide-react";

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

/** Mais antigo primeiro (empate: o maior ficheiro primeiro). O primeiro é o que se mantém. */
const oldestFirst = (a: B, b: B) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || (b.filesize ?? 0) - (a.filesize ?? 0) || a.id.localeCompare(b.id);

function Row({ b, checked, onToggle, children }: { b: B; checked?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-2.5 ${checked ? "border-error bg-error/5" : "border-outline-variant"} ${b.hidden ? "opacity-60" : ""}`}>
      {onToggle && <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--color-error,#b3261e)]" checked={!!checked} onChange={onToggle} aria-label={`Selecionar ${b.title} para esconder`} />}
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
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/duplicates", { cache: "no-store" });
    if (!res.ok) { setErr(res.status === 403 ? "Só o administrador pode ver esta página." : "Erro ao carregar."); return; }
    const d: Data = await res.json();
    setData(d);
    const alive = new Set(d.groups.flatMap((g) => g.books.filter((b) => !b.hidden).map((b) => b.id)));
    setSel((cur) => new Set([...cur].filter((id) => alive.has(id))));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: unknown, text: string) {
    setBusy(true); setMsg(null);
    try { await post(body); setMsg(text); await load(); } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** Em cada grupo seleciona tudo menos a cópia mais antiga. */
  function selectNewest() {
    if (!data) return;
    const next = new Set<string>();
    for (const g of data.groups) g.books.filter((b) => !b.hidden).sort(oldestFirst).slice(1).forEach((b) => next.add(b.id));
    setSel(next);
    setMsg(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-28 pt-6">
      <Link href="/definicoes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Definições</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Livros repetidos</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        São livros com o mesmo título e autor. <b>Esconder</b> tira o livro da biblioteca, das pesquisas e das listas (o ficheiro no Drive não é apagado e a sincronização não o volta a mostrar). Com <b>Selecionar as mais recentes</b> ficam marcadas, em cada grupo, todas as cópias exceto a mais antiga (a que foi adicionada primeiro; se foram adicionadas juntas, fica a de maior tamanho). Revê a seleção, desmarca o que quiseres e carrega em <b>Esconder selecionados</b>. <b>Manter</b> deixa-o como está e deixa de o assinalar como repetido.
      </p>
      {err && <p role="alert" className="mt-4 text-sm font-semibold text-error">{err}</p>}
      {!data && !err && <Loader2 className="mt-6 animate-spin text-primary" />}

      {data && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-on-surface-variant">{data.groups.length} grupo{data.groups.length !== 1 ? "s" : ""} por decidir · {data.hidden.length} escondido{data.hidden.length !== 1 ? "s" : ""}</span>
            {data.groups.length > 0 && (
              <button disabled={busy} className={`${btn} border border-outline-variant text-primary`} onClick={selectNewest}>
                <ListChecks size={14} /> Selecionar as mais recentes
              </button>
            )}
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
                    <Row key={b.id} b={b} checked={sel.has(b.id)} onToggle={b.hidden ? undefined : () => toggle(b.id)}>
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

          {sel.size > 0 && (
            <div role="region" aria-label="Selecionados" className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-background/95 px-5 py-3 backdrop-blur">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
                <span className="text-sm font-bold text-primary">{sel.size} selecionado{sel.size !== 1 ? "s" : ""}</span>
                <div className="flex gap-2">
                  <button disabled={busy} className={`${btn} border border-outline-variant`} onClick={() => setSel(new Set())}><X size={14} /> Limpar</button>
                  <button disabled={busy} className={`${btn} bg-error text-on-error`} onClick={() => { if (confirm(`Esconder ${sel.size} livro${sel.size !== 1 ? "s" : ""} da biblioteca? O ficheiro no Drive não é apagado e podes repô-los depois.`)) act({ action: "hide", ids: [...sel] }, `${sel.size} escondido${sel.size !== 1 ? "s" : ""}.`); }}><EyeOff size={14} /> Esconder selecionados</button>
                </div>
              </div>
            </div>
          )}

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
