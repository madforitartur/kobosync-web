export type HlColor = "yellow" | "green" | "blue" | "pink";

export type Bookmark = { id: string; ratio: number; label: string; createdAt: number };
export type Highlight = {
  id: string;
  /** posição (em caracteres) no texto do livro: estável enquanto o EPUB não mudar */
  start: number;
  end: number;
  text: string;
  color: HlColor;
  note?: string;
  createdAt: number;
};

export const HL_COLORS: Record<HlColor, { label: string; bg: string; dot: string }> = {
  yellow: { label: "Amarelo", bg: "rgba(250, 204, 21, 0.45)", dot: "#facc15" },
  green: { label: "Verde", bg: "rgba(74, 222, 128, 0.40)", dot: "#4ade80" },
  blue: { label: "Azul", bg: "rgba(96, 165, 250, 0.40)", dot: "#60a5fa" },
  pink: { label: "Rosa", bg: "rgba(244, 114, 182, 0.40)", dot: "#f472b6" },
};

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
