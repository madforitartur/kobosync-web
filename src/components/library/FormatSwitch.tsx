"use client";

export type Format = "epub" | "pdf";

/** Escolha da biblioteca: EPUBs ou PDFs. */
export function FormatSwitch({ value, onChange, compact }: { value: Format; onChange: (f: Format) => void; compact?: boolean }) {
  return (
    <div role="tablist" aria-label="Tipo de livros" className="inline-flex shrink-0 rounded-full border border-outline-variant p-0.5">
      {([["epub", "EPUB"], ["pdf", "PDF"]] as const).map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}
          className={`rounded-full font-bold transition ${compact ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs"} ${value === id ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>{label}</button>
      ))}
    </div>
  );
}
