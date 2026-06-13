/**
 * Helper para fazer download de ficheiros do Google Drive.
 *
 * Para ficheiros públicos partilhados como "qualquer pessoa com o link",
 * o download direto funciona. Para ficheiros privados, o Google devolve
 * uma página HTML de confirmação/login.
 */
export async function downloadFromDrive(fileId: string): Promise<ArrayBuffer> {
  // URL para download direto
  const baseUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  // 1ª tentativa: URL simples
  let response = await fetch(baseUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KoboSync/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Drive returned ${response.status} ${response.statusText}`);
  }

  let contentType = response.headers.get("content-type") ?? "";
  let arrayBuffer = await response.arrayBuffer();

  // Se o conteúdo é HTML, pode ser:
  // 1. Página de confirmação (ficheiros grandes >100MB)
  // 2. Página de login (ficheiros privados)
  // 3. Página de "vírus scan warning"
  if (contentType.includes("text/html")) {
    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      new Uint8Array(arrayBuffer),
    );

    // Caso 1: Ficheiro grande, precisa confirmação
    const confirmMatch = html.match(/confirm=([^&"]+)/);
    if (confirmMatch) {
      const confirmUrl = `${baseUrl}&confirm=${confirmMatch[1]}`;
      response = await fetch(confirmUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KoboSync/1.0)" },
      });
      if (response.ok) {
        contentType = response.headers.get("content-type") ?? "";
        arrayBuffer = await response.arrayBuffer();
      }
    }

    // Caso 2/3: Ainda é HTML → ficheiro privado
    if (contentType.includes("text/html") || arrayBuffer.byteLength < 1000) {
      throw new Error(
        "Downloaded HTML instead of EPUB. The file is likely private or requires authentication.",
      );
    }
  }

  return arrayBuffer;
}
