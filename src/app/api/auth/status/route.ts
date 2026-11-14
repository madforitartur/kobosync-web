import { NextResponse } from "next/server";
import { getPin } from "@/lib/auth";
import { currentUserId } from "@/lib/session";
import { getUser } from "@/lib/firebase/users";

export const runtime = "nodejs";

/** Utilizador atual e se a app está protegida por PIN. */
export async function GET() {
  const uid = await currentUserId();
  const user = await getUser(uid).catch(() => null);
  return NextResponse.json(
    { protected: !!getPin(), user: user ? { id: user.id, name: user.name, role: user.role } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
