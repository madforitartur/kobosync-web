/**
 * Cleans metadata text (titles, authors) by:
 * 1. Removing leading numbers followed by underscores (e.g., "01_Title" -> "Title")
 * 2. Replacing underscores with spaces (e.g., "Book_Title" -> "Book Title")
 * 3. Trimming whitespace
 */
export function cleanMetadataText(text: string | null | undefined): string {
  if (!text) return "";

  return text
    .replace(/^\d+_+/, "") // Remove leading numbers followed by underscores
    .replace(/_/g, " ")      // Replace underscores with spaces
    .trim();
}
