"use client";

import { useCallback, useEffect, useState } from "react";
import { OFFLINE_EVENT, listOffline, offlineSupported, removeOffline, saveOffline } from "@/lib/offline";

export function useOffline() {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => { listOffline().then(setSaved).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(OFFLINE_EVENT, refresh);
    return () => window.removeEventListener(OFFLINE_EVENT, refresh);
  }, [refresh]);

  const toggle = useCallback(async (id: string): Promise<"saved" | "removed"> => {
    setBusy(id);
    try {
      if (saved.has(id)) { await removeOffline(id); return "removed"; }
      await saveOffline(id);
      return "saved";
    } finally { setBusy(null); }
  }, [saved]);

  return { saved, busy, toggle, supported: offlineSupported() };
}
