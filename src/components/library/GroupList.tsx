"use client";

import { useMemo, useState } from "react";
import { Search, User, Library } from "lucide-react";
import type { Group } from "@/hooks/useFacets";

type Props = {
  kind: "series" | "authors";
  groups: Group[];
  compact: boolean;
  onOpen: (name: string) => void;
};

const STEP = 60;

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function GroupList({ kind, groups, compact, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);

  const filtered = useMemo(() => {
    const n = stripAccents(q.trim());
    return n ? groups.filter((g) => stripAccents(g.name).includes(n)) : groups;
  }, [groups, q]);

  const Icon = kind === "series" ? Library : User;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
        <Search size={16} className="text-outline" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setShown(STEP); }}
          placeholder={kind === "series" ? "Procurar série…" : "Procurar autor…"}
          className="w-full bg-transparent text-sm outline-none placeholder:text-outline"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-on-surface-variant">{kind === "series" ? "Nenhuma série encontrada." : "Nenhum autor encontrado."}</p>
      ) : (
        <>
          <ul className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}`}>
            {filtered.slice(0, shown).map((g) => (
              <li key={g.name}>
                <button onClick={() => onOpen(g.name)} className="group w-full rounded-xl border border-outline-variant p-3 text-left transition hover:bg-surface-container-low">
                  <div className="mb-2.5 flex h-24 items-center justify-center gap-[-8px] overflow-hidden rounded-lg bg-surface-container">
                    {g.covers.length > 0 ? (
                      g.covers.map((c, i) => (
                         
                        <img key={c} src={c} alt="" loading="lazy" className="h-24 w-16 object-cover shadow-md" style={{ marginLeft: i ? -18 : 0, zIndex: 3 - i }} />
                      ))
                    ) : (
                      <Icon size={30} className="text-outline" />
                    )}
                  </div>
                  <p className="truncate text-sm font-bold text-primary">{g.name}</p>
                  <p className="text-xs text-on-surface-variant">{g.count} {g.count === 1 ? "livro" : "livros"}</p>
                </button>
              </li>
            ))}
          </ul>
          {shown < filtered.length && (
            <button onClick={() => setShown((n) => n + STEP)} className="mx-auto mt-6 block rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-bold">
              Mostrar mais ({filtered.length - shown})
            </button>
          )}
        </>
      )}
    </div>
  );
}
