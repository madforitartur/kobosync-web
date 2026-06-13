"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BookCover } from "@/components/BookCover";
import type { Book } from "@/types/library";

type Status = { type: "info" | "success" | "error"; message: string } | null;

const PAGE_SIZE = 15;
const SIDEBAR_VISIBLE_ITEMS = 12;
const SIDEBAR_MAX_HEIGHT = `${SIDEBAR_VISIBLE_ITEMS * 36 + 8}px`;

const formatBytes = (bytes: number | null) => {
  if (!bytes) return "Tamanho indisponivel";
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
};

// Placeholder para livros sem capa
function BookCoverPlaceholder({ title }: { title: string }) {
  const initials = title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex aspect-epub w-full items-center justify-center rounded bg-gradient-to-br from-primary to-primary-container text-on-primary">
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <BookOpen size={32} strokeWidth={1.4} />
        <p className="line-clamp-3 text-xs font-bold leading-tight">
          {initials || "?"}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingCovers, setSyncingCovers] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [authors, setAuthors] = useState<string[]>([]);

  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Book[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    book: Book;
    x: number;
    y: number;
  } | null>(null);

  const isFiltered = searchQuery.trim().length > 0;

  const visibleBooks = useMemo(() => {
    if (showSelectedOnly) return selectedBooks;
    return books;
  }, [showSelectedOnly, selectedBooks, books]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (showSelectedOnly && selectedIds.size === 0) {
      setShowSelectedOnly(false);
    }
  }, [selectedIds, showSelectedOnly]);

  useEffect(() => {
    if (!contextMenu) return;
    function onClick() {
      setContextMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (showSelectedOnly) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));
        if (searchQuery.trim()) params.set("q", searchQuery.trim());

        const response = await fetch(`/api/books?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error("error" in data ? String(data.error) : "Erro");

        setBooks(data.books ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setStatus({
          type: "error",
          message:
            error instanceof Error ? error.message : "Erro ao carregar biblioteca.",
        });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [page, searchQuery, showSelectedOnly]);

  useEffect(() => {
    if (!showSelectedOnly) return;
    if (selectedIds.size === 0) return;
    const controller = new AbortController();
    setSelectedLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/books/selected", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [...selectedIds] }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error("error" in data ? String(data.error) : "Erro");
        setSelectedBooks(data.books ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setStatus({ type: "error", message: "Erro ao carregar selecionados." });
      } finally {
        setSelectedLoading(false);
      }
    })();
    return () => controller.abort();
  }, [showSelectedOnly, selectedIds]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const authorsRes = await fetch("/api/authors", {
          signal: controller.signal,
        });
        const authorsData = await authorsRes.json();
        if (authorsRes.ok) setAuthors(authorsData.authors ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    })();
    return () => controller.abort();
  }, []);

  function handleBookAction(book: Book, event: React.MouseEvent) {
    event.stopPropagation();
    setContextMenu({ book, x: event.clientX, y: event.clientY });
  }

  function toggleSelect(book: Book) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(book.id)) next.delete(book.id);
      else next.add(book.id);
      return next;
    });
    setContextMenu(null);
  }

  function readBook(book: Book) {
    setContextMenu(null);
    if (!book.epub_url && !book.drive_file_id) {
      setStatus({
        type: "error",
        message: "Este livro nao tem ficheiro EPUB disponivel.",
      });
      return;
    }
    window.open(`/read/${book.id}`, "_blank", "noopener,noreferrer");
  }

  function toggleBook(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function syncLibrary() {
    setSyncing(true);
    setStatus({ type: "info", message: "Sincronizando Google Drive com Supabase..." });
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sincronizacao falhou.");
      setStatus({
        type: result.errors?.length ? "info" : "success",
        message: `${result.processed} livros atualizados, ${result.skipped} sem alteracoes.`,
      });
      setPage(1);
      setShowSelectedOnly(false);
      const authorsRes = await fetch("/api/authors");
      const authorsData = await authorsRes.json();
      if (authorsRes.ok) setAuthors(authorsData.authors ?? []);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Erro.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function syncCovers() {
    setSyncingCovers(true);
    setStatus({ type: "info", message: "A extrair capas dos EPUBs (50 primeiros)..." });
    try {
      const res = await fetch("/api/covers/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "missing", limit: 50 }),
      });
      const data = await res.json();
      if (data?.results) {
        setStatus({
          type: "success",
          message: `Lote: ${data.results.success} OK, ${data.results.failed} falhas, ${data.results.skipped} ignorados. Continua a clicar.`,
        });
        setPage(1);
      } else {
        setStatus({ type: "error", message: data.error ?? "Erro" });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Erro",
      });
    } finally {
      setSyncingCovers(false);
    }
  }

  async function syncToKobo() {
    const booksToSend = showSelectedOnly
      ? selectedBooks
      : books.filter((b) => selectedIds.has(b.id));
    if (booksToSend.length === 0) {
      setStatus({ type: "error", message: "Nenhum livro selecionado para enviar." });
      return;
    }
    try {
      const picker = window as Window &
        typeof globalThis & {
          showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
        };
      if (!picker.showDirectoryPicker) {
        setStatus({ type: "error", message: "Este browser nao suporta sincronizacao USB." });
        return;
      }
      const dirHandle = await picker.showDirectoryPicker();
      setStatus({ type: "info", message: `A copiar ${booksToSend.length} livros para o Kobo...` });
      for (const book of booksToSend) {
        if (!book.epub_url) continue;
        const response = await fetch(book.epub_url);
        const blob = await response.blob();
        const safeTitle = book.title.replace(/[\\/:*?"<>|]+/g, "-");
        const fileHandle = await dirHandle.getFileHandle(`${safeTitle}.epub`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
      setStatus({ type: "success", message: "Livros copiados para o Kobo." });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus({ type: "error", message: "Nao foi possivel copiar para o Kobo." });
    }
  }

  function goToPage(n: number) {
    setPage(Math.max(1, Math.min(totalPages, n)));
    window.scrollTo({ top: 200, behavior: "smooth" });
  }

  function getPageNumbers(): (number | "ellipsis")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [];
    if (page <= 3) pages.push(1, 2, 3, "ellipsis", totalPages);
    else if (page >= totalPages - 2)
      pages.push(1, "ellipsis", totalPages - 2, totalPages - 1, totalPages);
    else pages.push(1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages);
    return pages;
  }

  const isLoading = loading || selectedLoading;

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background text-on-background selection:bg-primary-fixed selection:text-primary">
        <header className="sticky top-0 z-50 border-b border-outline-variant bg-background/90 backdrop-blur-xl">
          <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-6 px-5 md:px-10">
            <div className="flex min-w-0 items-center gap-6">
              <button
                className="flex items-center gap-3 text-left"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
                  <BookOpen size={21} />
                </span>
                <span className="hidden font-display-lg text-[28px] font-bold text-primary sm:block">
                  KoboSync
                </span>
              </button>

              {isFiltered && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="flex h-10 items-center gap-2 rounded border border-outline-variant bg-surface-container-low px-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition hover:bg-surface-container"
                >
                  <ArrowLeft size={16} />
                  <span className="hidden sm:inline">Biblioteca</span>
                </button>
              )}

              <div className="hidden min-w-[260px] items-center gap-2 rounded border border-outline-variant bg-surface-container-low px-3 py-2 md:flex">
                <Search size={18} className="text-outline" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-outline"
                  placeholder="Pesquisar titulo, autor, serie, editora ou ISBN"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex h-10 w-10 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container"
                onClick={() => setDarkMode((value) => !value)}
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
                            <button
                className="flex h-10 items-center gap-2 rounded border border-outline-variant px-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition hover:bg-surface-container disabled:opacity-40"
                disabled={syncingCovers}
                onClick={async () => {
                  setSyncingCovers(true);
                  setStatus({ type: "info", message: "A iniciar sync de TODAS as capas em background..." });
                  try {
                    const res = await fetch("/api/covers/sync-all", { method: "POST" });
                    const data = await res.json();
                    if (data?.state) {
                      setStatus({
                        type: "info",
                        message: `Sync iniciado: ${data.state.totalBooks} livros para processar.`,
                      });

                      // Polling do progresso
                      const interval = setInterval(async () => {
                        const progRes = await fetch("/api/covers/progress");
                        const prog = await progRes.json();
                        if (!prog.running) {
                          clearInterval(interval);
                          setStatus({
                            type: prog.progress.failed > 0 ? "info" : "success",
                            message: `Concluido: ${prog.progress.success} capas extraidas, ${prog.progress.failed} falhas (${prog.progress.elapsedSec}s).`,
                          });
                          setPage(1);
                        } else {
                          setStatus({
                            type: "info",
                            message: `A processar... ${prog.progress.percent}% (${prog.progress.processed}/${prog.progress.total}) - ETA: ${prog.progress.etaSec ?? "?"}s`,
                          });
                        }
                      }, 2000);
                    } else {
                      setStatus({ type: "error", message: data.error ?? "Erro" });
                    }
                  } catch (err) {
                    setStatus({
                      type: "error",
                      message: err instanceof Error ? err.message : "Erro",
                    });
                  } finally {
                    setSyncingCovers(false);
                  }
                }}
                title="Iniciar extracao de TODAS as capas em background (nao bloqueia)"
              >
                <BookOpen size={16} className={syncingCovers ? "animate-pulse" : ""} />
                <span className="hidden sm:inline">Capas</span>
              </button>
              <button
                className="flex h-10 items-center gap-2 rounded bg-primary px-4 text-xs font-bold uppercase tracking-wider text-on-primary transition hover:bg-primary-container disabled:opacity-40"
                disabled={syncing}
                onClick={syncLibrary}
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
              <button
                className="flex h-10 items-center gap-2 rounded border border-primary px-4 text-xs font-bold uppercase tracking-wider text-primary transition hover:bg-primary-fixed disabled:opacity-40"
                disabled={selectedIds.size === 0}
                onClick={syncToKobo}
              >
                <Download size={16} />
                <span className="hidden sm:inline">Kobo ({selectedIds.size})</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-12">
          <section className="mb-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded bg-surface-container-lowest p-6 shadow-sm md:p-8">
              <div className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary">
                <Sparkles size={16} />
                Biblioteca digital
              </div>
              <h1 className="mb-4 max-w-3xl font-display-lg text-[38px] font-bold leading-tight text-primary md:text-[52px]">
                A tua biblioteca Kobo, organizada a partir do Google Drive.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-on-surface-variant md:text-lg">
                Metadados, capas e ficheiros EPUB sao sincronizados no servidor e servidos pelo Supabase
                para uma experiencia rapida, pesquisavel e pronta para leitura online.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded bg-primary p-5 text-on-primary">
                <p className="text-3xl font-bold">{total}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider opacity-70">Livros</p>
              </div>
              <div className="rounded bg-secondary p-5 text-on-secondary">
                <p className="text-3xl font-bold">{authors.length}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider opacity-75">Autores</p>
              </div>
              <button
                onClick={() => setShowSelectedOnly((v) => !v)}
                disabled={selectedIds.size === 0}
                aria-pressed={showSelectedOnly}
                className={`group relative rounded p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  showSelectedOnly
                    ? "bg-primary text-on-primary ring-2 ring-primary-container"
                    : "bg-surface-container hover:bg-surface-container-high"
                }`}
              >
                <p className={`text-3xl font-bold ${showSelectedOnly ? "" : "text-primary"}`}>
                  {selectedIds.size}
                </p>
                <p
                  className={`mt-2 text-xs font-bold uppercase tracking-wider ${
                    showSelectedOnly ? "opacity-80" : "text-outline"
                  }`}
                >
                  {showSelectedOnly ? "A filtrar · clica para sair" : "Selecionados"}
                </p>
                {selectedIds.size > 0 && !showSelectedOnly && (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-secondary">
                    Ver livros selecionados
                  </p>
                )}
              </button>
            </div>
          </section>

          <div className="mb-8 flex flex-col gap-4 md:hidden">
            <div className="flex items-center gap-2 rounded border border-outline-variant bg-surface-container-low px-3 py-2">
              <Search size={18} className="text-outline" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-outline"
                placeholder="Pesquisar biblioteca"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
            <aside>
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-outline">Autores</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    {authors.length}
                  </span>
                </div>
                <div
                  className="custom-scrollbar space-y-1 overflow-y-auto pr-1"
                  style={{ maxHeight: SIDEBAR_MAX_HEIGHT }}
                >
                  {authors.length ? (
                    authors.map((author) => (
                      <button
                        key={author}
                        className="block w-full truncate rounded px-3 py-2 text-left text-sm text-on-surface-variant transition hover:bg-surface-container"
                        onClick={() => setSearchQuery(author)}
                      >
                        {author}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-outline">Sem autores indexados.</p>
                  )}
                </div>
              </section>
            </aside>

            <section>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant pb-4">
                <div>
                  <h2 className="font-display-lg text-[30px] font-bold text-primary">
                    {showSelectedOnly ? "Selecionados" : "Biblioteca"}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {isLoading
                      ? "A carregar livros..."
                      : showSelectedOnly
                        ? `A mostrar ${visibleBooks.length} de ${selectedIds.size} selecionados`
                        : isFiltered
                          ? `${total} resultados para "${searchQuery}"`
                          : `${total} livros encontrados`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-outline">
                  <ArrowDownAZ size={16} />
                  Ordenado por titulo
                </div>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-5">
                  {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                    <div key={index} className="animate-pulse">
                      <div className="aspect-epub rounded bg-surface-container" />
                      <div className="mt-4 h-4 w-4/5 rounded bg-surface-container" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-surface-container" />
                    </div>
                  ))}
                </div>
              ) : visibleBooks.length ? (
                <>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-5">
                    {visibleBooks.map((book) => (
                      <div key={book.id} className="group relative">
                        <motion.article
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="cursor-pointer"
                          onClick={() => toggleBook(book.id)}
                        >
                          {book.cover_url ? (
                            <BookCover
                              coverUrl={book.cover_url}
                              title={book.title}
                              isSelected={selectedIds.has(book.id)}
                            />
                          ) : (
                            <div className="relative">
                              <BookCoverPlaceholder title={book.title} />
                              {selectedIds.has(book.id) && (
                                <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg">
                                  <Check size={14} />
                                </div>
                              )}
                            </div>
                          )}
                          <h3 className="line-clamp-2 font-display-lg text-[20px] font-bold leading-snug text-primary">
                            {book.title}
                          </h3>
                          <p className="mt-1 truncate text-sm text-on-surface-variant">
                            {book.author ?? "Autor desconhecido"}
                          </p>
                          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-outline">
                            {formatBytes(book.filesize)}
                          </p>
                        </motion.article>

                        <button
                          onClick={(e) => handleBookAction(book, e)}
                          aria-label="Acoes do livro"
                          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-background/90 text-on-surface-variant opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-primary hover:text-on-primary"
                        >
                          <BookOpen size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!showSelectedOnly && totalPages > 1 && (
                    <nav
                      aria-label="Paginacao"
                      className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant pt-6"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-outline">
                        Pagina {page} de {totalPages}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => goToPage(page - 1)}
                          disabled={page === 1}
                          className="flex h-9 w-9 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container disabled:opacity-30"
                          aria-label="Pagina anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        {getPageNumbers().map((p, i) =>
                          p === "ellipsis" ? (
                            <span key={`e-${i}`} className="flex h-9 w-9 items-center justify-center text-on-surface-variant">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => goToPage(p)}
                              aria-current={p === page ? "page" : undefined}
                              className={`flex h-9 w-9 items-center justify-center rounded text-xs font-bold transition ${
                                p === page
                                  ? "bg-primary text-on-primary"
                                  : "border border-outline-variant text-on-surface-variant hover:bg-surface-container"
                              }`}
                            >
                              {p}
                            </button>
                          ),
                        )}
                        <button
                          onClick={() => goToPage(page + 1)}
                          disabled={page === totalPages}
                          className="flex h-9 w-9 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container disabled:opacity-30"
                          aria-label="Pagina seguinte"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </nav>
                  )}
                </>
              ) : showSelectedOnly ? (
                <div className="rounded border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-20 text-center">
                  <Check className="mx-auto mb-4 text-outline" size={44} strokeWidth={1.4} />
                  <h3 className="font-display-lg text-2xl font-bold text-primary">
                    Sem livros selecionados.
                  </h3>
                  <p className="mx-auto mt-3 max-w-md text-on-surface-variant">
                    Marca livros em qualquer pagina e clica no cartao "Selecionados" para os ver juntos.
                  </p>
                </div>
              ) : (
                <div className="rounded border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-20 text-center">
                  <BookOpen className="mx-auto mb-4 text-outline" size={44} strokeWidth={1.4} />
                  <h3 className="font-display-lg text-2xl font-bold text-primary">Nenhum livro encontrado.</h3>
                  <p className="mx-auto mt-3 max-w-md text-on-surface-variant">
                    Sincroniza o Google Drive para preencher a biblioteca com capas e metadados EPUB.
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>

        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[200] min-w-[200px] overflow-hidden rounded border border-outline-variant bg-background shadow-2xl"
              style={{
                top: Math.min(contextMenu.y, window.innerHeight - 120),
                left: Math.min(contextMenu.x, window.innerWidth - 220),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-outline-variant bg-surface-container-low px-4 py-2">
                <p className="truncate text-xs font-bold uppercase tracking-wider text-outline">
                  {contextMenu.book.title}
                </p>
              </div>
              <button
                onClick={() => toggleSelect(contextMenu.book)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-on-surface transition hover:bg-surface-container"
              >
                {selectedIds.has(contextMenu.book.id) ? (
                  <>
                    <Check size={16} />
                    Desselecionar
                  </>
                ) : (
                  <>
                    <BookOpen size={16} />
                    Selecionar
                  </>
                )}
              </button>
              <button
                onClick={() => readBook(contextMenu.book)}
                disabled={!contextMenu.book.epub_url && !contextMenu.book.drive_file_id}
                className="flex w-full items-center gap-3 border-t border-outline-variant px-4 py-3 text-left text-sm font-semibold text-primary transition hover:bg-surface-container disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <BookOpen size={16} />
                Ler livro
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="fixed bottom-6 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2"
            >
              <div
                className={`flex items-center gap-3 rounded px-5 py-4 text-sm font-semibold shadow-2xl ${
                  status.type === "error"
                    ? "bg-error text-on-error"
                    : status.type === "success"
                      ? "bg-primary text-on-primary"
                      : "bg-secondary text-on-secondary"
                }`}
              >
                {status.type === "error" ? <AlertCircle size={20} /> : <Check size={20} />}
                {status.message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}