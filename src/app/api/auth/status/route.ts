import { NextResponse } from "next/server";
import { getPin } from "@/lib/auth";

export const runtime = "nodejs";

/** Diz à interface se a app está protegida por PIN (para mostrar o botão "Sair"). */
export async function GET() {
  return NextResponse.json({ protected: !!getPin() });
}
