"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Menu, Search, X } from "lucide-react";
import { MobileBottomNav, type Tab } from "@/components/MobileBottomNav";
import { MobileMenu } from "@/components/MobileMenu";
import { Pagination } from "@/components/Pagination";
import { ReadingList } from "@/components/ReadingList";
import { useReadingList } from "@/hooks/useReadingList";
import { useIsTouchDevice } from "@/hooks/useDeviceType";
import { useStored } from "@/hooks/useStored";
import { useSelection } from "@/hooks/useSelection";
import { useCollections } from "@/hooks/useCollections";
import { useProgressMap } from "@/hooks/useProgressMap";
import { useBooksQuery } from "@/hooks/useBooksQuery";
import { useFacets } from "@/hooks/useFacets";
import { useSelectedBooks } from "@/hooks/useSelectedBooks";
import { useOffline } from "@/hooks/useOffline";
import { useCoverManager } from "@/hooks/useCoverManager";
import { useSyncActions, type Status } from "@/hooks/useSyncActions";
import { cleanBookTitle } from "@/lib/book-title";
import { FINISHED_RATIO, setFinished } from "@/lib/reading-progress";
import { EMPTY_FILTERS, type Filters, type SortKey } from "@/lib/library-types";
import type { ExportResult } from "@/lib/kobo-export";
import type { Book } from "@/types/library";
import { BookCard } from "./BookCard";
import { BookDetail } from "./BookDetail";
import { BookMenu, type BookMenuState } from "./BookMenu";
import { CoversBanner } from "./CoversBanner";
import { CollectionPicker } from "./CollectionPicker";
import { CollectionsView } from "./CollectionsView";
import { FilterPanel } from "./FilterPanel";
import { GroupList } from "./GroupList";
import { KoboDialog } from "./KoboDialog";
import { SelectionBar } from "./SelectionBar";
import { SelectionDock } from "./SelectionDock";
import { Sidebar, type DesktopView } from "./Sidebar";
import { StatusToast } from "./StatusToast";
import { Toolbar, type ViewMode } from "./Toolbar";

type View = DesktopView;
const DESKTOP_PAGE_SIZE = 30;
const MOBILE_PAGE_SIZE = 24;
const DENSITY_MIN_WIDTH = [200, 165, 138]; // px por coluna (PC)

const hasBookFile = (b: Book) => !!(b.epub_url || b.drive_file_id);

export function LibraryApp() {
  const touch = useIsTouchDevice();
  const [mounted, setMounted] = useState(false);
  const [darkMode, setDarkMode] = useStored<boolean>("kobosync:dark", false);
  const [status, setStatus] = useState<Status>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  // Navegação e consulta
  const [view, setView] = useState<View>("library");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useStored<ViewMode>("kobosync:view-mode", "grid");
  const [density, setDensity] = useStored<number>("kobosync:density", 1);
  const [selectMode, setSelectMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bookMenu, setBookMenu] = useState<BookMenuState>(null);
  const [detail, setDetail] = useState<Book | null>(null);
  const [pickerIds, setPickerIds] = useState<string[] | null>(null);
  const [koboOpen, setKoboOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isProtected, setIsProtected] = useState(false);
  const [exploreTab, setExploreTab] = useState<"series" | "authors" | "collections">("series");
  const searchRef = useRef<HTMLInputElement>(null);
  const lastIndex = useRef<number | null>(null);

  const reading = useReadingList();
  const selection = useSelection();
  const collections = useCollections();
  const progress = useProgressMap();
  const facets = useFacets(reloadKey);
  const [koboSent, setKoboSent] = useStored<Record<string, number>>("kobosync:kobo-sent", {}, "koboSent");
  const sync = useSyncActions(setStatus, bump);
  const offline = useOffline();
  const covers = useCoverManager();

  // ── Consulta ──────────────────────────────────────────────────────────────
  const activeCollection = filters.collectionId ? collections.collections.find((c) => c.id === filters.collectionId) : undefined;
  const onlyIds = view === "selected" ? selection.list : activeCollection ? activeCollection.bookIds : null;
  const listing = view === "library" || view === "selected";
  const pageSize = touch ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;

  const query = useBooksQuery({
    q, sort, filters, page, limit: pageSize, onlyIds, progress: progress.map,
    finishedRatio: FINISHED_RATIO, reloadKey, enabled: listing,
  });
  const selectedBooks = useSelectedBooks(selection.list, !!mounted, reloadKey);

  useEffect(() => { setPage(1); }, [q, sort, filters, view]);
  useEffect(() => { if (view === "selected" && selection.list.length === 0) setView("library"); }, [view, selection.list.length]);
  useEffect(() => { if (page > query.totalPages && !query.loading) setPage(query.totalPages); }, [page, query.totalPages, query.loading]);

  // ── Arranque ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    // Atalhos da app instalada: /?view=reading|series|authors|collections|selected
    const wanted = new URLSearchParams(window.location.search).get("view");
    if (wanted && ["reading", "series", "authors", "collections", "selected"].includes(wanted)) setView(wanted as View);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    fetch("/api/auth/status").then((r) => r.json()).then((d) => setIsProtected(!!d.protected)).catch(() => {});
    import("@/lib/cloud-sync").then((m) => m.startCloudSync());
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  // ── Ações sobre livros ────────────────────────────────────────────────────
  const openReader = useCallback((id: string) => {
    const a = document.createElement("a");
    a.href = `/read/${id}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  function readBook(book: Book) {
    setBookMenu(null);
    if (!hasBookFile(book)) {
      setStatus({ type: "error", message: "Este livro não tem ficheiro EPUB disponível." });
      return;
    }
    openReader(book.id);
  }

  async function toggleOffline(book: Book) {
    setBookMenu(null);
    const was = offline.saved.has(book.id);
    setStatus({ type: "info", message: was ? "A remover do offline…" : "A guardar para ler offline…" });
    try {
      await offline.toggle(book.id);
      setStatus({ type: "success", message: was ? "Removido do offline." : `“${cleanBookTitle(book.title)}” disponível sem ligação.` });
    } catch (e) {
      setStatus({ type: "error", message: e instanceof Error ? e.message : "Erro ao guardar offline." });
    }
  }

  async function syncLibraryAndCovers() {
    await sync.syncLibrary();
    covers.start(); // livros novos → capas novas
  }

  function toggleFinished(book: Book) {
    const finished = progress.statusOf(book.id) === "finished";
    setFinished(book.id, { title: cleanBookTitle(book.title), author: book.author, cover_url: book.cover_url }, !finished);
    setBookMenu(null);
    setStatus({ type: "success", message: finished ? "Marcado como por ler." : "Marcado como lido." });
  }

  // Capas acabadas de extrair entram na lista sem recarregar
  const visible = useMemo(
    () => query.books.map((b) => (covers.overrides[b.id] ? { ...b, cover_url: covers.overrides[b.id] } : b)),
    [query.books, covers.overrides],
  );
  // Ao mudar de página/filtro, pede já as capas que faltam nos livros visíveis
  const ensureCovers = covers.ensure;
  useEffect(() => {
    if (!query.loading && query.books.length) ensureCovers(query.books);
  }, [query.books, query.loading, ensureCovers]);

  const activate = useCallback((book: Book, e: React.MouseEvent | React.KeyboardEvent) => {
    const idx = visible.findIndex((b) => b.id === book.id);
    const multi = (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;
    const range = (e as React.MouseEvent).shiftKey;

    if (range && lastIndex.current !== null && idx >= 0) {
      const [a, b] = [Math.min(lastIndex.current, idx), Math.max(lastIndex.current, idx)];
      selection.add(visible.slice(a, b + 1).map((x) => x.id));
      return;
    }
    if (selectMode || multi) {
      selection.toggle(book.id);
      lastIndex.current = idx;
      return;
    }
    lastIndex.current = idx;
    const m = e as React.MouseEvent;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBookMenu({
      book,
      x: m.clientX || rect.left + rect.width / 2,
      y: m.clientY || rect.top + rect.height / 2,
    });
    e.stopPropagation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectMode, selection.toggle, selection.add]);

  useEffect(() => {
    if (!bookMenu) return;
    const close = () => setBookMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [bookMenu]);

  // Atalhos de teclado (PC): "/" pesquisa, Ctrl/Cmd+A seleciona a página, Esc sai do modo seleção
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (typing) return;
      if (e.key === "/" && !touch) { e.preventDefault(); searchRef.current?.focus(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && listing && visible.length) {
        e.preventDefault();
        selection.add(visible.map((b) => b.id));
      } else if (e.key === "Escape" && selectMode) setSelectMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [touch, listing, visible, selection, selectMode]);

  // ── Navegação ─────────────────────────────────────────────────────────────
  function go(v: View) {
    setView(v);
    if (v !== "library") setFilters((f) => ({ ...f, collectionId: undefined }));
    if (v === "library") setFilters((f) => ({ ...f, collectionId: undefined }));
    setSearchOpen(false);
    window.scrollTo({ top: 0 });
  }
  function openCollection(id: string) {
    setView("library");
    setFilters({ ...EMPTY_FILTERS, collectionId: id });
    window.scrollTo({ top: 0 });
  }
  function openGroup(kind: "series" | "authors", name: string) {
    setView("library");
    setFilters({ ...EMPTY_FILTERS, [kind === "series" ? "series" : "author"]: name });
    setDetail(null);
    window.scrollTo({ top: 0 });
  }
  function onSearch(value: string) {
    setQ(value);
    if (value && !listing) setView("library");
  }
  function goToPage(n: number) {
    setPage(Math.max(1, Math.min(query.totalPages, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const mobileTab: Tab = view === "reading" ? "reading" : view === "selected" ? "selected" : view === "library" ? "library" : "explore";
  function onMobileTab(tab: Tab) {
    if (tab === "explore") { setView(exploreTab); setSearchOpen(false); }
    else go(tab as View);
  }
  function onMobileExploreTab(t: "series" | "authors" | "collections") {
    setExploreTab(t);
    setView(t);
  }

  // ── Kobo ──────────────────────────────────────────────────────────────────
  function onKoboDone(result: ExportResult, mode: "folder" | "zip") {
    if (result.sent.length) {
      const now = Date.now();
      setKoboSent((cur) => ({ ...cur, ...Object.fromEntries(result.sent.map((id) => [id, now])) }));
    }
    const what = mode === "folder" ? "copiados para o Kobo" : "incluídos no ZIP";
    setStatus(
      result.failed.length === 0
        ? { type: "success", message: `${result.sent.length} livro${result.sent.length !== 1 ? "s" : ""} ${what}.` }
        : { type: "info", message: `${result.sent.length} ${what}, ${result.failed.length} falharam.` },
    );
  }
  function openKobo() {
    if (selection.list.length === 0) { setStatus({ type: "error", message: "Nenhum livro selecionado para enviar." }); return; }
    setKoboOpen(true);
  }

  async function selectAllResults() {
    const ids = await query.fetchAllIds();
    selection.add(ids);
    setStatus({ type: "info", message: `${ids.length} livros adicionados à seleção.` });
  }

  const pageIds = visible.map((b) => b.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selection.ids.has(id));
  const toggleSelectPage = () => (allOnPage ? selection.remove(pageIds) : selection.add(pageIds));

  const collectionNamesOf = (id: string) => collections.collections.filter((c) => c.bookIds.includes(id)).map((c) => c.name);

  // ── Peças de interface ────────────────────────────────────────────────────
  const title =
    view === "selected" ? "Seleção"
    : activeCollection ? activeCollection.name
    : filters.series ? filters.series
    : filters.author ? filters.author
    : q.trim() ? `“${q.trim()}”`
    : "Biblioteca";

  const gridStyle = !touch && viewMode === "grid"
    ? { gridTemplateColumns: `repeat(auto-fill, minmax(${DENSITY_MIN_WIDTH[density] ?? 165}px, 1fr))` }
    : undefined;
  const gridClass = viewMode === "list"
    ? "grid gap-2 md:grid-cols-2"
    : touch ? "grid grid-cols-3 gap-3 sm:grid-cols-4" : "grid gap-x-6 gap-y-9";

  const books = (
    <>
      {query.error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          <span>{query.error}</span>
          <button onClick={bump} className="rounded-lg border border-error px-3 py-1 text-xs font-bold">Tentar de novo</button>
        </div>
      )}
      {query.loading ? (
        <div className={gridClass} style={gridStyle} aria-busy="true">
          {Array.from({ length: touch ? 12 : 15 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-epub rounded bg-surface-container" />
              <div className="mt-3 h-3 w-4/5 rounded bg-surface-container" />
              <div className="mt-2 h-2.5 w-3/5 rounded bg-surface-container" />
            </div>
          ))}
        </div>
      ) : visible.length > 0 ? (
        <>
          <div className={gridClass} style={gridStyle}>
            {visible.map((book) => {
              const st = progress.statusOf(book.id);
              return (
                <BookCard
                  key={book.id} book={book} compact={touch} variant={viewMode}
                  selected={selection.ids.has(book.id)} selectMode={selectMode}
                  progress={progress.map[book.id]} finished={st === "finished"} sentToKobo={!!koboSent[book.id]}
                  onActivate={activate}
                />
              );
            })}
          </div>
          <Pagination variant={touch ? "mobile" : "desktop"} page={page} totalPages={query.totalPages} onChange={goToPage} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="mb-4 text-outline" size={44} strokeWidth={1.4} />
          <p className="font-bold text-on-surface-variant">
            {view === "selected" ? "Nenhum livro selecionado" : q || filters.author || filters.series || filters.status !== "all" ? "Sem resultados" : "Biblioteca vazia"}
          </p>
          {(q || filters.status !== "all" || filters.author || filters.series || filters.language) ? (
            <button onClick={() => { setQ(""); setFilters({ ...EMPTY_FILTERS, collectionId: filters.collectionId }); }} className="mt-3 rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold">Limpar pesquisa e filtros</button>
          ) : view === "library" ? (
            <p className="mt-2 text-sm text-outline">Usa “Sincronizar livros” para carregar o Google Drive.</p>
          ) : null}
        </div>
      )}
    </>
  );

  const main = (() => {
    if (view === "reading") {
      return <ReadingList entries={reading.entries} onOpen={openReader} onRemove={reading.remove} />;
    }
    if (view === "series") return <GroupList kind="series" groups={facets.series} compact={touch} onOpen={(n) => openGroup("series", n)} />;
    if (view === "authors") return <GroupList kind="authors" groups={facets.authors} compact={touch} onOpen={(n) => openGroup("authors", n)} />;
    if (view === "collections") {
      return (
        <CollectionsView
          collections={collections.collections} onOpen={openCollection}
          onCreate={(n) => collections.create(n)} onRename={collections.rename} onDelete={collections.remove}
        />
      );
    }
    return (
      <>
        <Toolbar
          touch={touch} sort={sort} onSort={setSort} filters={filters} onFilters={setFilters}
          onOpenFilters={() => setFiltersOpen(true)} viewMode={viewMode} onViewMode={setViewMode}
          density={density} onDensity={setDensity} selectMode={selectMode}
          onToggleSelectMode={() => setSelectMode((v) => !v)} hasQuery={!!q.trim()} collections={collections.collections}
        />
        {(selectMode || view === "selected") && (
          <SelectionBar
            count={selection.list.length} pageCount={visible.length} allOnPage={allOnPage}
            onSelectPage={toggleSelectPage} onSelectAllResults={selectAllResults} totalResults={query.total}
            onClear={selection.clear} onKobo={openKobo} onCollection={() => setPickerIds(selection.list)}
          />
        )}
        {books}
      </>
    );
  })();

  const heading =
    view === "reading" ? "A ler" : view === "series" ? "Séries" : view === "authors" ? "Autores" : view === "collections" ? "Coleções" : title;
  const subtitle =
    view === "reading" ? `${reading.entries.length} ${reading.entries.length === 1 ? "livro" : "livros"}`
    : listing ? (query.loading ? "A carregar…" : `${query.total} ${query.total === 1 ? "livro" : "livros"}`)
    : view === "series" ? `${facets.series.length} séries` : view === "authors" ? `${facets.authors.length} autores` : `${collections.collections.length} coleções`;

  const overlays = (
    <>
      <BookMenu
        state={bookMenu} touch={touch} onClose={() => setBookMenu(null)}
        selected={bookMenu ? selection.ids.has(bookMenu.book.id) : false}
        status={bookMenu ? progress.statusOf(bookMenu.book.id) : "unread"}
        offlineSaved={bookMenu ? offline.saved.has(bookMenu.book.id) : false}
        offlineSupported={offline.supported} onToggleOffline={toggleOffline}
        inCollectionName={activeCollection?.name}
        onRead={readBook}
        onToggleSelect={(b) => { selection.toggle(b.id); setBookMenu(null); }}
        onDetails={(b) => { setBookMenu(null); setDetail(b); }}
        onCollections={(b) => { setBookMenu(null); setPickerIds([b.id]); }}
        onToggleFinished={toggleFinished}
        onRemoveFromCollection={(b) => { if (activeCollection) collections.removeBooks(activeCollection.id, [b.id]); setBookMenu(null); }}
      />
      <BookDetail
        book={detail} touch={touch} onClose={() => setDetail(null)}
        selected={detail ? selection.ids.has(detail.id) : false}
        status={detail ? progress.statusOf(detail.id) : "unread"}
        progress={detail ? progress.map[detail.id] : undefined}
        sentToKobo={detail ? !!koboSent[detail.id] : false}
        offlineSaved={detail ? offline.saved.has(detail.id) : false}
        offlineSupported={offline.supported} onToggleOffline={toggleOffline}
        collectionNames={detail ? collectionNamesOf(detail.id) : []}
        onRead={readBook} onToggleSelect={(b) => selection.toggle(b.id)}
        onCollections={(b) => setPickerIds([b.id])} onToggleFinished={toggleFinished}
        onFilterAuthor={(a) => openGroup("authors", a)} onFilterSeries={(s) => openGroup("series", s)}
      />
      <FilterPanel
        open={filtersOpen} onClose={() => setFiltersOpen(false)} touch={touch} filters={filters} onChange={setFilters}
        authors={facets.authors} series={facets.series} languages={facets.languages} collections={collections.collections}
      />
      <CollectionPicker
        open={!!pickerIds} onClose={() => setPickerIds(null)} touch={touch} bookIds={pickerIds ?? []}
        collections={collections.collections} onAdd={collections.addBooks} onRemove={collections.removeBooks}
        onCreate={(name, ids) => { collections.create(name, ids); setStatus({ type: "success", message: `Coleção “${name}” criada.` }); }}
      />
      <KoboDialog
        open={koboOpen} onClose={() => setKoboOpen(false)} touch={touch}
        books={selectedBooks} total={selection.list.length} onDone={onKoboDone}
      />
      <StatusToast status={status} onClose={() => setStatus(null)} touch={touch} />
    </>
  );

  if (!mounted) return null;

  // ════════════ MOBILE ════════════
  if (touch) {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="min-h-screen bg-background text-on-background" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
          <header className="sticky top-0 z-40 border-b border-outline-variant bg-background/95 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex h-14 items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary"><BookOpen size={16} /></span>
                <span className="font-display-lg text-[22px] font-bold text-primary">KoboSync</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant"
                  onClick={() => { setSearchOpen((v) => !v); if (!listing) setView("library"); }} aria-label="Pesquisar" aria-expanded={searchOpen}>
                  <Search size={17} />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant"
                  onClick={() => setMenuOpen(true)} aria-label="Abrir menu" aria-haspopup="dialog">
                  <Menu size={18} />
                </button>
              </div>
            </div>
            {(searchOpen || q) && (
              <div className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-low px-4 py-2">
                <Search size={16} className="shrink-0 text-outline" />
                <input ref={searchRef} autoFocus={searchOpen} className="w-full bg-transparent text-sm outline-none placeholder:text-outline"
                  placeholder="Título, autor, série…" value={q} onChange={(e) => onSearch(e.target.value)} aria-label="Pesquisar livros" />
                {q && <button onClick={() => { setQ(""); }} aria-label="Limpar pesquisa" className="text-outline"><X size={16} /></button>}
              </div>
            )}
          </header>

          <main className="px-3 pt-4">
            {mobileTab === "explore" && (
              <div role="tablist" className="mb-4 flex rounded-full border border-outline-variant p-0.5">
                {([["series", "Séries"], ["authors", "Autores"], ["collections", "Coleções"]] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={view === id} onClick={() => onMobileExploreTab(id)}
                    className={`flex-1 rounded-full py-1.5 text-xs font-bold ${view === id ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>{label}</button>
                ))}
              </div>
            )}
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h1 className="min-w-0 truncate font-display-lg text-[22px] font-bold text-primary">{heading}</h1>
              <span className="shrink-0 text-xs text-on-surface-variant">{subtitle}</span>
            </div>
            <CoversBanner state={covers.state} onStop={covers.stop} onRetry={covers.start} />
            {main}
          </main>

          <MobileMenu
            open={menuOpen} onClose={() => setMenuOpen(false)} darkMode={darkMode} onToggleDark={() => setDarkMode((v) => !v)}
            onSync={syncLibraryAndCovers} onCovers={covers.start} syncing={sync.syncing} syncingCovers={covers.state.running}
            canInstall={!!deferredPrompt} isStandalone={isStandalone} onInstall={handleInstall}
            onLogout={isProtected ? logout : undefined}
          />
          <MobileBottomNav activeTab={mobileTab} onTabChange={onMobileTab} selectedCount={selection.list.length} readingCount={reading.entries.length} onKobo={openKobo} />
          {overlays}
        </div>
      </div>
    );
  }

  // ════════════ PC ════════════
  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex min-h-screen bg-background text-on-background selection:bg-primary-fixed selection:text-primary">
        <Sidebar
          view={view} activeCollectionId={activeCollection?.id} onView={go} onOpenCollection={openCollection}
          counts={{ total: facets.authors.length ? query.total : query.total, reading: reading.entries.length, selected: selection.list.length, series: facets.series.length, authors: facets.authors.length }}
          collections={collections.collections} darkMode={darkMode} onToggleDark={() => setDarkMode((v) => !v)}
          onSync={syncLibraryAndCovers} onCovers={covers.start} onFixCovers={sync.migrateCoverUrls}
          syncing={sync.syncing} syncingCovers={covers.state.running} onLogout={isProtected ? logout : undefined}
        />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-outline-variant bg-background/90 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-4 px-8">
              <div className="flex max-w-xl flex-1 items-center gap-2 rounded border border-outline-variant bg-surface-container-low px-3 py-2">
                <Search size={18} className="text-outline" />
                <input ref={searchRef} className="w-full bg-transparent text-sm outline-none placeholder:text-outline"
                  placeholder="Pesquisar título, autor, série, editora ou ISBN  ( / )" value={q} onChange={(e) => onSearch(e.target.value)} aria-label="Pesquisar livros" />
                {q && <button onClick={() => setQ("")} aria-label="Limpar pesquisa" className="text-outline"><X size={16} /></button>}
              </div>
            </div>
          </header>
          <main className="px-8 py-7">
            <div className="mb-5 flex items-end justify-between gap-4 border-b border-outline-variant pb-4">
              <div className="min-w-0">
                <h1 className="truncate font-display-lg text-[32px] font-bold text-primary">{heading}</h1>
                <p className="mt-1 text-sm text-on-surface-variant" aria-live="polite">{subtitle}</p>
              </div>
            </div>
            <CoversBanner state={covers.state} onStop={covers.stop} onRetry={covers.start} />
            {main}
          </main>
        </div>
        {selection.list.length > 0 && (
          <SelectionDock
            books={selectedBooks.slice(0, 40)} count={selection.list.length}
            onRemove={(id) => selection.remove([id])} onClear={selection.clear}
            onKobo={openKobo} onCollection={() => setPickerIds(selection.list)}
          />
        )}
        {overlays}
      </div>
    </div>
  );
}

// Tipo (não existe no lib.dom) do evento de instalação PWA
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
