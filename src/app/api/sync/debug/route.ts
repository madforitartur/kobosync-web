import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime     = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const config = getServerConfig();

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

    const dbIds = new Set((dbBooks ?? []).map((b: { drive_file_id: string }) => b.drive_file_id));
    const newInDrive = files.filter((f) => !dbIds.has(f.id));
    const inDbNotDrive = (dbBooks ?? []).filter(
      (b: { drive_file_id: string }) => !files.some((f) => f.id === b.drive_file_id)
    );

    return NextResponse.json({
      driveTotal:       files.length,
      dbTotal:          dbBooks?.length ?? 0,
      newInDrive:       newInDrive.length,
      missingFromDrive: inDbNotDrive.length,
      newFiles: newInDrive.slice(0, 20).map((f) => ({
        name: f.name, id: f.id, mimeType: f.mimeType, size: f.size,
      })),
      orphaned: inDbNotDrive.slice(0, 10).map((b: { drive_file_id: string; title: string }) => ({
        title: b.title, drive_file_id: b.drive_file_id,
      })),
      sample: files.slice(0, 5).map((f) => ({
        name: f.name, id: f.id, mimeType: f.mimeType,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 500 },
    );
  }
}
