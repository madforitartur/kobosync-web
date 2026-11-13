"use client";

import { BookMarked, BookOpen, Check, Compass, Usb } from "lucide-react";

export type Tab = "library" | "selected" | "explore" | "reading";

type MobileNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedCount: number;
  readingCount: number;
  onKobo: () => void;
};

export function MobileBottomNav({
  activeTab,
  onTabChange,
  selectedCount,
  readingCount,
  onKobo,
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
          <span className="text-[9px] font-bold tracking-wider uppercase">Biblioteca</span>
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
          <span className="text-[9px] font-bold tracking-wider uppercase">Leitura</span>
        </button>

        {/* Explorar: séries, autores e coleções */}
        <button
          onClick={() => onTabChange("explore")}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition"
          style={{ color: activeTab === "explore" ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Compass size={21} strokeWidth={activeTab === "explore" ? 2 : 1.5} />
          <span className="text-[9px] font-bold tracking-wider uppercase">Explorar</span>
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
          <span className="text-[9px] font-bold tracking-wider uppercase">Seleção</span>
        </button>

        {/* Kobo */}
        <button
          onClick={onKobo}
          disabled={selectedCount === 0}
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition disabled:opacity-30"
          style={{ color: selectedCount > 0 ? "var(--color-primary)" : "var(--color-outline)" }}
        >
          <Usb size={21} strokeWidth={1.5} />
          <span className="text-[9px] font-bold tracking-wider uppercase">Kobo</span>
        </button>

      </div>
    </nav>
  );
}
