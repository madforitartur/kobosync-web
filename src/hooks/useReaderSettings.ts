"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_EVENT,
  loadSettings,
  saveSettings,
  type ReaderSettings,
} from "@/lib/reader-settings";

/** Definições de leitura sincronizadas entre separadores (evento "storage") e componentes. */
export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const refresh = () => setSettings(loadSettings());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(SETTINGS_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(SETTINGS_EVENT, refresh);
    };
  }, []);

  const update = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings(saveSettings(patch));
  }, []);

  return { settings, update };
}
