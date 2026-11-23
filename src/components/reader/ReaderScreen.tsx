"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Bookmark as BookmarkIcon, Copy, Loader2, Maximize, Menu, Minimize, Trash2 } from "lucide-react";
import type { Book } from "@/types/library";
import { combineChapters } from "@/lib/pagination";
import { FINISHED_RATIO, clearPosition, ensureListed, loadPosition, savePosition } from "@/lib/reading-progress";
import { FONT_FAMILIES, FONT_PX, LINE_SPACING, TEXT_WIDTH, THEMES, type ReaderSettings } from "@/lib/reader-settings";
import { HL_COLORS, newId, type Bookmark, type Highlight, type HlColor } from "@/lib/reader-annotations";
import { keepAwake } from "@/lib/keep-awake";
import { PageCurl, snapshotPage } from "@/lib/page-curl";
import { BOOK_CSS, anchorOffsetBook, bookPages, canShowBook, computeGeo, scrollLeftForOffset, scrollLeftForX, spreadIndex, type BookGeo } from "@/lib/reader-book";
import { bookBgStyle } from "@/lib/book-backgrounds";
import { flipBook } from "@/lib/book-flip";
import { anchorOffset, measureLines, pageTarget, scrollTopForOffset, type Line } from "@/lib/reader-pages";
import { applyHighlights, bookText, findAll, flashRange, fold, offsetsFromRange, rangeFromOffsets, type Folded } from "@/lib/reader-dom";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useIsTouchDevice } from "@/hooks/useDeviceType";
import { useStored } from "@/hooks/useStored";
import { ReaderPanel, type PanelTab, type SearchHit } from "@/components/reader/ReaderPanel";

type Chapter = { id: string; title: string; html: string };
type ReadData = { title: string; chapters: Chapter[] };

const DOUBLE_TAP_MS = 280;
const SWIPE_MIN_X = 40;
const EDGE_PX = 24; // gestos que começam na borda do ecrã ficam para o sistema (ex.: "voltar" do iOS)
const WORDS_PER_MIN = 230;

const READER_CSS = `
.rdr::-webkit-scrollbar { display: none; }
.prose-book a { text-decoration: none !important; color: inherit !important; }
.prose-book img { max-width: 100%; height: auto; display: block; margin: 0.75em auto; border-radius: 4px; }
.prose-book mark.kb-hl { cursor: pointer; }
${BOOK_CSS}`;

async function tryFs(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: (o?: { navigationUI?: string }) => Promise<void> };
  try {
    if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: "hide" }); return true; }
    if (el.webkitRequestFullscreen) { await el.webkitRequestFullscreen({ navigationUI: "hide" }); return true; }
  } catch {}
  return false;
}
function exitFs() {
  try {
    const d = document as Document & { webkitExitFullscreen?: () => void };
    if (!isFsOn()) return;
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
  } catch {}
}
function isFsOn() {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  // app instalada com manifesto "fullscreen": já está em ecrã completo
  return !!(document.fullscreenElement || d.webkitFullscreenElement || window.matchMedia("(display-mode: fullscreen)").matches);
}

function formatMinutes(min: number): string {
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;
}

/** Leitor. `id` = livro da biblioteca (Drive); `localPath` = EPUB guardado no aparelho (leitura offline). */
export function ReaderScreen({ id, localPath }: { id?: string; localPath?: string }) {
  const router = useRouter();
  const touch = useIsTouchDevice();
  const isLocal = localPath !== undefined;
  const bookId = isLocal ? `local:${localPath}` : String(id ?? "");
  const [needGrant, setNeedGrant] = useState(false);
  const [grantTick, setGrantTick] = useState(0);
  const { settings, update } = useReaderSettings();
  const patchSettings = useCallback((p: Partial<ReaderSettings>) => update(p), [update]);

  const [book, setBook] = useState<Book | null>(null);
  const [data, setData] = useState<ReadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookmarksAll, setBookmarksAll] = useStored<Record<string, Bookmark[]>>("kobosync:bookmarks", {}, "bookmarks");
  const [highlightsAll, setHighlightsAll] = useStored<Record<string, Highlight[]>>("kobosync:highlights", {}, "highlights");
  const bookmarks = useMemo(() => bookmarksAll[bookId] ?? [], [bookmarksAll, bookId]);
  const highlights = useMemo(() => highlightsAll[bookId] ?? [], [highlightsAll, bookId]);

  const [showPanel, setShowPanel] = useState(false);
  const [tab, setTab] = useState<PanelTab>("aa");
  const [restored, setRestored] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [slideOut, setSlideOut] = useState(false);
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const curlRef = useRef<PageCurl | null>(null);
  const curlDrag = useRef<{ ignore: boolean; active: boolean; sx: number; sy: number; vx: number; lastX: number; lastT: number; dir: "next" | "prev"; target: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selBar, setSelBar] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null);
  const [hlPop, setHlPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [totalWords, setTotalWords] = useState(0);
  const [pageFrac, setPageFrac] = useState(0.02); // fração do livro que cabe num ecrã

  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [spread, setSpread] = useState({ cur: 0, total: 1 });
  const bookMode = settings.pageAnim === "book" && !touch && canShowBook(vp.w, vp.h);
  const effAnim = settings.pageAnim === "book" && !bookMode ? "curl" : settings.pageAnim;
  const geo = useMemo<BookGeo | null>(() => (bookMode ? computeGeo(vp.w, vp.h, settings.textWidth) : null), [bookMode, vp.w, vp.h, settings.textWidth]);
  const bkRef = useRef<BookGeo | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<{ destroy: () => void } | null>(null);
  const lastWheel = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const skipSave = useRef(false);
  const busy = useRef(false);
  const lastTap = useRef(0);
  const tX = useRef(0);
  const tY = useRef(0);
  const tT = useRef(0);
  const didScroll = useRef(false);
  const bookRef = useRef<Book | null>(null);
  const restoredFor = useRef<string | null>(null);
  const userMoved = useRef(false);
  const autoFs = useRef(false);
  const foldedRef = useRef<Folded | null>(null);
  const chapterStarts = useRef<number[]>([]);
  const linesRef = useRef<Line[] | null>(null);
  const anchorRef = useRef<number | null>(null);
  const textLenRef = useRef(0);

  const getLines = useCallback((): Line[] => {
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root) return [];
    if (!linesRef.current) linesRef.current = measureLines(el, root);
    return linesRef.current;
  }, []);
  /** Nº de duplas do modo Livro; também ajusta a largura rolável para a última dupla ser alcançável. */
  const pagesOf = useCallback((root: HTMLElement, g: BookGeo) => {
    const p = bookPages(root, g);
    if (spacerRef.current) spacerRef.current.style.left = `${p.spreads * g.W - 1}px`;
    return p;
  }, []);
  const scrollPos = useCallback((el: HTMLElement) => (bkRef.current ? el.scrollLeft : el.scrollTop), []);
  const scrollMax = useCallback((el: HTMLElement): number => {
    const g = bkRef.current;
    const root = contentRef.current;
    if (g && root) return (pagesOf(root, g).spreads - 1) * g.W;
    return el.scrollHeight - el.clientHeight;
  }, [pagesOf]);
  const setPos = useCallback((el: HTMLElement, v: number) => {
    const g = bkRef.current;
    if (g) el.scrollLeft = Math.round(Math.max(0, v) / g.W) * g.W;
    else el.scrollTo({ top: Math.max(0, v), behavior: "auto" });
  }, []);
  const locate = useCallback((el: HTMLElement, root: HTMLElement, offset: number): number | null => {
    const g = bkRef.current;
    return g ? scrollLeftForOffset(el, root, g, offset) : scrollTopForOffset(el, root, offset);
  }, []);
  const captureAnchor = useCallback((): { offset: number; textLen: number } | null => {
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root) return null;
    const g = bkRef.current;
    const off = g ? anchorOffsetBook(el, root, g) : anchorOffset(el, root, getLines());
    if (off === null) return null;
    anchorRef.current = off;
    return { offset: off, textLen: textLenRef.current };
  }, [getLines]);

  const chapterTitles = useMemo(() => (data ? data.chapters.map((c) => c.title) : []), [data]);
  const fullHtml = useMemo(() => (data ? combineChapters(data.chapters) : ""), [data]);
  const T = THEMES[settings.theme];

  useEffect(() => { autoFs.current = settings.autoFullscreen && touch; }, [settings.autoFullscreen, touch]); // no PC nunca abre sozinho em ecrã completo
  useEffect(() => { bookRef.current = book; }, [book]);

  useEffect(() => {
    const s = document.createElement("style");
    s.id = "rdr-css"; s.textContent = READER_CSS;
    document.head.appendChild(s);
    return () => { document.getElementById("rdr-css")?.remove(); };
  }, []);

  // Regista pesquisas feitas dentro do livro
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 3) return;
    const t = setTimeout(() => {
      if (!isLocal) fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: term, scope: "reader", bookId, title: bookRef.current?.title ?? "" }), keepalive: true }).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [searchTerm, bookId, isLocal]);

  // Não deixa o ecrã apagar nem escurecer enquanto se lê
  useEffect(() => keepAwake(), []);

  useEffect(() => {
    const fn = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    fn();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Sincroniza posição/anotações com a nuvem também a partir do leitor
  useEffect(() => { import("@/lib/cloud-sync").then((m) => m.startCloudSync()); }, []);
  // Leitura de livros da biblioteca offline (não passa pelo servidor, por isso comunica-se aqui)
  useEffect(() => {
    if (isLocal && book && data) import("@/lib/report-activity").then((m) => m.reportActivity("read_offline", { bookId, title: book.title }));
  }, [isLocal, book, data, bookId]);

  useEffect(() => {
    const fn = () => setIsFs(isFsOn());
    document.addEventListener("fullscreenchange", fn);
    document.addEventListener("webkitfullscreenchange", fn);
    return () => { document.removeEventListener("fullscreenchange", fn); document.removeEventListener("webkitfullscreenchange", fn); };
  }, []);

  // ── Carregar livro ──
  useEffect(() => {
    if (!bookId) return;
    const ctrl = new AbortController();
    setLoading(true);
    setNeedGrant(false);
    let revoke: (() => void) | null = null;
    (async () => {
      if (isLocal) {
        try {
          const L = await import("@/lib/local-library");
          const st = await L.getBackend(grantTick > 0);
          if (st.status === "needs-permission") { setNeedGrant(true); setLoading(false); return; }
          if (st.status === "unsupported") throw new Error("Este browser não permite guardar livros no aparelho.");
          const file = await L.readLocal(st.backend, localPath as string);
          const { openEpub } = await import("@/lib/epub-client");
          const lb = await openEpub(file);
          if (ctrl.signal.aborted) { lb.revoke(); return; }
          revoke = lb.revoke;
          setBook({ id: bookId, drive_file_id: null, title: lb.title, author: lb.author, series: null, series_index: null, language: lb.language, publisher: null, isbn: null, description: null, cover_url: null, epub_url: null, filesize: file.size, modified_at: null, created_at: null, updated_at: null });
          setData({ title: lb.title, chapters: lb.chapters });
        } catch (e) {
          if (!ctrl.signal.aborted) setError(e instanceof Error ? (e.name === "NotFoundError" ? "Este livro já não está na pasta." : e.message) : "Erro desconhecido");
        } finally { if (!ctrl.signal.aborted) setLoading(false); }
        return;
      }
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
        setError(e instanceof Error ? e.message : "Erro desconhecido");
      } finally { setLoading(false); }
    })();
    return () => { ctrl.abort(); revoke?.(); };
  }, [bookId, isLocal, localPath, grantTick]);

  // O HTML do livro é injetado à mão (e não por dangerouslySetInnerHTML) para o React
  // nunca o repor e apagar os destaques que acrescentamos ao DOM.
  const ready = !loading && !!data && !!book && !error;
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (root && ready) root.innerHTML = fullHtml;
  }, [fullHtml, ready]);

  // ── Ecrã completo ao primeiro toque (se ativo nas definições) ──
  useEffect(() => {
    const go = () => {
      if (!autoFs.current) return;
      autoFs.current = false;
      if (!isFsOn()) tryFs().then((ok) => { if (ok) setIsFs(true); });
    };
    window.addEventListener("pointerup", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => { window.removeEventListener("pointerup", go); window.removeEventListener("keydown", go); };
  }, []);

  // ── Preparar texto: início dos capítulos, nº de palavras ──
  useEffect(() => {
    const root = contentRef.current;
    if (!data || !root) return;
    const starts: number[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const sec = (n.parentElement as HTMLElement | null)?.closest("section[data-ch]");
      const idx = sec ? Number(sec.getAttribute("data-ch")) : -1;
      if (idx >= 0 && starts[idx] === undefined) starts[idx] = pos;
      pos += (n as Text).data.length;
    }
    chapterStarts.current = starts;
    foldedRef.current = null;
    textLenRef.current = bookText(root).length;
    linesRef.current = null;
    setTotalWords((bookText(root).match(/\S+/g) ?? []).length);
  }, [data]);

  // ── Aplicar destaques guardados ──
  useEffect(() => {
    const root = contentRef.current;
    if (root && data) applyHighlights(root, highlights);
  }, [data, highlights]);

  // ── Restaurar posição ──
  useEffect(() => {
    if (!data || restoredFor.current === bookId) return;
    const el = scrollRef.current;
    if (!el) return;
    restoredFor.current = bookId;

    const saved = loadPosition(bookId);
    if (!saved || (saved.ratio !== null && saved.ratio >= FINISHED_RATIO)) return; // livro terminado: recomeça

    const apply = () => {
      const max = scrollMax(el);
      linesRef.current = null;
      const root = contentRef.current;
      const sameText = saved.offset !== undefined && (!saved.textLen || Math.abs(saved.textLen - textLenRef.current) < 2);
      const byOffset = sameText && root ? locate(el, root, saved.offset as number) : null;
      if (byOffset !== null) anchorRef.current = saved.offset as number;
      const top = byOffset ?? (saved.ratio !== null && max > 0 ? Math.round(saved.ratio * max) : bkRef.current ? 0 : saved.scrollTop);
      const before = scrollPos(el);
      skipSave.current = true;
      setPos(el, top);
      if (Math.abs(scrollPos(el) - before) < 1) skipSave.current = false; // não houve deslocação → não haverá evento de scroll a "gastar" a marca
    };
    apply();
    setRestored(true);
    const timers = [150, 600, 1500].map((ms) => window.setTimeout(() => { if (!userMoved.current) apply(); }, ms));
    return () => timers.forEach(clearTimeout);
  }, [data, bookId, scrollMax, locate, setPos, scrollPos]);

  // Garante que o livro aparece em "Leitura" assim que se conhecem os seus dados
  useEffect(() => {
    if (book && data) ensureListed(bookId, { title: book.title, author: book.author, cover_url: book.cover_url });
  }, [book, data, bookId]);

  // ── Capítulo atual (a partir das secções) ──
  const currentChapterFromDom = useCallback((): number => {
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root) return 0;
    const g = bkRef.current;
    const er = el.getBoundingClientRect();
    let idx = 0;
    root.querySelectorAll("section[data-ch]").forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (g ? r.left <= er.left + g.PW - 2 : r.top <= er.top + 80) idx = i;
    });
    return idx;
  }, []);

  // ── Progresso + guardar ──
  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let anchorT: ReturnType<typeof setTimeout> | null = null;

    const persist = () => savePosition(bookId, bookRef.current, scrollPos(el), scrollMax(el), captureAnchor());
    const onScroll = () => {
      const g = bkRef.current;
      const root = contentRef.current;
      const max = scrollMax(el);
      if (max > 0) setProgress(Math.round((scrollPos(el) / max) * 100));
      if (g && root) {
        const total = pagesOf(root, g).spreads;
        setPageFrac(1 / total);
        setSpread({ cur: spreadIndex(el, g), total });
      } else if (el.scrollHeight > 0) setPageFrac(el.clientHeight / el.scrollHeight);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setChapterIdx(currentChapterFromDom()));
      if (anchorT) clearTimeout(anchorT);
      anchorT = setTimeout(() => {
        anchorT = null;
        const g2 = bkRef.current;
        if (g2 && !busy.current && el.scrollLeft % g2.W !== 0) { el.scrollLeft = Math.round(el.scrollLeft / g2.W) * g2.W; return; } // rolagem acidental (seleção de texto)
        if (!skipSave.current) captureAnchor();
      }, 100);
      if (skipSave.current) { skipSave.current = false; return; }
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; persist(); }, 500);
    };
    const flush = () => { if (t) { clearTimeout(t); t = null; persist(); } };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    const onUserInput = () => { userMoved.current = true; };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onUserInput, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onUserInput);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      if (anchorT) clearTimeout(anchorT);
      flush();
    };
  }, [data, bookId, currentChapterFromDom, captureAnchor, scrollMax, scrollPos, pagesOf]);

  const saveAndClose = useCallback(() => {
    const el = scrollRef.current;
    if (el && restoredFor.current === bookId) savePosition(bookId, bookRef.current, scrollPos(el), scrollMax(el), captureAnchor());
    exitFs();
    // O livro abre muitas vezes num separador novo: sem histórico, vai direto à biblioteca
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else router.push(isLocal ? "/offline" : "/");
  }, [bookId, isLocal, router, captureAnchor, scrollPos, scrollMax]);

  const toggleFs = useCallback(() => {
    if (isFsOn()) exitFs();
    else tryFs().then((ok) => { if (ok) setIsFs(true); });
  }, []);

  // ── Navegação por página ──
  const calcStep = useCallback((el: HTMLDivElement, dir: "next" | "prev"): number => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    return pageTarget(getLines(), el.scrollTop, el.clientHeight, max, dir) - el.scrollTop;
  }, [getLines]);

  // ── Re-ancorar quando o layout muda (rodar ecrã, redimensionar, fonte, largura, imagens) ──
  const reanchor = useCallback(() => {
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root || restoredFor.current !== bookId || anchorRef.current === null) return;
    const g = bkRef.current;
    if (g) pagesOf(root, g);
    const y = locate(el, root, anchorRef.current);
    if (y !== null && Math.abs(y - scrollPos(el)) > 1) { skipSave.current = true; setPos(el, y); }
  }, [bookId, pagesOf, locate, scrollPos, setPos]);

  // Mudou o modo/geometria/tipo de letra: volta já à mesma passagem (antes de pintar)
  useLayoutEffect(() => {
    bkRef.current = geo;
    linesRef.current = null;
    flipRef.current?.destroy(); flipRef.current = null; busy.current = false;
    reanchor();
  }, [geo, settings.fontSize, settings.fontFamily, settings.lineSpacing, settings.textWidth, reanchor]);

  useEffect(() => {
    if (!data) return;
    const el = scrollRef.current;
    const root = contentRef.current;
    if (!el || !root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const relayout = () => {
      linesRef.current = null;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; reanchor(); }, 120);
    };
    const ro = new ResizeObserver(relayout);
    ro.observe(el);
    ro.observe(root);
    root.addEventListener("load", relayout, true);
    return () => { ro.disconnect(); root.removeEventListener("load", relayout, true); if (timer) clearTimeout(timer); };
  }, [data, reanchor]);

  const makeCurl = useCallback((dir: "next" | "prev", startY: number, targetTop: number): PageCurl | null => {
    const el = scrollRef.current;
    const root = contentRef.current;
    const host = el?.parentElement;
    if (!el || !root || !host) return null;
    const theme = { bg: T.page, text: T.text, bgImage: T.eink ? getComputedStyle(el).backgroundImage : undefined };
    const under = snapshotPage(el, root, Math.max(0, targetTop), theme);
    const sheet = snapshotPage(el, root, el.scrollTop, theme);
    curlRef.current?.destroy();
    const c = new PageCurl(host, { left: el.offsetLeft, top: el.offsetTop, W: el.clientWidth, H: el.clientHeight }, under, sheet, dir, startY, theme);
    curlRef.current = c;
    return c;
  }, [T]);

  const finishCurl = useCallback((c: PageCurl, target: number) => {
    const el = scrollRef.current;
    if (el) { skipSave.current = false; el.scrollTo({ top: target, behavior: "auto" }); }
    // deixa o browser pintar a página nova antes de retirar a folha
    requestAnimationFrame(() => requestAnimationFrame(() => {
      c.destroy();
      if (curlRef.current === c) curlRef.current = null;
      busy.current = false;
    }));
  }, []);

  useEffect(() => () => { curlRef.current?.destroy(); }, []);

  const navigate = useCallback((dir: "next" | "prev") => {
    userMoved.current = true;
    if (busy.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const g = bkRef.current;
    const root = contentRef.current;
    if (g && root) {
      const total = pagesOf(root, g).spreads;
      const from = spreadIndex(el, g);
      const to = from + (dir === "next" ? 1 : -1);
      if (to < 0 || to >= total) return;
      const jump = () => { skipSave.current = false; el.scrollLeft = to * g.W; };
      const stage = stageRef.current;
      if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { jump(); return; }
      const f = flipBook({ el, root, stage, geo: g, theme: { bg: T.page, text: T.text, accent: T.accent, bgImage: T.eink ? getComputedStyle(el).backgroundImage : undefined }, from, to, textLen: textLenRef.current, maxSpread: total - 1 });
      if (!f.ready) { f.destroy(); jump(); return; }
      busy.current = true;
      flipRef.current = f;
      f.run().then(() => {
        if (flipRef.current !== f) return;
        jump();
        // deixa o browser pintar a dupla nova antes de retirar a folha
        requestAnimationFrame(() => requestAnimationFrame(() => { f.destroy(); if (flipRef.current === f) { flipRef.current = null; busy.current = false; } }));
      });
      return;
    }
    const step = calcStep(el, dir);
    const anim = effAnim;

    if (anim === "curl" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (Math.abs(step) < 2) return;
      const c = makeCurl(dir, el.clientHeight, el.scrollTop + step);
      if (!c) { el.scrollBy({ top: step, behavior: "auto" }); return; }
      busy.current = true;
      const target = Math.max(0, el.scrollTop + step);
      c.autoFlip().then(() => finishCurl(c, target));
      return;
    }
    if (anim === "curl") { el.scrollBy({ top: step, behavior: "auto" }); return; }
    if (anim === "slide") {
      busy.current = true;
      setSlideDir(dir);
      setSlideOut(true);
      setTimeout(() => { el.scrollBy({ top: step, behavior: "auto" }); setSlideOut(false); busy.current = false; }, 220);
      return;
    }
    if (anim === "none") el.scrollBy({ top: step, behavior: "auto" });
    else el.scrollTo({ top: el.scrollTop + step, behavior: "smooth" });
  }, [effAnim, calcStep, makeCurl, finishCurl, pagesOf, T]);

  const scrollToY = useCallback((y: number) => {
    userMoved.current = true;
    const el = scrollRef.current;
    if (!el) return;
    if (bkRef.current) { el.scrollLeft = Math.min(Math.max(0, y), scrollMax(el)); el.scrollLeft = Math.round(el.scrollLeft / bkRef.current.W) * bkRef.current.W; }
    else el.scrollTo({ top: Math.max(0, y), behavior: "auto" });
  }, [scrollMax]);

  const goToOffset = useCallback((start: number, end: number) => {
    const root = contentRef.current;
    const el = scrollRef.current;
    if (!root || !el) return;
    const r = rangeFromOffsets(root, start, end);
    if (!r) return;
    const g = bkRef.current;
    if (g) {
      const rect = r.getClientRects()[0] ?? r.getBoundingClientRect();
      scrollToY(scrollLeftForX(el, g, rect.left));
    } else scrollToY(r.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 90);
    flashRange(root, start, end);
    setShowPanel(false);
  }, [scrollToY]);

  const goToChapter = useCallback((i: number) => {
    const el = scrollRef.current;
    const sec = contentRef.current?.querySelector(`section[data-ch="${i}"]`) as HTMLElement | null;
    if (!el || !sec) return;
    const g = bkRef.current;
    if (g) scrollToY(scrollLeftForX(el, g, (sec.getClientRects()[0] ?? sec.getBoundingClientRect()).left));
    else scrollToY(sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 8);
    setShowPanel(false);
  }, [scrollToY]);

  // ── Marcadores ──
  const currentRatio = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const max = scrollMax(el);
    return max > 0 ? scrollPos(el) / max : 0;
  };
  const bookmarkHere = bookmarks.find((b) => Math.abs(b.ratio - progress / 100) < Math.max(0.004, pageFrac * 0.8));

  function toggleBookmark() {
    if (bookmarkHere) {
      setBookmarksAll((cur) => ({ ...cur, [bookId]: (cur[bookId] ?? []).filter((b) => b.id !== bookmarkHere.id) }));
      return;
    }
    const ratio = currentRatio();
    const ch = chapterTitles[chapterIdx] || `Capítulo ${chapterIdx + 1}`;
    const mark: Bookmark = { id: newId(), ratio, label: ch, createdAt: Date.now() };
    setBookmarksAll((cur) => ({ ...cur, [bookId]: [...(cur[bookId] ?? []), mark] }));
  }
  const toggleBookmarkRef = useRef(toggleBookmark);
  useEffect(() => { toggleBookmarkRef.current = toggleBookmark; }); // o atalho de teclado usa sempre a versão mais recente
  const goToBookmark = (b: Bookmark) => {
    const el = scrollRef.current;
    if (el) scrollToY(b.ratio * scrollMax(el));
    setShowPanel(false);
  };

  // ── Destaques ──
  function addHighlight(color: HlColor) {
    if (!selBar) return;
    const h: Highlight = { id: newId(), start: selBar.start, end: selBar.end, text: selBar.text.slice(0, 280), color, createdAt: Date.now() };
    setHighlightsAll((cur) => ({ ...cur, [bookId]: [...(cur[bookId] ?? []), h] }));
    window.getSelection()?.removeAllRanges();
    setSelBar(null);
  }
  const patchHighlight = (id: string, patch: Partial<Highlight>) =>
    setHighlightsAll((cur) => ({ ...cur, [bookId]: (cur[bookId] ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  const deleteHighlight = (id: string) => {
    setHighlightsAll((cur) => ({ ...cur, [bookId]: (cur[bookId] ?? []).filter((h) => h.id !== id) }));
    setHlPop(null);
  };

  // Barra de seleção: aparece quando há texto selecionado no livro
  useEffect(() => {
    let timer: number | undefined;
    const onSel = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const root = contentRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) { setSelBar(null); return; }
        const range = sel.getRangeAt(0);
        const off = offsetsFromRange(root, range);
        if (!off) { setSelBar(null); return; }
        const rect = range.getBoundingClientRect();
        const y = touch ? rect.bottom + 14 : Math.max(8, rect.top - 52);
        setSelBar({ x: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130), y, start: off.start, end: off.end, text: sel.toString().replace(/\s+/g, " ").trim() });
        setHlPop(null);
      }, 200);
    };
    document.addEventListener("selectionchange", onSel);
    return () => { document.removeEventListener("selectionchange", onSel); window.clearTimeout(timer); };
  }, [touch]);

  // Clique num destaque existente → pequeno menu
  const onContentClick = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest("mark.kb-hl") as HTMLElement | null;
    if (mark && window.getSelection()?.isCollapsed !== false) {
      const r = mark.getBoundingClientRect();
      setHlPop({ id: mark.getAttribute("data-hl") ?? "", x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: touch ? r.bottom + 12 : Math.max(8, r.top - 56) });
    } else setHlPop(null);
  };

  // ── Pesquisa no livro ──
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) { setHits([]); return; }
    const t = window.setTimeout(() => {
      const root = contentRef.current;
      if (!root) return;
      const text = bookText(root);
      if (!foldedRef.current) foldedRef.current = fold(text);
      const found = findAll(foldedRef.current, term, 200);
      const starts = chapterStarts.current;
      setHits(found.map((h) => {
        let ch = 0;
        for (let i = 0; i < starts.length; i++) if (starts[i] !== undefined && starts[i] <= h.start) ch = i;
        const a = Math.max(0, h.start - 35);
        return {
          ...h,
          chapter: chapterTitles[ch] || `Capítulo ${ch + 1}`,
          snippet: `${a > 0 ? "…" : ""}${text.slice(a, h.end + 45).replace(/\s+/g, " ")}…`,
        };
      }));
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchTerm, chapterTitles]);

  const openPanel = useCallback((t?: PanelTab) => { if (t) setTab(t); setShowPanel(true); }, []);

  // ── Teclado ──
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") { if (e.key === "Escape") (el as HTMLInputElement).blur(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "Escape":
          if (hlPop || selBar) { setHlPop(null); setSelBar(null); window.getSelection()?.removeAllRanges(); }
          else if (showPanel) setShowPanel(false);
          else saveAndClose();
          return;
        case "ArrowRight": case "ArrowDown": case "PageDown": e.preventDefault(); navigate("next"); return;
        case "ArrowLeft": case "ArrowUp": case "PageUp": e.preventDefault(); navigate("prev"); return;
        case " ": e.preventDefault(); navigate(e.shiftKey ? "prev" : "next"); return;
        case "Home": e.preventDefault(); scrollToY(0); return;
        case "End": e.preventDefault(); scrollToY(1e9); return;
        case "f": case "F": toggleFs(); return;
        case "t": case "T": e.preventDefault(); showPanel && tab === "toc" ? setShowPanel(false) : openPanel("toc"); return;
        case "b": case "B": toggleBookmarkRef.current(); return;
        case "h": case "H": openPanel("highlights"); return;
        case "/": case "s": case "S": e.preventDefault(); openPanel("search"); return;
        case "a": case "A": openPanel("aa"); return;
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
     
  }, [saveAndClose, navigate, toggleFs, showPanel, tab, hlPop, selBar, openPanel, scrollToY]);

  // ── Toque ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    tX.current = t.clientX; tY.current = t.clientY; tT.current = Date.now();
    didScroll.current = false; userMoved.current = true;
    curlDrag.current = { ignore: busy.current || e.touches.length > 1, active: false, sx: t.clientX, sy: t.clientY, vx: 0, lastX: t.clientX, lastT: Date.now(), dir: "next", target: 0 };
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (Math.abs(t.clientY - tY.current) > 8) didScroll.current = true;
    const g = curlDrag.current;
    const el = scrollRef.current;
    if (!g || g.ignore || !el || effAnim !== "curl") return;
    const dx = t.clientX - g.sx;
    const dy = t.clientY - g.sy;
    if (!g.active) {
      if (window.getSelection()?.toString()) { g.ignore = true; return; }
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g.ignore = true; return; } // rolar na vertical
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const dir = dx < 0 ? "next" : "prev";
      if (dir === "prev" && g.sx < 16) { g.ignore = true; return; } // gesto "voltar" do sistema
      const step = calcStep(el, dir);
      if (Math.abs(step) < 2) { g.ignore = true; return; } // início/fim do livro
      const c = makeCurl(dir, g.sy, el.scrollTop + step);
      if (!c) { g.ignore = true; return; }
      g.active = true; g.dir = dir; g.target = Math.max(0, el.scrollTop + step);
      busy.current = true;
      didScroll.current = true;
    }
    const now = Date.now();
    const dt = Math.max(1, now - g.lastT);
    g.vx = 0.7 * g.vx + 0.3 * ((t.clientX - g.lastX) / dt);
    g.lastX = t.clientX; g.lastT = now;
    curlRef.current?.set(dx, dy);
  }, [effAnim, calcStep, makeCurl]);
  const endCurlDrag = useCallback((cancel: boolean) => {
    const g = curlDrag.current;
    const c = curlRef.current;
    if (!g?.active || !c) return false;
    g.active = false;
    const flick = g.dir === "next" ? g.vx < -0.45 : g.vx > 0.45;
    const back = g.dir === "next" ? g.vx > 0.45 : g.vx < -0.45;
    const commit = !cancel && !back && (c.progress > 0.3 || flick);
    c.release(commit).then((ok) => { if (ok) finishCurl(c, g.target); else { c.destroy(); if (curlRef.current === c) curlRef.current = null; busy.current = false; } });
    return true;
  }, [finishCurl]);
  const onTouchCancel = useCallback(() => { endCurlDrag(true); }, [endCurlDrag]);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (endCurlDrag(false)) { e.preventDefault(); return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - tX.current;
    const dy = t.clientY - tY.current;
    const dt = Date.now() - tT.current;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const W = window.innerWidth, H = window.innerHeight;

    if (window.getSelection()?.toString()) return; // há texto selecionado: não vira página
    if ((e.target as HTMLElement).closest("mark.kb-hl")) return; // toque num destaque: tratado no clique
    if (adx > SWIPE_MIN_X && adx > ady * 2 && dt < 400) {
      if (tX.current < EDGE_PX || tX.current > W - EDGE_PX) return; // borda do ecrã: gesto do sistema
      e.preventDefault();
      navigate(dx < 0 ? "next" : "prev");
      return;
    }
    if (didScroll.current) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) { e.preventDefault(); setShowPanel((v) => !v); lastTap.current = 0; return; }
    lastTap.current = now;
    if (ady > 10) return;
    if (t.clientY < 72 || t.clientY > H - 56) return;
    if (t.clientX < W * 0.25) navigate("prev");
    else if (t.clientX > W * 0.75) navigate("next");
    else setShowPanel(true);
  }, [navigate, endCurlDrag]);

  // Clique no rato (PC): margens laterais viram a página; centro não faz nada
  const onMouseUp = (e: React.MouseEvent) => {
    if (touch || e.button !== 0) return;
    if (window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest("mark.kb-hl, a, button")) return;
    const g = bkRef.current;
    const st = stageRef.current;
    if (g && st) {
      const r = st.getBoundingClientRect();
      if (e.clientX < r.left + g.PW * 0.2) navigate("prev");
      else if (e.clientX > r.right - g.PW * 0.2) navigate("next");
      return;
    }
    const W = window.innerWidth;
    if (e.clientX < W * 0.12) navigate("prev");
    else if (e.clientX > W * 0.88) navigate("next");
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!bkRef.current) return;
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const now = Date.now();
    if (Math.abs(d) < 25 || now - lastWheel.current < 700) return;
    lastWheel.current = now;
    navigate(d > 0 ? "next" : "prev");
  };

  const slideStyle = useMemo((): React.CSSProperties => {
    if (settings.pageAnim !== "slide") return {};
    if (slideOut) return { opacity: 0, transform: `translateX(${slideDir === "next" ? "-5%" : "5%"})`, transition: "opacity 200ms ease, transform 200ms ease", willChange: "opacity, transform" };
    return { opacity: 1, transform: "translateX(0)", transition: "none" };
  }, [settings.pageAnim, slideOut, slideDir]);

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
  if (needGrant) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6" style={{ backgroundColor: T.bg }}>
        <div className="max-w-sm text-center">
          <BookOpen size={40} strokeWidth={1.4} color={T.accent} className="mx-auto mb-4" />
          <h1 className="text-xl font-bold" style={{ color: T.text }}>Permitir acesso à pasta</h1>
          <p className="mt-2 text-sm" style={{ color: T.accent }}>O browser pede que confirmes o acesso à pasta dos teus livros para os poderes ler.</p>
          <button onClick={() => setGrantTick((n) => n + 1)} className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold" style={{ backgroundColor: T.text, color: T.page }}>Permitir acesso</button>
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
          <button onClick={() => router.back()} className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold" style={{ backgroundColor: T.text, color: T.page }}>
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </div>
    );
  }

  const family = FONT_FAMILIES.find((f) => f.id === settings.fontFamily)?.css;
  const width = TEXT_WIDTH[settings.textWidth];
  const remainingMin = totalWords > 0 ? ((100 - progress) / 100) * (totalWords / WORDS_PER_MIN) : null;
  const onDarkBg = bookMode && (settings.bookBg === "wood" || settings.bookBg === "dark" || settings.bookBg === "felt");
  const ctlStyle: React.CSSProperties = onDarkBg ? { backgroundColor: "rgba(0,0,0,.38)", color: "#fff" } : { backgroundColor: `${T.accent}22`, color: T.text };
  const footColor = bookMode && (settings.bookBg === "wood" || settings.bookBg === "dark" || settings.bookBg === "felt") ? "#ffffffcc" : bookMode && settings.bookBg === "marble" ? "#3a3a40" : T.accent;
  const chapterLabel = chapterTitles[chapterIdx] || (chapterTitles.length > 1 ? `Capítulo ${chapterIdx + 1}` : "");

  const popColor = (c: HlColor) => (
    <button key={c} aria-label={HL_COLORS[c].label} onClick={() => (hlPop ? patchHighlight(hlPop.id, { color: c }) : addHighlight(c))}
      className="h-7 w-7 rounded-full border-2 border-white/70" style={{ backgroundColor: HL_COLORS[c].dot }} />
  );
  const floatBar = "fixed z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-900 px-3 py-2 text-white shadow-2xl";
  const hl = hlPop ? highlights.find((h) => h.id === hlPop.id) : null;

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none" style={{ backgroundColor: T.bg }}>
      {/* barra de progresso */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]" style={{ backgroundColor: `${T.accent}22` }}>
        <motion.div className="h-full" style={{ backgroundColor: T.accent }} animate={{ width: `${progress}%` }} transition={{ duration: 0.3, ease: "linear" }} />
      </div>

      {/* escurecer ecrã */}
      {settings.dim > 0 && <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] bg-black" style={{ opacity: settings.dim / 100 }} />}

      {/* PC: botão discreto para abrir o painel */}
      {!touch && (
        <div className="fixed right-4 top-3 z-40 flex gap-1.5 opacity-70 transition hover:opacity-100">
          <button onClick={toggleBookmark} aria-label={bookmarkHere ? "Remover marcador" : "Marcar página"} className="flex h-9 w-9 items-center justify-center rounded-full" style={ctlStyle}>
            <BookmarkIcon size={16} fill={bookmarkHere ? "currentColor" : "none"} />
          </button>
          <button onClick={toggleFs} aria-label={isFs ? "Sair do ecrã completo" : "Ecrã completo"} title={isFs ? "Sair do ecrã completo (F)" : "Ecrã completo (F)"} className="flex h-9 w-9 items-center justify-center rounded-full" style={ctlStyle}>
            {isFs ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button onClick={() => openPanel()} aria-label="Abrir painel de leitura" className="flex h-9 w-9 items-center justify-center rounded-full" style={ctlStyle}>
            <Menu size={16} />
          </button>
          <button onClick={saveAndClose} aria-label="Voltar à biblioteca" className="flex h-9 w-9 items-center justify-center rounded-full" style={ctlStyle}>
            <ArrowLeft size={16} />
          </button>
        </div>
      )}

      <ReaderPanel
        open={showPanel} onClose={() => setShowPanel(false)} touch={touch} canBook={!touch && canShowBook(vp.w, vp.h)} tab={tab} onTab={setTab}
        settings={settings} onSettings={patchSettings} isFs={isFs} onToggleFs={toggleFs}
        chapters={chapterTitles} currentChapter={chapterIdx} onGoChapter={goToChapter}
        bookmarks={bookmarks} bookmarkedHere={!!bookmarkHere} onToggleBookmark={toggleBookmark} onGoBookmark={goToBookmark}
        onDeleteBookmark={(id) => setBookmarksAll((cur) => ({ ...cur, [bookId]: (cur[bookId] ?? []).filter((b) => b.id !== id) }))}
        highlights={highlights}
        onGoHighlight={(h) => goToOffset(h.start, h.end)} onDeleteHighlight={deleteHighlight}
        searchTerm={searchTerm} onSearchTerm={setSearchTerm} hits={hits} onGoHit={(h) => goToOffset(h.start, h.end)}
        progress={progress} onShelve={saveAndClose} onClearPosition={() => { clearPosition(bookId); setRestored(false); }}
      />

      {/* texto selecionado → escolher cor */}
      {selBar && (
        <div className={floatBar} style={{ left: selBar.x, top: selBar.y }} role="toolbar" aria-label="Destacar texto" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
          {(Object.keys(HL_COLORS) as HlColor[]).map((c) => popColor(c))}
          <button aria-label="Copiar" className="ml-1 flex h-7 w-7 items-center justify-center" onClick={() => { navigator.clipboard?.writeText(selBar.text).catch(() => {}); window.getSelection()?.removeAllRanges(); setSelBar(null); }}>
            <Copy size={15} />
          </button>
        </div>
      )}
      {/* destaque existente → mudar cor, nota, remover */}
      {hlPop && hl && (
        <div className={floatBar} style={{ left: hlPop.x, top: hlPop.y }} role="toolbar" aria-label="Editar destaque" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
          {(Object.keys(HL_COLORS) as HlColor[]).map((c) => popColor(c))}
          <button className="px-1 text-xs font-bold" onClick={() => { const n = window.prompt("Nota:", hl.note ?? ""); if (n !== null) patchHighlight(hl.id, { note: n.trim() || undefined }); setHlPop(null); }}>
            Nota
          </button>
          <button aria-label="Remover destaque" className="flex h-7 w-7 items-center justify-center" onClick={() => deleteHighlight(hl.id)}><Trash2 size={15} /></button>
        </div>
      )}

      {/* texto */}
      <div className={bookMode ? "flex h-full w-full items-center justify-center" : "h-full w-full"} style={bookMode ? bookBgStyle(settings.bookBg, T.bg) : undefined} onMouseUp={onMouseUp}>
        <div
          ref={stageRef}
          className="relative"
          style={bookMode && geo
            ? { width: geo.W, height: geo.PH, borderRadius: 6, boxShadow: `0 24px 60px rgba(0,0,0,.38), 0 0 0 7px ${T.accent}30, 0 0 0 8px ${T.accent}18` }
            : { width: "100%", height: "100%" }}
        >
          <div
            ref={scrollRef}
            className={`rdr prose-book relative ${bookMode ? "kb-book overflow-hidden" : "h-full w-full overflow-y-auto overscroll-none"}`}
            style={{
              backgroundColor: T.page, color: T.text,
              ...(bookMode && geo
                ? { width: geo.W, height: geo.PH, borderRadius: 6 }
                : {
                    paddingTop: isFs ? "calc(2.5rem + env(safe-area-inset-top, 0px))" : "2.5rem",
                    paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
                    paddingLeft: width.pad, paddingRight: width.pad,
                  }),
              scrollbarWidth: "none", WebkitOverflowScrolling: "touch", touchAction: effAnim === "curl" ? "pan-y" : undefined,
              ...(T.eink ? { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='%23cccccc' opacity='0.18'/%3E%3C/svg%3E\")" } : {}),
            } as React.CSSProperties}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}
            onWheel={onWheel} onClick={onContentClick}
          >
            <div style={slideStyle}>
              <div
                ref={contentRef}
                className={`select-text ${bookMode ? "kb-text" : ""}`}
                style={{
                  ...(bookMode && geo
                    ? { columnCount: 2, columnGap: geo.G, columnFill: "auto", height: geo.TH, width: 2 * geo.TW + geo.G, margin: `${geo.padTop}px ${geo.padX}px 0`, ["--kb-th" as string]: `${geo.TH}px` }
                    : { maxWidth: `${width.ch}ch`, margin: "0 auto" }),
                  fontSize: FONT_PX[settings.fontSize], lineHeight: LINE_SPACING[settings.lineSpacing].factor, fontFamily: family,
                  ...(T.eink ? ({ fontWeight: 500, textRendering: "geometricPrecision" } as React.CSSProperties) : {}),
                }}
              />
              {!bookMode && (
                <div className="mx-auto mt-24 flex max-w-[65ch] flex-col items-center gap-3 border-t py-16" style={{ borderColor: `${T.accent}25` }}>
                  <BookOpen size={24} strokeWidth={1.4} color={T.accent} />
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.accent }}>Fim</p>
                  {restored && <p className="text-[10px]" style={{ color: T.accent }}>Posição restaurada</p>}
                </div>
              )}
            </div>
            {bookMode && <div ref={spacerRef} aria-hidden className="pointer-events-none absolute top-0 h-px w-px" style={{ left: 0 }} />}
          </div>
          {bookMode && geo && (
            <>
              {/* lombada */}
              <div aria-hidden className="pointer-events-none absolute inset-y-0 z-10" style={{ left: geo.PW - 20, width: 40, background: "linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,.16) 46%, rgba(0,0,0,.30) 50%, rgba(0,0,0,.16) 54%, rgba(0,0,0,0))" }} />
              {/* números de página */}
              <span aria-hidden className="pointer-events-none absolute z-10 text-[11px] tabular-nums opacity-70" style={{ left: 0, width: geo.PW, textAlign: "center", bottom: Math.round(geo.padBottom * 0.38), color: T.accent }}>{spread.cur * 2 + 1}</span>
              <span aria-hidden className="pointer-events-none absolute z-10 text-[11px] tabular-nums opacity-70" style={{ left: geo.PW, width: geo.PW, textAlign: "center", bottom: Math.round(geo.padBottom * 0.38), color: T.accent }}>{spread.cur * 2 + 2}</span>
            </>
          )}
        </div>
      </div>

      {/* rodapé: capítulo, tempo restante, progresso */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 px-4"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))", paddingTop: "1.5rem", background: bookMode ? "none" : `linear-gradient(to top, ${T.bg}cc 40%, ${T.bg}00 100%)` }}
      >
        <span className="min-w-0 truncate text-[10px] font-medium opacity-70" style={{ color: footColor }}>{chapterLabel || book.author || ""}</span>
        <span className="shrink-0 text-[10px] font-bold tabular-nums opacity-70" style={{ color: footColor }}>
          {remainingMin !== null && progress < 100 ? `faltam ${formatMinutes(remainingMin)} · ` : ""}{progress}%
        </span>
      </div>
    </div>
  );
}
