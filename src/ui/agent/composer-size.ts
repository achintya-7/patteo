/**
 * Composer sizing, after Paseo Desktop: the box grows with what you type and stops at
 * half the window (Desktop: 160px or 50% of the window, whichever is larger). Beyond the
 * cap the textarea scrolls to keep the cursor visible.
 */

/** Rows the composer itself occupies: border (2) + text lines + the status line. */
export const COMPOSER_CHROME = 3;

export function composerHeight(lines: number, maxLines: number): number {
  return COMPOSER_CHROME + Math.max(1, Math.min(maxLines, lines));
}

/** Desktop's rule in terminal rows: half the body, never less than 6, never more than 20. */
export function maxComposerLines(bodyHeight: number): number {
  if (!Number.isFinite(bodyHeight) || bodyHeight <= 0) return 8;
  return Math.max(6, Math.min(20, Math.floor(bodyHeight * 0.5)));
}

/**
 * Lines the text occupies once wrapped at `width`. Counts by code points (the same
 * approximation as `truncate`), so wide glyphs may grow the box one row early.
 */
export function composerLineCount(text: string, width: number): number {
  const w = Math.max(8, width);
  let lines = 0;
  for (const line of text.split("\n")) lines += Math.max(1, Math.ceil([...line].length / w));
  return Math.max(1, lines);
}
