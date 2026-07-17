import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/covers/migrate
 * Para cada livro com cover_path mas cover_url errada/expirada,
 * reconstrói a cover_url pública correcta.
 * Também limpa signed URLs expiradas (contêm "token=").
 */
export async function POST() {
  const supabase = createServiceClient();
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

  // 1. Livros com cover_path correcto mas cover_url errada
  const { data: withPath } = await supabase
    .from("books")
    .select("id, cover_path, cover_url")
    .not("cover_path", "is", null);

  let fixed = 0;
  let skipped = 0;

  for (const book of withPath ?? []) {
    const expectedUrl = `${base}/storage/v1/object/public/covers/${book.cover_path}`;
    if (book.cover_url === expectedUrl) { skipped++; continue; }

    await supabase
      .from("books")
      .update({ cover_url: expectedUrl })
      .eq("id", book.id);
    fixed++;
  }

  // 2. Livros com signed URL expirada (contêm "token=") → limpar
  const { data: withToken } = await supabase
    .from("books")
    .select("id, cover_url")
    .like("cover_url", "%token=%");

  let cleared = 0;
  for (const book of withToken ?? []) {
    await supabase
      .from("books")
      .update({ cover_url: null })
      .eq("id", book.id);
    cleared++;
  }

  // 3. Stats
  const { count: nullCovers } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .is("cover_url", null);

  const { count: failedCovers } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("cover_url", "_failed_");

  const { count: goodCovers } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .not("cover_url", "is", null)
    .not("cover_url", "eq", "_failed_");

  return NextResponse.json({
    fixed,
    skipped,
    clearedExpired: cleared,
    stats: {
      withCover:   goodCovers  ?? 0,
      withoutCover:nullCovers  ?? 0,
      failed:      failedCovers ?? 0,
    },
  });
}

export async function GET() {
  const supabase = createServiceClient();

  const { count: total }       = await supabase.from("books").select("id", { count: "exact", head: true });
  const { count: withPath }    = await supabase.from("books").select("id", { count: "exact", head: true }).not("cover_path", "is", null);
  const { count: withUrl }     = await supabase.from("books").select("id", { count: "exact", head: true }).not("cover_url", "is", null).not("cover_url", "eq", "_failed_");
  const { count: withToken }   = await supabase.from("books").select("id", { count: "exact", head: true }).like("cover_url", "%token=%");
  const { count: failed }      = await supabase.from("books").select("id", { count: "exact", head: true }).eq("cover_url", "_failed_");
  const { count: noUrl }       = await supabase.from("books").select("id", { count: "exact", head: true }).is("cover_url", null);

  return NextResponse.json({
    total:          total       ?? 0,
    withCoverPath:  withPath    ?? 0,
    withGoodUrl:    withUrl     ?? 0,
    withExpiredUrl: withToken   ?? 0,
    markedFailed:   failed      ?? 0,
    noCover:        noUrl       ?? 0,
    recommendation: (withToken ?? 0) > 0
      ? `Corre POST /api/covers/migrate para corrigir ${withToken} URLs expiradas`
      : "OK — sem URLs expiradas",
  });
}
