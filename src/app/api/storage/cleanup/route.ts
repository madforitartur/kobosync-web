/**
 * POST /api/storage/cleanup
 * Apaga todos os ficheiros do bucket "epubs" do Supabase.
 * Os livros continuam acessíveis via Google Drive.
 * As capas no bucket "covers" NÃO são afectadas.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime     = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const supabase = createServiceClient();
  let totalDeleted = 0;
  let totalErrors  = 0;

  // 1. Listar e apagar todos os ficheiros do bucket "epubs"
  let offset = 0;
  const PAGE = 100;

  while (true) {
    const { data: files, error: listErr } = await supabase.storage
      .from("epubs")
      .list("", { limit: PAGE, offset });

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    if (!files || files.length === 0) break;

    // Apagar em lotes de 100
    const paths = files.map((f) => f.name);
    const { error: delErr } = await supabase.storage
      .from("epubs")
      .remove(paths);

    if (delErr) {
      totalErrors += paths.length;
      console.error("[Cleanup] Erro ao apagar:", delErr.message);
    } else {
      totalDeleted += paths.length;
    }

    if (files.length < PAGE) break;
    offset += PAGE;
  }

  // 2. Listar ficheiros em subpastas (formato drive_file_id/filename.epub)
  // O Supabase Storage pode ter ficheiros em "pastas" (prefixos)
  // Tentar listar prefixos e apagar recursivamente
  const { data: topLevel } = await supabase.storage
    .from("epubs")
    .list("", { limit: 1000 });

  const folders = (topLevel ?? []).filter((f) => f.id === null); // pastas não têm id

  for (const folder of folders) {
    let folderOffset = 0;
    while (true) {
      const { data: folderFiles } = await supabase.storage
        .from("epubs")
        .list(folder.name, { limit: PAGE, offset: folderOffset });

      if (!folderFiles || folderFiles.length === 0) break;

      const paths = folderFiles.map((f) => `${folder.name}/${f.name}`);
      const { error: delErr } = await supabase.storage
        .from("epubs")
        .remove(paths);

      if (delErr) {
        totalErrors += paths.length;
      } else {
        totalDeleted += paths.length;
      }

      if (folderFiles.length < PAGE) break;
      folderOffset += PAGE;
    }
  }

  // 3. Limpar epub_url e epub_path da tabela books
  const { error: updateErr } = await supabase
    .from("books")
    .update({ epub_url: null, epub_path: null })
    .not("epub_url", "is", null);

  // 4. Verificar espaço restante no bucket
  const { data: remaining } = await supabase.storage
    .from("epubs")
    .list("", { limit: 1 });

  return NextResponse.json({
    deleted:         totalDeleted,
    errors:          totalErrors,
    epubUrlsCleared: !updateErr,
    bucketEmpty:     (remaining ?? []).length === 0,
    message:         `${totalDeleted} ficheiros EPUB apagados do Supabase Storage.`,
  });
}

export async function GET() {
  const supabase = createServiceClient();

  // Contar ficheiros no bucket epubs
  let total = 0;

  const { data: topLevel } = await supabase.storage
    .from("epubs")
    .list("", { limit: 1000 });

  const files   = (topLevel ?? []).filter((f) => f.id !== null);
  const folders = (topLevel ?? []).filter((f) => f.id === null);
  total += files.length;

  for (const folder of folders) {
    const { data: sub } = await supabase.storage
      .from("epubs")
      .list(folder.name, { limit: 1000 });
    total += (sub ?? []).length;
  }

  // Contar livros com epub_url ainda preenchida
  const { count: withEpubUrl } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .not("epub_url", "is", null);

  return NextResponse.json({
    epubFilesInStorage: total,
    booksWithEpubUrl:   withEpubUrl ?? 0,
    recommendation:     total > 0
      ? `Corre POST /api/storage/cleanup para apagar ${total} EPUBs do Supabase`
      : "Bucket epubs já está vazio.",
  });
}
