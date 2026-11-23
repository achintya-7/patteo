/**
 * The workspace's file system as the daemon lists it, plus the pure rules the Files tab
 * builds its tree from. Paths are relative to the workspace directory; "" is the root.
 */

export interface DirEntry {
  name: string;
  /** Relative to the workspace directory, e.g. `src/ui`. */
  path: string;
  kind: "file" | "directory";
  size: number;
}

export interface DirListing {
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
}

export interface FilesState {
  cwd: string | null;
  /** Keyed by directory path ("" = root). */
  listings: Record<string, DirListing>;
}

export const emptyFiles = (): FilesState => ({ cwd: null, listings: {} });

/** Daemon directory payload → entries. */
export function toDirEntries(payload: { entries?: { name?: string; path?: string; kind?: string; size?: number }[] }): DirEntry[] {
  return (payload.entries ?? [])
    .filter((e) => e.name && e.path)
    .map((e) => ({ name: String(e.name), path: String(e.path), kind: e.kind === "directory" ? "directory" : "file", size: Number(e.size ?? 0) }));
}

/** Folders first, then files, each A→Z ignoring case — the order Desktop's tree uses. */
export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}

export const parentDir = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
};

/** Bytes → text for the file viewer, or why it can't be shown. */
export type FileContent =
  | { kind: "text"; text: string; size: number; truncated: boolean }
  | { kind: "binary" | "image"; size: number }
  | { kind: "error"; message: string };

export const MAX_VIEW_BYTES = 256 * 1024;

export function toFileContent(file: { kind?: string; bytes?: Uint8Array; size?: number }): FileContent {
  const size = Number(file.size ?? file.bytes?.length ?? 0);
  if (file.kind === "binary" || file.kind === "image") return { kind: file.kind, size };
  const bytes = file.bytes ?? new Uint8Array();
  const truncated = size > bytes.length || bytes.length > MAX_VIEW_BYTES;
  const text = new TextDecoder().decode(bytes.length > MAX_VIEW_BYTES ? bytes.subarray(0, MAX_VIEW_BYTES) : bytes);
  // A NUL byte means a binary file the daemon didn't flag.
  if (text.includes("\u0000")) return { kind: "binary", size };
  return { kind: "text", text, size, truncated };
}
