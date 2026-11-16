/**
 * Virar de página 3D para o modo "Livro".
 *
 * A folha que vira é feita de várias tiras aninhadas (cada uma roda um pouco
 * mais ou menos que a anterior), por isso encurva-se durante o movimento como
 * papel a sério. Cada tira tem frente e verso; sombras e luz mudam com o ângulo.
 * As páginas são cópias leves do texto de cada página (só o intervalo de
 * caracteres dessa página), não do livro inteiro.
 */
import { rangeFromOffsets } from "./reader-dom";
import { columnStartOffset, type BookGeo } from "./reader-book";

export type FlipTheme = { bg: string; text: string; accent: string; bgImage?: string };

const STRIPS = 24;
const BEND = 3.1; // graus de curvatura por tira no auge do movimento
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function div(css: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" }, css);
  return d;
}

/** Cópia estática de uma página: texto entre dois offsets + margens, número e sombra da lombada. */
export function makeFace(
  root: HTMLElement, g: BookGeo, start: number, end: number, side: "left" | "right", pageNo: number, theme: FlipTheme,
): HTMLDivElement {
  const face = div({ width: `${g.PW}px`, height: `${g.PH}px`, overflow: "hidden", background: theme.bg, backgroundImage: theme.bgImage ?? "none" });
  face.className = "kb-face";
  const page = div({ left: `${g.padX}px`, top: `${g.padTop}px`, width: `${g.TW}px`, height: `${g.TH}px`, overflow: "hidden" });
  page.className = "kb-page rdr prose-book";
  const cs = getComputedStyle(root);
  Object.assign(page.style, {
    fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight,
    textRendering: cs.textRendering, color: theme.text,
  });
  const r = end > start ? rangeFromOffsets(root, start, end) : null;
  if (r) {
    const sc = r.startContainer;
    if (sc.nodeType === Node.TEXT_NODE && (r.startOffset > 0 || sc.previousSibling)) face.classList.add("kb-cont");
    page.appendChild(r.cloneContents());
    page.querySelectorAll("img").forEach((im) => { (im as HTMLElement).style.maxHeight = `${g.TH}px`; });
  }
  face.appendChild(page);
  const no = div({ top: "auto", bottom: `${Math.round(g.padBottom * 0.38)}px`, height: "auto", textAlign: "center", fontSize: "12px", color: theme.accent, opacity: "0.7", fontFamily: cs.fontFamily });
  no.textContent = String(pageNo);
  face.appendChild(no);
  face.appendChild(div({ background: `linear-gradient(to ${side === "right" ? "right" : "left"}, rgba(0,0,0,.20), rgba(0,0,0,.05) 7%, rgba(0,0,0,0) 16%)`, pointerEvents: "none" }));
  return face;
}

/** Offsets de início das colunas necessárias, saltando (sem pintar) entre as duplas. */
function pageStarts(el: HTMLElement, root: HTMLElement, g: BookGeo, from: number, dir: "next" | "prev", textLen: number, maxSpread: number): number[] | null {
  const saved = el.scrollLeft;
  const at = (spread: number, side: 0 | 1): number | null => {
    if (spread < 0 || spread > maxSpread) return textLen;
    el.scrollLeft = spread * g.W;
    const o = columnStartOffset(el, root, g, side);
    return o === null && spread === maxSpread && side === 1 ? textLen : o; // última dupla sem página direita
  };
  let out: (number | null)[];
  if (dir === "next") out = [at(from, 1), at(from + 1, 0), at(from + 1, 1), at(from + 2, 0)];
  else out = [at(from - 1, 0), at(from - 1, 1), at(from, 0), at(from, 1)];
  el.scrollLeft = saved;
  if (out.some((v) => v === null)) return null;
  const nums = out as number[];
  for (let i = 1; i < nums.length; i++) if (nums[i] < nums[i - 1]) return null;
  return nums;
}

export type FlipArgs = {
  el: HTMLElement; root: HTMLElement; stage: HTMLElement; geo: BookGeo; theme: FlipTheme;
  from: number; to: number; textLen: number; maxSpread: number; ms?: number;
};

/** Anima a viragem. Resolve com um `done()` que o chamador executa depois de pôr a dupla nova no sítio. */
export function flipBook(a: FlipArgs): { ready: boolean; run: () => Promise<void>; destroy: () => void } {
  const { el, root, stage, geo: g, theme } = a;
  const dir: "next" | "prev" = a.to > a.from ? "next" : "prev";
  const starts = pageStarts(el, root, g, a.from, dir, a.textLen, a.maxSpread);
  const none = { ready: false, run: async () => {}, destroy: () => {} };
  if (!starts) return none;

  const k = a.from;
  const [s0, s1, s2, s3] = starts;
  // páginas (colunas) em jogo: A = frente da folha, B = verso, U = página que fica por baixo
  const A = dir === "next" ? makeFace(root, g, s0, s1, "right", 2 * k + 2, theme) : makeFace(root, g, s1, s2, "right", 2 * k, theme);
  const B = dir === "next" ? makeFace(root, g, s1, s2, "left", 2 * k + 3, theme) : makeFace(root, g, s2, s3, "left", 2 * k + 1, theme);
  const U = dir === "next" ? makeFace(root, g, s2, s3, "right", 2 * k + 4, theme) : makeFace(root, g, s0, s1, "left", 2 * k - 1, theme);

  const host = div({ left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${g.W}px`, height: `${g.PH}px`, pointerEvents: "none", zIndex: "20", perspective: `${Math.round(g.PW * 4.2)}px`, perspectiveOrigin: "50% 42%" });
  host.setAttribute("aria-hidden", "true");
  host.dataset.kbFlip = dir;

  const under = div({ left: dir === "next" ? `${g.PW}px` : "0", width: `${g.PW}px` });
  under.appendChild(U);
  host.appendChild(under);

  const shR = div({ left: `${g.PW}px`, width: "0", background: "linear-gradient(to right, rgba(0,0,0,.38), rgba(0,0,0,.14) 55%, rgba(0,0,0,0))", opacity: "0" });
  const shL = div({ left: "0", width: "56px", background: "linear-gradient(to left, rgba(0,0,0,.42), rgba(0,0,0,0))", opacity: "0" });
  host.append(shR, shL);

  // folha: tiras aninhadas, com o eixo na lombada
  const leaf = div({ left: `${g.PW}px`, width: "0", transformStyle: "preserve-3d" });
  const w = g.PW / STRIPS;
  const strips: { el: HTMLDivElement; fd: HTMLDivElement; bd: HTMLDivElement }[] = [];
  let parent: HTMLElement = leaf;
  for (let i = 0; i < STRIPS; i++) {
    const s = div({ left: i === 0 ? "0" : `${w}px`, width: `${w + 0.7}px`, transformStyle: "preserve-3d", transformOrigin: "0 50%" });
    const place = (face: HTMLElement, idx: number) => {
      const c = face.cloneNode(true) as HTMLElement;
      Object.assign(c.style, { left: `${-idx * w}px`, width: `${g.PW}px`, height: `${g.PH}px` });
      return c;
    };
    const fd = div({ overflow: "hidden", backfaceVisibility: "hidden" });
    fd.appendChild(place(A, i));
    const fs = div({ background: "#000", opacity: "0" });
    fd.appendChild(fs);
    const bd = div({ overflow: "hidden", backfaceVisibility: "hidden", transform: "rotateY(180deg)" });
    bd.appendChild(place(B, STRIPS - 1 - i));
    const bs = div({ background: "#000", opacity: "0" });
    bd.appendChild(bs);
    s.append(fd, bd);
    parent.appendChild(s);
    parent = s;
    strips.push({ el: s, fd, bd });
    (fd as HTMLElement & { _s?: HTMLElement })._s = fs;
    (bd as HTMLElement & { _s?: HTMLElement })._s = bs;
  }
  host.appendChild(leaf);

  const set = (theta: number, p: number) => {
    const beta = BEND * Math.cos(Math.PI * p) * Math.pow(Math.sin(Math.PI * p), 0.35);
    let prev = 0;
    strips.forEach((st, i) => {
      const cum = Math.max(0, Math.min(180, theta - i * beta));
      st.el.style.transform = `rotateY(${i === 0 ? -cum : prev - cum}deg)`;
      prev = cum;
      const sin = Math.sin((cum * Math.PI) / 180);
      const dark = 0.34 * Math.pow(sin, 1.1);
      ((st.fd as HTMLElement & { _s?: HTMLElement })._s as HTMLElement).style.opacity = String(cum < 90 ? dark : 0);
      ((st.bd as HTMLElement & { _s?: HTMLElement })._s as HTMLElement).style.opacity = String(cum >= 90 ? dark : 0);
    });
    const rad = (theta * Math.PI) / 180;
    const sinT = Math.sin(rad);
    if (theta < 90) {
      const wpx = Math.min(g.PW, g.PW * Math.cos(rad) + 46);
      shR.style.width = `${wpx}px`;
      shR.style.opacity = String(Math.min(1, sinT * 1.6));
      shL.style.opacity = "0";
    } else {
      const edge = g.PW - g.PW * Math.abs(Math.cos(rad)); // limite da folha sobre a página esquerda
      shL.style.left = `${Math.max(-56, edge - 56)}px`;
      shL.style.width = "56px";
      shL.style.opacity = String(Math.min(1, sinT * 1.4));
      shR.style.opacity = "0";
    }
  };
  set(dir === "next" ? 0 : 180, dir === "next" ? 0 : 1);
  stage.appendChild(host);

  let raf = 0;
  let dead = false;
  const run = () =>
    new Promise<void>((resolve) => {
      const ms = a.ms ?? 980;
      const t0 = performance.now();
      const step = (now: number) => {
        if (dead) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        const e = easeInOut(t);
        const p = dir === "next" ? e : 1 - e;
        set(180 * p, p);
        if (t < 1) raf = requestAnimationFrame(step);
        else resolve();
      };
      raf = requestAnimationFrame(step);
    });
  const destroy = () => { dead = true; cancelAnimationFrame(raf); host.remove(); };
  return { ready: true, run, destroy };
}
