import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { cleanName, createUser, listUsers, validPin } from "@/lib/firebase/users";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ users: await listUsers() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = cleanName(body?.name);
  if (name.length < 2) return NextResponse.json({ error: "Escreve um nome (mín. 2 letras)." }, { status: 400 });
  if (!validPin(body?.pin)) return NextResponse.json({ error: "O PIN deve ter entre 4 e 12 dígitos." }, { status: 400 });
  try {
    return NextResponse.json({ user: await createUser(name, body.pin) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
