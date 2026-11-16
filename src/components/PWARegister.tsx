"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/pwa-install";

export function PWARegister() {
  useEffect(() => {
    startInstallCapture();
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Nova versão disponível — poderíamos mostrar um toast aqui
              console.log("[PWA] Nova versão disponível. Recarrega para atualizar.");
            }
          });
        });
      } catch (err) {
        console.error("[PWA] Erro ao registar Service Worker:", err);
      }
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
