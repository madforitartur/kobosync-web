import JSZip from "jszip";
import { supportsFolderPicker } from "./kobo-export";

export type NamedBlob = { name: string; blob: Blob };

export { supportsFolderPicker };

function trigger(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Copia ficheiros para uma pasta escolhida (por exemplo a do Kobo ligado por USB). Chrome/Edge no PC. */
export async function saveBlobsToFolder(items: NamedBlob[]): Promise<number> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const dir = await picker.call(window, { mode: "readwrite" });
  let n = 0;
  for (const it of items) {
    const h = await dir.getFileHandle(it.name, { create: true });
    const w = await h.createWritable();
    await w.write(it.blob);
    await w.close();
    n++;
  }
  return n;
}

/** Guarda no sistema: um ficheiro se for só um; vários vão num ZIP. */
export async function downloadBlobs(items: NamedBlob[]): Promise<void> {
  if (items.length === 1) return trigger(items[0].blob, items[0].name);
  const zip = new JSZip();
  items.forEach((it) => zip.file(it.name, it.blob));
  trigger(await zip.generateAsync({ type: "blob", compression: "STORE" }), "livros-convertidos.zip");
}
