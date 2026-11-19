"use client";

import { useParams } from "next/navigation";
import { ReaderScreen } from "@/components/reader/ReaderScreen";

export default function ReadPage() {
  const params = useParams();
  return <ReaderScreen id={String(params.id ?? "")} />;
}
