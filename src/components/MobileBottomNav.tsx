"use client";

import { BookOpen, Check, Download, RefreshCw, Search } from "lucide-react";

type MobileNavProps = {
  activeTab: "library" | "selected" | "search";
  onTabChange: (tab: "library" | "selected" | "search") => void;
  selectedCount: number;
  onSync: () => void;
  onKobo: () => void;
  syncing: boolean;
};

export function MobileBottomNav({
  activeTab,
  onTabChange,
  selectedCount,
  onSync,
  onKobo,
  syncing,
}: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-outline-variant bg-background/95 backdrop-blur-xl safe-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {/* Biblioteca */}
        <button
          onClick={() => onTabChange("library")}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition"
          style={{
            color: activeTab === "library" ? "var(--color-primary)" : "var(--color-outline)",
          }}
        >
          <BookOpen size={22} strokeWidth={activeTab === "library" ? 2 : 1.5} />
          <span className="text-[10px] font-bold tracking-wider uppercase">
            Biblioteca
          </span>
        </button>

        {/* Pesquisa */}
        <button
          onClick={() => onTabChange("search")}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition"
          style={{
            color: activeTab === "search" ? "var(--color-primary)" : "var(--color-outline)",
          }}
        >
          <Search size={22} strokeWidth={activeTab === "search" ? 2 : 1.5} />
          <span className="text-[10px] font-bold tracking-wider uppercase">
            Pesquisar
          </span>
        </button>

        {/* Selecionados */}
        <button
          onClick={() => onTabChange("selected")}
          className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition"
          style={{
            color: activeTab === "selected" ? "var(--color-primary)" : "var(--color-outline)",
          }}
        >
          <Check size={22} strokeWidth={activeTab === "selected" ? 2 : 1.5} />
          {selectedCount > 0 && (
            <span className="absolute -top-0.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary">
              {selectedCount > 9 ? "9+" : selectedCount}
            </span>
          )}
          <span className="text-[10px] font-bold tracking-wider uppercase">
            Seleção
          </span>
        </button>

        {/* Sincronizar */}
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition disabled:opacity-40"
          style={{ color: "var(--color-outline)" }}
        >
          <RefreshCw size={22} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
          <span className="text-[10px] font-bold tracking-wider uppercase">Sync</span>
        </button>

        {/* Kobo */}
        <button
          onClick={onKobo}
          disabled={selectedCount === 0}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition disabled:opacity-30"
          style={{
            color: selectedCount > 0 ? "var(--color-primary)" : "var(--color-outline)",
          }}
        >
          <Download size={22} strokeWidth={1.5} />
          <span className="text-[10px] font-bold tracking-wider uppercase">Kobo</span>
        </button>
      </div>
    </nav>
  );
}
