"use client";

import { useEffect } from "react";
import { loadSettings } from "@/lib/reader-settings";

/**
 * Arranque da app: se o ecrã completo estava ligado quando a app foi fechada, volta a ligá-lo
 * ao primeiro toque (o browser só deixa entrar em ecrã completo depois de um gesto do utilizador).
 */
export function AppBoot() {
  useEffect(() => {
    document.getElementById("kb-boot")?.remove(); // o fundo provisório já não é preciso
    // mesmo critério da app (useIsTouchDevice): ecrã tátil ou estreito; o PC nunca abre sozinho em ecrã completo
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0 || window.innerWidth < 1024;
    if (!touch || !loadSettings().autoFullscreen) return;
    const go = () => {
      if (document.fullscreenElement || window.matchMedia("(display-mode: fullscreen)").matches || !loadSettings().autoFullscreen) return;
      document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
    };
    window.addEventListener("pointerup", go, { once: true });
    return () => window.removeEventListener("pointerup", go);
  }, []);
  return null;
}
