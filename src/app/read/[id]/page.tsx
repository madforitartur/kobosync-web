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
type Theme = "light" | "sepia" | "dark" | "paper" | "eink";
type PageAnim = "none" | "fade" | "slide" | "curl";

const CACHE_PREFIX = "kobosync:reading:";
const DOUBLE_TAP_MS = 280;
const SWIPE_MIN_X = 50;
const SWIPE_MAX_Y = 80;

const FONT_SIZE_CLASS: Record<FontSize, string> = {
  xs: "text-[13px] leading-relaxed",
  sm: "text-[15px] leading-relaxed",
  md: "text-[17px] leading-[1.75]",
  lg: "text-[19px] leading-[1.8]",
  xl: "text-[22px] leading-[1.85]",
};
const FONT_SIZE_LABELS: Record<FontSize, string> = { xs: "XS", sm: "S", md: "M", lg: "L", xl: "XL" };

const THEMES: Record<Theme, { label: string; bg: string; page: string; text: string; accent: string; eink?: boolean }> = {
  light: { label: "Claro", bg: "#e8e6e1", page: "#fdfcf8", text: "#1a1a1a", accent: "#6b6f7a" },
  sepia: { label: "Sépia", bg: "#d4c4a8", page: "#f5ecd9", text: "#3d2f1f", accent: "#9b7f58" },
  paper: { label: "Papel", bg: "#c9c5be", page: "#f7f3ea", text: "#1a1a1a", accent: "#6a6050" },
  dark:  { label: "Noite", bg: "#0d0d0f", page: "#18181b", text: "#e4e4e7", accent: "#71717a" },
  eink:  { label: "E-Ink", bg: "#b0b0b0", page: "#e8e8e8", text: "#0a0a0a", accent: "#444444", eink: true },
};

const PAGE_ANIMS: { id: PageAnim; label: string; icon: string }[] = [
  { id: "none",  label: "Nenhuma", icon: "✕" },
  { id: "fade",  label: "Fade",    icon: "✦" },
  { id: "slide", label: "Slide",   icon: "→" },
  { id: "curl",  label: "Folha",   icon: "📄" },
];

// CSS da animação de viragem de página (page curl 3D)
const CURL_CSS = `
@keyframes _curlNext {
  0%   { transform: perspective(1200px) rotateY(0deg);   transform-origin: left center;  opacity: 1; }
  100% { transform: perspective(1200px) rotateY(-90deg); transform-origin: left center;  opacity: 0; }
}
@keyframes _curlPrev {
  0%   { transform: perspective(1200px) rotateY(0deg);   transform-origin: right center; opacity: 1; }
  100% { transform: perspective(1200px) rotateY(90deg);  transform-origin: right center; opacity: 0; }
}
._curl-next { animation: _curlNext 0.42s cubic-bezier(0.4,0,0.2,1) forwards; }
._curl-prev { animation: _curlPrev 0.42s cubic-bezier(0.4,0,0.2,1) forwards; }
`;

// Tenta fullscreen (cross-browser). Retorna true se conseguiu.
async function tryFullscreen(): Promise<boolean> {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
      return true;
    }
    const wk = (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
    if (wk) { await wk.call(el); return true; }
  } catch {}
  return false;
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
  const [pageAnim, setPageAnim] = useState<PageAnim>("fade");
  // UI (header + footer) começa oculta — ecrã limpo
  const [uiVisible, setUiVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [progress, setProgress] = useState(0);
  const [curlClass, setCurlClass] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const skipNextSave = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const lastTapTime = useRef(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const fullscreenAttempted = useRef(false);

  // ── Injectar CSS curl ──
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = CURL_CSS;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  // ── Fullscreen imediato ao montar ──
  // Browsers móveis exigem gesto do utilizador para fullscreen.
  // Estratégia: tenta ao montar; se falhar, tenta no primeiro toque.
  useEffect(() => {
    if (fullscreenAttempted.current) return;
    fullscreenAttempted.current = true;

    tryFullscreen().then((ok) => {
      if (!ok) {
        // Fallback: primeiro evento de toque/click do utilizador
        const onGesture = () => {
          tryFullscreen();
          document.removeEventListener("touchstart", onGesture, true);
          document.removeEventListener("click", onGesture, true);
        };
        document.addEventListener("touchstart", onGesture, { once: true, capture: true });
        document.addEventListener("click", onGesture, { once: true, capture: true });
      }
    });

    // Listener para sincronizar estado se o utilizador sair manualmente
    const onChange = () => {
      // Nada a fazer — não temos estado de fullscreen local
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // ── Carregar livro ──
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

  // ── Restaurar posição ──
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

  // ── Guardar posição + calcular progresso ──
  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    if (!el) return;
    let t: number | null = null;
    const onScroll = () => {
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

  // ── Mostrar UI temporariamente (4s) ──
  const showUiTemporarily = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setUiVisible(true);
    hideTimer.current = window.setTimeout(() => {
      setUiVisible(false);
      setShowSettings(false);
    }, 4000);
  }, []);

  // ── Navegação com animação ──
  const navigate = useCallback((direction: "next" | "prev") => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = el.clientHeight * 0.9;

    if (pageAnim === "curl") {
      const cls = direction === "next" ? "_curl-next" : "_curl-prev";
      setCurlClass(cls);
      setTimeout(() => {
        el.scrollBy({ top: direction === "next" ? delta : -delta, behavior: "auto" });
        setCurlClass("");
      }, 420);
    } else {
      el.scrollBy({ top: direction === "next" ? delta : -delta, behavior: pageAnim === "none" ? "auto" : "smooth" });
    }
  }, [pageAnim]);

  // ── Teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return saveAndClose();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); navigate("next"); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); navigate("prev"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAndClose, navigate]);

  // ── Touch: start ──
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
    touchStartTime.current = Date.now();
  }, []);

  // ── Touch: end ──
  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;

    // Swipe horizontal → virar página
    if (Math.abs(dx) > SWIPE_MIN_X && Math.abs(dy) < SWIPE_MAX_Y && dt < 400) {
      e.preventDefault();
      navigate(dx < 0 ? "next" : "prev");
      return;
    }

    // Double tap → toggle UI permanente
    const now = Date.now();
    if (now - lastTapTime.current < DOUBLE_TAP_MS) {
      e.preventDefault();
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setUiVisible((v) => { if (v) setShowSettings(false); return !v; });
      lastTapTime.current = 0;
      return;
    }
    lastTapTime.current = now;

    // Toque simples: zonas esq/centro/dir
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (t.clientY < 80 || t.clientY > H - 60) return; // ignora topo e fundo

    if (t.clientX < W * 0.3)      navigate("prev");
    else if (t.clientX > W * 0.7) navigate("next");
    else                           showUiTemporarily();
  }, [navigate, showUiTemporarily]);

  const T = THEMES[theme];

  // ── Loading ──
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

  // ── Erro ──
  if (error || !data || !book) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6" style={{ backgroundColor: T.bg }}>
        <div className="max-w-sm text-center">
          <BookOpen size={40} strokeWidth={1.4} color={T.accent} className="mx-auto mb-4" />
          <h1 className="text-xl font-bold" style={{ color: T.text }}>Não foi possível abrir</h1>
          <p className="mt-2 text-sm" style={{ color: T.accent }}>{error ?? "Erro desconhecido"}</p>
          <button onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            style={{ backgroundColor: T.text, color: T.page }}>
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
      {/* ── BARRA DE PROGRESSO (sempre visível, 2px no topo) ── */}
      <div className="fixed inset-x-0 top-0 z-50 h-[2px]" style={{ backgroundColor: `${T.accent}25` }}>
        <motion.div
          className="h-full"
          style={{ backgroundColor: T.accent }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "linear" }}
        />
      </div>

      {/* ── BOTÃO FECHAR — sempre acessível, canto sup. esq., z alto ──
           Fica FORA do header para não ser tapado pelo painel de definições */}
      <AnimatePresence>
        {uiVisible && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            onPointerDown={(e) => { e.stopPropagation(); saveAndClose(); }}
            className="fixed left-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full shadow-xl active:scale-90 transition-transform"
            style={{
              top: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
              backgroundColor: T.page,
              color: T.text,
              border: `1px solid ${T.accent}35`,
            }}
            aria-label="Fechar"
          >
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── BOTÃO DEFINIÇÕES — canto sup. dir., z alto ── */}
      <AnimatePresence>
        {uiVisible && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            onPointerDown={(e) => { e.stopPropagation(); setShowSettings((v) => !v); showUiTemporarily(); }}
            className="fixed right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full shadow-xl active:scale-90 transition-transform"
            style={{
              top: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
              backgroundColor: showSettings ? T.text : T.page,
              color: showSettings ? T.page : T.text,
              border: `1px solid ${T.accent}35`,
            }}
            aria-label="Definições"
          >
            <Settings2 size={17} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── GRADIENTE SUPERIOR (contexto visual para os botões) ── */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-x-0 top-0 z-40 h-24"
            style={{
              background: `linear-gradient(to bottom, ${T.bg}e0 0%, ${T.bg}00 100%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* ── PAINEL DE DEFINIÇÕES ──
           z-[55] — acima do gradiente mas abaixo dos botões (z-[60]) */}
      <AnimatePresence>
        {uiVisible && showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-3 z-[55] rounded-2xl p-4 shadow-2xl"
            style={{
              top: `calc(4.25rem + env(safe-area-inset-top, 0px))`,
              backgroundColor: T.page,
              border: `1px solid ${T.accent}25`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Tamanho da letra */}
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
              Tamanho da letra
            </p>
            <div className="mb-4 flex gap-1.5">
              {(Object.keys(FONT_SIZE_CLASS) as FontSize[]).map((s) => (
                <button
                  key={s}
                  onPointerDown={() => setFontSize(s)}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold active:scale-95 transition-transform"
                  style={{
                    backgroundColor: fontSize === s ? T.text : `${T.accent}18`,
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
            <div className="mb-4 flex gap-1.5">
              {(Object.keys(THEMES) as Theme[]).map((t) => (
                <button
                  key={t}
                  onPointerDown={() => setTheme(t)}
                  title={THEMES[t].label}
                  className="flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold active:scale-95 transition-all"
                  style={{
                    backgroundColor: THEMES[t].page,
                    color: THEMES[t].text,
                    border: theme === t ? `2.5px solid ${T.text}` : `1px solid ${T.accent}25`,
                    boxShadow: theme === t ? `0 0 0 2px ${T.bg}` : "none",
                  }}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: THEMES[t].text }}
                  />
                  {THEMES[t].label}
                </button>
              ))}
            </div>

            {/* Animação de página */}
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
              Animação de página
            </p>
            <div className="mb-3 flex gap-1.5">
              {PAGE_ANIMS.map((a) => (
                <button
                  key={a.id}
                  onPointerDown={() => setPageAnim(a.id)}
                  className="flex h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-bold active:scale-95 transition-colors"
                  style={{
                    backgroundColor: pageAnim === a.id ? T.text : `${T.accent}18`,
                    color: pageAnim === a.id ? T.page : T.text,
                  }}
                >
                  <span className="text-sm leading-none">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>

            {/* Rodapé do painel */}
            <div
              className="mt-1 flex items-center justify-between border-t pt-2 text-[9px]"
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

      {/* ── CONTEÚDO DO LIVRO ── */}
      <div
        ref={scrollRef}
        className={`prose-book h-full w-full overflow-y-auto overscroll-none ${curlClass}`}
        style={{
          backgroundColor: T.page,
          color: T.text,
          paddingTop: "calc(2.5rem + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "clamp(1.25rem, 5vw, 3rem)",
          paddingRight: "clamp(1.25rem, 5vw, 3rem)",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          ...(T.eink ? {
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='%23cccccc' opacity='0.25'/%3E%3C/svg%3E\")",
          } : {}),
        } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <style>{`.prose-book::-webkit-scrollbar { display: none; }`}</style>

        <div
          dangerouslySetInnerHTML={{ __html: fullHtml }}
          className={`${FONT_SIZE_CLASS[fontSize]} select-text`}
          style={{
            maxWidth: "65ch",
            margin: "0 auto",
            ...(T.eink ? { fontWeight: 500, textRendering: "geometricPrecision" } as React.CSSProperties : {}),
          }}
        />

        {/* Fim do livro */}
        <div
          className="mx-auto mt-24 flex max-w-[65ch] flex-col items-center gap-3 border-t py-16"
          style={{ borderColor: `${T.accent}30` }}
        >
          <BookOpen size={24} strokeWidth={1.4} color={T.accent} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>Fim</p>
          {restoredFromCache && (
            <p className="text-[10px]" style={{ color: T.accent }}>Posição restaurada</p>
          )}
        </div>
      </div>

      {/* ── GRADIENTE + INFO INFERIOR (visível quando uiVisible) ── */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between px-5 py-3"
            style={{
              paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
              background: `linear-gradient(to top, ${T.bg}e0 60%, ${T.bg}00 100%)`,
            }}
          >
            <span className="text-[11px] font-medium" style={{ color: T.accent }}>
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
