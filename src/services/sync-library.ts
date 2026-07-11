/**
 * sync-library.ts
 *
 * FASE 1 — syncLibrary() — rápido (<30s):
 *   Lista todos os EPUBs do Drive recursivamente e insere entradas básicas
 *   (título do nome do ficheiro) para os livros novos. Sem download de EPUBs.
 *
 * FASE 2 — processCovers() — chamado separadamente via /api/covers/sync-all:
 *   Para cada livro sem capa, descarrega o EPUB, extrai metadados reais
 *   e a capa, comprime e guarda no Supabase.
 */

import { getServerConfig }               from "@/lib/env";
import { listDriveEpubs }                from "@/lib/google-drive";
import { createServiceClient }           from "@/lib/supabase/server";

const stripExtension = (name: string) => name.replace(/\.epub$/i, "");

function basicMetadataFromFilename(fileName: string) {
  const name      = stripExtension(fileName);
  const separator = name.lastIndexOf(" - ");
  if (separator > 0) {
    return {
      title:  name.slice(0, separator).trim(),
      author: name.slice(separator + 3).trim() || null,
    };
  }
  return { title: name, author: null };
}

/**
 * Insere apenas os livros que ainda não existem na BD.
 * Usa upsert com ignoreDuplicates para ser idempotente e seguro.
 */
async function insertNewBooks(
  files: Awaited<ReturnType<typeof listDriveEpubs>>["files"],
): Promise<number> {
  const supabase = createServiceClient();

  // Busca os drive_file_id já conhecidos em chunks (evita query enorme)
  const CHUNK = 500;
  const knownIds = new Set<string>();

  for (let i = 0; i < files.length; i += CHUNK) {
    const ids = files.slice(i, i + CHUNK).map((f) => f.id);
    const { data } = await supabase
      .from("books")
      .select("drive_file_id")
      .in("drive_file_id", ids);
    for (const r of data ?? []) knownIds.add(r.drive_file_id);
  }

  const newFiles = files.filter((f) => !knownIds.has(f.id));
  if (newFiles.length === 0) return 0;

  // Insere em chunks de 200
  for (let i = 0; i < newFiles.length; i += 200) {
    const chunk = newFiles.slice(i, i + 200).map((file) => {
      const m = basicMetadataFromFilename(file.name);
      return {
        drive_file_id: file.id,
        title:         m.title,
        author:        m.author,
        cover_url:     null,
        epub_url:      null,
        filesize:      file.size ? Number(file.size) : null,
        modified_at:   file.modifiedTime ?? null,
      };
    });

    const { error } = await supabase
      .from("books")
      .upsert(chunk, { onConflict: "drive_file_id", ignoreDuplicates: true });

    if (error) throw error;
  }

  console.log(`[Sync] Inserted ${newFiles.length} new books`);
  return newFiles.length;
}

export async function syncLibrary() {
  const config = getServerConfig();

  // ── 1. Listar todos os EPUBs do Drive (recursivo) ──
  const { files } = await listDriveEpubs({
    clientEmail:   config.googleClientEmail,
    privateKey:    config.googlePrivateKey,
    sharedDriveId: config.googleSharedDriveId,
    folderId:      config.googleDriveFolderId,
  });

  // ── 2. Inserir apenas livros novos ──
  const newCount = await insertNewBooks(files);

  // ── 3. Contar livros sem capa (para informar o utilizador) ──
  const supabase = createServiceClient();
  const { count: withoutCover } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .is("cover_url", null);

  return {
    found:        files.length,
    newBooks:     newCount,
    withoutCover: withoutCover ?? 0,
    message:      newCount > 0
      ? `${newCount} livro${newCount !== 1 ? "s" : ""} novo${newCount !== 1 ? "s" : ""} adicionado${newCount !== 1 ? "s" : ""}.${withoutCover ? ` ${withoutCover} sem capa — clica em "Capas" para processar.` : ""}`
      : withoutCover
        ? `Sem livros novos. ${withoutCover} sem capa — clica em "Capas" para processar.`
        : "Biblioteca actualizada.",
  };
}
