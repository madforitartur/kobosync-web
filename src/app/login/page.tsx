"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { adoptUser } from "@/lib/user-session";

type Profile = { id: string; name: string; role: "admin" | "user" };

const COLORS = ["#2f4f7f", "#8f3d2a", "#3b6b4f", "#6b4a8f", "#9a6b1f", "#2f6f73", "#8f3a63", "#4f5b6b"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

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
    <div className="mb-6 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary"><BookOpen size={21} /></span>
      <span className="font-display-lg text-[26px] font-bold text-primary">KoboSync</span>
    </div>
  );

  if (!profiles) {
    return <div className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 shadow-sm">{header}<Loader2 className="animate-spin text-primary" /></div>;
  }

  if (!chosen) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
        {header}
        <h1 className="mb-4 text-sm font-bold text-on-surface-variant">Quem vai ler?</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profiles.map((p) => (
            <button key={p.id} onClick={() => { setChosen(p); setPin(""); setError(null); }}
              className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant p-4 hover:border-primary">
              <span className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: colorFor(p.id) }}>
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-full truncate text-sm font-bold text-primary">{p.name}</span>
              {p.role === "admin" && <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-outline"><ShieldCheck size={11} /> Admin</span>}
            </button>
          ))}
        </div>
        {profiles.length === 0 && <p className="text-sm text-error">Não foi possível carregar os perfis.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
      {header}
      {profiles.length > 1 && (
        <button type="button" onClick={() => { setChosen(null); setError(null); }} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <ArrowLeft size={16} /> Outro utilizador
        </button>
      )}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: colorFor(chosen.id) }}>{chosen.name.charAt(0).toUpperCase()}</span>
        <span className="text-lg font-bold text-primary">{chosen.name}</span>
      </div>
      <label htmlFor="pin" className="mb-2 block text-sm font-bold text-on-surface-variant">PIN</label>
      <input
        id="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-background px-4 py-3 text-lg outline-none focus:border-primary"
      />
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-error">{error}</p>}
      <button type="submit" disabled={busy || !pin}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50">
        {busy && <Loader2 size={16} className="animate-spin" />} Entrar
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-on-background">
      <Suspense fallback={null}><LoginForm /></Suspense>
    </main>
  );
}
