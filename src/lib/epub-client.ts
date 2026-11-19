/** Lê EPUBs no próprio aparelho (sem servidor): capítulos para o leitor e título/autor/capa para a lista. */
import JSZip from "jszip";
import { cleanHtml, extractTitle, parseManifest, parseSpine } from "./epub-html";

export type LocalBook = {
  title: string;
  author: string | null;
  language: string | null;
  chapters: { id: string; title: string; html: string }[];
  /** Liberta os URLs das imagens (chamar ao sair do leitor). */
  revoke: () => void;
};
export type EpubMeta = { title: string; author: string | null; cover: Blob | null };

const IMG_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };
const ext = (n: string) => n.split(".").pop()?.toLowerCase() ?? "";
const unesc = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/\s+/g, " ").trim();

async function openZip(file: Blob) {
  const zip = await JSZip.loadAsync(file);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  let opfPath = container?.match(/full-path="([^"]+)"/)?.[1] ?? Object.keys(zip.files).find((n) => n.endsWith(".opf"));
  if (!opfPath) throw new Error("Este ficheiro não é um EPUB válido.");
  const opf = await zip.file(opfPath)?.async("text");
  if (!opf) throw new Error("Não consegui ler o EPUB.");
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  opfPath = undefined;
  return { zip, opf, dir };
}

const tag = (opf: string, name: string) => {
  const m = opf.match(new RegExp(`<dc:${name}\\b[^>]*>([\\s\\S]*?)</dc:${name}>`, "i"));
  return m ? unesc(m[1]) : null;
};

/** Título, autor e capa (reduzida) para mostrar na lista. */
export async function readEpubMeta(file: Blob): Promise<EpubMeta> {
  const { zip, opf, dir } = await openZip(file);
  let href: string | undefined;
  const items = [...opf.matchAll(/<item\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const attr = (a: string, k: string) => a.match(new RegExp(`\\b${k}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
  const coverId = opf.match(/<meta\b[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"/i)?.[1] ?? opf.match(/<meta\b[^>]*content\s*=\s*"([^"]+)"[^>]*name\s*=\s*"cover"/i)?.[1];
  href = items.map((a) => ({ id: attr(a, "id"), href: attr(a, "href"), props: attr(a, "properties") })).find((i) => i.props?.includes("cover-image") || (coverId && i.id === coverId))?.href;
  let cover: Blob | null = null;
  const entry = href ? zip.file(decodeURIComponent(dir + href)) ?? zip.file(dir + href) : null;
  if (entry) {
    const raw = await entry.async("blob");
    cover = await shrink(new Blob([raw], { type: IMG_TYPES[ext(href ?? "")] ?? "image/jpeg" })).catch(() => raw);
  }
  return { title: tag(opf, "title") ?? "Sem título", author: tag(opf, "creator"), cover };
}

async function shrink(blob: Blob, maxW = 240): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.8));
}

/** Converte o EPUB em capítulos de HTML limpo, com as imagens como blob: URLs locais. */
export async function openEpub(file: Blob): Promise<LocalBook> {
  const { zip, opf, dir } = await openZip(file);
  const urls: string[] = [];
  const imageMap = new Map<string, string>();
  for (const name of Object.keys(zip.files)) {
    const type = IMG_TYPES[ext(name)];
    if (zip.files[name].dir || !type) continue;
    const url = URL.createObjectURL(new Blob([await zip.files[name].async("blob")], { type }));
    urls.push(url);
    imageMap.set(name, url);
    if (name.startsWith(dir)) imageMap.set(name.slice(dir.length), url);
    const base = name.split("/").pop()!;
    if (!imageMap.has(base)) imageMap.set(base, url);
  }
  const manifest = parseManifest(opf);
  let spine = parseSpine(opf, manifest);
  if (!spine.length) spine = Object.keys(zip.files).filter((n) => /\.(x?html?)$/i.test(n) && !n.includes("META-INF")).sort();
  const chapters: LocalBook["chapters"] = [];
  for (let i = 0; i < spine.length; i++) {
    const full = dir + spine[i];
    const f = zip.file(full) ?? zip.file(decodeURIComponent(full));
    if (!f) continue;
    const html = await f.async("text");
    const chDir = full.includes("/") ? full.slice(0, full.lastIndexOf("/") + 1) : dir;
    const cleaned = cleanHtml(html, chDir, imageMap);
    chapters.push({ id: `c${i + 1}`, title: extractTitle(cleaned) || `Capítulo ${i + 1}`, html: cleaned });
  }
  if (!chapters.length) throw new Error("Não encontrei texto neste EPUB.");
  return { title: tag(opf, "title") ?? "Sem título", author: tag(opf, "creator"), language: tag(opf, "language"), chapters, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
