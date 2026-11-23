/**
 * Copies whatever the user selects with the mouse. Kept separate from AppRoot so the
 * wiring (blank selections ignored, failures silent, one toast per copy) is testable
 * without a terminal.
 */
export interface SelectionLike {
  getSelectedText?: () => string;
}

export interface SelectionHost {
  on(event: "selection", handler: (selection: SelectionLike | null) => void): unknown;
  off(event: "selection", handler: (selection: SelectionLike | null) => void): unknown;
}

export function watchSelection(
  host: SelectionHost,
  copy: (text: string) => Promise<boolean>,
  copied: (message: string) => void,
): () => void {
  const handler = (selection: SelectionLike | null) => {
    const text = selection?.getSelectedText?.() ?? "";
    if (!text.trim()) return; // a click that selected nothing
    void copy(text).then((ok) => {
      if (ok) copied(`Copied ${text.length} character${text.length === 1 ? "" : "s"}`);
    });
  };
  host.on("selection", handler);
  return () => {
    host.off("selection", handler);
  };
}
