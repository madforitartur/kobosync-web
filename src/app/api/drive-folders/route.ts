import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getServerConfig } from "@/lib/env";
import { getDriveFolderInfo, parseFolderIds } from "@/lib/google-drive";
import { addStoredFolder, cleanLabel, listStoredFolders, removeStoredFolder, renameStoredFolder } from "@/lib/firebase/drive-folders";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const cfg = getServerConfig();
  return NextResponse.json(
    { folders: await listStoredFolders(), envFolders: parseFolderIds(cfg.googleDriveFolderId), serviceEmail: cfg.googleClientEmail },
    { headers: NO_STORE },
  );
}

/** Dá (ou muda) o nome de uma pasta. Para a pasta principal (variável de ambiente) cria o registo só com o nome. */
export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = parseFolderIds(typeof body?.id === "string" ? body.id : "")[0];
  if (!id) return NextResponse.json({ error: "Pasta inválida." }, { status: 400 });
  const label = cleanLabel(body?.label);
  const cfg = getServerConfig();
  const stored = await listStoredFolders();
  if (!stored.some((f) => f.id === id)) {
    if (!parseFolderIds(cfg.googleDriveFolderId).includes(id)) return NextResponse.json({ error: "Pasta desconhecida." }, { status: 404 });
    if (!label) return NextResponse.json({ folders: stored }, { headers: NO_STORE });
    const info = await getDriveFolderInfo(cfg.googleClientEmail, cfg.googlePrivateKey, id).catch(() => ({ id, name: id }));
    await addStoredFolder({ ...info, label });
    return NextResponse.json({ folders: await listStoredFolders() }, { headers: NO_STORE });
  }
  return NextResponse.json({ folders: await renameStoredFolder(id, label) }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const id = parseFolderIds(typeof body?.link === "string" ? body.link.slice(0, 500) : "")[0];
  if (!id) return NextResponse.json({ error: "Cola o link da pasta do Google Drive." }, { status: 400 });
  try {
    const cfg = getServerConfig();
    const info = await getDriveFolderInfo(cfg.googleClientEmail, cfg.googlePrivateKey, id);
    const folders = await addStoredFolder({ ...info, label: body?.label, kind: body?.kind === "pdf" ? "pdf" : "epub" });
    return NextResponse.json({ folders, added: info }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = parseFolderIds(request.nextUrl.searchParams.get("id"))[0];
  if (!id) return NextResponse.json({ error: "Pasta inválida." }, { status: 400 });
  return NextResponse.json({ folders: await removeStoredFolder(id) }, { headers: NO_STORE });
}
