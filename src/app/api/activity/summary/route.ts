import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listActivity } from "@/lib/firebase/activity";
import { listBooksByIds } from "@/lib/firebase/books";
import { listUsers } from "@/lib/firebase/users";
import { readUserState } from "@/lib/firebase/userdata";

export const runtime = "nodejs";

type Pos = { ratio?: number | null; timestamp?: number };

/** Por utilizador: último acesso, totais e o que está a ler (posições guardadas). */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const [users, events] = await Promise.all([listUsers(), listActivity(1500)]);

  const states = await Promise.all(users.map((u) => readUserState(u.id).catch(() => ({}))));
  const reading = users.map((_, i) => {
    const pos = ((states[i] as Record<string, { data?: unknown }>).positions?.data ?? {}) as Record<string, Pos>;
    return Object.entries(pos)
      .filter(([, p]) => (p.timestamp ?? 0) > 0)
      .sort((a, b) => (b[1].timestamp ?? 0) - (a[1].timestamp ?? 0))
      .slice(0, 12)
      .map(([bookId, p]) => ({ bookId, progress: Math.round((p.ratio ?? 0) * 100), lastRead: p.timestamp ?? 0 }));
  });
  const ids = [...new Set(reading.flat().map((r) => r.bookId))].slice(0, 200);
  const titles = new Map((ids.length ? await listBooksByIds(ids) : []).map((b) => [b.id, b.title]));

  const summary = users.map((u, i) => {
    const mine = events.filter((e) => e.uid === u.id);
    const count = (t: string) => mine.filter((e) => e.type === t).length;
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      lastLogin: mine.find((e) => e.type === "login")?.ts ?? null,
      lastActivity: mine[0]?.ts ?? null,
      logins: count("login"),
      failedLogins: count("login_failed"),
      reads: count("read"),
      downloads: count("download") + count("kobo_download"),
      searches: count("search"),
      reading: reading[i].map((r) => ({ ...r, title: titles.get(r.bookId) ?? "(livro removido)" })),
    };
  });
  return NextResponse.json({ summary, since: events.at(-1)?.ts ?? null }, { headers: { "Cache-Control": "no-store" } });
}
