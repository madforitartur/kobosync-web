"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FileOutput, FileText, Loader2, RefreshCw, Search, X } from "lucide-react";
import { PdfConvertDialog } from "@/components/pdf/PdfConvertDialog";
import { useIsTouchDevice } from "@/hooks/useDeviceType";
import type { PdfEntry } from "@/lib/pdf-library";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mb = (n: number | null) => (n ? `${(n / 1048576).toFixed(1)} MB` : "");

export default function PdfLibraryPage() {
  const touch = useIsTouchDevice();
  const [pdfs, setPdfs] = useState<PdfEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [convertIds, setConvertIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/pdfs${refresh ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erro");
      setPdfs(d.pdfs);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar os PDFs."); setPdfs([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const folders = useMemo(() => [...new Map((pdfs ?? []).map((p) => [p.folder, p.folderName])).entries()], [pdfs]);
  const shown = useMemo(() => {
    const t = norm(q.trim());
    return (pdfs ?? []).filter((p) => (!folder || p.folder === folder) && (!t || norm(`${p.title} ${p.author ?? ""}`).includes(t)));
  }, [pdfs, q, folder]);

  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = (pdfs ?? []).filter((p) => sel.has(p.id));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 pb-32 pt-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Biblioteca</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display-lg text-3xl font-bold text-primary">Livros em PDF</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Seleciona um ou mais PDFs e converte-os em EPUB para ler no Kobo ou guardar no teu aparelho.</p>
        </div>
        <button onClick={() => load(true)} disabled={loading} aria-label="Atualizar a lista" title="Atualizar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar PDFs" aria-label="Pesquisar PDFs" className="w-full rounded-lg border border-outline-variant bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        {shown.length > 0 && (
          <button onClick={() => setSel(new Set(shown.map((p) => p.id)))} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-bold text-primary">Selecionar todos ({shown.length})</button>
        )}
      </div>
      {folders.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pastas">
          {[["", "Todas"], ...folders].map(([id, name]) => (
            <button key={id} onClick={() => setFolder(id)} aria-pressed={folder === id} className={`rounded-full border px-3 py-1 text-xs font-bold ${folder === id ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant"}`}>{name}</button>
          ))}
        </div>
      )}

      {pdfs === null && <p className="mt-8 flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="animate-spin" size={16} /> A carregar…</p>}
      {error && <p role="alert" className="mt-6 text-sm font-semibold text-error">{error}</p>}
      {pdfs && pdfs.length === 0 && !error && (
        <p className="mt-8 rounded-xl border border-outline-variant p-5 text-center text-sm text-on-surface-variant">
          Ainda não há pastas de PDFs. O administrador pode adicionar uma pasta do Google Drive em <Link href="/definicoes" className="font-bold text-primary underline">Definições</Link> escolhendo &ldquo;Livros PDF&rdquo;.
        </p>
      )}

      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((p) => {
          const on = sel.has(p.id);
          return (
            <li key={p.id} className={`relative flex flex-col overflow-hidden rounded-xl border-2 ${on ? "border-primary" : "border-outline-variant"}`}>
              <button onClick={() => toggle(p.id)} aria-pressed={on} aria-label={`${on ? "Desselecionar" : "Selecionar"} ${p.title}`} className="block text-left">
                {p.hasThumb
                  ? <img src={`/api/pdfs/${p.id}/thumb`} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover" />
                  : <div className="flex aspect-[2/3] w-full items-center justify-center bg-surface-container"><FileText size={32} className="text-on-surface-variant" /></div>}
                <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-on-primary" : "border-white bg-black/40 text-transparent"}`}><Check size={14} /></span>
                <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
              </button>
              <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                <p className="line-clamp-2 text-sm font-bold text-primary">{p.title}</p>
                <p className="truncate text-xs text-on-surface-variant">{p.author ?? "—"}{p.size ? ` · ${mb(p.size)}` : ""}</p>
                <button onClick={() => setConvertIds([p.id])} className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant px-2 py-1.5 text-xs font-bold text-primary">
                  <FileOutput size={13} /> Converter para EPUB
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-background/95 px-4 py-3 backdrop-blur-xl" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <p className="flex-1 text-sm font-bold text-primary">{sel.size} selecionado{sel.size !== 1 ? "s" : ""}</p>
            <button onClick={() => setSel(new Set())} aria-label="Limpar seleção" className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant"><X size={16} /></button>
            <button onClick={() => setConvertIds(chosen.map((p) => p.id))} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary"><FileOutput size={16} /> Converter para EPUB</button>
          </div>
        </div>
      )}

      <PdfConvertDialog open={convertIds !== null} onClose={() => setConvertIds(null)} touch={touch} pdfs={(pdfs ?? []).filter((p) => convertIds?.includes(p.id))} />
    </main>
  );
}
