import JSZip from "jszip";
import { createServiceClient } from "./supabase/server";

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
  const opfDir = opfPath.includes("/")
    ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
    : "";

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) return null;

  const imageItems: Array<{
    id: string;
    href: string;
    mediaType: string;
    properties: string;
  }> = [];
  const itemRegex = /<item\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(opfContent)) !== null) {
    const attrs = match[1];
    const idMatch = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
    const hrefMatch = attrs.match(/\bhref\s*=\s*"([^"]+)"/i);
    const mediaTypeMatch = attrs.match(/\bmedia-type\s*=\s*"([^"]+)"/i);
    const propertiesMatch = attrs.match(/\bproperties\s*=\s*"([^"]+)"/i);

    if (idMatch && hrefMatch && mediaTypeMatch?.[1].startsWith("image/")) {
      imageItems.push({
        id: idMatch[1],
        href: hrefMatch[1],
        mediaType: mediaTypeMatch[1],
        properties: propertiesMatch?.[1] ?? "",
      });
    }
  }

  const coverMetaMatch = opfContent.match(
    /<meta\s+name="cover"\s+content="([^"]+)"/i,
  );
  let coverItem = coverMetaMatch
    ? imageItems.find((i) => i.id === coverMetaMatch[1])
    : null;

  if (!coverItem) {
    coverItem = imageItems.find((i) =>
      i.properties.split(/\s+/).includes("cover-image"),
    );
  }

  if (!coverItem) {
    coverItem = imageItems.find((i) => i.id.toLowerCase() === "cover");
  }

  if (!coverItem && imageItems.length > 0) {
    coverItem = imageItems[0];
  }

  if (!coverItem) return null;

  const fullPath = opfDir + coverItem.href;
  const file = zip.file(fullPath);
  if (!file) return null;

  const data = await file.async("arraybuffer");
  return { data, mimeType: coverItem.mediaType };
}

/**
 * Extrai capa de um EPUB do Google Drive, faz upload para Supabase,
 * e devolve URL e path.
 */
export async function uploadCoverForBook(
  driveFileId: string,
  bookId: string,
  downloadFn: (id: string) => Promise<ArrayBuffer>,
): Promise<{ url: string; path: string } | null> {
  try {
    const epubBuffer = await downloadFn(driveFileId);
    const cover = await extractCoverFromEpub(epubBuffer);
    if (!cover) return null;

    const ext = cover.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const coverPath = `covers/${bookId}.${ext}`;

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(coverPath, cover.data, {
        contentType: cover.mimeType,
        upsert: true,
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

/**
 * Atualiza a lista de livros (helper para refresh após sync).
 */
export async function refreshBooks(
  supabase: ReturnType<typeof createServiceClient>,
) {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
