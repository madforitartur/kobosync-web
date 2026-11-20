"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { adoptUser } from "@/lib/user-session";
import { SpineWall } from "@/components/login/SpineWall";

type Profile = { id: string; name: string; role: "admin" | "user" };

const COLORS = ["#2f4f7f", "#8f3d2a", "#3b6b4f", "#6b4a8f", "#9a6b1f", "#2f6f73", "#8f3a63", "#4f5b6b"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

/** Ficha de biblioteca (papel creme, linhas, margem vermelha e furo no fundo). */
function CatalogCard({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`kb-card relative w-full ${wide ? "max-w-md" : "max-w-sm"} rounded-[10px] px-8 pb-12 pt-7 text-[#2b2118]`}
      style={{
        background:
          "linear-gradient(90deg, transparent 52px, rgba(190,60,50,.55) 52px 53px, transparent 53px), repeating-linear-gradient(180deg, transparent 0 27px, rgba(70,110,160,.22) 27px 28px), #f6efdf",
        boxShadow: "0 30px 60px -10px rgba(0,0,0,.7), 0 0 0 1px rgba(120,85,40,.55), inset 0 0 40px rgba(150,110,60,.18)",
      }}
    >
      <span aria-hidden className="absolute bottom-3.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full" style={{ background: "#1c130d", boxShadow: "inset 0 2px 3px rgba(0,0,0,.8), 0 1px 0 rgba(255,255,255,.4)" }} />
      <div className="pl-8">{children}</div>
    </div>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [chosen, setChosen] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const header = (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-sm" style={{ background: "#1f3a34", color: "#e8c98a", boxShadow: "inset 0 0 0 1.5px #c9a25a" }}><BookOpen size={19} /></span>
        <span className="font-display-lg text-[28px] font-bold leading-none" style={{ color: "#1f2b25" }}>KoboSync</span>
      </div>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "#8a5a2b" }}>A tua biblioteca</p>
    </div>
  );

  if (!profiles) {
    return <CatalogCard>{header}<Loader2 className="animate-spin" style={{ color: "#1f3a34" }} /></CatalogCard>;
  }

  if (!chosen) {
    return (
      <CatalogCard wide>
        {header}
        <h1 className="mb-4 font-display-lg text-lg font-bold" style={{ color: "#3b2a1a" }}>Quem vai ler?</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profiles.map((p) => (
            <button key={p.id} onClick={() => { setChosen(p); setPin(""); setError(null); }}
              className="flex flex-col items-center gap-2 rounded-md border p-3 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f3a34]"
              style={{ borderColor: "rgba(120,85,40,.45)", background: "rgba(255,252,243,.75)" }}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full font-display-lg text-xl font-bold text-white" style={{ background: colorFor(p.id), boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35), 0 0 0 2px #c9a25a" }}>
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-full truncate text-sm font-bold" style={{ color: "#2b2118" }}>{p.name}</span>
              {p.role === "admin" && <span className="flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: "#8a5a2b" }}><ShieldCheck size={11} /> Admin</span>}
            </button>
          ))}
        </div>
        {profiles.length === 0 && <p className="text-sm font-semibold" style={{ color: "#a02020" }}>Não foi possível carregar os perfis.</p>}
      </CatalogCard>
    );
  }

  return (
    <form onSubmit={submit} className="contents">
     <CatalogCard>
      {header}
      {profiles.length > 1 && (
        <button type="button" onClick={() => { setChosen(null); setError(null); }} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "#1f3a34" }}>
          <ArrowLeft size={16} /> Outro utilizador
        </button>
      )}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full font-display-lg text-lg font-bold text-white" style={{ background: colorFor(chosen.id), boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35), 0 0 0 2px #c9a25a" }}>{chosen.name.charAt(0).toUpperCase()}</span>
        <span className="font-display-lg text-xl font-bold" style={{ color: "#2b2118" }}>{chosen.name}</span>
      </div>
      <label htmlFor="pin" className="mb-2 block text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "#8a5a2b" }}>PIN</label>
      <input
        id="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full rounded-md border bg-[#fffdf6] px-4 py-3 text-lg tracking-[0.3em] outline-none focus:border-[#1f3a34] focus:ring-2 focus:ring-[#1f3a34]/25" style={{ borderColor: "rgba(120,85,40,.55)" }}
      />
      {error && <p role="alert" className="mt-3 text-sm font-semibold" style={{ color: "#a02020" }}>{error}</p>}
      <button type="submit" disabled={busy || !pin}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 font-bold disabled:opacity-50"
        style={{ background: "linear-gradient(180deg,#2a4d44,#1f3a34)", color: "#f3e3bd", boxShadow: "inset 0 0 0 1.5px #c9a25a, 0 4px 10px rgba(0,0,0,.35)" }}>
        {busy && <Loader2 size={16} className="animate-spin" />} Entrar
      </button>
     </CatalogCard>
    </form>
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
