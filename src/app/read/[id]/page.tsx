"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen, Loader2, Settings2, X } from "lucide-react";
import type { Book } from "@/types/library";
import { combineChapters } from "@/lib/pagination";

type Chapter = { id: string; title: string; html: string };
type ReadData = { title: string; chapters: Chapter[] };
type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
type Theme = "light" | "sepia" | "dark" | "paper";

const CACHE_PREFIX = "kobosync:reading:";
const DOUBLE_TAP_MS = 280;
const SWIPE_MIN_X = 50;   // px mínimo para contar como swipe
const SWIPE_MAX_Y = 80;   // px máximo vertical para não cancelar scroll

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  xs: "text-[13px] leading-relaxed",
  sm: "text-[15px] leading-relaxed",
  md: "text-[17px] leading-[1.75]",
  lg: "text-[19px] leading-[1.8]",
  xl: "text-[22px] leading-[1.85]",
};

const FONT_SIZE_LABELS: Record<FontSize, string> = { xs: "XS", sm: "S", md: "M", lg: "L", xl: "XL" };

const THEMES: Record<Theme, { label: string; bg: string; page: string; text: string; accent: string }> = {
  light:  { label: "Claro",  bg: "#e8e6e1", page: "#fdfcf8", text: "#1a1a1a", accent: "#6b6f7a" },
  sepia:  { label: "Sépia",  bg: "#d4c4a8", page: "#f5ecd9", text: "#3d2f1f", accent: "#9b7f58" },
  paper:  { label: "Papel",  bg: "#c9c5be", page: "#f7f3ea", text: "#1a1a1a", accent: "#6a6050" },
  dark:   { label: "Noite",  bg: "#0d0d0f", page: "#18181b", text: "#e4e4e7", accent: "#71717a" },
};

function requestFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
  } catch {}
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
  const [uiVisible, setUiVisible] = useState(false);   // começa oculto no mobile
  const [showSettings, setShowSettings] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);

  // Progresso (0–100)
  const [progress, setProgress] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const skipNextSave = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const lastTapTime = useRef(0);

  // Touch swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  // Fullscreen ao montar
  useEffect(() => { requestFullscreen(); }, []);

  // Carregar livro
  useEffect(() => {
    if (!bookId) return;
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const [br, cr] = await Promise.all([
          fetch(`/api/books/${bookId}`, { signal: ctrl.signal }),
          fetch(`/api/books/${bookId}/content`, { signal: ctrl.signal }),
        ]);
        const bd = await br.json();
        const cd = await cr.json();
        if (!br.ok) throw new Error(bd.error ?? "Erro");
        if (!cr.ok) throw new Error(cd.error ?? "Erro");
        setBook(bd.book);
        setData(cd);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Erro ao carregar livro");
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [bookId]);

  const fullHtml = useMemo(() => (data ? combineChapters(data.chapters) : ""), [data]);

  // Restaurar posição
  useEffect(() => {
    if (!data || !scrollRef.current || restoredFromCache) return;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + bookId);
      if (raw) {
        const c = JSON.parse(raw) as { scrollTop: number; timestamp: number };
        if (Date.now() - c.timestamp < 4 * 7 * 24 * 60 * 60 * 1000) {
          skipNextSave.current = true;
          scrollRef.current.scrollTo({ top: c.scrollTop, behavior: "auto" });
          setRestoredFromCache(true);
        }
      }
    } catch {}
  }, [data, bookId, restoredFromCache]);

  // Guardar posição + calcular progresso
  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    if (!el) return;
    let t: number | null = null;

    const onScroll = () => {
      // Progresso
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) setProgress(Math.round((el.scrollTop / max) * 100));

      if (skipNextSave.current) { skipNextSave.current = false; return; }
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        try {
          localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() }));
        } catch {}
      }, 500);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (t) window.clearTimeout(t); };
  }, [data, bookId]);

  const saveAndClose = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      try { localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() })); } catch {}
    }
    try { if (document.exitFullscreen) document.exitFullscreen(); } catch {}
    router.back();
  }, [bookId, router]);

  // Mostrar UI temporariamente
  const showUiTemporarily = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setUiVisible(true);
    hideTimer.current = window.setTimeout(() => {
      setUiVisible(false);
      setShowSettings(false);
    }, 4000);
  }, []);

  // Teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return saveAndClose();
      const el = scrollRef.current;
      if (!el) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" }); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAndClose]);

  // ── HANDLERS de TOQUE ──

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    const el = scrollRef.current;

    // ── Swipe horizontal para virar página ──
    if (Math.abs(dx) > SWIPE_MIN_X && Math.abs(dy) < SWIPE_MAX_Y && dt < 400) {
      e.preventDefault();
      if (!el) return;
      if (dx < 0) {
        // swipe esquerda → próxima página
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" });
      } else {
        // swipe direita → página anterior
        el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" });
      }
      return;
    }

    // ── Double tap → toggle UI ──
    const now = Date.now();
    if (now - lastTapTime.current < DOUBLE_TAP_MS) {
      e.preventDefault();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setUiVisible((v) => { if (v) setShowSettings(false); return !v; });
      lastTapTime.current = 0;
      return;
    }
    lastTapTime.current = now;

    // ── Toque simples: metade esquerda/direita → virar página ──
    // Só actua se não for na zona do texto com scroll
    const W = window.innerWidth;
    const tapX = t.clientX;
    const tapY = t.clientY;
    const H = window.innerHeight;

    // Ignora toques na faixa central (40%) e no topo/fundo (UI)
    const inTopBar = tapY < 80;
    const inBottomBar = tapY > H - 60;
    const inCenterZone = tapX > W * 0.3 && tapX < W * 0.7;

    if (inTopBar || inBottomBar || !el) return;

    if (tapX < W * 0.3) {
      // Terço esquerdo → página anterior
      el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" });
    } else if (tapX > W * 0.7) {
      // Terço direito → página seguinte
      el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" });
    } else {
      // Centro → mostrar UI temporariamente
      showUiTemporarily();
    }
  }, [showUiTemporarily]);

  const T = THEMES[theme];

  // ── LOADING / ERROR ──
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ backgroundColor: T.bg }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" size={28} color={T.accent} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: T.accent }}>A abrir…</p>
        </div>
      </div>
    );
  }

  if (error || !data || !book) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6" style={{ backgroundColor: T.bg }}>
        <div className="max-w-sm text-center">
          <BookOpen size={40} strokeWidth={1.4} color={T.accent} className="mx-auto mb-4" />
          <h1 className="text-xl font-bold" style={{ color: T.text }}>Não foi possível abrir</h1>
          <p className="mt-2 text-sm" style={{ color: T.accent }}>{error ?? "Erro desconhecido"}</p>
          <button
            onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            style={{ backgroundColor: T.text, color: T.page }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden select-none"
      style={{ backgroundColor: T.bg }}
    >
      {/* ════════════════════════════════
          BARRA SUPERIOR — só visível quando uiVisible
      ════════════════════════════════ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div
            initial={{ opacity: 0, y: -48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -48 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 py-3"
            style={{
              paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
              background: `linear-gradient(to bottom, ${T.bg}f5 0%, ${T.bg}00 100%)`,
            }}
          >
            {/* Fechar */}
            <button
              onPointerDown={(e) => { e.stopPropagation(); saveAndClose(); }}
              className="flex h-11 w-11 items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
              style={{ backgroundColor: T.page, color: T.text, border: `1px solid ${T.accent}30` }}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>

            {/* Autor (discreto) */}
            <span
              className="min-w-0 truncate text-center text-xs font-medium"
              style={{ color: T.accent }}
            >
              {book.author ?? ""}
            </span>

            {/* Definições */}
            <button
              onPointerDown={(e) => { e.stopPropagation(); setShowSettings(v => !v); showUiTemporarily(); }}
              className="flex h-11 w-11 items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
              style={{
                backgroundColor: showSettings ? T.text : T.page,
                color: showSettings ? T.page : T.text,
                border: `1px solid ${T.accent}30`,
              }}
              aria-label="Definições"
            >
              <Settings2 size={17} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════
          PAINEL DE DEFINIÇÕES
      ════════════════════════════════ */}
      <AnimatePresence>
        {uiVisible && showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-3 z-30 rounded-2xl p-4 shadow-2xl"
            style={{
              top: `calc(4rem + env(safe-area-inset-top, 0px))`,
              backgroundColor: T.page,
              border: `1px solid ${T.accent}20`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Tamanho da letra */}
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
              Tamanho da letra
            </p>
            <div className="mb-4 flex gap-2">
              {(Object.keys(FONT_SIZE_CLASS) as FontSize[]).map((s) => (
                <button
                  key={s}
                  onPointerDown={() => setFontSize(s)}
                  className="flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold transition-colors active:scale-95"
                  style={{
                    backgroundColor: fontSize === s ? T.text : `${T.accent}15`,
                    color: fontSize === s ? T.page : T.text,
                  }}
                >
                  {FONT_SIZE_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Temas */}
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
              Tema
            </p>
            <div className="flex gap-2">
              {(Object.keys(THEMES) as Theme[]).map((t) => (
                <button
                  key={t}
                  onPointerDown={() => setTheme(t)}
                  title={THEMES[t].label}
                  className="flex h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                  style={{
                    backgroundColor: THEMES[t].page,
                    color: THEMES[t].text,
                    border: theme === t ? `2px solid ${T.text}` : `1px solid ${T.accent}20`,
                    boxShadow: theme === t ? `0 0 0 2px ${T.bg}` : "none",
                  }}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: THEMES[t].text }} />
                  {THEMES[t].label}
                </button>
              ))}
            </div>

            {/* Dica e limpar */}
            <div
              className="mt-4 flex items-center justify-between border-t pt-3 text-[10px]"
              style={{ borderColor: `${T.accent}25`, color: T.accent }}
            >
              <span>2× toque · swipe · toque esq/dir</span>
              <button
                onPointerDown={() => {
                  try { localStorage.removeItem(CACHE_PREFIX + bookId); setRestoredFromCache(false); } catch {}
                }}
                className="font-bold underline underline-offset-2"
              >
                Limpar posição
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════
          BARRA DE PROGRESSO (sempre visível, muito fina)
      ════════════════════════════════ */}
      <div
        className="fixed inset-x-0 top-0 z-50 h-[2px]"
        style={{ backgroundColor: `${T.accent}20` }}
      >
        <motion.div
          className="h-full"
          style={{ backgroundColor: T.accent }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "linear" }}
        />
      </div>

      {/* ════════════════════════════════
          CONTEÚDO DO LIVRO
      ════════════════════════════════ */}
      <div
        ref={scrollRef}
        className="prose-book h-full w-full overflow-y-auto overscroll-none"
        style={{
          backgroundColor: T.page,
          color: T.text,
          // Padding generoso: topo/fundo com safe-area, laterais confortáveis
          paddingTop: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "clamp(1.25rem, 5vw, 3rem)",
          paddingRight: "clamp(1.25rem, 5vw, 3rem)",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <style>{`.prose-book::-webkit-scrollbar { display: none; }`}</style>

        <div
          dangerouslySetInnerHTML={{ __html: fullHtml }}
          className={`${FONT_SIZE_CLASS[fontSize]} select-text`}
          style={{ maxWidth: "65ch", margin: "0 auto" }}
        />

        {/* Fim do livro */}
        <div
          className="mx-auto mt-24 flex max-w-[65ch] flex-col items-center gap-3 border-t py-16"
          style={{ borderColor: `${T.accent}30` }}
        >
          <BookOpen size={24} strokeWidth={1.4} color={T.accent} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
            Fim
          </p>
          {restoredFromCache && (
            <p className="text-[10px]" style={{ color: T.accent }}>Posição restaurada</p>
          )}
        </div>
      </div>

      {/* ════════════════════════════════
          BARRA INFERIOR DE PROGRESSO (só quando UI visível)
      ════════════════════════════════ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between px-5 py-3"
            style={{
              paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
              background: `linear-gradient(to top, ${T.bg}f5 0%, ${T.bg}00 100%)`,
            }}
          >
            <span className="text-[11px] font-bold" style={{ color: T.accent }}>
              {book.author ?? ""}
            </span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: T.accent }}>
              {progress}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
