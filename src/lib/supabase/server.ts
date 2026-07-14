import type { Book } from "@/types/library";
import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "@/lib/env";

export function createServiceClient() {
  const config = getServerConfig();
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ListBooksOptions = {
  from?: number;
  to?: number;
  count?: boolean;
};

export async function listBooks(
  search?: string,
  options: ListBooksOptions = {}
): Promise<Book[]> {
  const supabase = createServiceClient();
  const term = search?.trim();

  let query = supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });

  if (options.from !== undefined && options.to !== undefined) {
    query = query.range(options.from, options.to);
  }

  if (term) {
    const escaped = term.replace(/[%_,]/g, "\\$&");
    query = query.or(
      [
        `title.ilike.%${escaped}%`,
        `author.ilike.%${escaped}%`,
        `series.ilike.%${escaped}%`,
        `publisher.ilike.%${escaped}%`,
        `isbn.ilike.%${escaped}%`,
      ].join(","),
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return await refreshCoverUrls(data as Book[], supabase);
}

export async function listBooksByIds(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) return [];

  const supabase = createServiceClient();
  const uniqueIds = [...new Set(ids)];

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .in("id", uniqueIds)
    .order("title", { ascending: true });

  if (error) throw error;
  return await refreshCoverUrls(data as Book[], supabase);
}

export async function countBooks(search?: string): Promise<number> {
  const supabase = createServiceClient();
  const term = search?.trim();

  let query = supabase
    .from("books")
    .select("*", { count: "exact", head: true });

  if (term) {
    const escaped = term.replace(/[%_,]/g, "\\$&");
    query = query.or(
      [
        `title.ilike.%${escaped}%`,
        `author.ilike.%${escaped}%`,
        `series.ilike.%${escaped}%`,
        `publisher.ilike.%${escaped}%`,
        `isbn.ilike.%${escaped}%`,
      ].join(","),
    );
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listAuthors(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("author")
    .not("author", "is", null)
    .not("author", "eq", "")
    .order("author", { ascending: true });

  if (error) throw error;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data ?? []) {
    const author = (row as { author: string }).author;
    if (author && !seen.has(author)) {
      seen.add(author);
      result.push(author);
    }
  }
  return result;
}

export async function listSeries(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("series")
    .not("series", "is", null)
    .not("series", "eq", "")
    .order("series", { ascending: true });

  if (error) throw error;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of data ?? []) {
    const series = (row as { series: string }).series;
    if (series && !seen.has(series)) {
      seen.add(series);
      result.push(series);
    }
  }
  return result;
}

/**
 * Para cada livro com cover_path, gera signed URL fresca.
 * Usa URL pública (bucket covers é público) — sem signed URLs, sem latência extra.
 * Filtra livros marcados como "_failed_" (sem capa no Drive).
 */
async function refreshCoverUrls(
  books: Book[],
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Book[]> {
  if (books.length === 0) return books;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return books.map((book) => {
    const updated = { ...book };

    // Limpar sentinel _failed_ — mostra sem capa em vez do sentinel
    if (updated.cover_url === "_failed_") {
      updated.cover_url = null;
    }

    // Se tem cover_path mas cover_url está em falta/expirada, reconstrói URL pública
    if (book.cover_path && (!book.cover_url || book.cover_url === "_failed_")) {
      updated.cover_url = `${SUPABASE_URL}/storage/v1/object/public/covers/${book.cover_path}`;
    }

    return updated;
  });
  // Nota: Promise.all removido — URL pública não precisa de IO
}
