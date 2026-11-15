import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ID } from "@/lib/auth";
import { currentUserId } from "@/lib/session";
import { getUser, updateUser, validPin, verifyPin } from "@/lib/firebase/users";

export const runtime = "nodejs";

/** O próprio utilizador muda o seu PIN (tem de indicar o atual). */
export async function PATCH(request: NextRequest) {
  const uid = await currentUserId();
  if (uid === ADMIN_ID) return NextResponse.json({ error: "O PIN do administrador define-se em APP_PIN na Vercel." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const user = await getUser(uid);
  if (!user) return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  if (typeof body?.currentPin !== "string" || !verifyPin(body.currentPin, user.pinHash)) return NextResponse.json({ error: "PIN atual incorreto." }, { status: 401 });
  if (!validPin(body?.pin)) return NextResponse.json({ error: "O novo PIN deve ter entre 4 e 12 dígitos." }, { status: 400 });
  await updateUser(uid, { pin: body.pin });
  return NextResponse.json({ ok: true });
}
