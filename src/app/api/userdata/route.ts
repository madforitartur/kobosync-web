import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { userExists } from "@/lib/firebase/users";
import { DOMAINS, readUserState, writeDomain, type Domain } from "@/lib/firebase/userdata";

export const runtime = "nodejs";

export async function GET() {
  try {
    const uid = await currentUserId();
    if (!(await userExists(uid))) return NextResponse.json({ error: "Utilizador removido" }, { status: 401 });
    return NextResponse.json({ state: await readUserState(uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const uid = await currentUserId();
    if (!(await userExists(uid))) return NextResponse.json({ error: "Utilizador removido" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as {
      domain?: string;
      data?: unknown;
      updatedAt?: unknown;
    };
    const domain = DOMAINS.find((d) => d === body.domain) as Domain | undefined;
    if (!domain) return NextResponse.json({ error: "Domínio inválido" }, { status: 400 });
    const updatedAt = Number(body.updatedAt);
    if (!Number.isFinite(updatedAt)) return NextResponse.json({ error: "updatedAt inválido" }, { status: 400 });
    await writeDomain(uid, domain, body.data ?? null, updatedAt);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
