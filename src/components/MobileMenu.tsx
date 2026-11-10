"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Download,
  Image as ImageIcon,
  Maximize,
  Moon,
  RefreshCw,
  Sun,
  X,
} from "lucide-react";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { FONT_LABELS, PAGE_ANIMS, THEMES, type FontSize, type Theme } from "@/lib/reader-settings";

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onSync: () => void;
  onCovers: () => void;
  syncing: boolean;
  syncingCovers: boolean;
  /** Existe um pedido de instalação PWA pronto a usar (Chrome/Android). */
  canInstall: boolean;
  isStandalone: boolean;
  onInstall: () => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 px-1 text-[10px] font-bold uppercase tracking-widest text-outline first:mt-0">
      {children}
    </h3>
  );
}

function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-surface-container-high"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

const rowClass =
  "flex w-full items-center gap-3 rounded-xl border border-outline-variant px-4 py-3 text-left text-sm font-bold text-on-surface transition active:scale-[0.99] disabled:opacity-50";

export function MobileMenu({
  open,
  onClose,
  darkMode,
  onToggleDark,
  onSync,
  onCovers,
  syncing,
  syncingCovers,
  canInstall,
  isStandalone,
  onInstall,
}: MobileMenuProps) {
  const { settings, update } = useReaderSettings();
  const [isFs, setIsFs] = useState(false);
  const [fsSupported, setFsSupported] = useState(true);

  useEffect(() => {
    const d = document as Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element };
    setFsSupported(!!(document.fullscreenEnabled || d.webkitFullscreenEnabled));
    const sync = () => setIsFs(!!(document.fullscreenElement || d.webkitFullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function toggleFullscreen() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    try {
      if (isFs) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
        update({ autoFullscreen: false });
      } else {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        update({ autoFullscreen: true });
      }
    } catch {
      // o browser recusou: não altera a preferência
    }
  }

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-black/40"
            onClick={onClose}
          />
          <motion.aside
            key="menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed inset-y-0 right-0 z-[220] flex w-[min(88vw,360px)] flex-col bg-background shadow-2xl"
          >
            <div
              className="flex items-center justify-between border-b border-outline-variant px-4"
              style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "3.5rem" }}
            >
              <span className="font-display-lg text-xl font-bold text-primary">Menu</span>
              <button
                onClick={onClose}
                aria-label="Fechar menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant"
              >
                <X size={16} />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto px-4 py-4"
              style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
            >
              <SectionTitle>Biblioteca</SectionTitle>
              <div className="space-y-2">
                <button onClick={act(onSync)} disabled={syncing} className={rowClass}>
                  <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
                  Sincronizar livros
                </button>
                <button onClick={act(onCovers)} disabled={syncingCovers} className={rowClass}>
                  <ImageIcon size={18} className={syncingCovers ? "animate-pulse" : ""} />
                  Sincronizar capas
                </button>
              </div>

              <SectionTitle>Aparência</SectionTitle>
              <button onClick={onToggleDark} className={rowClass} role="switch" aria-checked={darkMode}>
                {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                <span className="flex-1">Modo escuro</span>
                <Switch checked={darkMode} />
              </button>

              <SectionTitle>Leitura</SectionTitle>

              <p className="mb-1.5 px-1 text-xs font-bold text-on-surface-variant">Tamanho da letra</p>
              <div className="flex gap-1.5">
                {(Object.keys(FONT_LABELS) as FontSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => update({ fontSize: size })}
                    aria-pressed={settings.fontSize === size}
                    className={`flex h-10 flex-1 items-center justify-center rounded-xl border text-sm font-bold transition ${
                      settings.fontSize === size
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface"
                    }`}
                  >
                    {FONT_LABELS[size]}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 mt-4 px-1 text-xs font-bold text-on-surface-variant">Tema</p>
              <div className="flex gap-1.5">
                {(Object.keys(THEMES) as Theme[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => update({ theme: id })}
                    aria-pressed={settings.theme === id}
                    className="flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold transition"
                    style={{
                      backgroundColor: THEMES[id].page,
                      color: THEMES[id].text,
                      border:
                        settings.theme === id
                          ? "2.5px solid var(--color-primary)"
                          : "1px solid var(--color-outline-variant)",
                    }}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: THEMES[id].text }} />
                    {THEMES[id].label}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 mt-4 px-1 text-xs font-bold text-on-surface-variant">Animação de página</p>
              <div className="flex gap-1.5">
                {PAGE_ANIMS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => update({ pageAnim: a.id })}
                    aria-pressed={settings.pageAnim === a.id}
                    className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border text-[9px] font-bold transition ${
                      settings.pageAnim === a.id
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface"
                    }`}
                  >
                    <span className="text-sm leading-none">{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>

              <button
                onClick={toggleFullscreen}
                disabled={!fsSupported}
                role="switch"
                aria-checked={isFs}
                className={`${rowClass} mt-4`}
              >
                <Maximize size={18} />
                <span className="flex-1">
                  Ecrã completo
                  <span className="block text-[11px] font-normal text-outline">
                    {fsSupported
                      ? "Também ao abrir um livro (ativa-se ao primeiro toque)"
                      : "Não disponível neste browser — instala a app"}
                  </span>
                </span>
                <Switch checked={isFs} />
              </button>

              <SectionTitle>Aplicação</SectionTitle>
              {isStandalone ? (
                <div className={`${rowClass} cursor-default opacity-70`}>
                  <Check size={18} />
                  Aplicação já instalada
                </div>
              ) : (
                <>
                  <button onClick={act(onInstall)} disabled={!canInstall} className={rowClass}>
                    <Download size={18} />
                    Instalar aplicação
                  </button>
                  {!canInstall && (
                    <p className="mt-2 px-1 text-[11px] leading-snug text-outline">
                      Se o botão estiver inativo, usa o menu do browser: “Instalar aplicação” (Chrome) ou
                      Partilhar → “Adicionar ao ecrã principal” (Safari).
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
