"use client";
import { useCallback, useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// O browser dispara "beforeinstallprompt" uma só vez e cedo (pode ser antes de a biblioteca abrir),
// por isso guarda-se aqui, ao nível do módulo, assim que a app arranca.
let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let started = false;

export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; emit(); });
}

export const isStandaloneApp = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    startInstallCapture();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    const ev = deferred;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") { deferred = null; emit(); }
    return outcome;
  }, []);
  return { canInstall: !!deferred, installed, standalone: isStandaloneApp(), install };
}
