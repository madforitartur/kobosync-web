"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FolderDown, HardDrive, Loader2, Usb } from "lucide-react";
import { Modal } from "@/components/library/Modal";
import { downloadBlobs, saveBlobsToFolder, supportsFolderPicker, type NamedBlob } from "@/lib/blob-export";
import { getBackend, writeLocal } from "@/lib/local-library";
export type PdfEntry = { id: string; title: string; author: string | null };

type Row = { pdf: PdfEntry; status: "espera" | "a converter" | "feito" | "erro"; pct: number; label: string; error?: string; blob?: Blob; name?: string; info?: string };

type Props = { open: boolean; onClose: () => void; touch: boolean; pdfs: PdfEntry[] };

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "livro";
const LANGS = [["pt", "Português"], ["en", "Inglês"], ["es", "Espanhol"], ["fr", "Francês"], ["de", "Alemão"], ["it", "Italiano"]];

/** Converte os PDFs escolhidos em EPUB (no browser) e deixa enviá-los para o Kobo ou guardá-los no sistema. */
export function PdfConvertDialog({ open, onClose, touch, pdfs }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [lang, setLang] = useState("pt");
  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    if (!open) { stop.current = true; return; }
    stop.current = false;
    setRows(pdfs.map((pdf) => ({ pdf, status: "espera", pct: 0, label: "" })));
    setPhase("config"); setMsg(null); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (id: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.pdf.id === id ? { ...r, ...p } : r)));

  async function convert() {
    setPhase("running");
    setErr(null);
    const { convertPdfToEpub } = await import("@/lib/pdf-to-epub");
    for (const r of rows) {
      if (stop.current) return;
      patch(r.pdf.id, { status: "a converter", pct: 0, label: "A descarregar o PDF…" });
      try {
        const res = await fetch(`/api/pdfs/${r.pdf.id}/file`);
        if (!res.ok) throw new Error("Não foi possível descarregar o PDF.");
        const out = await convertPdfToEpub(await res.arrayBuffer(), { title: r.pdf.title, author: r.pdf.author ?? "", language: lang, cover: true }, (d, t, label) => patch(r.pdf.id, { pct: Math.round((d / t) * 100), label }));
        patch(r.pdf.id, {
          status: "feito", pct: 100, blob: out.blob,
          name: `${safe(r.pdf.author ? `${r.pdf.title} - ${r.pdf.author}` : r.pdf.title)}.epub`,
          info: `${out.chapters} capítulo${out.chapters !== 1 ? "s" : ""} · ${(out.blob.size / 1048576).toFixed(1)} MB`,
        });
      } catch (e) {
        patch(r.pdf.id, { status: "erro", error: e instanceof Error ? e.message : "Erro na conversão." });
      }
    }
    setPhase("done");
  }

  const ready: NamedBlob[] = rows.filter((r) => r.status === "feito" && r.blob).map((r) => ({ name: r.name as string, blob: r.blob as Blob }));
  const folderOk = supportsFolderPicker();

  async function act(fn: () => Promise<string>) {
    setBusy(true); setErr(null); setMsg(null);
    try { setMsg(await fn()); }
    catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setErr(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }

  const plural = (n: number) => `${n} livro${n !== 1 ? "s" : ""}`;

  return (
    <Modal open={open} onClose={phase === "running" ? () => {} : onClose} touch={touch} title={`Converter para EPUB (${pdfs.length})`}>
      <p className="mb-4 text-sm text-on-surface-variant">A conversão faz-se neste aparelho. Funciona com PDFs que tenham texto (não com digitalizações); as imagens e tabelas não passam para o EPUB.</p>

      {phase === "config" && (
        <>
          <label className="mb-4 flex items-center gap-2 text-sm font-semibold">Língua dos livros
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Língua dos livros" className="rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm">
              {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <button onClick={convert} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-bold text-on-primary">Converter {plural(pdfs.length)}</button>
        </>
      )}

      {phase !== "config" && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.pdf.id} className="rounded-xl border border-outline-variant p-3 text-sm">
              <p className="truncate font-bold text-primary">{r.pdf.title}</p>
              {r.status === "a converter" && (
                <div className="mt-2" aria-live="polite">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full bg-primary transition-all" style={{ width: `${r.pct}%` }} /></div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant"><Loader2 size={12} className="animate-spin" /> {r.label || "A converter…"} {r.pct}%</p>
                </div>
              )}
              {r.status === "espera" && <p className="mt-1 text-xs text-on-surface-variant">À espera…</p>}
              {r.status === "feito" && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary"><CheckCircle2 size={14} /> Convertido · {r.info}</p>}
              {r.status === "erro" && <p role="alert" className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-error"><AlertTriangle size={14} className="mt-px shrink-0" /> {r.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {phase === "done" && ready.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-bold text-primary">{plural(ready.length)} pronto{ready.length !== 1 ? "s" : ""}. O que queres fazer?</p>
          <button disabled={busy || !folderOk} onClick={() => act(async () => `${plural(await saveBlobsToFolder(ready))} copiado${ready.length !== 1 ? "s" : ""} para a pasta escolhida.`)}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-primary p-4 text-left hover:bg-surface-container-low disabled:opacity-50">
            <Usb size={22} className="mt-0.5 shrink-0 text-primary" />
            <span><span className="block font-bold text-primary">Enviar para o Kobo</span>
              <span className="text-sm text-on-surface-variant">{folderOk ? "Liga o Kobo ao PC por USB e escolhe a pasta do leitor." : "Só no Chrome ou Edge, no computador. No telemóvel, guarda os livros e passa-os ao Kobo pelo PC."}</span></span>
          </button>
          <button disabled={busy} onClick={() => act(async () => { await downloadBlobs(ready); return ready.length === 1 ? "Livro guardado." : "ZIP guardado."; })}
            className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-4 text-left hover:bg-surface-container-low disabled:opacity-50">
            <Download size={22} className="mt-0.5 shrink-0 text-primary" />
            <span><span className="block font-bold text-primary">Guardar no meu sistema</span>
              <span className="text-sm text-on-surface-variant">Descarrega {ready.length === 1 ? "o EPUB" : "os EPUBs num ZIP"} para este aparelho.</span></span>
          </button>
          <button disabled={busy} onClick={() => act(async () => {
              const st = await getBackend(true);
              if (st.status !== "ready") throw new Error("Escolhe primeiro a pasta em Biblioteca offline e permite o acesso.");
              for (const it of ready) await writeLocal(st.backend, it.name, it.blob);
              return `${plural(ready.length)} guardado${ready.length !== 1 ? "s" : ""} na biblioteca offline.`;
            })}
            className="flex w-full items-start gap-3 rounded-xl border border-outline-variant p-4 text-left hover:bg-surface-container-low disabled:opacity-50">
            <HardDrive size={22} className="mt-0.5 shrink-0 text-primary" />
            <span><span className="block font-bold text-primary">Guardar na biblioteca offline</span>
              <span className="text-sm text-on-surface-variant">Lê sem internet na pasta que definiste. <Link href="/offline" className="font-semibold underline">Abrir biblioteca offline</Link></span></span>
          </button>
          {busy && <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Loader2 size={16} className="animate-spin" /> A guardar…</p>}
          {msg && <p role="status" className="flex items-center gap-2 text-sm font-bold text-primary"><FolderDown size={16} /> {msg}</p>}
          {err && <p role="alert" className="text-sm font-semibold text-error">{err}</p>}
        </div>
      )}
      {phase === "done" && ready.length === 0 && <p className="mt-4 text-sm font-semibold text-error">Nenhum livro foi convertido.</p>}
    </Modal>
  );
}
