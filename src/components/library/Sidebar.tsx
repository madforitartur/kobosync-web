"use client";

import { BookMarked, BookOpen, Check, FolderOpen, Image as ImageIcon, Library, LogOut, Moon, RefreshCw, Sun, User, Wrench } from "lucide-react";
import type { Collection } from "@/hooks/useCollections";

export type DesktopView = "library" | "reading" | "series" | "authors" | "collections" | "selected";

type Props = {
  view: DesktopView;
  activeCollectionId?: string;
  onView: (v: DesktopView) => void;
  onOpenCollection: (id: string) => void;
  counts: { total: number; reading: number; selected: number; series: number; authors: number };
  collections: Collection[];
  darkMode: boolean;
  onToggleDark: () => void;
  onSync: () => void;
  onCovers: () => void;
  onFixCovers: () => void;
  syncing: boolean;
  syncingCovers: boolean;
  onLogout?: () => void;
};

export function Sidebar({ view, activeCollectionId, onView, onOpenCollection, counts, collections, darkMode, onToggleDark, onSync, onCovers, onFixCovers, syncing, syncingCovers, onLogout }: Props) {
  const item = (id: DesktopView, label: string, Icon: typeof BookOpen, count?: number) => {
    const active = view === id && !activeCollectionId;
    return (
      <button key={id} onClick={() => onView(id)} aria-current={active ? "page" : undefined}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}>
        <Icon size={18} />
        <span className="flex-1">{label}</span>
        {count !== undefined && count > 0 && <span className={`text-xs ${active ? "opacity-80" : "text-outline"}`}>{count}</span>}
      </button>
    );
  };

  const tool = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50";

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-outline-variant bg-background px-3 py-5" aria-label="Navegação principal">
      <div className="mb-6 flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary"><BookOpen size={21} /></span>
        <span className="font-display-lg text-[26px] font-bold text-primary">KoboSync</span>
      </div>

      <nav className="space-y-1">
        {item("library", "Biblioteca", Library, counts.total)}
        {item("reading", "A ler", BookMarked, counts.reading)}
        {item("series", "Séries", Library, counts.series)}
        {item("authors", "Autores", User, counts.authors)}
        {item("collections", "Coleções", FolderOpen, collections.length)}
        {item("selected", "Seleção", Check, counts.selected)}
      </nav>

      {collections.length > 0 && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-outline">As tuas coleções</p>
          {collections.map((c) => (
            <button key={c.id} onClick={() => onOpenCollection(c.id)} aria-current={activeCollectionId === c.id ? "page" : undefined}
              className={`flex w-full items-center gap-2 truncate rounded-lg px-3 py-1.5 text-left text-sm ${activeCollectionId === c.id ? "bg-surface-container-high font-bold text-primary" : "text-on-surface-variant hover:bg-surface-container"}`}>
              <FolderOpen size={14} className="shrink-0" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {collections.length === 0 && <div className="flex-1" />}

      <div className="mt-4 space-y-0.5 border-t border-outline-variant pt-3">
        <p className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-outline"><Wrench size={11} /> Ferramentas</p>
        <button className={tool} onClick={onSync} disabled={syncing}><RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> Sincronizar livros</button>
        <button className={tool} onClick={onCovers} disabled={syncingCovers}><ImageIcon size={16} className={syncingCovers ? "animate-pulse" : ""} /> Sincronizar capas</button>
        <button className={tool} onClick={onFixCovers}><RefreshCw size={16} /> Corrigir capas</button>
        <button className={tool} onClick={onToggleDark}>{darkMode ? <Sun size={16} /> : <Moon size={16} />} {darkMode ? "Modo claro" : "Modo escuro"}</button>
        {onLogout && <button className={tool} onClick={onLogout}><LogOut size={16} /> Sair</button>}
      </div>
    </aside>
  );
}
