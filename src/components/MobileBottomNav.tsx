"use client";

import { BookMarked, BookOpen, Check, Download, Image, RefreshCw, Search } from "lucide-react";

type Tab = "library" | "selected" | "search" | "reading";

type MobileNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedCount: number;
  readingCount: number;
  onSync: () => void;
  onCovers: () => void;
  onKobo: () => void;
  syncing: boolean;
  syncingCovers: boolean;
};

export function MobileBottomNav({
  activeTab,
  onTabChange,
  selectedCount,
  readingCount,
  onSync,
  onCovers,
  onKobo,
  syncing,
  syncingCovers,
}: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-outline-variant bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-0.5 pt-2 pb-1">

        {/* Biblioteca */}
        <button
          onClick={() => onTabChange("library")}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition"
          style={{ color: activeTab === "library" ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <BookOpen size={21} strokeWidth={activeTab === "library" ? 2 : 1.5} />
          <span className="text-[8px] font-bold tracking-normal uppercase">Biblioteca</span>
        </button>

        {/* Leitura */}
        <button
          onClick={() => onTabChange("reading")}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition"
          style={{ color: activeTab === "reading" ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <BookMarked size={21} strokeWidth={activeTab === "reading" ? 2 : 1.5} />
          {readingCount > 0 && (
            <span className="absolute -top-0.5 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary">
              {readingCount > 9 ? "9+" : readingCount}
            </span>
          )}
          <span className="text-[8px] font-bold tracking-normal uppercase">Leitura</span>
        </button>

        {/* Pesquisa */}
        <button
          onClick={() => onTabChange("search")}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition"
          style={{ color: activeTab === "search" ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Search size={21} strokeWidth={activeTab === "search" ? 2 : 1.5} />
          <span className="text-[8px] font-bold tracking-normal uppercase">Pesquisar</span>
        </button>

        {/* Selecionados */}
        <button
          onClick={() => onTabChange("selected")}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition"
          style={{ color: activeTab === "selected" ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Check size={21} strokeWidth={activeTab === "selected" ? 2 : 1.5} />
          {selectedCount > 0 && (
            <span className="absolute -top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary">
              {selectedCount > 9 ? "9+" : selectedCount}
            </span>
          )}
          <span className="text-[8px] font-bold tracking-normal uppercase">Seleção</span>
        </button>

        {/* Sincronizar livros */}
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition disabled:opacity-40"
          style={{ color: "var(--color-outline)" }}
        >
          <RefreshCw size={21} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
          <span className="text-[8px] font-bold tracking-normal uppercase">Sync</span>
        </button>

        {/* Sincronizar capas */}
        <button
          onClick={onCovers}
          disabled={syncingCovers}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition disabled:opacity-40"
          style={{ color: syncingCovers ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Image size={21} strokeWidth={1.5} className={syncingCovers ? "animate-pulse" : ""} />
          <span className="text-[8px] font-bold tracking-normal uppercase">Capas</span>
        </button>

        {/* Kobo */}
        <button
          onClick={onKobo}
          disabled={selectedCount === 0}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition disabled:opacity-30"
          style={{ color: selectedCount > 0 ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Download size={21} strokeWidth={1.5} />
          <span className="text-[8px] font-bold tracking-normal uppercase">Kobo</span>
        </button>

      </div>
    </nav>
  );
}
