"use client";

import { useCallback, useEffect, useState } from "react";

export function useFullscreen(elementRef?: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      const fsEl =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      setIsFullscreen(!!fsEl);
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = elementRef?.current ?? document.documentElement;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" });
      } else if ((el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (el as HTMLElement & { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
      }
    } catch {
      // iOS Safari não suporta fullscreen — usa apenas viewport
      console.info("[Fullscreen] Não disponível, a usar viewport completo.");
    }
  }, [elementRef]);

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as Document & { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
        await (document as Document & { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
      }
    } catch {
      // ignora
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isFullscreen) await exit();
    else await enter();
  }, [isFullscreen, enter, exit]);

  return { isFullscreen, enter, exit, toggle };
}
