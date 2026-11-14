import { NextResponse } from "next/server";
import { getPin } from "@/lib/auth";
import { listUsers } from "@/lib/firebase/users";

export const runtime = "nodejs";

/** Perfis para o ecrã de entrada (só nome e id; os PINs nunca saem do servidor). */
export async function GET() {
  if (!getPin()) return NextResponse.json({ protected: false, profiles: [] });
  const users = await listUsers().catch(() => []);
  return NextResponse.json(
    { protected: true, profiles: users.map((u) => ({ id: u.id, name: u.name, role: u.role })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
