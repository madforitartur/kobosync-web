"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detectar iOS (Safari não suporta beforeinstallprompt)
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    // Verificar se já está instalado como PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    if (ios) {
      // iOS: mostrar botão com instruções
      setIsInstallable(true);
      return;
    }

    // Android/Chrome/Edge: aguarda evento
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isInstalled || !isInstallable) return null;

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHint((v) => !v);
      return;
    }

    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleInstall}
        className="flex h-10 w-10 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container sm:w-auto sm:gap-2 sm:px-3"
        aria-label="Instalar aplicação"
        title="Instalar KoboSync"
      >
        <Download size={18} />
        <span className="hidden text-xs font-bold uppercase tracking-wider sm:inline">
          Instalar
        </span>
      </button>

      {/* Tooltip iOS */}
      {showIOSHint && isIOS && (
        <div className="absolute right-0 top-12 z-[300] w-64 rounded-lg border border-outline-variant bg-background p-4 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-outline">
            Instalar no iPhone / iPad
          </p>
          <ol className="mt-2 space-y-1 text-sm text-on-surface-variant">
            <li>1. Toca em <strong>Partilhar</strong> <span className="text-base">⬆️</span></li>
            <li>2. Escolhe <strong>"Adicionar ao Ecrã de Início"</strong></li>
            <li>3. Toca em <strong>Adicionar</strong></li>
          </ol>
          <button
            onClick={() => setShowIOSHint(false)}
            className="mt-3 text-xs font-bold text-primary underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
