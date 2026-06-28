/**
 * sync-library.ts
 *
 * ESTRATÉGIA DE ARMAZENAMENTO:
 * - EPUBs: NÃO são guardados no Supabase. São sempre lidos directamente do
 *   Google Drive na hora (via /api/books/[id]/download ou /api/books/[id]/content).
 * - Capas: guardadas no Supabase, comprimidas para JPEG 300×450px ~50 KB.
 * - Metadados: guardados na tabela `books`.
 *
 * LÓGICA DE SYNC:
 * 1. Lista todos os EPUBs do Drive.
 * 2. Compara com os drive_file_id já na BD → detecta livros genuinamente novos.
 * 3. Insere entradas básicas (título do nome do ficheiro) para todos os novos.
 * 4. Processa metadados + capa para até SYNC_PROCESS_LIMIT livros que ainda
 *    não têm capa OU cujo modified_at mudou no Drive.
 */

import { getServerConfig }               from "@/lib/env";
import { downloadFromDrive, listDriveEpubs } from "@/lib/google-drive";
import { parseEpub }                      from "@/lib/epub";
import { createServiceClient }            from "@/lib/supabase/server";

const stripExtension = (name: string) => name.replace(/\.epub$/i, "");

// Quantos livros processamos (download + capa) por chamada ao sync.
// Aumentado de 3 para 20 — cada livro demora 2-5s, 20 cabem em 60s (Vercel limit).
const syncProcessLimit = Number(process.env.SYNC_PROCESS_LIMIT ?? 20);

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
 * Insere apenas os livros que ainda não existem na BD (drive_file_id novo).
 * Devolve o número de livros verdadeiramente novos inseridos.
 */
async function insertNewBooks(
  files: Awaited<ReturnType<typeof listDriveEpubs>>["files"],
): Promise<number> {
  const supabase = createServiceClient();

  // 1. Busca todos os drive_file_id já conhecidos
  const { data: existing, error: fetchErr } = await supabase
    .from("books")
    .select("drive_file_id");

  if (fetchErr) throw fetchErr;

  const knownIds = new Set((existing ?? []).map((r: { drive_file_id: string }) => r.drive_file_id));

  // 2. Filtra apenas os genuinamente novos
  const newFiles = files.filter((f) => !knownIds.has(f.id));

  if (newFiles.length === 0) return 0;

  // 3. Insere em chunks de 250
  const chunkSize = 250;
  for (let i = 0; i < newFiles.length; i += chunkSize) {
    const chunk = newFiles.slice(i, i + chunkSize).map((file) => {
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
      .insert(chunk); // insert (não upsert) — só novos

    if (error) throw error;
  }

  console.log(`[Sync] Inserted ${newFiles.length} new books`);
  return newFiles.length;
}

/** Comprime e faz upload da capa (JPEG 300×450, ~50 KB) */
async function uploadCover(
  coverBytes: ArrayBuffer,
  bookId:     string,
): Promise<string | null> {
  try {
    const sharp      = (await import("sharp")).default;
    const compressed = await sharp(Buffer.from(coverBytes))
      .resize(300, 450, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    const supabase  = createServiceClient();
    const coverPath = `covers/${bookId}.jpg`;

    const { error } = await supabase.storage
      .from("covers")
      .upload(coverPath, compressed, {
        contentType:  "image/jpeg",
        upsert:       true,
        cacheControl: "2592000",
      });

    if (error) { console.error("[Sync] Cover upload error:", error); return null; }

    const { data } = supabase.storage.from("covers").getPublicUrl(coverPath);
    return data.publicUrl ?? null;
  } catch (err) {
    console.error("[Sync] Cover compress error:", err);
    return null;
  }
}

export async function syncLibrary() {
  const config   = getServerConfig();
  const supabase = createServiceClient();

  // ── 1. Listar todos os EPUBs do Drive ──
  const { files, token } = await listDriveEpubs({
    clientEmail:   config.googleClientEmail,
    privateKey:    config.googlePrivateKey,
    sharedDriveId: config.googleSharedDriveId,
    folderId:      config.googleDriveFolderId,
  });

  // ── 2. Inserir livros novos (drive_file_id desconhecido) ──
  const newCount = await insertNewBooks(files);

  // ── 3. Determinar quais livros precisam de processamento completo ──
  // Critérios (OR):
  //   a) Sem capa (cover_url IS NULL)
  //   b) modified_at no Drive diferente do que está na BD
  //
  // Fazemos isto com uma query simples: buscamos todos os livros da BD
  // e cruzamos com a lista do Drive.

  const { data: dbBooks, error: dbErr } = await supabase
    .from("books")
    .select("id, drive_file_id, modified_at, cover_url");

  if (dbErr) throw dbErr;

  const dbMap = new Map(
    (dbBooks ?? []).map((b: { id: string; drive_file_id: string; modified_at: string | null; cover_url: string | null }) =>
      [b.drive_file_id, b]
    )
  );

  // Livros que precisam de processamento, ordenados: sem capa primeiro, depois por data
  const toProcess = files.filter((file) => {
    const db = dbMap.get(file.id);
    if (!db) return false; // não existe ainda (acabou de ser inserido mas pode já estar)
    const noCover       = !db.cover_url;
    const dateChanged   = db.modified_at && file.modifiedTime
      ? new Date(db.modified_at).getTime() !== new Date(file.modifiedTime).getTime()
      : false;
    return noCover || dateChanged;
  });

  // Ordena: livros sem capa primeiro (mais prioritários)
  toProcess.sort((a, b) => {
    const aDb = dbMap.get(a.id);
    const bDb = dbMap.get(b.id);
    const aHasCover = !!aDb?.cover_url;
    const bHasCover = !!bDb?.cover_url;
    if (!aHasCover && bHasCover)  return -1;
    if (aHasCover  && !bHasCover) return  1;
    return 0;
  });

  // ── 4. Processar até syncProcessLimit livros ──
  let processed = 0;
  let skipped   = files.length - toProcess.length; // já estavam OK
  const errors: { file: string; message: string }[] = [];

  for (const file of toProcess) {
    if (processed >= syncProcessLimit) break;

    try {
      const db = dbMap.get(file.id);
      if (!db) continue;

      // Descarrega EPUB do Drive para extrair metadados + capa
      const epubBytes = await downloadFromDrive(file.id, token);
      const parsed    = await parseEpub(epubBytes, stripExtension(file.name));

      // Capa
      let coverUrl: string | null = db.cover_url ?? null;
      if (parsed.cover?.bytes && !db.cover_url) {
        coverUrl = await uploadCover(parsed.cover.bytes, db.id);
      }

      // Actualiza metadados na BD
      const { error: updateErr } = await supabase
        .from("books")
        .update({
          title:        parsed.metadata.title,
          author:       parsed.metadata.author,
          series:       parsed.metadata.series,
          series_index: parsed.metadata.seriesIndex,
          language:     parsed.metadata.language,
          publisher:    parsed.metadata.publisher,
          isbn:         parsed.metadata.isbn,
          description:  parsed.metadata.description,
          cover_url:    coverUrl,
          epub_url:     null,
          epub_path:    null,
          filesize:     file.size ? Number(file.size) : epubBytes.byteLength,
          modified_at:  file.modifiedTime ?? null,
        })
        .eq("drive_file_id", file.id);

      if (updateErr) throw updateErr;

      processed += 1;
      console.log(`[Sync] Processed ${processed}/${Math.min(toProcess.length, syncProcessLimit)}: ${parsed.metadata.title}`);
    } catch (err) {
      errors.push({
        file:    file.name,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const remaining = Math.max(0, toProcess.length - processed - errors.length);

  return {
    found:        files.length,   // total no Drive
    newBooks:     newCount,       // inseridos agora pela 1.ª vez
    processed,                    // metadados + capa actualizados
    skipped,                      // já estavam actualizados
    remaining,                    // ainda precisam de processamento (correr sync de novo)
    processLimit: syncProcessLimit,
    errors,
  };
}
