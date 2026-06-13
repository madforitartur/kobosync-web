import JSZip from "jszip";
import type { ParsedEpub } from "@/types/library";

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");

const textOf = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : null;
};

const attrOf = (fragment: string, attr: string) => {
  const match = fragment.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeXml(match[1]) : null;
};

const resolvePath = (basePath: string, href: string) => {
  const base = basePath.split("/").slice(0, -1);
  const parts = [...base, ...href.split("/")];
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }

  return resolved.join("/");
};

function findOpfPath(containerXml: string) {
  const rootfile = containerXml.match(/<rootfile\b[^>]*>/i)?.[0];
  return rootfile ? attrOf(rootfile, "full-path") : null;
}

function findItems(opfXml: string) {
  return [...opfXml.matchAll(/<item\b[^>]*>/gi)].map((match) => {
    const item = match[0];
    return {
      id: attrOf(item, "id"),
      href: attrOf(item, "href"),
      mediaType: attrOf(item, "media-type"),
      properties: attrOf(item, "properties"),
    };
  });
}

function findCoverHref(opfXml: string) {
  const items = findItems(opfXml);
  const coverByProperties = items.find((item) => item.properties?.includes("cover-image"));
  if (coverByProperties?.href) return coverByProperties.href;

  const coverMeta = opfXml.match(/<meta\b[^>]*name=["']cover["'][^>]*>/i)?.[0];
  const coverId = coverMeta ? attrOf(coverMeta, "content") : null;
  const coverByMeta = coverId ? items.find((item) => item.id === coverId) : null;
  if (coverByMeta?.href) return coverByMeta.href;

  return (
    items.find(
      (item) =>
        item.mediaType?.startsWith("image/") &&
        [item.id, item.href].some((value) => value?.toLowerCase().includes("cover")),
    )?.href ?? null
  );
}

function findSeries(opfXml: string) {
  const calibreSeries = opfXml.match(/<meta\b[^>]*name=["']calibre:series["'][^>]*>/i)?.[0];
  const calibreIndex = opfXml.match(/<meta\b[^>]*name=["']calibre:series_index["'][^>]*>/i)?.[0];

  return {
    series: calibreSeries ? attrOf(calibreSeries, "content") : null,
    seriesIndex: calibreIndex ? Number(attrOf(calibreIndex, "content")) || null : null,
  };
}

export async function parseEpub(bytes: ArrayBuffer, fallbackTitle: string): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(bytes);
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  const opfPath = containerXml ? findOpfPath(containerXml) : null;
  const opfXml = opfPath ? await zip.file(opfPath)?.async("text") : null;

  if (!opfPath || !opfXml) {
    return {
      metadata: {
        title: fallbackTitle,
        author: null,
        language: null,
        publisher: null,
        isbn: null,
        description: null,
        series: null,
        seriesIndex: null,
      },
      cover: null,
    };
  }

  const coverHref = findCoverHref(opfXml);
  const coverPath = coverHref ? resolvePath(opfPath, coverHref) : null;
  const coverFile = coverPath ? zip.file(coverPath) : null;
  const coverBytes = coverFile ? await coverFile.async("arraybuffer") : null;
  const { series, seriesIndex } = findSeries(opfXml);

  return {
    metadata: {
      title: textOf(opfXml, "dc:title") ?? fallbackTitle,
      author: textOf(opfXml, "dc:creator"),
      language: textOf(opfXml, "dc:language"),
      publisher: textOf(opfXml, "dc:publisher"),
      isbn: textOf(opfXml, "dc:identifier"),
      description: textOf(opfXml, "dc:description"),
      series,
      seriesIndex,
    },
    cover:
      coverBytes && coverPath
        ? {
            filename: coverPath.split("/").pop() ?? "cover",
            contentType: coverFile?.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
            bytes: coverBytes,
          }
        : null,
  };
}
