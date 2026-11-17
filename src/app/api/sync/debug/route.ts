import { requireAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { allFolderIds } from "@/lib/firebase/drive-folders";
import { getAllBooksCached } from "@/lib/firebase/books";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const config = getServerConfig();

    const { files, warnings } = await listDriveEpubs({
      clientEmail: config.googleClientEmail,
      privateKey: config.googlePrivateKey,
      sharedDriveId: config.googleSharedDriveId,
      folderId: (await allFolderIds(config.googleDriveFolderId)).join(","),
    });

    const dbBooks = await getAllBooksCached(true);
    const dbIds = new Set(dbBooks.map((b) => b.drive_file_id).filter(Boolean));
    const newInDrive = files.filter((f) => !dbIds.has(f.id));

    return NextResponse.json({
      driveTotal: files.length,
      warnings,
      dbTotal: dbBooks.length,
      newInDrive: newInDrive.length,
      config: {
        folderId: config.googleDriveFolderId ?? null,
        sharedDriveId: config.googleSharedDriveId ?? null,
      },
      newFiles: newInDrive.slice(0, 20).map((f) => ({
        name: f.name, id: f.id, mimeType: f.mimeType,
      })),
      sample: files.slice(0, 10).map((f) => ({
        name: f.name, id: f.id, mimeType: f.mimeType,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
