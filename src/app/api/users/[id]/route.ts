import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ID } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin-guard";
import { cleanName, deleteUser, getUser, updateUser, validPin } from "@/lib/firebase/users";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  if (!(await getUser(id))) return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const patch: { name?: string; pin?: string } = {};
  if (body?.name !== undefined) {
    patch.name = cleanName(body.name);
    if (patch.name.length < 2) return NextResponse.json({ error: "Nome demasiado curto." }, { status: 400 });
  }
  if (body?.pin !== undefined) {
    if (id === ADMIN_ID) return NextResponse.json({ error: "O PIN do administrador define-se em APP_PIN na Vercel." }, { status: 400 });
    if (!validPin(body.pin)) return NextResponse.json({ error: "O PIN deve ter entre 4 e 12 dígitos." }, { status: 400 });
    patch.pin = body.pin;
  }
  try {
    await updateUser(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}
