import { longestCommonPrefix } from "../../util/text";

/**
 * Shell-style Tab completion for the Add-folder path. Pure: callers supply the
 * directory entries, so the rules are testable without a filesystem or a daemon.
 */

/** The directory to list and the partial name inside it. `~/a/b` → dir `~/a/`, prefix `b`. */
export function splitFolderInput(input: string): { dir: string; prefix: string } {
  if (input === "~") return { dir: "~/", prefix: "" };
  const cut = input.lastIndexOf("/");
  if (cut < 0) return { dir: "", prefix: input };
  return { dir: input.slice(0, cut + 1), prefix: input.slice(cut + 1) };
}



export interface Completion {
  /** The input after completing as far as the matches allow. */
  value: string;
  /** Matching directory names, for the candidate list. */
  candidates: string[];
  /** Absolute directory that was listed (after `~` expansion), for the caller to fetch. */
  listDir: string;
}

/**
 * Completes `input` from the directory entries of its parent.
 * One match fills it in (with a trailing slash); several extend to the common prefix.
 * Dot-directories only match when the typed prefix starts with a dot, as in a shell.
 */
export function completeFolder(input: string, entries: string[], home: string): Completion {
  const { dir, prefix } = splitFolderInput(input);
  const expanded = dir === "" ? `${home}/` : dir === "~/" ? `${home}/` : dir.startsWith("~/") ? `${home}/${dir.slice(2)}` : dir;
  const candidates = entries
    .filter((name) => (prefix.startsWith(".") || !name.startsWith(".")) && name.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) return { value: input, candidates, listDir: expanded };
  if (candidates.length === 1) return { value: `${dir}${candidates[0]}/`, candidates, listDir: expanded };
  const common = longestCommonPrefix(candidates);
  return { value: common.length > prefix.length ? `${dir}${common}` : input, candidates, listDir: expanded };
}
