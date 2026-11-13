/**
 * Definições de leitura (tamanho de letra, tema, animação, ecrã completo).
 * Guardadas no browser e partilhadas entre o menu da app e o leitor.
 */

import { markChanged } from "./local-store";

export type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
export type Theme = "light" | "sepia" | "dark" | "paper" | "eink";
export type PageAnim = "none" | "fade" | "slide" | "curl";

export type ReaderSettings = {
  fontSize: FontSize;
  theme: Theme;
  pageAnim: PageAnim;
  /** Abrir os livros em ecrã completo (ativa-se ao primeiro toque no leitor). */
  autoFullscreen: boolean;
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: "md",
  theme: "light",
  pageAnim: "fade",
  autoFullscreen: false,
};

export const SETTINGS_KEY = "kobosync:reader-settings";
export const SETTINGS_EVENT = "kobosync:reader-settings-changed";

export const FONT_LABELS: Record<FontSize, string> = { xs: "XS", sm: "S", md: "M", lg: "L", xl: "XL" };

export const THEMES: Record<Theme, {
  label: string; bg: string; page: string; text: string; accent: string; eink?: boolean;
}> = {
  light: { label: "Claro", bg: "#e8e6e1", page: "#fdfcf8", text: "#1a1a1a", accent: "#6b6f7a" },
  sepia: { label: "Sépia", bg: "#d4c4a8", page: "#f5ecd9", text: "#3d2f1f", accent: "#9b7f58" },
  paper: { label: "Papel", bg: "#c9c5be", page: "#f7f3ea", text: "#1a1a1a", accent: "#6a6050" },
  dark:  { label: "Noite", bg: "#0d0d0f", page: "#18181b", text: "#e4e4e7", accent: "#71717a" },
  eink:  { label: "E-Ink", bg: "#b0b0b0", page: "#e8e8e8", text: "#0a0a0a", accent: "#444444", eink: true },
};

export const PAGE_ANIMS: { id: PageAnim; label: string; icon: string }[] = [
  { id: "none",  label: "Nenhuma", icon: "✕" },
  { id: "fade",  label: "Fade",    icon: "✦" },
  { id: "slide", label: "Slide",   icon: "⇄" },
  { id: "curl",  label: "Folha",   icon: "📄" },
];

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      fontSize: isOneOf(s.fontSize, Object.keys(FONT_LABELS) as FontSize[]) ? s.fontSize : DEFAULT_SETTINGS.fontSize,
      theme: isOneOf(s.theme, Object.keys(THEMES) as Theme[]) ? s.theme : DEFAULT_SETTINGS.theme,
      pageAnim: isOneOf(s.pageAnim, PAGE_ANIMS.map((a) => a.id)) ? s.pageAnim : DEFAULT_SETTINGS.pageAnim,
      autoFullscreen: s.autoFullscreen === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(patch: Partial<ReaderSettings>): ReaderSettings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  } catch {}
  markChanged("settings");
  return next;
}
