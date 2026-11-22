"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { adoptUser } from "@/lib/user-session";
import { SpineWall } from "@/components/login/SpineWall";

type Profile = { id: string; name: string; role: "admin" | "user" };

const COLORS = ["#2f4f7f", "#8f3d2a", "#3b6b4f", "#6b4a8f", "#9a6b1f", "#2f6f73", "#8f3a63", "#4f5b6b"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/** Letreiro da livraria. */
function Sign() {
  return (
    <div className="mx-auto mb-8 w-fit rounded-md px-8 py-4 text-center" style={{ background: "linear-gradient(180deg,#24463d,#1a332c)", boxShadow: "inset 0 0 0 2px #c9a25a, inset 0 0 0 5px #1a332c, inset 0 0 0 6px rgba(201,162,90,.6), 0 14px 30px rgba(0,0,0,.6)" }}>
      <div className="flex items-center justify-center gap-3">
        <BookOpen size={26} style={{ color: "#e8c98a" }} />
        <span className="font-display-lg text-[34px] font-bold leading-none" style={{ color: "#f3e3bd", textShadow: "0 2px 0 rgba(0,0,0,.4)" }}>KoboSync</span>
      </div>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "#c9a25a" }}>Livraria · A tua biblioteca</p>
    </div>
  );
}

const lighten = (hex: string, amt: number) => `color-mix(in srgb, ${hex} ${100 - amt}%, white)`;
const darken = (hex: string, amt: number) => `color-mix(in srgb, ${hex} ${100 - amt}%, black)`;

/** Cada utilizador é um livro: lombada, capa com o nome e folhas. */
function UserBook({ p, w = 132, lifted = false, flat = false, onClick }: { p: Profile; w?: number; lifted?: boolean; flat?: boolean; onClick?: () => void }) {
  const c = colorFor(p.id);
  const h = Math.round(w * 1.45);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      aria-label={onClick ? `${p.name}${p.role === "admin" ? " (administrador)" : ""}` : undefined}
      className={`kb-ubook group relative block shrink-0 text-left ${onClick ? "cursor-pointer" : ""}`}
      style={{ width: w, height: h, perspective: 900, perspectiveOrigin: "50% 100%", ["--c" as string]: c } as React.CSSProperties}
    >
      <span aria-hidden className="kb-ushadow" />
      <span className={`kb-u3d ${lifted ? "kb-lift" : ""} ${flat ? "kb-flat" : ""}`} style={{ width: w, height: h }}>
        <i className="kb-uspine" style={{ background: `linear-gradient(90deg, rgba(0,0,0,.38), rgba(255,255,255,.16) 40%, rgba(0,0,0,.34)), linear-gradient(180deg, ${c}, ${darken(c, 30)})` }} />
        <i className="kb-upages" />
        <span className="kb-ucover" style={{ background: `linear-gradient(155deg, ${lighten(c, 8)} 0%, ${c} 45%, ${darken(c, 35)} 100%)` }}>
          <span className="kb-uframe" />
          <span className="font-display-lg text-[34px] font-bold leading-none sm:text-[44px]" style={{ color: "#f3e3bd", textShadow: "0 2px 3px rgba(0,0,0,.45)" }}>{p.name.charAt(0).toUpperCase()}</span>
          <span className="mt-2 block h-px w-8" style={{ background: "#e0bd73" }} />
          <span className="mt-2 max-w-[78%] break-words text-center font-display-lg text-[13px] sm:text-[15px] font-bold leading-tight" style={{ color: "#f8efd8" }}>{p.name}</span>
          {p.role === "admin" && <span className="absolute bottom-2 flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest" style={{ color: "#e0bd73" }}><ShieldCheck size={10} /> Admin</span>}
        </span>
      </span>
    </Tag>
  );
}

const BOOK_CSS = `
.kb-u3d{position:relative;display:block;transform-style:preserve-3d;transform-origin:50% 100%;transform:rotateY(22deg);transition:transform .25s ease}
.kb-ubook:hover .kb-u3d,.kb-ubook:focus-visible .kb-u3d{transform:translateY(-14px) rotateY(8deg)}
.kb-ubook:focus-visible{outline:none}.kb-ubook:focus-visible .kb-ucover{box-shadow:0 0 0 3px #f3e3bd}
.kb-u3d.kb-flat{transform:rotateY(12deg)}
.kb-ushadow{position:absolute;left:4%;right:-22%;bottom:-4px;height:14px;background:radial-gradient(closest-side,rgba(0,0,0,.7),transparent);filter:blur(2px)}
.kb-ucover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:4px 6px 6px 4px;box-shadow:inset 3px 0 4px rgba(255,255,255,.16),inset -3px 0 5px rgba(0,0,0,.3),0 8px 18px rgba(0,0,0,.35)}
.kb-uframe{position:absolute;inset:9px 9px 9px 14px;border:1.5px solid rgba(224,189,115,.7);border-radius:2px;pointer-events:none}
.kb-uspine,.kb-upages{position:absolute;top:0;bottom:0;width:22px;display:block}
.kb-uspine{left:0;transform-origin:left center;transform:rotateY(90deg);border-radius:4px}
.kb-upages{right:0;transform-origin:right center;transform:rotateY(-90deg);margin:3px 0;background:repeating-linear-gradient(0deg,rgba(120,100,70,.35) 0 1px,transparent 1px 3px),linear-gradient(90deg,#efe6d2,#d9cdb4)}
.kb-plank{position:relative;z-index:2;height:20px;margin:-4px -28px 0;background:repeating-linear-gradient(90deg,rgba(60,30,10,.18) 0 1px,transparent 1px 9px),linear-gradient(180deg,#c58f55,#a8743f 35%,#7a4f27);border-top:2px solid #e0b27c;box-shadow:0 12px 18px -4px rgba(0,0,0,.75),inset 0 -3px 0 rgba(0,0,0,.25)}
@media (prefers-reduced-motion:reduce){.kb-u3d{transition:none}}
`;

function LoginForm() {
  const params = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [chosen, setChosen] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perRow, setPerRow] = useState(5);
  useEffect(() => {
    const fit = () => setPerRow(window.innerWidth < 520 ? 3 : window.innerWidth < 760 ? 4 : 5);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    fetch("/api/auth/profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.protected) { window.location.href = "/"; return; }
        setProfiles(d.profiles);
        if (d.profiles.length === 1) setChosen(d.profiles[0]); // só o administrador: vai direto ao PIN
      })
      .catch(() => setProfiles([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: chosen.id, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao entrar.");
      adoptUser(data.user.id);
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
      setPin("");
      setBusy(false);
    }
  }

  const loading = !profiles;
  const rows: Profile[][] = [];
  if (profiles) for (let i = 0; i < profiles.length; i += perRow) rows.push(profiles.slice(i, i + perRow));

  return (
    <div className="w-full max-w-3xl">
      <style>{BOOK_CSS}</style>
      <Sign />
      {loading && <div className="flex justify-center"><Loader2 className="animate-spin" style={{ color: "#e8c98a" }} /></div>}

      {profiles && !chosen && (
        <div className="px-2">
          <h1 className="mb-6 text-center font-display-lg text-xl font-bold" style={{ color: "#f3e3bd", textShadow: "0 2px 6px rgba(0,0,0,.7)" }}>Quem vai ler?</h1>
          {rows.map((row, ri) => (
            <div key={ri} className="relative pt-10">
              <div className="relative z-[1] flex flex-wrap items-end justify-center gap-x-4 gap-y-0 px-2 sm:gap-x-9 sm:px-4">
                {row.map((p) => <UserBook key={p.id} p={p} w={perRow === 3 ? 84 : 108} onClick={() => { setChosen(p); setPin(""); setError(null); }} />)}
              </div>
              <div className="kb-plank" aria-hidden />
            </div>
          ))}
          {profiles.length === 0 && <p className="mt-4 text-center text-sm font-semibold" style={{ color: "#ffb4a8" }}>Não foi possível carregar os perfis.</p>}
        </div>
      )}

      {profiles && chosen && (
        <form onSubmit={submit} className="px-2">
          <div className="relative pt-10">
            <div className="relative z-[1] flex flex-wrap items-end justify-center gap-x-10 gap-y-6 px-4 pb-1">
              <UserBook p={chosen} w={perRow === 3 ? 96 : 120} flat />
              <div className="w-full max-w-[17rem] rounded-md p-5" style={{ background: "linear-gradient(180deg,rgba(38,26,18,.94),rgba(24,16,11,.94))", boxShadow: "inset 0 0 0 1.5px #c9a25a, 0 16px 34px rgba(0,0,0,.6)" }}>
                {profiles.length > 1 && (
                  <button type="button" onClick={() => { setChosen(null); setError(null); }} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "#e8c98a" }}>
                    <ArrowLeft size={16} /> Outro utilizador
                  </button>
                )}
                <p className="mb-3 font-display-lg text-lg font-bold" style={{ color: "#f3e3bd" }}>{chosen.name}</p>
                <label htmlFor="pin" className="mb-2 block text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "#c9a25a" }}>PIN</label>
                <input
                  id="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-md border bg-[#fffdf6] px-4 py-3 text-lg tracking-[0.3em] text-[#2b2118] outline-none focus:ring-2 focus:ring-[#e8c98a]/60" style={{ borderColor: "rgba(201,162,90,.7)" }}
                />
                {error && <p role="alert" className="mt-3 text-sm font-semibold" style={{ color: "#ffb4a8" }}>{error}</p>}
                <button type="submit" disabled={busy || !pin}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 font-bold disabled:opacity-50"
                  style={{ background: "linear-gradient(180deg,#2a4d44,#1f3a34)", color: "#f3e3bd", boxShadow: "inset 0 0 0 1.5px #c9a25a, 0 4px 10px rgba(0,0,0,.35)" }}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Entrar
                </button>
              </div>
            </div>
            <div className="kb-plank" aria-hidden />
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <SpineWall />
      <div className="kb-login-in relative z-10 flex w-full justify-center">
        <Suspense fallback={null}><LoginForm /></Suspense>
      </div>
      <style>{`.kb-login-in{animation:kbIn .5s ease both}@keyframes kbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.kb-login-in{animation:none}}`}</style>
    </main>
  );
}
