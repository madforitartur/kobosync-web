"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Type,
  X,
} from "lucide-react";
import type { Book } from "@/types/library";
import { combineChapters } from "@/lib/pagination";

type Chapter = {
  id: string;
  title: string;
  html: string;
};

type ReadData = {
  title: string;
  chapters: Chapter[];
};

type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
type Theme = "light" | "sepia" | "dark" | "paper";

// Cache key prefix
const CACHE_PREFIX = "kobosync:reading:";

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  xs: "text-[13px] leading-[1.6]",
  sm: "text-[15px] leading-[1.65]",
  md: "text-[17px] leading-[1.7]",
  lg: "text-[19px] leading-[1.75]",
  xl: "text-[22px] leading-[1.8]",
};

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  xs: "XS",
  sm: "S",
  md: "M",
  lg: "L",
  xl: "XL",
};

const THEMES: Record<
  Theme,
  {
    label: string;
    background: string;
    pageColor: string;
    text: string;
    accent: string;
  }
> = {
  light: {
    label: "Claro",
    background: "#e8e6e1",
    pageColor: "#fdfcf8",
    text: "#1a1a1a",
    accent: "#585e6c",
  },
  sepia: {
    label: "Sépia",
    background: "#d4c4a8",
    pageColor: "#f5ecd9",
    text: "#3d2f1f",
    accent: "#8b6f47",
  },
  paper: {
    label: "Papel",
    background: "#c9c5be",
    pageColor: "#f7f3ea",
    text: "#1a1a1a",
    accent: "#5a5040",
  },
  dark: {
    label: "Noite",
    background: "#0d0d0f",
    pageColor: "#1a1a1d",
    text: "#e0e0e0",
    accent: "#9ca3af",
  },
};

export default function ReadPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = String(params.id ?? "");

  const [book, setBook] = useState<Book | null>(null);
  const [data, setData] = useState<ReadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>("md");
  const [theme, setTheme] = useState<Theme>("light");
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const hideControlsTimeout = useRef<number | null>(null);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const skipNextSave = useRef(false);

  // Carrega metadados + conteúdo
  useEffect(() => {
    if (!bookId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [bookRes, contentRes] = await Promise.all([
          fetch(`/api/books/${bookId}`, { signal: controller.signal }),
          fetch(`/api/books/${bookId}/content`, { signal: controller.signal }),
        ]);
        const bookData = await bookRes.json();
        const contentData = await contentRes.json();
        if (!bookRes.ok) throw new Error(bookData.error ?? "Erro");
        if (!contentRes.ok) throw new Error(contentData.error ?? "Erro");
        setBook(bookData.book);
        setData(contentData);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Erro ao carregar livro");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [bookId]);

  // HTML combinado
  const fullHtml = useMemo(() => {
    if (!data) return "";
    return combineChapters(data.chapters);
  }, [data]);

  /**
   * Carrega a posição guardada em cache (se existir) DEPOIS do conteúdo estar pronto.
   * Só aplica se a cache corresponder ao bookId atual.
   */
  useEffect(() => {
    if (!data || !scrollContainerRef.current) return;
    if (restoredFromCache) return; // já restaurou

    try {
      const raw = localStorage.getItem(CACHE_PREFIX + bookId);
      if (raw) {
        const cached = JSON.parse(raw) as { scrollTop: number; timestamp: number };
        // Só restaura se foi nas últimas 4 semanas
        const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - cached.timestamp < fourWeeks) {
          skipNextSave.current = true; // não guardar de volta imediatamente
          scrollContainerRef.current.scrollTo({ top: cached.scrollTop, behavior: "auto" });
          setRestoredFromCache(true);
        }
      }
    } catch {
      // localStorage indisponível, ignora
    }
  }, [data, bookId, restoredFromCache]);

  /**
   * Guarda a posição no localStorage sempre que o utilizador faz scroll.
   * Debounce de 500ms para não escrever excessivamente.
   */
  useEffect(() => {
    if (!data) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    let timeout: number | null = null;
    const onScroll = () => {
      if (skipNextSave.current) {
        skipNextSave.current = false;
        return;
      }
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        try {
          localStorage.setItem(
            CACHE_PREFIX + bookId,
            JSON.stringify({
              scrollTop: el.scrollTop,
              timestamp: Date.now(),
            }),
          );
        } catch {
          // localStorage cheio ou indisponível
        }
      }, 500);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [data, bookId]);

  /**
   * Ao fechar (X ou Esc), guarda a posição final antes de sair.
   */
  const handleClose = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      try {
        localStorage.setItem(
          CACHE_PREFIX + bookId,
          JSON.stringify({
            scrollTop: el.scrollTop,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // ignora
      }
    }
    router.back();
  }, [bookId, router]);

  // Atalhos
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showSettings) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextPage();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrevLine();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goNextLine();
      } else if (e.key === "Escape") {
        handleClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Auto-hide
  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current);
    setShowControls(true);
    hideControlsTimeout.current = window.setTimeout(() => {
      setShowControls(false);
      setShowSettings(false);
    }, 3500);
  }, []);

  useEffect(() => {
    scheduleHideControls();
    return () => {
      if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current);
    };
  }, [scheduleHideControls]);

  /**
   * Avança 1 PÁGINA COMPLETA (altura visível).
   */
  function goNextPage() {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
  }

  function goPrevPage() {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ top: -el.clientHeight, behavior: "smooth" });
  }

  /**
   * Avança 1 LINHA (baseado no line-height da fonte atual).
   * Para "xs" é ~20px, para "xl" é ~40px.
   */
  function goNextLine() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const lineHeights: Record<FontSize, number> = {
      xs: 21,
      sm: 25,
      md: 29,
      lg: 33,
      xl: 40,
    };
    el.scrollBy({ top: lineHeights[fontSize], behavior: "smooth" });
  }

  function goPrevLine() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const lineHeights: Record<FontSize, number> = {
      xs: 21,
      sm: 25,
      md: 29,
      lg: 33,
      xl: 40,
    };
    el.scrollBy({ top: -lineHeights[fontSize], behavior: "smooth" });
  }

  const currentTheme = THEMES[theme];

  // ============== RENDERS ==============

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: currentTheme.background }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" size={32} color={currentTheme.accent} />
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
            A abrir o livro...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data || !book) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: currentTheme.background }}
      >
        <div className="max-w-md text-center">
          <BookOpen className="mx-auto mb-4" size={44} strokeWidth={1.4} color={currentTheme.accent} />
          <h1 className="font-display-lg text-2xl font-bold" style={{ color: currentTheme.text }}>
            Nao foi possivel abrir o livro
          </h1>
          <p className="mt-3 text-sm" style={{ color: currentTheme.accent }}>
            {error ?? "Erro desconhecido"}
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded px-5 text-xs font-bold uppercase tracking-wider transition"
            style={{ backgroundColor: currentTheme.text, color: currentTheme.pageColor }}
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: currentTheme.background }}
      onMouseMove={scheduleHideControls}
      onClick={scheduleHideControls}
    >
      {/* HEADER */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed inset-x-0 top-0 z-30 px-4 py-3 md:px-8"
            style={{ backgroundColor: `${currentTheme.background}f2`, backdropFilter: "blur(12px)" }}
          >
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleClose(); }}
                  className="flex h-9 w-9 items-center justify-center rounded border transition"
                  style={{ borderColor: currentTheme.accent, color: currentTheme.text }}
                  aria-label="Fechar e guardar posicao"
                  title="Fechar (guarda a posicao)"
                >
                  <X size={18} />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold" style={{ color: currentTheme.text }}>
                    {book.title}
                  </p>
                  <p className="truncate text-xs" style={{ color: currentTheme.accent }}>
                    {book.author ?? "Autor desconhecido"}
                    {restoredFromCache && " · Posicao restaurada"}
                  </p>
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
                className="flex h-9 w-9 items-center justify-center rounded border transition"
                style={{
                  borderColor: currentTheme.accent,
                  color: showSettings ? currentTheme.pageColor : currentTheme.text,
                  backgroundColor: showSettings ? currentTheme.text : "transparent",
                }}
                aria-label="Definicoes"
              >
                <Type size={16} />
              </button>
            </div>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="mx-auto mt-3 max-w-5xl overflow-hidden"
                >
                  <div
                    className="rounded-lg p-4"
                    style={{ backgroundColor: currentTheme.pageColor, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                          Tamanho da letra
                        </p>
                        <div className="flex gap-1">
                          {(Object.keys(FONT_SIZE_CLASS) as FontSize[]).map((size) => (
                            <button
                              key={size}
                              onClick={() => setFontSize(size)}
                              className="flex h-9 min-w-[44px] items-center justify-center rounded border px-3 text-xs font-bold transition"
                              style={{
                                borderColor: currentTheme.accent,
                                backgroundColor: fontSize === size ? currentTheme.text : "transparent",
                                color: fontSize === size ? currentTheme.pageColor : currentTheme.text,
                              }}
                            >
                              {FONT_SIZE_LABELS[size]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                          Tema
                        </p>
                        <div className="flex gap-1">
                          {(Object.keys(THEMES) as Theme[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => setTheme(t)}
                              className="flex h-9 items-center gap-2 rounded border px-3 text-xs font-bold transition"
                              style={{
                                borderColor: currentTheme.accent,
                                backgroundColor: theme === t ? currentTheme.text : "transparent",
                                color: theme === t ? THEMES[t].pageColor : currentTheme.text,
                              }}
                            >
                              <span
                                className="h-4 w-4 rounded-full border"
                                style={{ backgroundColor: THEMES[t].pageColor, borderColor: currentTheme.accent }}
                              />
                              {THEMES[t].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-3 flex items-center justify-between border-t pt-3 text-[10px] font-bold uppercase tracking-widest"
                      style={{ borderColor: currentTheme.accent, color: currentTheme.accent }}
                    >
                      <span>←/→ Pagina &nbsp;·&nbsp; ↑/↓ Linha &nbsp;·&nbsp; Esc Fechar</span>
                      <button
                        onClick={() => {
                          try {
                            localStorage.removeItem(CACHE_PREFIX + bookId);
                            setRestoredFromCache(false);
                          } catch {}
                        }}
                        className="underline"
                      >
                        Limpar posicao guardada
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.header>
        )}
      </AnimatePresence>

      {/* SETA ESQUERDA — Página anterior */}
      <AnimatePresence>
        {showControls && (
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            onClick={(e) => { e.stopPropagation(); goPrevPage(); }}
            className="fixed left-3 top-1/2 z-20 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition hover:scale-110 md:left-6 md:h-14 md:w-14"
            style={{
              backgroundColor: `${currentTheme.pageColor}ee`,
              borderColor: currentTheme.accent,
              color: currentTheme.text,
            }}
            aria-label="Pagina anterior (←)"
            title="Pagina anterior"
          >
            <ChevronLeft size={22} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* SETA DIREITA — Próxima página */}
      <AnimatePresence>
        {showControls && (
          <motion.button
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            onClick={(e) => { e.stopPropagation(); goNextPage(); }}
            className="fixed right-3 top-1/2 z-20 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition hover:scale-110 md:right-6 md:h-14 md:w-14"
            style={{
              backgroundColor: `${currentTheme.pageColor}ee`,
              borderColor: currentTheme.accent,
              color: currentTheme.text,
            }}
            aria-label="Pagina seguinte (→)"
            title="Pagina seguinte"
          >
            <ChevronRight size={22} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* A "FOLHA" — 1 página com scroll vertical */}
      <div className="flex h-full w-full items-center justify-center px-3 pt-20 pb-6 md:px-8 md:pt-24 md:pb-10">
        <div
          className="relative h-full max-h-[860px] w-full overflow-hidden rounded-lg"
          style={{
            maxWidth: "min(960px, calc(100vw - 2rem))",
            boxShadow:
              "0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05), inset 0 0 60px rgba(0,0,0,0.04)",
          }}
        >
          <div
            ref={scrollContainerRef}
            className="prose-book h-full overflow-y-auto"
            style={{
              backgroundColor: currentTheme.pageColor,
              color: currentTheme.text,
              // MUDANÇA 1+2: Margens superior/inferior GRANDES, laterais também generosas
              padding: "5rem 3.5rem",
              scrollbarWidth: "thin",
              scrollbarColor: `${currentTheme.accent} transparent`,
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: fullHtml }}
              className={FONT_SIZE_CLASS[fontSize]}
            />

            {/* Fim */}
            <div
              className="mt-20 flex flex-col items-center gap-2 border-t pt-12"
              style={{ borderColor: currentTheme.accent }}
            >
              <BookOpen size={28} strokeWidth={1.4} color={currentTheme.accent} />
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: currentTheme.accent }}
              >
                Fim
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
