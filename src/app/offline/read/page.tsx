"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReaderScreen } from "@/components/reader/ReaderScreen";

// O livro vem no endereço (?f=...) e não numa rota dinâmica: assim a mesma página fica guardada
// para abrir sem ligação, qualquer que seja o livro.
function Inner() {
  const f = useSearchParams().get("f");
  return f ? <ReaderScreen localPath={f} /> : null;
}

export default function OfflineReadPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
