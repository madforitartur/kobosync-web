import JSZip from "jszip";
import { getServerConfig } from "@/lib/env";
import { uploadCoverToDrive, deleteCoverFromDrive } from "@/lib/google-drive";

/** Dimensões e qualidade máximas para as capas guardadas no Drive */
const COVER_MAX_W     = 300;
const COVER_MAX_H     = 450;
const COVER_QUALITY   = 80; // JPEG 0-100
const COVER_MAX_BYTES = 250 * 1024; // 250 KB — aviso se ainda ficar grande após compressão

/**
 * Redimensiona e comprime um buffer de imagem para JPEG.
 * Usa sharp se disponível (Node.js); caso contrário devolve o buffer original.
 */
async function compressToJpeg(data: ArrayBuffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharp = (await import("sharp")).default;
    const compressed = await sharp(Buffer.from(data))
      .resize(COVER_MAX_W, COVER_MAX_H, {
        fit: "inside", // preserva aspect-ratio, nunca amplia
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
 * Extrai a imagem de capa de um ficheiro EPUB (sem tocar em rede/BD).
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

  const imageItems: Array<{ id: string; href: string; mediaType: string; properties: string }> = [];
  const itemRegex = /<item\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(opfContent)) !== null) {
    const attrs          = match[1];
    const idMatch        = attrs.match(/\bid\s*=\s*"([^"]+)"/i);
    const hrefMatch      = attrs.match(/\bhref\s*=\s*"([^"]+)"/i);
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

  // Prioridade: meta name=cover → properties=cover-image → id="cover" → primeira imagem
  const coverMetaMatch = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"/i);
  const coverItem =
    (coverMetaMatch ? imageItems.find((i) => i.id === coverMetaMatch[1]) : null) ??
    imageItems.find((i) => i.properties.split(/\s+/).includes("cover-image")) ??
    imageItems.find((i) => i.id.toLowerCase() === "cover") ??
    (imageItems.length > 0 ? imageItems[0] : null);

  if (!coverItem) return null;

  const fullPath = opfDir + coverItem.href;
  const file = zip.file(fullPath);
  if (!file) return null;

  const data = await file.async("arraybuffer");
  return { data, mimeType: coverItem.mediaType };
}

/**
 * Extrai a capa de um EPUB do Google Drive (conta dos livros), COMPRIME
 * para JPEG 300×450 e faz upload para a pasta de capas no Google Drive
 * (pode ser uma conta Google diferente). Nada é guardado no Firebase.
 *
 * Devolve o ID do ficheiro no Drive e o URL de imagem embebível.
 */
export async function uploadCoverForBook(
  driveFileId: string,
  bookId: string,
  downloadFn: (id: string) => Promise<ArrayBuffer>,
  previousCoverFileId?: string | null,
): Promise<{ url: string; fileId: string } | null> {
  try {
    const epubBuffer = await downloadFn(driveFileId);
    const cover = await extractCoverFromEpub(epubBuffer);
    if (!cover) return null;

    const { buffer: compressed, mimeType } = await compressToJpeg(cover.data);

    if (compressed.length > COVER_MAX_BYTES * 2) {
      console.warn(
        `[Cover] Imagem ainda grande após compressão (${(compressed.length / 1024).toFixed(0)} KB) para ${bookId}`,
      );
    }

    const config = getServerConfig();
    const coversConfig = {
      clientEmail: config.coversClientEmail,
      privateKey: config.coversPrivateKey,
      folderId: config.coversFolderId!,
      sharedDriveId: config.coversSharedDriveId,
    };

    if (!coversConfig.folderId) {
      throw new Error(
        "GOOGLE_COVERS_FOLDER_ID não está configurado — define a pasta do Drive onde as capas devem ficar.",
      );
    }

    // Se já existia uma capa antiga deste livro no Drive, apaga-a primeiro
    if (previousCoverFileId) {
      await deleteCoverFromDrive(coversConfig, previousCoverFileId);
    }

    const { fileId, url } = await uploadCoverToDrive(
      coversConfig,
      `${bookId}.jpg`,
      compressed,
      mimeType,
    );

    return { url, fileId };
  } catch (error) {
    console.error(`[Cover] Error for book ${bookId}:`, error);
    return null;
  }
}
