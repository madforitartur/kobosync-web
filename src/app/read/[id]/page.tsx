"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen, Loader2, Maximize, Minimize, Settings2, X } from "lucide-react";
import type { Book } from "@/types/library";
import { combineChapters } from "@/lib/pagination";

type Chapter  = { id: string; title: string; html: string };
type ReadData = { title: string; chapters: Chapter[] };
type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
type Theme    = "light" | "sepia" | "dark" | "paper" | "eink";
type PageAnim = "none" | "fade" | "slide" | "curl";

const CACHE_PREFIX  = "kobosync:reading:";
const DOUBLE_TAP_MS = 280;
const SWIPE_MIN_X   = 48;
const SWIPE_MAX_Y   = 80;

// Tamanho e line-height de cada opção de fonte (para alinhamento de página)
const FONT_PX: Record<FontSize, number> = { xs:13, sm:15, md:17, lg:19, xl:22 };
const FONT_LH: Record<FontSize, number> = { xs:1.6, sm:1.6, md:1.75, lg:1.8, xl:1.85 };

const FONT_CLASS: Record<FontSize, string> = {
  xs: "text-[13px] leading-relaxed",
  sm: "text-[15px] leading-relaxed",
  md: "text-[17px] leading-[1.75]",
  lg: "text-[19px] leading-[1.8]",
  xl: "text-[22px] leading-[1.85]",
};
const FONT_LABELS: Record<FontSize, string> = { xs:"XS", sm:"S", md:"M", lg:"L", xl:"XL" };

const THEMES: Record<Theme, {
  label:string; bg:string; page:string; text:string; accent:string; eink?:boolean;
}> = {
  light: { label:"Claro",  bg:"#e8e6e1", page:"#fdfcf8", text:"#1a1a1a", accent:"#6b6f7a" },
  sepia: { label:"Sépia",  bg:"#d4c4a8", page:"#f5ecd9", text:"#3d2f1f", accent:"#9b7f58" },
  paper: { label:"Papel",  bg:"#c9c5be", page:"#f7f3ea", text:"#1a1a1a", accent:"#6a6050" },
  dark:  { label:"Noite",  bg:"#0d0d0f", page:"#18181b", text:"#e4e4e7", accent:"#71717a" },
  eink:  { label:"E-Ink",  bg:"#b0b0b0", page:"#e8e8e8", text:"#0a0a0a", accent:"#444444", eink:true },
};

const PAGE_ANIMS: { id:PageAnim; label:string; icon:string }[] = [
  { id:"none",  label:"Nenhuma", icon:"✕"  },
  { id:"fade",  label:"Fade",    icon:"✦"  },
  { id:"slide", label:"Slide",   icon:"⇄"  },
  { id:"curl",  label:"Folha",   icon:"📄" },
];

const READER_CSS = `
.rdr::-webkit-scrollbar { display: none; }
@keyframes curlN {
  from { transform: perspective(1400px) rotateY(0deg);   transform-origin:left center;  opacity:1 }
  to   { transform: perspective(1400px) rotateY(-90deg); transform-origin:left center;  opacity:0 }
}
@keyframes curlP {
  from { transform: perspective(1400px) rotateY(0deg);   transform-origin:right center; opacity:1 }
  to   { transform: perspective(1400px) rotateY(90deg);  transform-origin:right center; opacity:0 }
}
.curl-n { animation: curlN 0.38s cubic-bezier(.4,0,.2,1) forwards; }
.curl-p { animation: curlP 0.38s cubic-bezier(.4,0,.2,1) forwards; }
`;

// ── Fullscreen helpers ──
async function tryFs(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: (o?: { navigationUI?: string }) => Promise<void>;
  };
  try {
    if (el.requestFullscreen)       { await el.requestFullscreen({ navigationUI:"hide" }); return true; }
    if (el.webkitRequestFullscreen) { await el.webkitRequestFullscreen({ navigationUI:"hide" }); return true; }
  } catch {}
  return false;
}
function exitFs() {
  try {
    const d = document as Document & { webkitExitFullscreen?:()=>void };
    if (document.exitFullscreen) document.exitFullscreen();
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
  } catch {}
}
function isFsOn() {
  const d = document as Document & { webkitFullscreenElement?: Element|null };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export default function ReadPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = String(params.id ?? "");

  const [book,    setBook]    = useState<Book|null>(null);
  const [data,    setData]    = useState<ReadData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string|null>(null);
  const [fontSize,   setFontSize]   = useState<FontSize>("md");
  const [theme,      setTheme]      = useState<Theme>("light");
  const [pageAnim,   setPageAnim]   = useState<PageAnim>("fade");
  const [uiVisible,  setUiVisible]  = useState(false);
  const [showPanel,  setShowPanel]  = useState(false);
  const [restored,   setRestored]   = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [isFs,       setIsFs]       = useState(false);

  // Slide: controla opacity+transform do WRAPPER de texto (não do scroll)
  // O scroll container fica estático; só o conteúdo desliza.
  const [slideOut, setSlideOut] = useState(false);
  const [slideDir, setSlideDir] = useState<"next"|"prev">("next");

  // Curl: classe CSS no scroll container
  const [curlCls, setCurlCls] = useState("");

  const scrollRef  = useRef<HTMLDivElement>(null);
  const skipSave   = useRef(false);
  const busy       = useRef(false); // bloqueia navegação dupla durante animação
  const lastTap    = useRef(0);
  const tX         = useRef(0);
  const tY         = useRef(0);
  const tT         = useRef(0);

  // ── CSS ──
  useEffect(() => {
    const s = document.createElement("style");
    s.id = "rdr-css"; s.textContent = READER_CSS;
    document.head.appendChild(s);
    return () => { document.getElementById("rdr-css")?.remove(); };
  }, []);

  // ── Sync estado fullscreen ──
  useEffect(() => {
    const fn = () => setIsFs(isFsOn());
    document.addEventListener("fullscreenchange", fn);
    document.addEventListener("webkitfullscreenchange", fn);
    return () => {
      document.removeEventListener("fullscreenchange", fn);
      document.removeEventListener("webkitfullscreenchange", fn);
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
          fetch(`/api/books/${bookId}`,         { signal: ctrl.signal }),
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
        setError(e instanceof Error ? e.message : "Erro desconhecido");
      } finally { setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [bookId]);

  const fullHtml = useMemo(() => (data ? combineChapters(data.chapters) : ""), [data]);

  // ── Restaurar posição ──
  useEffect(() => {
    if (!data || !scrollRef.current || restored) return;
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + bookId);
      if (raw) {
        const c = JSON.parse(raw) as { scrollTop:number; timestamp:number };
        if (Date.now() - c.timestamp < 28 * 24 * 3600 * 1000) {
          skipSave.current = true;
          scrollRef.current.scrollTo({ top: c.scrollTop, behavior: "auto" });
          setRestored(true);
        }
      }
    } catch {}
  }, [data, bookId, restored]);

  // ── Progresso + guardar ──
  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) setProgress(Math.round((el.scrollTop / max) * 100));
      if (skipSave.current) { skipSave.current = false; return; }
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try {
          localStorage.setItem(CACHE_PREFIX + bookId,
            JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() }));
        } catch {}
      }, 500);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (t) clearTimeout(t); };
  }, [data, bookId]);

  const saveAndClose = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      try {
        localStorage.setItem(CACHE_PREFIX + bookId,
          JSON.stringify({ scrollTop: el.scrollTop, timestamp: Date.now() }));
      } catch {}
    }
    exitFs();
    router.back();
  }, [bookId, router]);

  const toggleFs = useCallback(() => {
    if (isFsOn()) exitFs();
    else tryFs().then((ok) => { if (ok) setIsFs(true); });
  }, []);

  // ── Navegação com página alinhada ──
  // Calcula delta alinhado à altura de linha para não cortar texto.
  // Mantém 1 linha de sobreposição para continuidade de leitura.
  const navigate = useCallback((dir: "next"|"prev") => {
    if (busy.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const lineH  = Math.round(FONT_PX[fontSize] * FONT_LH[fontSize]);
    const viewH  = el.clientHeight;
    const lines  = Math.floor(viewH / lineH);
    // Usa (lines - 1) linhas por página: 1 linha de contexto sempre visível
    const step   = (lines - 1) * lineH;
    const sign   = dir === "next" ? 1 : -1;

    if (pageAnim === "curl") {
      busy.current = true;
      setCurlCls(dir === "next" ? "curl-n" : "curl-p");
      setTimeout(() => {
        el.scrollBy({ top: sign * step, behavior: "auto" });
        setCurlCls("");
        busy.current = false;
      }, 380);
      return;
    }

    if (pageAnim === "slide") {
      busy.current = true;
      // 1. Desliza para fora (220ms)
      setSlideDir(dir);
      setSlideOut(true);
      setTimeout(() => {
        // 2. Scroll instantâneo enquanto conteúdo está invisible
        el.scrollBy({ top: sign * step, behavior: "auto" });
        // 3. Volta para a posição inicial (sem transição) e depois entra com transição
        setSlideOut(false);
        busy.current = false;
      }, 220);
      return;
    }

    // fade: smooth nativo do browser (suave, sem glitch)
    // none: instantâneo
    el.scrollBy({ top: sign * step, behavior: pageAnim === "none" ? "auto" : "smooth" });
  }, [pageAnim, fontSize]);

  // ── Teclado ──
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape")                               { saveAndClose(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); navigate("next"); }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); navigate("prev"); }
      if (e.key === "f" || e.key === "F")                  { toggleFs(); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [saveAndClose, navigate, toggleFs]);

  // ── Touch ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    tX.current = t.clientX; tY.current = t.clientY; tT.current = Date.now();
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const t  = e.changedTouches[0];
    const dx = t.clientX - tX.current;
    const dy = t.clientY - tY.current;
    const dt = Date.now() - tT.current;

    // Swipe horizontal
    if (Math.abs(dx) > SWIPE_MIN_X && Math.abs(dy) < SWIPE_MAX_Y && dt < 400) {
      e.preventDefault();
      navigate(dx < 0 ? "next" : "prev");
      return;
    }

    // Double tap → toggle UI
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      e.preventDefault();
      // Ao fazer double-tap: se UI estiver visível fecha-a (e o painel);
      // se estiver oculta, mostra-a. SEM timer — o utilizador controla.
      setUiVisible((v) => {
        if (v) setShowPanel(false);
        return !v;
      });
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;

    // Toque simples: zonas laterais / centro
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Ignora toques nas zonas reservadas aos botões (topo e fundo)
    if (t.clientY < 72 || t.clientY > H - 56) return;
    if      (t.clientX < W * 0.28) navigate("prev");
    else if (t.clientX > W * 0.72) navigate("next");
    else {
      // Centro: mostrar UI sem timer (utilizador fecha com X)
      setUiVisible(true);
    }
  }, [navigate]);

  const T = THEMES[theme];

  // Estilo inline do wrapper de slide
  const slideStyle = useMemo((): React.CSSProperties => {
    if (pageAnim !== "slide") return {};
    if (slideOut) {
      return {
        opacity:    0,
        transform:  `translateX(${slideDir === "next" ? "-5%" : "5%"})`,
        transition: "opacity 200ms ease, transform 200ms ease",
        willChange: "opacity, transform",
      };
    }
    return {
      opacity:   1,
      transform: "translateX(0)",
      // Sem transição no "in": o scroll já posicionou o conteúdo,
      // o wrapper apenas reaparece no sítio correcto (sem deslizar de volta)
      transition: "none",
    };
  }, [pageAnim, slideOut, slideDir]);

  // ── Loading / Error ──
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
          <button onClick={() => router.back()}
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            style={{ backgroundColor: T.text, color: T.page }}>
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </div>
    );
  }

  // top dos botões flutuantes: respeita notch em fullscreen e fora
  const btnTop = isFs
    ? "calc(0.75rem + env(safe-area-inset-top, 0px))"
    : "0.75rem";

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none" style={{ backgroundColor: T.bg }}>

      {/* ══ BARRA PROGRESSO 2px (sempre visível) ══ */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]"
        style={{ backgroundColor: `${T.accent}22` }}>
        <motion.div className="h-full" style={{ backgroundColor: T.accent }}
          animate={{ width: `${progress}%` }} transition={{ duration: 0.3, ease: "linear" }} />
      </div>

      {/* ══ BOTÃO X — fecha o livro, topo esquerdo, z-[70] ══ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.button key="btn-x"
            initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.8 }} transition={{ duration:0.14 }}
            onPointerDown={(e) => { e.stopPropagation(); saveAndClose(); }}
            className="fixed left-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full shadow-xl active:scale-90 transition-transform"
            style={{ top: btnTop, backgroundColor: T.page, color: T.text, border: `1px solid ${T.accent}28` }}
            aria-label="Fechar">
            <X size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ BOTÃO DEFINIÇÕES — topo direito, z-[70] ══ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.button key="btn-cfg"
            initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.8 }} transition={{ duration:0.14 }}
            onPointerDown={(e) => { e.stopPropagation(); setShowPanel((v) => !v); }}
            className="fixed right-4 z-[70] flex h-11 w-11 items-center justify-center rounded-full shadow-xl active:scale-90 transition-transform"
            style={{
              top: btnTop,
              backgroundColor: showPanel ? T.text : T.page,
              color:           showPanel ? T.page : T.text,
              border: `1px solid ${T.accent}28`,
            }}
            aria-label="Definições">
            <Settings2 size={17} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ GRADIENTE TOPO (degrade visual p/ os botões) ══ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div key="grad-t"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="pointer-events-none fixed inset-x-0 top-0 z-40 h-28"
            style={{ background: `linear-gradient(to bottom, ${T.bg}d8 0%, ${T.bg}00 100%)` }}
          />
        )}
      </AnimatePresence>

      {/* ══ PAINEL DE DEFINIÇÕES — z-[60], NÃO fecha automaticamente ══
           Fecha com: botão Definições (toggle) OU o X dentro do cabeçalho do painel */}
      <AnimatePresence>
        {uiVisible && showPanel && (
          <motion.div key="panel"
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-10 }} transition={{ duration:0.18 }}
            className="fixed inset-x-3 z-[60] overflow-y-auto rounded-2xl shadow-2xl"
            style={{
              top:       `calc(4.5rem + ${isFs ? "env(safe-area-inset-top, 0px)" : "0px"})`,
              maxHeight: `calc(100vh - 5.5rem - ${isFs ? "env(safe-area-inset-top, 0px)" : "0px"} - env(safe-area-inset-bottom, 0px))`,
              backgroundColor: T.page,
              border: `1px solid ${T.accent}18`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho com X próprio para fechar o PAINEL (não o livro) */}
            <div className="flex items-center justify-between border-b px-4 pt-3 pb-2"
              style={{ borderColor: `${T.accent}15` }}>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                Definições de leitura
              </p>
              <button
                onPointerDown={(e) => { e.stopPropagation(); setShowPanel(false); }}
                className="flex h-7 w-7 items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{ backgroundColor: `${T.accent}15`, color: T.text }}
                aria-label="Fechar painel">
                <X size={13} />
              </button>
            </div>

            <div className="space-y-4 p-4">

              {/* Letra */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                  Tamanho da letra
                </p>
                <div className="flex gap-1.5">
                  {(Object.keys(FONT_CLASS) as FontSize[]).map((s) => (
                    <button key={s} onPointerDown={() => setFontSize(s)}
                      className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold active:scale-95 transition-transform"
                      style={{
                        backgroundColor: fontSize === s ? T.text : `${T.accent}15`,
                        color:           fontSize === s ? T.page : T.text,
                      }}>
                      {FONT_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Temas */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                  Tema
                </p>
                <div className="flex gap-1.5">
                  {(Object.keys(THEMES) as Theme[]).map((t) => (
                    <button key={t} onPointerDown={() => setTheme(t)} title={THEMES[t].label}
                      className="flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold active:scale-95 transition-all"
                      style={{
                        backgroundColor: THEMES[t].page,
                        color:           THEMES[t].text,
                        border:    theme === t ? `2.5px solid ${T.text}` : `1px solid ${T.accent}18`,
                        boxShadow: theme === t ? `0 0 0 2px ${T.bg}`    : "none",
                      }}>
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: THEMES[t].text }} />
                      {THEMES[t].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animação */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                  Animação de página
                </p>
                <div className="flex gap-1.5">
                  {PAGE_ANIMS.map((a) => (
                    <button key={a.id} onPointerDown={() => setPageAnim(a.id)}
                      className="flex h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-bold active:scale-95 transition-colors"
                      style={{
                        backgroundColor: pageAnim === a.id ? T.text : `${T.accent}15`,
                        color:           pageAnim === a.id ? T.page : T.text,
                      }}>
                      <span className="text-sm leading-none">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ecrã completo */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>
                  Ecrã
                </p>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); toggleFs(); }}
                  className="flex w-full items-center justify-between rounded-xl px-4 h-11 text-sm font-bold active:scale-95 transition-all"
                  style={{
                    backgroundColor: isFs ? T.text : `${T.accent}15`,
                    color:           isFs ? T.page : T.text,
                  }}>
                  <span>{isFs ? "Sair do ecrã completo" : "Ecrã completo"}</span>
                  {isFs ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>

              {/* Rodapé */}
              <div className="flex items-center justify-between border-t pt-2 text-[9px]"
                style={{ borderColor: `${T.accent}15`, color: T.accent }}>
                <span>2× toque · swipe · toque esq/dir · F fullscreen</span>
                <button
                  onPointerDown={() => {
                    try { localStorage.removeItem(CACHE_PREFIX + bookId); setRestored(false); } catch {}
                  }}
                  className="font-bold underline underline-offset-2">
                  Limpar posição
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ SCROLL CONTAINER ══
           O curl aplica-se aqui (rotateY anima o próprio container).
           O slide NÃO aplica aqui — aplica-se ao wrapper interno. */}
      <div
        ref={scrollRef}
        className={`rdr prose-book h-full w-full overflow-y-auto overscroll-none ${curlCls}`}
        style={{
          backgroundColor:         T.page,
          color:                   T.text,
          // paddingTop respeita notch APENAS em fullscreen
          paddingTop:  isFs
            ? "calc(2.5rem + env(safe-area-inset-top, 0px))"
            : "2.5rem",
          paddingBottom:           "calc(3rem + env(safe-area-inset-bottom, 0px))",
          paddingLeft:             "clamp(1.25rem, 5vw, 3rem)",
          paddingRight:            "clamp(1.25rem, 5vw, 3rem)",
          scrollbarWidth:          "none",
          WebkitOverflowScrolling: "touch",
          ...(T.eink ? {
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='%23cccccc' opacity='0.18'/%3E%3C/svg%3E\")",
          } : {}),
        } as React.CSSProperties}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Wrapper interno — slide anima este elemento */}
        <div style={slideStyle}>
          <div
            dangerouslySetInnerHTML={{ __html: fullHtml }}
            className={`${FONT_CLASS[fontSize]} select-text`}
            style={{
              maxWidth: "65ch",
              margin:   "0 auto",
              ...(T.eink ? { fontWeight:500, textRendering:"geometricPrecision" } as React.CSSProperties : {}),
            }}
          />
          <div className="mx-auto mt-24 flex max-w-[65ch] flex-col items-center gap-3 border-t py-16"
            style={{ borderColor: `${T.accent}25` }}>
            <BookOpen size={24} strokeWidth={1.4} color={T.accent} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>Fim</p>
            {restored && (
              <p className="text-[10px]" style={{ color: T.accent }}>Posição restaurada</p>
            )}
          </div>
        </div>
      </div>

      {/* ══ FOOTER (autor + %) ══ */}
      <AnimatePresence>
        {uiVisible && (
          <motion.div key="footer"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:12 }} transition={{ duration:0.16 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-between px-5 pt-6"
            style={{
              paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))`,
              background:    `linear-gradient(to top, ${T.bg}d8 50%, ${T.bg}00 100%)`,
            }}>
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
