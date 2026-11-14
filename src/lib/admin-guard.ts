import { NextResponse } from "next/server";
import { ADMIN_ID } from "@/lib/auth";
import { currentUserId } from "@/lib/session";

/** Devolve uma resposta 403 se o utilizador atual não for o administrador. */
export async function requireAdmin(): Promise<NextResponse | null> {
  return (await currentUserId()) === ADMIN_ID ? null : NextResponse.json({ error: "Só o administrador pode fazer isto." }, { status: 403 });
}
