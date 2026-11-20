/**
 * Parede de estantes para o fundo do login: filas de lombadas desenhadas em CSS,
 * sempre iguais (geradas a partir de uma semente fixa, por isso não há diferenças entre servidor e cliente).
 */
const SPINE_COLORS = ["#6b2d2a", "#2f4a3f", "#25384f", "#5a3b52", "#7a5a2a", "#3b2f27", "#8a4a2b", "#2c4f55", "#4a3d2a", "#5b2f3b", "#33422f", "#41394f"];
const GOLD = "rgba(222,184,110,.55)";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

type Spine = { w: number; h: number; c: string; band: number; lean: number };

function makeRow(seed: number, count: number): Spine[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => ({
    w: 18 + Math.floor(r() * 26),
    h: 118 + Math.floor(r() * 56),
    c: SPINE_COLORS[Math.floor(r() * SPINE_COLORS.length)],
    band: Math.floor(r() * 3),
    lean: r() > 0.96 ? (r() > 0.5 ? 7 : -7) : 0,
  }));
}

const ROWS = Array.from({ length: 7 }, (_, i) => makeRow(1000 + i * 77, 60));

export function SpineWall() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(180deg,#2a1d15,#1b130e)" }}>
      <div className="absolute inset-x-0 top-0 flex flex-col">
        {ROWS.map((row, ri) => (
          <div key={ri} className="relative" style={{ height: 200 }}>
            <div className="absolute bottom-[14px] left-0 flex items-end" style={{ gap: 2, marginLeft: -(ri * 13) }}>
              {row.map((s, i) => (
                <span
                  key={i}
                  className="relative block shrink-0 rounded-[2px]"
                  style={{
                    width: s.w, height: s.h, transformOrigin: "bottom center", transform: s.lean ? `rotate(${s.lean}deg)` : undefined,
                    background: `linear-gradient(90deg, rgba(255,255,255,.14), rgba(0,0,0,0) 30%, rgba(0,0,0,.35)), ${s.c}`,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25), 3px 0 6px rgba(0,0,0,.45)",
                  }}
                >
                  {s.band >= 1 && <i className="absolute inset-x-0 block" style={{ top: 14, height: 3, background: GOLD }} />}
                  {s.band >= 2 && <i className="absolute inset-x-0 block" style={{ bottom: 14, height: 3, background: GOLD }} />}
                  <i className="absolute left-1/2 block -translate-x-1/2" style={{ top: "34%", width: Math.max(3, s.w * 0.28), height: "28%", background: "rgba(240,225,190,.28)", borderRadius: 1 }} />
                </span>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[14px]" style={{
              background: "repeating-linear-gradient(90deg, rgba(60,30,10,.2) 0 1px, transparent 1px 9px), linear-gradient(180deg,#a8743f,#7a4f27 60%,#5a3a1d)",
              borderTop: "2px solid #c99a5f", boxShadow: "0 8px 12px -2px rgba(0,0,0,.7)",
            }} />
          </div>
        ))}
      </div>
      {/* luz de candeeiro e vinheta, para o cartão se destacar */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 55% at 50% 42%, rgba(255,205,130,.22), rgba(20,12,8,.55) 55%, rgba(10,6,4,.9) 100%)" }} />
    </div>
  );
}
