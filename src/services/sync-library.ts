/**
 * sync-library.ts
 *
 * ESTRATÉGIA DE ARMAZENAMENTO:
 * - EPUBs: NÃO são guardados no Supabase. São sempre lidos directamente do
 *   Google Drive na hora (via /api/books/[id]/download ou /api/books/[id]/content).
 *   Isto poupa todo o espaço dos EPUBs (tipicamente 5–50 MB cada).
 *
 * - Capas: guardadas no Supabase, mas comprimidas para JPEG 300×450px ≤ 250 KB
 *   (via sharp). Uma biblioteca de 500 livros ocupa ~125 MB em capas.
 *
 * - Metadados: guardados na tabela `books` (texto, sem custo de storage).
 */

import { getServerConfig } from "@/lib/env";
import { downloadFromDrive, listDriveEpubs } from "@/lib/google-drive";
import { parseEpub } from "@/lib/epub";
import { createServiceClient } from "@/lib/supabase/server";

const stripExtension = (name: string) => name.replace(/\.epub$/i, "");
const syncProcessLimit = Number(process.env.SYNC_PROCESS_LIMIT ?? 3);

function basicMetadataFromFilename(fileName: string) {
  const name      = stripExtension(fileName);
  const separator = name.lastIndexOf(" - ");
  if (separator > 0) {
    return { title: name.slice(0, separator).trim(), author: name.slice(separator + 3).trim() || null };
  }
  return { title: name, author: null };
}

async function insertMissingBooks(files: Awaited<ReturnType<typeof listDriveEpubs>>["files"]) {
  const supabase  = createServiceClient();
  const chunkSize = 250;

  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize).map((file) => {
      const m = basicMetadataFromFilename(file.name);
      return {
        drive_file_id: file.id,
        title:         m.title,
        author:        m.author,
        series:        null,
        series_index:  null,
        language:      null,
        publisher:     null,
        isbn:          null,
        description:   null,
        cover_url:     null,
        epub_url:      null,          // nunca guardamos EPUB no Supabase
        filesize:      file.size ? Number(file.size) : null,
        modified_at:   file.modifiedTime ?? null,
      };
    });

    const { error } = await supabase
      .from("books")
      .upsert(chunk, { onConflict: "drive_file_id", ignoreDuplicates: true });

    if (error) throw error;
  }
}

/** Comprime e faz upload da capa para Supabase (JPEG 300×450, ≤250 KB) */
async function uploadCover(
  coverBytes:   ArrayBuffer,
  coverMime:    string,
  bookId:       string,
): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;

    const compressed = await sharp(Buffer.from(coverBytes))
      .resize(300, 450, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    const supabase   = createServiceClient();
    const coverPath  = `covers/${bookId}.jpg`;

    const { error } = await supabase.storage
      .from("covers")
      .upload(coverPath, compressed, {
        contentType:  "image/jpeg",
        upsert:       true,
        cacheControl: "2592000",    // 30 dias no CDN
      });

    if (error) { console.error("[Sync] Cover upload error:", error); return null; }

    // URL pública (capas são bucket público)
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

  const { files, token } = await listDriveEpubs({
    clientEmail:   config.googleClientEmail,
    privateKey:    config.googlePrivateKey,
    sharedDriveId: config.googleSharedDriveId,
    folderId:      config.googleDriveFolderId,
  });

  await insertMissingBooks(files);

  let processed = 0;
  let skipped   = 0;
  const errors: { file: string; message: string }[] = [];

  for (const file of files) {
    if (processed >= syncProcessLimit) break;

    try {
      const { data: existing } = await supabase
        .from("books")
        .select("id, modified_at, cover_url")
        .eq("drive_file_id", file.id)
        .maybeSingle();

      // Salta se já temos metadados actualizados e capa
      if (
        existing?.modified_at && file.modifiedTime &&
        new Date(existing.modified_at).getTime() === new Date(file.modifiedTime).getTime() &&
        existing.cover_url
      ) {
        skipped += 1;
        continue;
      }

      // Descarrega EPUB do Drive para extrair metadados + capa
      const epubBytes = await downloadFromDrive(file.id, token);
      const parsed    = await parseEpub(epubBytes, stripExtension(file.name));

      // Capa: comprimir e guardar no Supabase
      let coverUrl: string | null = null;
      if (parsed.cover?.bytes) {
        const existing_id = existing?.id;
        if (existing_id) {
          coverUrl = await uploadCover(parsed.cover.bytes, parsed.cover.contentType, existing_id);
        } else {
          // Precisa do id gerado — vai buscar após upsert
          coverUrl = null; // actualizado logo abaixo
        }
      }

      // Guarda metadados SEM epub_url (EPUB fica no Drive)
      const record = {
        drive_file_id: file.id,
        title:         parsed.metadata.title,
        author:        parsed.metadata.author,
        series:        parsed.metadata.series,
        series_index:  parsed.metadata.seriesIndex,
        language:      parsed.metadata.language,
        publisher:     parsed.metadata.publisher,
        isbn:          parsed.metadata.isbn,
        description:   parsed.metadata.description,
        cover_url:     coverUrl,
        epub_url:      null,   // não guardamos EPUB no Supabase
        epub_path:     null,
        filesize:      file.size ? Number(file.size) : epubBytes.byteLength,
        modified_at:   file.modifiedTime ?? null,
      };

      const { data: upserted, error: upsertError } = await supabase
        .from("books")
        .upsert(record, { onConflict: "drive_file_id" })
        .select("id")
        .single();

      if (upsertError) throw upsertError;

      // Se não tínhamos o id ainda, faz upload da capa agora
      if (!coverUrl && parsed.cover?.bytes && upserted?.id) {
        const url = await uploadCover(parsed.cover.bytes, parsed.cover.contentType, upserted.id);
        if (url) {
          await supabase.from("books").update({ cover_url: url }).eq("id", upserted.id);
        }
      }

      processed += 1;
    } catch (error) {
      errors.push({
        file:    file.name,
        message: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return {
    found:        files.length,
    processed,
    skipped,
    inserted:     files.length,
    processLimit: syncProcessLimit,
    errors,
  };
}
