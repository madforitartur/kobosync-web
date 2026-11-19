"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, Loader2, Trash2, Upload } from "lucide-react";

type Item = {
  id: number; file: File; title: string; author: string; pages: number | null; hasText: boolean;
  status: "pronto" | "a converter" | "feito" | "erro"; pct: number; label: string; error?: string;
  url?: string; fileName?: string; info?: string; warnings?: string[];
};

const field = "w-full rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-50";
const LANGS = [["pt", "Português"], ["en", "Inglês"], ["es", "Espanhol"], ["fr", "Francês"], ["de", "Alemão"], ["it", "Italiano"]];
const niceName = (n: string) => n.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
const safeFile = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "livro";

export default function ConverterPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [lang, setLang] = useState("pt");
  const [cover, setCover] = useState(true);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" }).then((r) => r.json()).then((d) => setIsAdmin(!d?.protected || d?.user?.role === "admin")).catch(() => setIsAdmin(false));
    const u = urls.current;
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, []);

  const patch = useCallback((id: number, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = [...list].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!files.length) return;
    const fresh: Item[] = files.map((file) => ({ id: ++seq.current, file, title: niceName(file.name), author: "", pages: null, hasText: true, status: "pronto", pct: 0, label: "" }));
    setItems((cur) => [...cur, ...fresh]);
    const { readPdfMeta } = await import("@/lib/pdf-to-epub");
    for (const it of fresh) {
      try {
        const m = await readPdfMeta(await it.file.arrayBuffer());
        patch(it.id, { pages: m.pages, hasText: m.hasText, ...(m.title ? { title: m.title } : {}), ...(m.author ? { author: m.author } : {}) });
      } catch {
        patch(it.id, { status: "erro", error: "Não consegui abrir este PDF (está danificado ou protegido com palavra-passe)." });
      }
    }
  }, [patch]);

  async function convertAll() {
    setRunning(true);
    const { convertPdfToEpub } = await import("@/lib/pdf-to-epub");
    for (const it of items.filter((i) => i.status === "pronto" || i.status === "erro")) {
      patch(it.id, { status: "a converter", pct: 0, label: "A começar…", error: undefined });
      try {
        const res = await convertPdfToEpub(await it.file.arrayBuffer(), { title: it.title, author: it.author, language: lang, cover }, (d, t, label) => patch(it.id, { pct: Math.round((d / t) * 100), label }));
        const url = URL.createObjectURL(res.blob);
        urls.current.push(url);
        patch(it.id, { status: "feito", pct: 100, url, fileName: `${safeFile(it.author ? `${it.title} - ${it.author}` : it.title)}.epub`, info: `${res.chapters} capítulo${res.chapters !== 1 ? "s" : ""} · ${res.words.toLocaleString("pt-PT")} palavras · ${(res.blob.size / 1048576).toFixed(1)} MB`, warnings: res.warnings });
      } catch (e) {
        patch(it.id, { status: "erro", error: e instanceof Error ? e.message : "Erro na conversão." });
      }
    }
    setRunning(false);
  }

  const todo = items.filter((i) => i.status === "pronto" || i.status === "erro").length;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-20 pt-6">
      <Link href="/definicoes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Definições</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Converter PDF em EPUB</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        A conversão faz-se aqui, no teu browser: os PDFs não são enviados para nenhum servidor. Funciona com PDFs que tenham texto (não com digitalizações) e leva só o texto; imagens e tabelas não passam para o EPUB. A capa é a primeira página.
      </p>

      {isAdmin === false && <p role="alert" className="mt-5 text-sm font-semibold text-error">Só o administrador pode usar esta página.</p>}

      {isAdmin && (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
            className={`mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center ${over ? "border-primary bg-primary/5" : "border-outline-variant"}`}
          >
            <Upload size={28} className="text-primary" />
            <span className="font-bold text-primary">Escolhe ou arrasta PDFs para aqui</span>
            <span className="text-xs text-on-surface-variant">Podes juntar vários de uma vez</span>
            <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Escolher PDFs" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </label>

          {items.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold">Língua do livro
                <select className={`${field} !w-auto`} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Língua do livro">{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={cover} onChange={(e) => setCover(e.target.checked)} /> Capa com a 1.ª página</label>
            </div>
          )}

          <ul className="mt-5 space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-2xl border border-outline-variant p-4">
                <div className="flex items-start gap-3">
                  <FileText size={22} className="mt-0.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-on-surface-variant">{it.file.name} · {(it.file.size / 1048576).toFixed(1)} MB{it.pages ? ` · ${it.pages} páginas` : ""}</p>
                    {it.status !== "feito" && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input className={field} value={it.title} onChange={(e) => patch(it.id, { title: e.target.value })} disabled={it.status === "a converter"} placeholder="Título" aria-label={`Título de ${it.file.name}`} />
                        <input className={field} value={it.author} onChange={(e) => patch(it.id, { author: e.target.value })} disabled={it.status === "a converter"} placeholder="Autor (opcional)" aria-label={`Autor de ${it.file.name}`} />
                      </div>
                    )}
                    {!it.hasText && it.status === "pronto" && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-error"><AlertTriangle size={14} /> Parece um PDF digitalizado (sem texto); provavelmente não vai funcionar.</p>}
                    {it.status === "a converter" && (
                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-container"><div className="h-full bg-primary transition-all" style={{ width: `${it.pct}%` }} /></div>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant"><Loader2 size={12} className="animate-spin" /> {it.label}</p>
                      </div>
                    )}
                    {it.status === "erro" && it.error && <p role="alert" className="mt-2 text-xs font-semibold text-error">{it.error}</p>}
                    {it.status === "feito" && (
                      <div className="mt-1">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-primary"><CheckCircle2 size={16} /> {it.title}</p>
                        <p className="text-xs text-on-surface-variant">{it.info}</p>
                        {it.warnings?.map((w) => <p key={w} className="mt-1 text-xs text-on-surface-variant">ℹ️ {w}</p>)}
                        <a href={it.url} download={it.fileName} className={`${btn} mt-3 bg-primary text-on-primary`}><Download size={16} /> Descarregar EPUB</a>
                      </div>
                    )}
                  </div>
                  <button aria-label={`Remover ${it.file.name}`} disabled={it.status === "a converter"} onClick={() => { if (it.url) URL.revokeObjectURL(it.url); setItems((c) => c.filter((x) => x.id !== it.id)); }} className="rounded-lg p-2 text-error hover:bg-surface-container disabled:opacity-40"><Trash2 size={17} /></button>
                </div>
              </li>
            ))}
          </ul>

          {todo > 0 && (
            <button disabled={running} onClick={convertAll} className={`${btn} mt-5 w-full bg-primary text-on-primary`}>
              {running ? <Loader2 size={16} className="animate-spin" /> : null} Converter {todo} PDF{todo !== 1 ? "s" : ""} em EPUB
            </button>
          )}

          <p className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-xs text-on-surface-variant">
            <b>Para ter o livro na biblioteca:</b> depois de descarregares o EPUB, coloca-o numa das pastas do Google Drive que tens ligadas à app e, na biblioteca, carrega em sincronizar. A app só lê o Drive, por isso não consegue guardar lá o ficheiro sozinha.
          </p>
        </>
      )}
    </main>
  );
}
