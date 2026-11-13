"use client";

import { useEffect, useState } from "react";

export type Group = { name: string; count: number; covers: string[] };
type Facets = { authors: Group[]; series: Group[]; languages: Group[] };

export function useFacets(reloadKey: number) {
  const [facets, setFacets] = useState<Facets>({ authors: [], series: [], languages: [] });
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/library/facets", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFacets(d))
      .catch(() => {});
    return () => c.abort();
  }, [reloadKey]);
  return facets;
}
