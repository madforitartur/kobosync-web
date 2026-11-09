// Limpa títulos de livros: remove prefixos numéricos, #N, underscores
export function cleanBookTitle(raw: string): string {
  return raw
    .replace(/^#?\d+[\s._\-–:]+/, "")  // "#4 ", "4. ", "004_", "4 - ", "4: "
    .replace(/^#\d+\s*/, "")            // "#4" sozinho no início
    .replace(/#\d+\s*/g, "")            // "#4" em qualquer posição restante
    .replace(/_/g, " ")                  // underscores → espaços
    .replace(/\s{2,}/g, " ")            // espaços duplos → simples
    .replace(/\s*[-–]\s*(\.{2,})?$/, "") // traço/dash no final "Título -" ou "Título -..."
    .trim();
}
