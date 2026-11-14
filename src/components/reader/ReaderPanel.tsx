"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark as BookmarkIcon, Highlighter, List, Maximize, Minimize, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  FONT_FAMILIES, FONT_LABELS, LINE_SPACING, PAGE_ANIMS, TEXT_WIDTH, THEMES,
  type FontFamily, type FontSize, type LineSpacing, type PageAnim, type ReaderSettings, type TextWidth, type Theme,
} from "@/lib/reader-settings";
import { HL_COLORS, type Bookmark, type Highlight } from "@/lib/reader-annotations";

export type PanelTab = "aa" | "toc" | "marks" | "highlights" | "search";
export type SearchHit = { start: number; end: number; snippet: string; chapter: string };

type Props = {
  open: boolean;
  onClose: () => void;
  touch: boolean;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  settings: ReaderSettings;
  onSettings: (patch: Partial<ReaderSettings>) => void;
  isFs: boolean;
  onToggleFs: () => void;
  chapters: string[];
  currentChapter: number;
  onGoChapter: (i: number) => void;
  bookmarks: Bookmark[];
  bookmarkedHere: boolean;
  onToggleBookmark: () => void;
  onGoBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  highlights: Highlight[];
  onGoHighlight: (h: Highlight) => void;
  onDeleteHighlight: (id: string) => void;
  searchTerm: string;
  onSearchTerm: (s: string) => void;
  hits: SearchHit[];
  onGoHit: (h: SearchHit) => void;
  progress: number;
  onClearPosition: () => void;
};

const TABS: { id: PanelTab; label: string; Icon: typeof List }[] = [
  { id: "aa", label: "Aspeto", Icon: SlidersHorizontal },
  { id: "toc", label: "Índice", Icon: List },
  { id: "marks", label: "Marcadores", Icon: BookmarkIcon },
  { id: "highlights", label: "Destaques", Icon: Highlighter },
  { id: "search", label: "Pesquisa", Icon: Search },
];

export function ReaderPanel(p: Props) {
  const T = THEMES[p.settings.theme];
  const muted = { color: T.accent };
  const chip = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? T.text : `${T.accent}15`,
    color: active ? T.page : T.text,
  });
  const label = (t: string) => (
    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={muted}>{t}</p>
  );

  const listItem = "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm";

  return (
    <AnimatePresence>
      {p.open && (
        <>
          <motion.div
            key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55]" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
            onPointerDown={p.onClose}
          />
          <motion.div
            key="panel" role="dialog" aria-label="Opções de leitura"
            initial={p.touch ? { opacity: 0, y: -20 } : { x: "100%" }}
            animate={p.touch ? { opacity: 1, y: 0 } : { x: 0 }}
            exit={p.touch ? { opacity: 0, y: -20 } : { x: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`fixed z-[60] flex flex-col shadow-2xl ${
              p.touch ? "inset-x-3 top-0 rounded-b-2xl" : "inset-y-0 right-0 w-[420px] max-w-full"
            }`}
            style={{
              maxHeight: p.touch ? "calc(88vh - env(safe-area-inset-bottom, 0px))" : undefined,
              paddingTop: p.touch && p.isFs ? "env(safe-area-inset-top, 0px)" : undefined,
              backgroundColor: T.page, color: T.text, border: `1px solid ${T.accent}18`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1 px-2 pt-2" role="tablist">
              {TABS.map(({ id, label: l, Icon }) => (
                <button key={id} role="tab" aria-selected={p.tab === id} aria-label={l} title={l}
                  onClick={() => p.onTab(id)}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl transition-colors"
                  style={chip(p.tab === id)}>
                  <Icon size={16} />
                </button>
              ))}
              <button onClick={p.onClose} aria-label="Fechar painel"
                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${T.accent}15`, color: T.accent }}>
                <X size={14} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
              {/* ── ASPETO ── */}
              {p.tab === "aa" && (
                <div className="space-y-4">
                  <div>
                    {label("Tamanho da letra")}
                    <div className="flex gap-1.5">
                      {(Object.keys(FONT_LABELS) as FontSize[]).map((s) => (
                        <button key={s} onClick={() => p.onSettings({ fontSize: s })} aria-pressed={p.settings.fontSize === s}
                          className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold" style={chip(p.settings.fontSize === s)}>
                          {FONT_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    {label("Tipo de letra")}
                    <div className="grid grid-cols-3 gap-1.5">
                      {FONT_FAMILIES.map((f) => (
                        <button key={f.id} onClick={() => p.onSettings({ fontFamily: f.id as FontFamily })} aria-pressed={p.settings.fontFamily === f.id}
                          className="flex h-11 items-center justify-center truncate rounded-xl px-1 text-[13px]"
                          style={{ ...chip(p.settings.fontFamily === f.id), fontFamily: f.css }}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      {label("Espaçamento")}
                      <div className="flex gap-1">
                        {(Object.keys(LINE_SPACING) as LineSpacing[]).map((k) => (
                          <button key={k} onClick={() => p.onSettings({ lineSpacing: k })} aria-pressed={p.settings.lineSpacing === k}
                            className="h-9 flex-1 rounded-lg text-[10px] font-bold" style={chip(p.settings.lineSpacing === k)}>{LINE_SPACING[k].label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      {label("Largura do texto")}
                      <div className="flex gap-1">
                        {(Object.keys(TEXT_WIDTH) as TextWidth[]).map((k) => (
                          <button key={k} onClick={() => p.onSettings({ textWidth: k })} aria-pressed={p.settings.textWidth === k}
                            className="h-9 flex-1 rounded-lg text-[10px] font-bold" style={chip(p.settings.textWidth === k)}>{TEXT_WIDTH[k].label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    {label("Tema")}
                    <div className="flex gap-1.5">
                      {(Object.keys(THEMES) as Theme[]).map((t) => (
                        <button key={t} onClick={() => p.onSettings({ theme: t })} title={THEMES[t].label} aria-pressed={p.settings.theme === t}
                          className="flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold"
                          style={{
                            backgroundColor: THEMES[t].page, color: THEMES[t].text,
                            border: p.settings.theme === t ? `2.5px solid ${T.text}` : `1px solid ${T.accent}18`,
                          }}>
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: THEMES[t].text }} />
                          {THEMES[t].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    {label(`Escurecer ecrã · ${p.settings.dim}%`)}
                    <input type="range" min={0} max={60} step={5} value={p.settings.dim} aria-label="Escurecer ecrã"
                      onChange={(e) => p.onSettings({ dim: Number(e.target.value) })} className="w-full" />
                  </div>
                  <div>
                    {label("Animação de página")}
                    <div className="flex gap-1.5">
                      {PAGE_ANIMS.map((a) => (
                        <button key={a.id} onClick={() => p.onSettings({ pageAnim: a.id as PageAnim })} aria-pressed={p.settings.pageAnim === a.id}
                          className="flex h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-bold" style={chip(p.settings.pageAnim === a.id)}>
                          <span className="text-sm leading-none">{a.icon}</span>{a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={p.onToggleFs} className="flex h-11 w-full items-center justify-between rounded-xl px-4 text-sm font-bold" style={chip(p.isFs)}>
                    <span>{p.isFs ? "Sair do ecrã completo" : "Ecrã completo"}</span>
                    {p.isFs ? <Minimize size={16} /> : <Maximize size={16} />}
                  </button>
                  <div className="border-t pt-3 text-[10px] leading-relaxed" style={{ borderColor: `${T.accent}15`, ...muted }}>
                    <p>{p.progress}% lido · <button className="font-bold underline underline-offset-2" onClick={p.onClearPosition}>Limpar posição</button></p>
                    <p className="mt-1.5 hidden md:block">
                      Atalhos: ←/→ página · Espaço avança · T índice · B marcador · H destaques · / pesquisa · F ecrã completo · Esc fecha
                    </p>
                    <p className="mt-1.5 md:hidden">Toca nas margens para virar a página; toca no centro para abrir este painel.</p>
                  </div>
                </div>
              )}

              {/* ── ÍNDICE ── */}
              {p.tab === "toc" && (
                <ul className="space-y-0.5">
                  {p.chapters.map((c, i) => (
                    <li key={i}>
                      <button onClick={() => p.onGoChapter(i)} aria-current={p.currentChapter === i ? "true" : undefined}
                        className={listItem} style={p.currentChapter === i ? chip(true) : undefined}>
                        <span className="w-6 shrink-0 text-xs tabular-nums opacity-60">{i + 1}</span>
                        <span className="min-w-0 flex-1">{c || `Capítulo ${i + 1}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ── MARCADORES ── */}
              {p.tab === "marks" && (
                <div>
                  <button onClick={p.onToggleBookmark} className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold" style={chip(p.bookmarkedHere)}>
                    <BookmarkIcon size={16} fill={p.bookmarkedHere ? "currentColor" : "none"} />
                    {p.bookmarkedHere ? "Remover marcador desta página" : "Marcar esta página"}
                  </button>
                  {p.bookmarks.length === 0 ? (
                    <p className="py-6 text-center text-sm" style={muted}>Ainda não tens marcadores neste livro.</p>
                  ) : (
                    <ul className="space-y-1">
                      {[...p.bookmarks].sort((a, b) => a.ratio - b.ratio).map((b) => (
                        <li key={b.id} className="flex items-center gap-1">
                          <button onClick={() => p.onGoBookmark(b)} className={`${listItem} flex-1`} style={{ backgroundColor: `${T.accent}10` }}>
                            <BookmarkIcon size={14} className="mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{b.label}</span>
                              <span className="text-xs" style={muted}>{Math.round(b.ratio * 100)}%</span>
                            </span>
                          </button>
                          <button onClick={() => p.onDeleteBookmark(b.id)} aria-label="Apagar marcador" className="flex h-9 w-9 items-center justify-center rounded-full" style={muted}><Trash2 size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ── DESTAQUES ── */}
              {p.tab === "highlights" && (
                p.highlights.length === 0 ? (
                  <p className="py-6 text-center text-sm" style={muted}>Seleciona texto no livro para o destacar.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...p.highlights].sort((a, b) => a.start - b.start).map((h) => (
                      <li key={h.id} className="flex items-start gap-1">
                        <button onClick={() => p.onGoHighlight(h)} className={`${listItem} flex-1 flex-col`} style={{ backgroundColor: `${T.accent}10` }}>
                          <span className="rounded px-1 leading-snug" style={{ background: HL_COLORS[h.color].bg }}>{h.text}</span>
                          {h.note && <span className="text-xs italic" style={muted}>{h.note}</span>}
                        </button>
                        <button onClick={() => p.onDeleteHighlight(h.id)} aria-label="Apagar destaque" className="mt-1 flex h-9 w-9 items-center justify-center rounded-full" style={muted}><Trash2 size={15} /></button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {/* ── PESQUISA ── */}
              {p.tab === "search" && (
                <div>
                  <input autoFocus value={p.searchTerm} onChange={(e) => p.onSearchTerm(e.target.value)} placeholder="Pesquisar no livro…" aria-label="Pesquisar no livro"
                    className="mb-3 w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: `${T.accent}15`, color: T.text }} />
                  {p.searchTerm.trim().length >= 2 && (
                    <p className="mb-2 text-xs" style={muted} aria-live="polite">
                      {p.hits.length === 0 ? "Sem resultados." : `${p.hits.length}${p.hits.length >= 200 ? "+" : ""} resultados`}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {p.hits.map((h, i) => (
                      <li key={i}>
                        <button onClick={() => p.onGoHit(h)} className={`${listItem} flex-col`} style={{ backgroundColor: `${T.accent}10` }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={muted}>{h.chapter}</span>
                          <span className="leading-snug">{h.snippet}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
