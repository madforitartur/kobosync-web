/**
 * Definições de leitura (tamanho de letra, tema, animação, ecrã completo).
 * Guardadas no browser e partilhadas entre o menu da app e o leitor.
 */

import { markChanged } from "./local-store";

export type FontSize = "xs" | "sm" | "md" | "lg" | "xl";
export type Theme = "light" | "sepia" | "dark" | "paper" | "eink";
export type PageAnim = "none" | "fade" | "slide" | "curl";
export type FontFamily = "serif" | "sans" | "dyslexic";
export type LineSpacing = "compact" | "normal" | "loose";
export type TextWidth = "narrow" | "normal" | "wide";

export type ReaderSettings = {
  fontSize: FontSize;
  theme: Theme;
  pageAnim: PageAnim;
  /** Abrir os livros em ecrã completo (ativa-se ao primeiro toque no leitor). */
  autoFullscreen: boolean;
  fontFamily: FontFamily;
  lineSpacing: LineSpacing;
  /** largura da coluna de texto (no PC) e margens */
  textWidth: TextWidth;
  /** escurecimento do ecrã em % (0–60), para ler à noite */
  dim: number;
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: "md",
  theme: "light",
  pageAnim: "fade",
  autoFullscreen: false,
  fontFamily: "serif",
  lineSpacing: "normal",
  textWidth: "normal",
  dim: 0,
};

export const FONT_FAMILIES: { id: FontFamily; label: string; css: string }[] = [
  { id: "serif", label: "Serifa", css: "'Libre Caslon Text', Georgia, 'Times New Roman', serif" },
  { id: "sans", label: "Sem serifa", css: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "dyslexic", label: "Dislexia", css: "'OpenDyslexic', 'Comic Sans MS', sans-serif" },
];
export const LINE_SPACING: Record<LineSpacing, { label: string; factor: number }> = {
  compact: { label: "Compacto", factor: 1.5 },
  normal: { label: "Normal", factor: 1.75 },
  loose: { label: "Largo", factor: 2.0 },
};
export const TEXT_WIDTH: Record<TextWidth, { label: string; ch: number; pad: string }> = {
  narrow: { label: "Estreita", ch: 52, pad: "clamp(1.5rem, 8vw, 4rem)" },
  normal: { label: "Normal", ch: 65, pad: "clamp(1.25rem, 5vw, 3rem)" },
  wide: { label: "Larga", ch: 82, pad: "clamp(0.75rem, 3vw, 2rem)" },
};
export const FONT_PX: Record<FontSize, number> = { xs: 13, sm: 15, md: 17, lg: 19, xl: 22 };

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
      fontFamily: isOneOf(s.fontFamily, FONT_FAMILIES.map((f) => f.id)) ? s.fontFamily : DEFAULT_SETTINGS.fontFamily,
      lineSpacing: isOneOf(s.lineSpacing, Object.keys(LINE_SPACING) as LineSpacing[]) ? s.lineSpacing : DEFAULT_SETTINGS.lineSpacing,
      textWidth: isOneOf(s.textWidth, Object.keys(TEXT_WIDTH) as TextWidth[]) ? s.textWidth : DEFAULT_SETTINGS.textWidth,
      dim: typeof s.dim === "number" ? Math.min(60, Math.max(0, Math.round(s.dim))) : 0,
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
