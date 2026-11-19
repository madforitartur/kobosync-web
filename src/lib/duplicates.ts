import type { Book } from "@/types/library";

/** Normaliza para comparar: sem acentos, maiúsculas, parênteses, pontuação nem espaços a mais. */
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([{].*?[)\]}]/g, " ")
    .replace(/\b(copy|copia|cópia)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type DupGroup = { key: string; books: Book[] };

/**
 * Livros repetidos = mesmo título e mesmo autor (ou um deles sem autor).
 * Grupos só com um livro visível, ou já marcados como "manter", não precisam de decisão.
 */
export function findDuplicateGroups(all: Book[]): DupGroup[] {
  const byTitle = new Map<string, Book[]>();
  for (const b of all) {
    const t = norm(b.title);
    if (t.length < 2) continue;
    byTitle.set(t, [...(byTitle.get(t) ?? []), b]);
  }
  const groups: DupGroup[] = [];
  for (const [t, list] of byTitle) {
    if (list.length < 2) continue;
    const authors = new Set(list.map((b) => norm(b.author)).filter(Boolean));
    if (authors.size <= 1) {
      groups.push({ key: t, books: list });
    } else {
      // autores diferentes com o mesmo título não são repetidos; só agrupa por autor
      for (const a of authors) {
        const same = list.filter((b) => norm(b.author) === a || !norm(b.author));
        if (same.length >= 2) groups.push({ key: `${t}|${a}`, books: same });
      }
    }
  }
  return groups;
}

export const isPending = (g: DupGroup) => g.books.filter((b) => !b.hidden).length >= 2 && !g.books.every((b) => b.dup_ok || b.hidden);

/** Melhor candidato a manter: o maior ficheiro; em empate, o mais antigo. */
export function bestOf(books: Book[]): Book {
  return [...books].sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0) || (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
}
