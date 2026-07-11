import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime     = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const config = getServerConfig();

    // Lista EPUBs com pesquisa recursiva
    const { files } = await listDriveEpubs({
      clientEmail:   config.googleClientEmail,
      privateKey:    config.googlePrivateKey,
      sharedDriveId: config.googleSharedDriveId,
      folderId:      config.googleDriveFolderId,
    });

    const supabase = createServiceClient();
    const { data: dbBooks } = await supabase
      .from("books")
      .select("drive_file_id, title, cover_url");

    const dbIds      = new Set((dbBooks ?? []).map((b: { drive_file_id: string }) => b.drive_file_id));
    const newInDrive = files.filter((f) => !dbIds.has(f.id));

    return NextResponse.json({
      driveTotal: files.length,
      dbTotal:    dbBooks?.length ?? 0,
      newInDrive: newInDrive.length,
      config: {
        folderId:      config.googleDriveFolderId ?? null,
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
