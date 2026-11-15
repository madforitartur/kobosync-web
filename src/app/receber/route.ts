import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { createSession } from "@/lib/firebase/kobo-sessions";
import { renderReceiverPage } from "@/lib/receiver-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Página para abrir no browser do Kobo (sem login, HTML simples e JS antigo para o WebKit do leitor).
 * Mostra um código de 4 caracteres + QR; os livros enviados pela app aparecem como links de download.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;
  const { code, secret } = await createSession();
  const qr = await QRCode.toString(`${origin}/kobo?code=${code}`, { type: "svg", margin: 1, width: 200 });

  const html = renderReceiverPage({ host, code, secret, qr });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
