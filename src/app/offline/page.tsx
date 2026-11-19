"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Download, FileOutput, FolderOpen, HardDrive, Loader2, Search, Trash2, Upload } from "lucide-react";
import { useLocalBackend } from "@/lib/use-local-backend";
import { LOCAL_EVENT, folderSupported, getMeta, listEntries, readLocal, readerHref, removeLocal, setMeta, writeLocal, type Backend, type LocalEntry } from "@/lib/local-library";
import { prepareOfflineShell } from "@/lib/offline";

type Row = LocalEntry & { title: string; author: string | null; cover: string | null };
type Meta = { title: string; author: string | null; cover: Blob | null };

const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-50";
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

export default function OfflinePage() {
  const lb = useLocalBackend();
  const backend: Backend | null = lb.state?.status === "ready" ? lb.state.backend : null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const gen = useRef(0);

  const load = useCallback(async (b: Backend) => {
    const my = ++gen.current;
    try {
      const entries = await listEntries(b);
      if (my !== gen.current) return;
      const { readEpubMeta } = await import("@/lib/epub-client");
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
      const out: Row[] = [];
      setScan({ done: 0, total: entries.length });
      for (const [i, e] of entries.entries()) {
        const key = `${b.key}|${e.path}|${e.size}|${e.modified}`;
        let m = await getMeta<Meta>(key);
        if (!m) {
          try { m = await readEpubMeta(await readLocal(b, e.path)); await setMeta(key, m); } catch { m = { title: e.name.replace(/\.epub$/i, ""), author: null, cover: null }; }
        }
        const cover = m.cover ? URL.createObjectURL(m.cover) : null;
        if (cover) urls.current.push(cover);
        out.push({ ...e, title: m.title, author: m.author, cover });
        if (my !== gen.current) return;
        if (i % 4 === 3 || i === entries.length - 1) { setRows([...out]); setScan({ done: i + 1, total: entries.length }); }
      }
      setRows(out);
      setScan(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao ler a pasta.");
      setScan(null);
    }
  }, []);

  useEffect(() => { if (backend) load(backend); else setRows(null); }, [backend?.key, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fn = () => { if (backend) load(backend); };
    window.addEventListener(LOCAL_EVENT, fn);
    return () => window.removeEventListener(LOCAL_EVENT, fn);
  }, [backend, load]);
  useEffect(() => { prepareOfflineShell(); const u = urls; return () => u.current.forEach((x) => URL.revokeObjectURL(x)); }, []);

  async function importFiles(list: FileList) {
    if (!backend) return;
    setErr(null); setMsg(null);
    let n = 0;
    for (const f of [...list].filter((f) => /\.epub$/i.test(f.name))) { await writeLocal(backend, f.name, f); n++; }
    setMsg(n ? `${n} livro${n !== 1 ? "s" : ""} guardado${n !== 1 ? "s" : ""}.` : "Escolhe ficheiros .epub.");
  }

  async function exportBook(r: Row) {
    if (!backend) return;
    const f = await readLocal(backend, r.path);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = r.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.title} ${r.author ?? ""}`.toLowerCase().includes(t));
  }, [rows, q]);

  const st = lb.state;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-20 pt-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Biblioteca</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Biblioteca offline</h1>
      <p className="mt-2 text-sm text-on-surface-variant">Lê EPUBs guardados neste aparelho, sem internet. Os livros e a tua posição ficam só aqui; nada é enviado para o servidor.</p>

      <section className="mt-5 rounded-2xl border border-outline-variant p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Onde ficam os livros</h2>
        {!st && <Loader2 className="mt-3 animate-spin text-primary" />}
        {st?.status === "unsupported" && <p className="mt-2 text-sm text-error">Este browser não permite guardar livros no aparelho.</p>}
        {st?.status === "needs-permission" && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm"><b>{st.label}</b> — o browser pede que confirmes o acesso a esta pasta.</p>
            <button className={`${btn} bg-primary text-on-primary`} onClick={() => lb.grant()}>Permitir acesso</button>
            <button className={`${btn} border border-outline-variant`} onClick={() => lb.useAppStorage()}>Deixar de usar esta pasta</button>
          </div>
        )}
        {backend && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">{backend.kind === "folder" ? <FolderOpen size={18} className="shrink-0 text-primary" /> : <HardDrive size={18} className="shrink-0 text-primary" />}<span className="truncate">{backend.kind === "folder" ? `Pasta: ${backend.label}` : backend.label}</span></p>
            {folderSupported() && <button className={`${btn} border border-outline-variant text-primary`} onClick={() => lb.pickFolder()}><FolderOpen size={16} /> {backend.kind === "folder" ? "Mudar de pasta" : "Escolher pasta"}</button>}
            {backend.kind === "folder" && <button className={`${btn} border border-outline-variant`} onClick={() => lb.useAppStorage()}>Usar o armazenamento da app</button>}
          </div>
        )}
        {st && st.status !== "unsupported" && !folderSupported() && (
          <p className="mt-3 text-xs text-on-surface-variant">Neste aparelho o browser não deixa escolher uma pasta, por isso os livros ficam no armazenamento privado da app (continuam a funcionar sem internet). Podes <b>importar</b> EPUBs do telemóvel e <b>exportá-los</b> quando quiseres.</p>
        )}
        {folderSupported() && backend?.kind === "private" && <p className="mt-3 text-xs text-on-surface-variant">Dica: escolhe uma pasta do computador (por exemplo, a que sincronizas com o telemóvel ou com o Kobo) e os EPUBs que lá estiverem aparecem aqui.</p>}
      </section>

      {backend && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className={`${btn} cursor-pointer bg-primary text-on-primary`}>
              <Upload size={16} /> Importar EPUBs
              <input type="file" multiple accept=".epub,application/epub+zip" className="sr-only" aria-label="Importar EPUBs" onChange={(e) => { if (e.target.files) importFiles(e.target.files).catch((x) => setErr(x instanceof Error ? x.message : "Erro")); e.target.value = ""; }} />
            </label>
            <Link href="/converter" className={`${btn} border border-outline-variant text-primary`}><FileOutput size={16} /> Converter PDF em EPUB</Link>
            <div className="relative ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input className="w-full rounded-lg border border-outline-variant bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Pesquisar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar nos livros offline" />
            </div>
          </div>
          {msg && <p role="status" className="mt-3 text-sm font-semibold text-primary">{msg}</p>}
          {err && <p role="alert" className="mt-3 text-sm font-semibold text-error">{err}</p>}
          {scan && <p className="mt-3 flex items-center gap-2 text-xs text-on-surface-variant"><Loader2 size={13} className="animate-spin" /> A ler os livros… {scan.done}/{scan.total}</p>}

          {rows && rows.length === 0 && !scan && <p className="mt-8 rounded-xl border border-outline-variant p-5 text-center text-sm text-on-surface-variant">Ainda não há livros {backend.kind === "folder" ? "nesta pasta" : "guardados"}. Importa EPUBs ou converte um PDF.</p>}

          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {shown.map((r) => (
              <li key={r.path} className="flex flex-col overflow-hidden rounded-xl border border-outline-variant">
                <Link href={readerHref(r.path)} className="block" aria-label={`Ler ${r.title}`}>
                  {r.cover
                    ? <img src={r.cover} alt="" className="aspect-[2/3] w-full object-cover" />
                    : <div className="flex aspect-[2/3] w-full items-center justify-center bg-surface-container"><BookOpen size={32} className="text-on-surface-variant" /></div>}
                </Link>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-bold text-primary">{r.title}</p>
                  <p className="truncate text-xs text-on-surface-variant">{r.author ?? "Autor desconhecido"} · {mb(r.size)}</p>
                  <div className="mt-auto flex justify-end gap-1 pt-1">
                    <button aria-label={`Exportar ${r.title}`} className="rounded-lg p-1.5 hover:bg-surface-container" onClick={() => exportBook(r)}><Download size={16} /></button>
                    <button aria-label={`Apagar ${r.title}`} className="rounded-lg p-1.5 text-error hover:bg-surface-container" onClick={() => { if (confirm(`Apagar "${r.title}" ${backend.kind === "folder" ? "da pasta" : "deste aparelho"}?`)) removeLocal(backend, r.path).catch((x) => setErr(x instanceof Error ? x.message : "Não consegui apagar.")); }}><Trash2 size={16} /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
