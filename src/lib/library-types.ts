export type SortKey = "title" | "author" | "recent" | "series" | "size" | "relevance";
export type StatusFilter = "all" | "unread" | "reading" | "finished";

export type Filters = {
  author?: string;
  series?: string;
  language?: string;
  collectionId?: string;
  status: StatusFilter;
};

export const EMPTY_FILTERS: Filters = { status: "all" };

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "title", label: "Título (A–Z)" },
  { id: "author", label: "Autor" },
  { id: "series", label: "Série" },
  { id: "recent", label: "Mais recentes" },
  { id: "size", label: "Maiores" },
];

export const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "unread", label: "Por ler" },
  { id: "reading", label: "A ler" },
  { id: "finished", label: "Lidos" },
];

export const LANGUAGE_NAMES: Record<string, string> = {
  pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês", de: "Alemão", it: "Italiano",
};

export function activeFilterCount(f: Filters): number {
  return [f.author, f.series, f.language, f.collectionId].filter(Boolean).length + (f.status !== "all" ? 1 : 0);
}
