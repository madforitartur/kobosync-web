"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Send, Wifi } from "lucide-react";
import { useSelection } from "@/hooks/useSelection";
import { useStored } from "@/hooks/useStored";
import { BookCover } from "@/components/BookCover";
import type { Book } from "@/types/library";

function KoboTransfer() {
  const params = useSearchParams();
  const { list } = useSelection();
  const [koboSent, setKoboSent] = useStored<Record<string, number>>("kobosync:kobo-sent", {}, "koboSent");
  const [books, setBooks] = useState<Book[]>([]);
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase().slice(0, 4));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [host, setHost] = useState("");

  useEffect(() => setHost(window.location.host), []);
  useEffect(() => {
    if (list.length === 0) { setBooks([]); return; }
    let live = true;
    fetch("/api/books/selected", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: list.slice(0, 500) }) })
      .then((r) => r.json())
      .then((d) => { if (live) setBooks(d.books ?? []); })
      .catch(() => {});
    return () => { live = false; };
  }, [list]);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/receber/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, ids: list.slice(0, 100) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falhou");
      const now = Date.now();
      setKoboSent((cur) => ({ ...cur, ...Object.fromEntries((d.sentIds as string[]).map((id) => [id, now])) }));
      setMsg({ ok: true, text: `${d.added} ${d.added === 1 ? "livro enviado" : "livros enviados"} — já aparecem no ecrã do Kobo. Toca neles para descarregar.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Não foi possível enviar." });
    } finally {
      setBusy(false);
    }
  }

  const ready = code.length === 4 && books.length > 0 && !busy;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 pb-16 pt-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={18} /> Biblioteca</Link>
      <h1 className="font-display-lg text-3xl font-bold text-primary">Enviar para o Kobo</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Sem cabos nem apps: o Kobo recebe os livros pelo seu próprio browser.</p>

      <ol className="mt-6 space-y-3 rounded-2xl border border-outline-variant bg-surface-container-low p-5 text-[15px]">
        <li className="flex gap-3"><span className="font-bold text-primary">1.</span><span>No browser do Kobo abre <b className="break-all">{host || "…"}/receber</b></span></li>
        <li className="flex gap-3"><span className="font-bold text-primary">2.</span><span>O Kobo mostra um código de 4 caracteres. Escreve-o abaixo.</span></li>
        <li className="flex gap-3"><span className="font-bold text-primary">3.</span><span>Carrega em <b>Enviar</b>. Os livros aparecem no Kobo e é só tocar para os descarregar.</span></li>
      </ol>

      <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="kcode">Código do Kobo</label>
      <input
        id="kcode" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={4} placeholder="ABCD"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        onKeyDown={(e) => { if (e.key === "Enter" && ready) send(); }}
        className="mt-1 w-full rounded-xl border-2 border-outline-variant bg-surface px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.5em] text-primary outline-none focus:border-primary"
      />

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">Selecionados ({list.length})</h2>
        {list.length > 100 && <span className="text-xs text-error">Só os primeiros 100 por envio</span>}
      </div>
      {list.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">
          Ainda não selecionaste livros. Volta à biblioteca, seleciona e regressa aqui.
        </p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {books.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl border border-outline-variant p-2">
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded"><BookCover title={b.title} author={b.author} coverUrl={b.cover_url} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-primary">{b.title}</p>
                <p className="truncate text-xs text-on-surface-variant">{b.author}</p>
              </div>
              {koboSent[b.id] && <CheckCircle2 size={18} className="shrink-0 text-primary" aria-label="Já enviado" />}
            </li>
          ))}
        </ul>
      )}

      <button
        disabled={!ready} onClick={send}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-on-primary disabled:opacity-40"
      >
        {busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />} Enviar {Math.min(list.length, 100) || ""} para o Kobo
      </button>
      {msg && (
        <p role="status" className={`mt-4 flex items-start gap-2 text-sm font-semibold ${msg.ok ? "text-primary" : "text-error"}`}>
          {msg.ok && <Wifi size={18} className="mt-0.5 shrink-0" />}{msg.text}
        </p>
      )}
    </main>
  );
}

export default function KoboPage() {
  return <Suspense><KoboTransfer /></Suspense>;
}
