/**
 * Virar de folha realista (estilo Apple Books).
 *
 * A folha é "dobrada" ao longo da mediatriz entre o canto de origem (C) e o
 * ponto onde está o dedo (P). Camadas:
 *   1. página de destino (por baixo, com a sombra da dobra);
 *   2. folha atual, recortada pela parte que ainda não foi levantada;
 *   3. verso da folha (refletido na dobra, com papel translúcido) e a sua sombra.
 * Cada "página" é um instantâneo leve do texto visível (só os blocos que
 * aparecem no ecrã), por isso o efeito funciona em livros grandes.
 */

type Pt = { x: number; y: number };

const BLOCK_SEL = "p,div,ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote,table,pre,section,figure";
const LEAF_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "DL", "TABLE", "PRE", "FIGURE", "IMG", "HR", "SVG"]);

export type CurlTheme = { bg: string; bgImage?: string; text: string };

/** Cópia estática do que o leitor mostra com o scroll em `scrollTop`. */
export function snapshotPage(el: HTMLElement, root: HTMLElement, scrollTop: number, theme: CurlTheme): HTMLElement {
  const W = el.clientWidth;
  const H = el.clientHeight;
  const er = el.getBoundingClientRect();
  const baseY = er.top - el.scrollTop;
  const page = document.createElement("div");
  Object.assign(page.style, {
    position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px`, overflow: "hidden",
    backgroundColor: theme.bg, backgroundImage: theme.bgImage ?? "none", color: theme.text,
  });
  const holder = document.createElement("div");
  holder.className = `rdr prose-book ${root.className}`;
  const cs = getComputedStyle(root);
  Object.assign(holder.style, {
    position: "absolute", left: "0", top: "0", width: `${W}px`, height: `${H}px`,
    fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight,
    textRendering: cs.textRendering, color: theme.text,
  });
  page.appendChild(holder);

  const visit = (parent: Element) => {
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      const r = child.getBoundingClientRect();
      const y = r.top - baseY - scrollTop;
      if (r.height === 0 && child.tagName !== "HR") continue;
      if (y > H + 4 || y + r.height < -4) continue;
      const leaf = LEAF_TAGS.has(child.tagName.toUpperCase()) || child.children.length === 0 || !child.querySelector(BLOCK_SEL);
      if (leaf) {
        const c = child.cloneNode(true) as HTMLElement;
        c.removeAttribute("id");
        Object.assign(c.style, {
          position: "absolute", left: `${r.left - er.left}px`, top: `${y}px`, width: `${r.width}px`,
          margin: "0", boxSizing: "border-box", height: child.tagName === "IMG" ? `${r.height}px` : "auto",
        });
        holder.appendChild(c);
      } else visit(child);
    }
  };
  visit(root);
  return page;
}

function clipHalf(poly: Pt[], m: Pt, n: Pt, keep: 1 | -1): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => keep * ((p.x - m.x) * n.x + (p.y - m.y) * n.y);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = f(a);
    const db = f(b);
    if (da >= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const poly = (pts: Pt[]) => (pts.length < 3 ? "inset(100%)" : `polygon(${pts.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(",")})`);
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function abs(extra: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const d = document.createElement("div");
  Object.assign(d.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" }, extra);
  return d;
}

export class PageCurl {
  readonly W: number;
  readonly H: number;
  private host: HTMLDivElement;
  private dimEl: HTMLDivElement;
  private shUnder: HTMLDivElement;
  private shUnderStrip: HTMLDivElement;
  private sheet: HTMLDivElement;
  private sheetStrip: HTMLDivElement;
  private flapOuter: HTMLDivElement;
  private flapClip: HTMLDivElement;
  private flapT: HTMLDivElement;
  private flapStrip: HTMLDivElement;
  private C: Pt;
  private bottom: boolean;
  private sign: 1 | -1; // -1: "next" (puxa da direita para a esquerda)
  private dx = 0;
  private dy = 0;
  private raf = 0;
  private dead = false;

  constructor(parent: HTMLElement, box: { left: number; top: number; W: number; H: number }, under: HTMLElement, sheetSnap: HTMLElement, dir: "next" | "prev", startY: number, theme: CurlTheme) {
    this.W = box.W;
    this.H = box.H;
    this.sign = dir === "next" ? -1 : 1;
    this.bottom = startY >= box.H / 2;
    this.C = { x: dir === "next" ? box.W : 0, y: this.bottom ? box.H : 0 };

    const host = (this.host = document.createElement("div"));
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, {
      position: "absolute", left: `${box.left}px`, top: `${box.top}px`, width: `${box.W}px`, height: `${box.H}px`,
      overflow: "hidden", zIndex: "30", pointerEvents: "none", contain: "strict",
    });
    host.appendChild(under);
    this.dimEl = abs({ background: "#000", opacity: "0.18" });
    host.appendChild(this.dimEl);

    this.shUnder = abs();
    this.shUnderStrip = this.strip("linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.18) 55%, rgba(0,0,0,.42))", 90);
    this.shUnder.appendChild(this.shUnderStrip);
    host.appendChild(this.shUnder);

    this.sheet = abs();
    this.sheet.appendChild(sheetSnap);
    this.sheetStrip = this.strip("linear-gradient(to bottom, rgba(0,0,0,.16), rgba(0,0,0,0))", 34);
    this.sheet.appendChild(this.sheetStrip);
    host.appendChild(this.sheet);

    // verso: reflexo da própria folha sobre papel translúcido
    this.flapOuter = abs({ filter: "drop-shadow(-5px 7px 9px rgba(0,0,0,.38))" });
    this.flapClip = abs();
    this.flapT = abs({ transformOrigin: "0 0" });
    const paper = abs({ background: theme.bg });
    const ghost = sheetSnap.cloneNode(true) as HTMLElement;
    ghost.style.opacity = "0.16";
    const tint = abs({ background: "rgba(0,0,0,.05)" });
    this.flapT.append(paper, ghost, tint);
    this.flapStrip = this.strip("linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,.08) 40%, rgba(255,255,255,.10) 75%, rgba(0,0,0,0))", 70);
    this.flapClip.append(this.flapT, this.flapStrip);
    this.flapOuter.appendChild(this.flapClip);
    host.appendChild(this.flapOuter);

    parent.appendChild(host);
    this.set(0, 0);
  }

  private strip(bg: string, h: number): HTMLDivElement {
    const d = document.createElement("div");
    Object.assign(d.style, { position: "absolute", left: "0", top: "0", height: `${h}px`, background: bg, transformOrigin: "0 0" });
    d.dataset.h = String(h);
    return d;
  }

  private placeStrip(d: HTMLDivElement, m: Pt, phi: number, L: number, towardC: boolean) {
    const h = Number(d.dataset.h);
    d.style.width = `${L}px`;
    d.style.transform = `translate(${m.x}px,${m.y}px) rotate(${phi}rad) translate(${-L / 2}px,${towardC ? -h : 0}px)`;
  }

  /** Posição do dedo relativamente ao ponto onde começou (dx para dentro da página). */
  set(dxRaw: number, dyRaw: number) {
    if (this.dead) return;
    const W = this.W, H = this.H;
    const inward = Math.min(2 * W, Math.max(0, dxRaw * this.sign));
    this.dx = inward;
    const lim = H * 0.4;
    let dy = Math.max(-lim, Math.min(lim, dyRaw));
    dy = this.bottom ? Math.min(dy, H * 0.08) : Math.max(dy, -H * 0.08);
    this.dy = dy;
    const P: Pt = { x: this.C.x + this.sign * inward, y: this.C.y + dy };
    const d = { x: this.C.x - P.x, y: this.C.y - P.y };
    const len = Math.hypot(d.x, d.y);
    const progress = Math.min(1, inward / (2 * W));
    this.dimEl.style.opacity = String(0.18 * (1 - progress));
    if (len < 0.8) {
      this.sheet.style.clipPath = "none";
      this.shUnder.style.clipPath = "inset(100%)";
      this.flapOuter.style.display = "none";
      return;
    }
    this.flapOuter.style.display = "";
    const n = { x: d.x / len, y: d.y / len };
    const M = { x: (this.C.x + P.x) / 2, y: (this.C.y + P.y) / 2 };
    const R: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    const visible = clipHalf(R, M, n, -1);
    const removed = clipHalf(R, M, n, 1);
    const flap = removed.map((p) => {
      const k = 2 * ((p.x - M.x) * n.x + (p.y - M.y) * n.y);
      return { x: p.x - k * n.x, y: p.y - k * n.y };
    });
    this.sheet.style.clipPath = poly(visible);
    this.shUnder.style.clipPath = poly(removed);
    this.flapClip.style.clipPath = poly(flap);
    // matriz de reflexão na dobra
    const c = 2 * (M.x * n.x + M.y * n.y);
    this.flapT.style.transform = `matrix(${1 - 2 * n.x * n.x},${-2 * n.x * n.y},${-2 * n.x * n.y},${1 - 2 * n.y * n.y},${c * n.x},${c * n.y})`;
    const phi = Math.atan2(n.x, -n.y);
    const L = Math.hypot(W, H) * 2.2;
    this.placeStrip(this.shUnderStrip, M, phi, L, true);
    this.placeStrip(this.sheetStrip, M, phi, L, false);
    this.placeStrip(this.flapStrip, M, phi, L, false);
  }

  /** Progresso atual 0–1 (para decidir se a folha vira ao largar). */
  get progress() { return Math.min(1, this.dx / this.W); }

  private animate(toDx: number, toDy: number, ms: number, ease: (t: number) => number, arc = 0): Promise<void> {
    cancelAnimationFrame(this.raf);
    const fromDx = this.dx * this.sign;
    const fromDy = this.dy;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        if (this.dead) return resolve();
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        const bend = arc ? Math.sin(Math.PI * t) * arc * (this.bottom ? -1 : 1) : 0;
        this.set(fromDx + (toDx - fromDx) * e, fromDy + (toDy - fromDy) * e + bend);
        if (t < 1) this.raf = requestAnimationFrame(step);
        else resolve();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  /** Vira a folha sozinha (toque ou teclado). */
  autoFlip(): Promise<void> {
    return this.animate(this.sign * 2 * this.W, 0, 720, easeInOut, this.H * 0.1);
  }

  /** Larga o dedo: completa o virar ou volta atrás. Devolve true se a página mudou. */
  async release(commit: boolean): Promise<boolean> {
    const remaining = commit ? 1 - this.dx / (2 * this.W) : this.dx / (2 * this.W);
    const ms = 180 + 380 * remaining;
    await this.animate(commit ? this.sign * 2 * this.W : 0, 0, ms, easeOut);
    return commit;
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.host.remove();
  }
}
