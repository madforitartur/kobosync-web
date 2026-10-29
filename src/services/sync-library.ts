/**
 * sync-library.ts
 *
 * FASE 1 — syncLibrary() — rápido (<30s):
 *   Lista todos os EPUBs do Drive recursivamente e insere entradas básicas
 *   (título do nome do ficheiro) para os livros novos no Firestore.
 *   Sem download de EPUBs.
 *
 * FASE 2 — processamento de capas — chamado separadamente via
 *   /api/covers/sync-all: para cada livro sem capa, descarrega o EPUB
 *   (parcialmente), extrai a capa, comprime e envia para o Google Drive
 *   (conta das capas). Nada é guardado no Firebase além do link.
 */

import { getServerConfig } from "@/lib/env";
import { listDriveEpubs } from "@/lib/google-drive";
import { insertNewBooks, countBooksWithoutCover } from "@/lib/firebase/books";

const stripExtension = (name: string) => name.replace(/\.epub$/i, "");

function basicMetadataFromFilename(fileName: string) {
  const name = stripExtension(fileName);
  const separator = name.lastIndexOf(" - ");
  if (separator > 0) {
    return {
      title: name.slice(0, separator).trim(),
      author: name.slice(separator + 3).trim() || null,
    };
  }
  return { title: name, author: null };
}

export async function syncLibrary() {
  const config = getServerConfig();

  // ── 1. Listar todos os EPUBs do Drive (recursivo) ──
  const { files } = await listDriveEpubs({
    clientEmail: config.googleClientEmail,
    privateKey: config.googlePrivateKey,
    sharedDriveId: config.googleSharedDriveId,
    folderId: config.googleDriveFolderId,
  });

  // ── 2. Inserir apenas livros novos no Firestore ──
  const newCount = await insertNewBooks(files, basicMetadataFromFilename);

  // ── 3. Contar livros sem capa (para informar o utilizador) ──
  const withoutCover = await countBooksWithoutCover();

  return {
    found: files.length,
    newBooks: newCount,
    withoutCover,
    message:
      newCount > 0
        ? `${newCount} livro${newCount !== 1 ? "s" : ""} novo${newCount !== 1 ? "s" : ""} adicionado${newCount !== 1 ? "s" : ""}.${withoutCover ? ` ${withoutCover} sem capa — clica em "Capas" para processar.` : ""}`
        : withoutCover
          ? `Sem livros novos. ${withoutCover} sem capa — clica em "Capas" para processar.`
          : "Biblioteca actualizada.",
  };
}
