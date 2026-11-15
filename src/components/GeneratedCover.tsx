/**
 * Capa modelo para livros sem capa: desenhada com título e autor, em cores
 * escolhidas de forma estável a partir do livro (o mesmo livro tem sempre a mesma capa).
 * Escala com a largura (unidades `cqw`), por isso serve do miniatura ao detalhe.
 */
type Palette = { bg: string; bg2: string; ink: string; accent: string };

const PALETTES: Palette[] = [
  { bg: "#1f3a34", bg2: "#14261f", ink: "#f3ead6", accent: "#d9b96a" }, // verde garrafa
  { bg: "#3b2a4a", bg2: "#241830", ink: "#f4ecf7", accent: "#e0b4d6" }, // ameixa
  { bg: "#7a2e2e", bg2: "#4d1b1d", ink: "#fbeee6", accent: "#f0c78f" }, // vinho
  { bg: "#1f3b5c", bg2: "#122339", ink: "#eef3f9", accent: "#9fc3e8" }, // azul marinho
  { bg: "#e9dfc7", bg2: "#d6c8a6", ink: "#2b2418", accent: "#8a5a2b" }, // pergaminho
  { bg: "#2d2d2d", bg2: "#151515", ink: "#f5f5f0", accent: "#c9a25a" }, // carvão
  { bg: "#a8572b", bg2: "#6f3416", ink: "#fff4e6", accent: "#ffd9a0" }, // terracota
  { bg: "#2f5d62", bg2: "#1a3638", ink: "#eaf6f4", accent: "#a8dcd1" }, // petróleo
  { bg: "#d8e2dc", bg2: "#b7c8bd", ink: "#1e2f27", accent: "#4f7a64" }, // sálvia
  { bg: "#4a3b2a", bg2: "#2e2318", ink: "#f6ecdc", accent: "#d2a86a" }, // café
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tamanho do título (em % da largura) conforme o comprimento, para caber sempre. */
function titleSize(len: number): number {
  if (len <= 14) return 13;
  if (len <= 26) return 11;
  if (len <= 44) return 9.2;
  if (len <= 70) return 7.8;
  return 6.6;
}

export function GeneratedCover({ title, author }: { title: string; author?: string | null }) {
  const clean = title.trim() || "Sem título";
  const by = author?.trim() || "";
  const p = PALETTES[hash(`${clean}|${by}`) % PALETTES.length];
  const size = titleSize(clean.length);

  return (
    <div
      role="img"
      aria-label={by ? `Capa: ${clean}, de ${by}` : `Capa: ${clean}`}
      className="absolute inset-0 overflow-hidden"
      style={{
        containerType: "inline-size",
        background: `linear-gradient(155deg, ${p.bg} 0%, ${p.bg2} 100%)`,
        color: p.ink,
      }}
    >
      {/* lombada */}
      <div className="absolute inset-y-0 left-0 w-[7%]" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,0))" }} />
      {/* moldura */}
      <div className="absolute" style={{ inset: "6cqw 6cqw 6cqw 9cqw", border: `0.6cqw solid ${p.accent}`, opacity: 0.55 }} />

      <div className="absolute flex flex-col items-center justify-between text-center" style={{ inset: "11cqw 10cqw 11cqw 13cqw" }}>
        <div className="flex flex-col items-center" style={{ gap: "3cqw" }}>
          <span style={{ width: "14cqw", height: "0.6cqw", background: p.accent }} />
          <span style={{ width: "2.6cqw", height: "2.6cqw", background: p.accent, transform: "rotate(45deg)" }} />
        </div>

        <h3
          className="font-display-lg font-bold"
          style={{
            fontSize: `${size}cqw`,
            lineHeight: 1.18,
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
            hyphens: "auto",
            textWrap: "balance",
          }}
        >
          {clean}
        </h3>

        <div className="flex flex-col items-center" style={{ gap: "3cqw" }}>
          {by && <span style={{ width: "9cqw", height: "0.5cqw", background: p.accent }} />}
          {by && (
            <p
              className="font-label-md font-bold uppercase"
              style={{
                fontSize: "5.2cqw",
                letterSpacing: "0.14em",
                color: p.accent,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {by}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
