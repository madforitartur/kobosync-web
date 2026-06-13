export interface Book {
  id: string;
  drive_file_id: string;
  title: string;
  author: string | null;
  series: string | null;
  series_index: number | null;
  language: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  cover_url: string | null;
  epub_url: string | null;
  filesize: number | null;
  modified_at: string | null;
}

export interface DriveBookFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
}

export interface EpubMetadata {
  title: string;
  author: string | null;
  language: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  series: string | null;
  seriesIndex: number | null;
}

export interface ExtractedCover {
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export interface ParsedEpub {
  metadata: EpubMetadata;
  cover: ExtractedCover | null;
}
export type Book = {
  id: string;
  drive_file_id: string | null;
  title: string;
  author: string | null;
  series: string | null;
  series_index: number | null;
  language: string | null;
  publisher: string | null;
  isbn: string | null;
  description: string | null;
  cover_url: string | null;
  cover_path?: string | null;
  epub_url: string | null;
  epub_path?: string | null;
  filesize: number | null;
  modified_at: string | null;
  created_at: string;
  updated_at: string;
};
