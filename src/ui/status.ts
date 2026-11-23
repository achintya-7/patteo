import type { Theme } from "../theme/theme";
import type { WorkspaceStatus } from "./sidebar/model";

export function workspaceStatusGlyph(status: WorkspaceStatus | null, t: Theme): { glyph: string; color: string } {
  switch (status) {
    case "running":
      return { glyph: "●", color: t.info };
    case "needs_input":
      return { glyph: "?", color: t.warning };
    case "attention":
      return { glyph: "●", color: t.warning };
    case "failed":
      return { glyph: "✗", color: t.error };
    case "done":
      return { glyph: "○", color: t.subtle };
    default:
      return { glyph: " ", color: t.subtle };
  }
}

export function agentStatusGlyph(status: string, attention: boolean, t: Theme): { glyph: string; color: string } {
  if (attention) return { glyph: "●", color: t.warning };
  switch (status) {
    case "running":
      return { glyph: "●", color: t.info };
    case "initializing":
      return { glyph: "◌", color: t.muted };
    case "error":
      return { glyph: "✗", color: t.error };
    case "closed":
      return { glyph: "·", color: t.subtle };
    default:
      return { glyph: "○", color: t.subtle };
  }
}
