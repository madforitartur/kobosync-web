import { getServerConfig } from "@/lib/env";
import { downloadFromDrive, listDriveEpubs } from "@/lib/google-drive";
import { parseEpub } from "@/lib/epub";
import { createServiceClient } from "@/lib/supabase/server";
import type { Book } from "@/types/library";

const stripExtension = (name: string) => name.replace(/\.epub$/i, "");
const syncProcessLimit = Number(process.env.SYNC_PROCESS_LIMIT ?? 3);

function storagePath(fileId: string, filename: string) {
  return `${fileId}/${filename.replace(/[^\w.\-]+/g, "-")}`;
}

function basicMetadataFromFilename(fileName: string) {
  const name = stripExtension(fileName);
  const separator = name.lastIndexOf(" - ");

  if (separator > 0) {
    return {
      title: name.slice(0, separator).trim(),
      author: name.slice(separator + 3).trim() || null,
    };
  }

  return {
    title: name,
    author: null,
  };
}

async function insertMissingBooks(files: Awaited<ReturnType<typeof listDriveEpubs>>["files"]) {
  const supabase = createServiceClient();
  const chunkSize = 250;

  for (let index = 0; index < files.length; index += chunkSize) {
    const chunk = files.slice(index, index + chunkSize).map((file) => {
      const metadata = basicMetadataFromFilename(file.name);

      return {
        drive_file_id: file.id,
        title: metadata.title,
        author: metadata.author,
        series: null,
        series_index: null,
        language: null,
        publisher: null,
        isbn: null,
        description: null,
        cover_url: null,
        epub_url: null,
        filesize: file.size ? Number(file.size) : null,
        modified_at: file.modifiedTime ?? null,
      };
    });

    const { error } = await supabase
      .from("books")
      .upsert(chunk, { onConflict: "drive_file_id", ignoreDuplicates: true });

    if (error) {
      throw error;
    }
  }
}

export async function syncLibrary() {
  const config = getServerConfig();
  const supabase = createServiceClient();
  const { files, token } = await listDriveEpubs({
    clientEmail: config.googleClientEmail,
    privateKey: config.googlePrivateKey,
    sharedDriveId: config.googleSharedDriveId,
    folderId: config.googleDriveFolderId,
  });

  await insertMissingBooks(files);

  let processed = 0;
  let skipped = 0;
  const errors: { file: string; message: string }[] = [];

  for (const file of files) {
    if (processed >= syncProcessLimit) {
      break;
    }

    try {
      const { data: existing } = await supabase
        .from("books")
        .select("id,modified_at,cover_url,epub_url")
        .eq("drive_file_id", file.id)
        .maybeSingle();

      if (
        existing?.modified_at &&
        file.modifiedTime &&
        new Date(existing.modified_at).getTime() === new Date(file.modifiedTime).getTime() &&
        existing.cover_url &&
        existing.epub_url
      ) {
        skipped += 1;
        continue;
      }

      const epubBytes = await downloadFromDrive(file.id, token);
      const parsed = await parseEpub(epubBytes, stripExtension(file.name));

      const epubPath = storagePath(file.id, file.name);
      const { error: epubError } = await supabase.storage
        .from("epubs")
        .upload(epubPath, epubBytes, {
          upsert: true,
          contentType: "application/epub+zip",
        });

      if (epubError) throw epubError;

      const { data: epubPublic } = supabase.storage.from("epubs").getPublicUrl(epubPath);
      let coverUrl: string | null = null;

      if (parsed.cover) {
        const coverPath = storagePath(file.id, parsed.cover.filename);
        const { error: coverError } = await supabase.storage
          .from("covers")
          .upload(coverPath, parsed.cover.bytes, {
            upsert: true,
            contentType: parsed.cover.contentType,
          });

        if (coverError) throw coverError;
        coverUrl = supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
      }

      const record = {
        drive_file_id: file.id,
        title: parsed.metadata.title,
        author: parsed.metadata.author,
        series: parsed.metadata.series,
        series_index: parsed.metadata.seriesIndex,
        language: parsed.metadata.language,
        publisher: parsed.metadata.publisher,
        isbn: parsed.metadata.isbn,
        description: parsed.metadata.description,
        cover_url: coverUrl,
        epub_url: epubPublic.publicUrl,
        filesize: file.size ? Number(file.size) : epubBytes.byteLength,
        modified_at: file.modifiedTime ?? null,
      };

      const { error: upsertError } = await supabase
        .from("books")
        .upsert(record, { onConflict: "drive_file_id" });

      if (upsertError) throw upsertError;
      processed += 1;
    } catch (error) {
      errors.push({
        file: file.name,
        message: error instanceof Error ? error.message : "Unknown sync error",
      });
    }
  }

  return {
    found: files.length,
    processed,
    skipped,
    inserted: files.length,
    processLimit: syncProcessLimit,
    errors,
  };
}
