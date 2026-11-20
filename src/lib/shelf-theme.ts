/** Madeiras disponíveis (cores da parede de fundo, da tábua e do realce). */
export const SHELF_THEMES = [
  { id: "carvalho", name: "Carvalho", wall: ["#8a6a4b", "#6b4f37"], plank: ["#e3b982", "#c99a5f", "#a07040"], top: "#f3d3a2", swatch: "#d9ab72" },
  { id: "nogueira", name: "Nogueira", wall: ["#4a3427", "#35251b"], plank: ["#c58f55", "#a8743f", "#7a4f27"], top: "#e0b27c", swatch: "#8a5a30" },
  { id: "mogno", name: "Mogno", wall: ["#4a1f1a", "#2f130f"], plank: ["#a2492f", "#7f3322", "#55210f"], top: "#c9704f", swatch: "#7f3322" },
  { id: "ebano", name: "Ébano", wall: ["#26262b", "#141417"], plank: ["#4a4a52", "#35353b", "#1d1d21"], top: "#6a6a74", swatch: "#2a2a2f" },
] as const;
export type ThemeId = (typeof SHELF_THEMES)[number]["id"];

export const shelfThemeById = (id: string) => SHELF_THEMES.find((t) => t.id === id) ?? SHELF_THEMES[1];

/** Fundo (parede de madeira) usado na estante e, no modo Estante, em toda a aplicação. */
export const wallBackground = (t: (typeof SHELF_THEMES)[number]) =>
  `repeating-linear-gradient(90deg, rgba(0,0,0,.10) 0 2px, transparent 2px 64px), linear-gradient(180deg, ${t.wall[0]}, ${t.wall[1]})`;
