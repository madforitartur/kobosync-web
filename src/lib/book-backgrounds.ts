/** Fundos onde o livro "pousa" no modo Livro (só CSS + SVG inline, sem imagens externas). */
export type BookBg = "theme" | "wood" | "marble" | "dark" | "felt";

const svg = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

// Veios da madeira: ruído esticado na horizontal
const GRAIN = svg(
  `<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.004 0.22' numOctaves='4' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0 0.02  0 0 0 1.5 -0.55'/></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
  900, 420,
);
// Veios do mármore: linhas finas onde o ruído suave cruza o valor médio
const vein = (freq: string, seed: number, peak: number, col: string) =>
  svg(
    `<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='5' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${col}  0 0 0 0 ${col}  0 0 0 0 ${col}  1 0 0 0 0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0 0 0 0 0.1 ${peak} 0.1 0 0 0 0 0 0 0'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
    900, 700,
  );
const VEINS = vein("0.0035 0.0075", 11, 0.75, "0.30");
const VEINS2 = vein("0.009 0.013", 29, 0.4, "0.45");
const FELT = svg(
  `<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0.7 -0.1'/></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
  300, 300,
);

const VIGNETTE = (a: number) => `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${a}) 100%)`;

export const BOOK_BGS: { id: BookBg; label: string; swatch: string }[] = [
  { id: "theme", label: "Tema", swatch: "#cfcfcf" },
  { id: "wood", label: "Madeira", swatch: "linear-gradient(135deg,#8a5a2e,#5e3a1b)" },
  { id: "marble", label: "Mármore", swatch: "linear-gradient(135deg,#f1efec,#b9bcc2)" },
  { id: "dark", label: "Escuro", swatch: "#111114" },
  { id: "felt", label: "Feltro", swatch: "linear-gradient(135deg,#2c6a4a,#1a4030)" },
];

/** Estilo de fundo do ecrã; `themeBg` é a cor do tema de leitura. */
export function bookBgStyle(id: BookBg, themeBg: string): React.CSSProperties {
  switch (id) {
    case "wood":
      return {
        backgroundColor: "#7d4f27",
        backgroundImage: [
          VIGNETTE(0.5),
          GRAIN,
          "repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 138px, rgba(0,0,0,.34) 138px 141px, rgba(255,235,200,.06) 141px 143px)", // juntas das tábuas
          "linear-gradient(180deg,#8c5a2c,#9a6836 22%,#7a4b22 48%,#93622f 74%,#6f4220)",
        ].join(","),
        backgroundSize: "100% 100%, 900px 420px, 100% 143px, 100% 100%",
      };
    case "marble":
      return {
        backgroundColor: "#ecebe8",
        backgroundImage: [VIGNETTE(0.2), VEINS, VEINS2, "linear-gradient(135deg,#f6f5f2,#dedddb 55%,#efede9)"].join(","),
        backgroundSize: "100% 100%, 900px 700px, 900px 700px, 100% 100%",
      };
    case "dark":
      return { backgroundColor: "#0c0c0f", backgroundImage: `${VIGNETTE(0.65)}, radial-gradient(circle at 50% 40%, #1b1b21, #0a0a0c 70%)` };
    case "felt":
      return {
        backgroundColor: "#1f5a40",
        backgroundImage: [VIGNETTE(0.55), FELT, "radial-gradient(circle at 50% 40%, #2b7352, #174631 75%)"].join(","),
        backgroundSize: "100% 100%, 300px 300px, 100% 100%",
      };
    default:
      return { backgroundColor: themeBg };
  }
}
