import JSZip from "jszip";
import { createServiceClient } from "./supabase/server";

/** Dimensões e qualidade máximas para capas guardadas no Supabase */
const COVER_MAX_W   = 300;
const COVER_MAX_H   = 450;
const COVER_QUALITY = 80;   // JPEG 0-100
const COVER_MAX_BYTES = 250 * 1024; // 250 KB — rejeita uploads que ainda sejam grandes

/**
 * Redimensiona e comprime um buffer de imagem para JPEG.
 * Usa sharp se disponível (Node.js); caso contrário devolve o buffer original.
 */
async function compressToJpeg(data: ArrayBuffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const compressed = await sharp(Buffer.from(data))
      .resize(COVER_MAX_W, COVER_MAX_H, {
        fit:      "inside",      // preserva aspect-ratio, nunca amplia
        withoutEnlargement: true,
      })
      .jpeg({ quality: COVER_QUALITY, mozjpeg: true })
      .toBuffer();
    return { buffer: compressed, mimeType: "image/jpeg" };
  } catch {
    // Fallback: devolve original sem compressão
    return { buffer: Buffer.from(data), mimeType: "image/jpeg" };
  }
}

/**
 * Extrai a imagem de capa de um ficheiro EPUB.
 */
export async function extractCoverFromEpub(
  arrayBuffer: ArrayBuffer,
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) return null;

  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfPathMatch) return null;
  const opfPath = opfPathMatch[1];
  const opfDir  = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) return null;

  const imageItems: Array<{ id: string; href: string; mediaType: string; properties: string }> = [];
  const itemRegex = /<item\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(opfContent)) !== null) {
    const attrs         = match[1];
    const idMatch       = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
    const hrefMatch     = attrs.match(/\bhref\s*=\s*"([^"]+)"/i);
    const mediaTypeMatch= attrs.match(/\bmedia-type\s*=\s*"([^"]+)"/i);
    const propertiesMatch=attrs.match(/\bproperties\s*=\s*"([^"]+)"/i);

    if (idMatch && hrefMatch && mediaTypeMatch?.[1].startsWith("image/")) {
      imageItems.push({
        id:         idMatch[1],
        href:       hrefMatch[1],
        mediaType:  mediaTypeMatch[1],
        properties: propertiesMatch?.[1] ?? "",
      });
    }
  }

  // Prioridade: meta name=cover → properties=cover-image → id="cover" → primeira imagem
  const coverMetaMatch = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"/i);
  let coverItem =
    (coverMetaMatch ? imageItems.find((i) => i.id === coverMetaMatch[1]) : null) ??
    imageItems.find((i) => i.properties.split(/\s+/).includes("cover-image")) ??
    imageItems.find((i) => i.id.toLowerCase() === "cover") ??
    (imageItems.length > 0 ? imageItems[0] : null);

  if (!coverItem) return null;

  const fullPath = opfDir + coverItem.href;
  const file     = zip.file(fullPath);
  if (!file) return null;

  const data = await file.async("arraybuffer");
  return { data, mimeType: coverItem.mediaType };
}

/**
 * Extrai capa de um EPUB do Google Drive, COMPRIME para JPEG 300×450 ≤ 250KB,
 * faz upload para Supabase e devolve URL e path.
 */
export async function uploadCoverForBook(
  driveFileId: string,
  bookId:      string,
  downloadFn:  (id: string) => Promise<ArrayBuffer>,
): Promise<{ url: string; path: string } | null> {
  try {
    const epubBuffer = await downloadFn(driveFileId);
    const cover      = await extractCoverFromEpub(epubBuffer);
    if (!cover) return null;

    // Comprime sempre para JPEG independentemente do formato original
    const { buffer: compressed, mimeType } = await compressToJpeg(cover.data);

    if (compressed.length > COVER_MAX_BYTES * 2) {
      // Última salvaguarda: se ainda for muito grande, ignora
      console.warn(`[Cover] Imagem ainda grande após compressão (${(compressed.length/1024).toFixed(0)} KB) para ${bookId}`);
    }

    const coverPath = `covers/${bookId}.jpg`;
    const supabase  = createServiceClient();

    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(coverPath, compressed, {
        contentType: mimeType,
        upsert:      true,
        // Cache de 30 dias no CDN do Supabase
        cacheControl: "2592000",
      });

    if (uploadError) {
      console.error(`[Cover] Upload failed for ${bookId}:`, uploadError);
      return null;
    }

    const { data: signedData } = await supabase.storage
      .from("covers")
      .createSignedUrl(coverPath, 60 * 60 * 24 * 30);

    if (!signedData?.signedUrl) return null;

    return { url: signedData.signedUrl, path: coverPath };
  } catch (error) {
    console.error(`[Cover] Error for book ${bookId}:`, error);
    return null;
  }
}

export async function refreshBooks(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
