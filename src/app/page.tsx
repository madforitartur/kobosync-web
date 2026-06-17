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

// Abre fullscreen se disponível
function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if ((el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
    (el as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  }
}

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
  // Controlos visíveis por defeito no desktop, ocultos no mobile
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const hideControlsTimeout = useRef<number | null>(null);

  // Double-tap state
  const lastTapRef = useRef<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const skipNextSave = useRef(false);

  // Fullscreen ao montar
  useEffect(() => {
    requestFullscreen();
  }, []);

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

  const fullHtml = useMemo(() => {
    if (!data) return "";
    return combineChapters(data.chapters);
  }, [data]);

  // Restaurar posição do cache
  useEffect(() => {
    if (!data || !scrollContainerRef.current) return;
    if (restoredFromCache) return;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + bookId);
      if (raw) {
        const cached = JSON.parse(raw) as { scrollTop: number; timestamp: number };
        const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - cached.timestamp < fourWeeks) {
          skipNextSave.current = true;
          scrollContainerRef.current.scrollTo({ top: cached.scrollTop, behavior: "auto" });
          setRestoredFromCache(true);
        }
      }
    } catch {}
  }, [data, bookId, restoredFromCache]);

  // Guardar posição no scroll
  useEffect(() => {
    if (!data) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    let timeout: number | null = null;
    const onScroll = () => {
      if (skipNextSave.current) { skipNextSave.current = false; return; }
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        try {
          localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() }));
        } catch {}
      }, 500);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [data, bookId]);

  const handleClose = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      try {
        localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() }));
      } catch {}
    }
    // Sair do fullscreen ao fechar
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    router.back();
  }, [bookId, router]);

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showSettings) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrevPage(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNextPage(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); goPrevLine(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); goNextLine(); }
      else if (e.key === "Escape") { handleClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Auto-hide dos controlos (desktop: 3.5s; mobile: imediato após toque simples)
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
    return () => { if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current); };
  }, [scheduleHideControls]);

  /**
   * Duplo toque → toggle controlos (mobile)
   * Toque simples → mostrar controlos brevemente
   */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300 && delta > 0) {
      // Double tap: toggle permanente
      e.preventDefault();
      if (hideControlsTimeout.current) window.clearTimeout(hideControlsTimeout.current);
      setShowControls((v) => {
        if (v) setShowSettings(false);
        return !v;
      });
    } else {
      // Single tap: mostrar temporariamente
      scheduleHideControls();
    }
  }, [scheduleHideControls]);

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

  function goNextLine() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const lineHeights: Record<FontSize, number> = { xs: 21, sm: 25, md: 29, lg: 33, xl: 40 };
    el.scrollBy({ top: lineHeights[fontSize], behavior: "smooth" });
  }

  function goPrevLine() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const lineHeights: Record<FontSize, number> = { xs: 21, sm: 25, md: 29, lg: 33, xl: 40 };
    el.scrollBy({ top: -lineHeights[fontSize], behavior: "smooth" });
  }

  const currentTheme = THEMES[theme];

  // ============== RENDERS ==============

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: currentTheme.background }}>
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
      <div className="flex min-h-screen items-center justify-center p-6" style={{ backgroundColor: currentTheme.background }}>
        <div className="max-w-md text-center">
          <BookOpen className="mx-auto mb-4" size={44} strokeWidth={1.4} color={currentTheme.accent} />
          <h1 className="font-display-lg text-2xl font-bold" style={{ color: currentTheme.text }}>
            Não foi possível abrir o livro
          </h1>
          <p className="mt-3 text-sm" style={{ color: currentTheme.accent }}>{error ?? "Erro desconhecido"}</p>
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
      onTouchStart={handleTouchStart}
    >
      {/* ── HEADER — apenas botão fechar + botão definições ── */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 top-0 z-30"
            style={{
              // Padding extra no topo para notch/safe-area iOS
              paddingTop: "env(safe-area-inset-top, 0px)",
              backgroundColor: `${currentTheme.background}e8`,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3">
              {/* Botão fechar */}
              <button
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-95"
                style={{ borderColor: currentTheme.accent, color: currentTheme.text, backgroundColor: `${currentTheme.pageColor}cc` }}
                aria-label="Fechar"
              >
                <X size={17} />
              </button>

              {/* Indicador de posição restaurada (discreto) */}
              {restoredFromCache && (
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ color: currentTheme.accent }}>
                  Posição restaurada
                </span>
              )}

              {/* Botão definições */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); scheduleHideControls(); }}
                className="flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-95"
                style={{
                  borderColor: currentTheme.accent,
                  backgroundColor: showSettings ? currentTheme.text : `${currentTheme.pageColor}cc`,
                  color: showSettings ? currentTheme.pageColor : currentTheme.text,
                }}
                aria-label="Definições de leitura"
              >
                <Type size={15} />
              </button>
            </div>

            {/* Painel de definições */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className="mx-3 mb-2 rounded-xl p-3 md:mx-6 md:p-4"
                    style={{ backgroundColor: currentTheme.pageColor, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Tamanho da letra */}
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                          Letra
                        </p>
                        <div className="flex gap-1">
                          {(Object.keys(FONT_SIZE_CLASS) as FontSize[]).map((size) => (
                            <button
                              key={size}
                              onClick={() => setFontSize(size)}
                              className="flex h-9 min-w-[38px] flex-1 items-center justify-center rounded-lg border text-xs font-bold transition active:scale-95"
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

                      {/* Tema */}
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                          Tema
                        </p>
                        <div className="flex gap-1">
                          {(Object.keys(THEMES) as Theme[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => setTheme(t)}
                              title={THEMES[t].label}
                              className="flex h-9 flex-1 items-center justify-center rounded-lg border transition active:scale-95"
                              style={{
                                borderColor: theme === t ? currentTheme.text : currentTheme.accent,
                                backgroundColor: THEMES[t].pageColor,
                                boxShadow: theme === t ? `0 0 0 2px ${currentTheme.text}` : "none",
                              }}
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: THEMES[t].text }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Dica + limpar */}
                    <div
                      className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[9px] font-bold uppercase tracking-widest"
                      style={{ borderColor: `${currentTheme.accent}40`, color: currentTheme.accent }}
                    >
                      <span className="hidden sm:inline">← → Página &nbsp;·&nbsp; ↑ ↓ Linha &nbsp;·&nbsp; 2× toque Ocultar</span>
                      <span className="sm:hidden">2 toques para ocultar controlos</span>
                      <button
                        onClick={() => {
                          try { localStorage.removeItem(CACHE_PREFIX + bookId); setRestoredFromCache(false); } catch {}
                        }}
                        className="underline underline-offset-2"
                      >
                        Limpar posição
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ── SETAS laterais (apenas desktop / landscape) ── */}
      <AnimatePresence>
        {showControls && (
          <>
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onClick={(e) => { e.stopPropagation(); goPrevPage(); }}
              className="fixed left-2 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-12 w-12 items-center justify-center rounded-full border shadow-xl transition hover:scale-110 md:left-4"
              style={{ backgroundColor: `${currentTheme.pageColor}ee`, borderColor: currentTheme.accent, color: currentTheme.text }}
              aria-label="Página anterior"
            >
              <ChevronLeft size={22} strokeWidth={1.5} />
            </motion.button>

            <motion.button
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              onClick={(e) => { e.stopPropagation(); goNextPage(); }}
              className="fixed right-2 top-1/2 z-20 hidden -translate-y-1/2 md:flex h-12 w-12 items-center justify-center rounded-full border shadow-xl transition hover:scale-110 md:right-4"
              style={{ backgroundColor: `${currentTheme.pageColor}ee`, borderColor: currentTheme.accent, color: currentTheme.text }}
              aria-label="Página seguinte"
            >
              <ChevronRight size={22} strokeWidth={1.5} />
            </motion.button>
          </>
        )}
      </AnimatePresence>

      {/* ── CONTEÚDO ── */}
      <div
        className="flex h-full w-full items-start justify-center"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="relative h-full w-full overflow-hidden md:my-6 md:rounded-xl"
          style={{
            maxWidth: "min(760px, 100vw)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          }}
        >
          <div
            ref={scrollContainerRef}
            className="prose-book h-full overflow-y-auto"
            style={{
              backgroundColor: currentTheme.pageColor,
              color: currentTheme.text,
              // Padding generoso + safe-area no topo para não ficar atrás do header
              padding: "4rem 1.5rem 5rem",
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              scrollbarWidth: "thin",
              scrollbarColor: `${currentTheme.accent}40 transparent`,
            }}
          >
            {/* Espaço extra para o header fixo */}
            <div style={{ height: "3.5rem" }} aria-hidden />

            <div
              dangerouslySetInnerHTML={{ __html: fullHtml }}
              className={FONT_SIZE_CLASS[fontSize]}
            />

            {/* Fim do livro */}
            <div
              className="mt-20 flex flex-col items-center gap-2 border-t pt-12"
              style={{ borderColor: `${currentTheme.accent}40` }}
            >
              <BookOpen size={26} strokeWidth={1.4} color={currentTheme.accent} />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: currentTheme.accent }}>
                Fim
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
