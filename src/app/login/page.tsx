"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Loader2 } from "lucide-react";

function LoginForm() {
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao entrar.");
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded bg-primary text-on-primary">
          <BookOpen size={21} />
        </span>
        <span className="font-display-lg text-[26px] font-bold text-primary">KoboSync</span>
      </div>
      <label htmlFor="pin" className="mb-2 block text-sm font-bold text-on-surface-variant">
        PIN de acesso
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-background px-4 py-3 text-lg outline-none focus:border-primary"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !pin}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-50"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        Entrar
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-on-background">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
