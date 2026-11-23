import { BoxRenderable, TextRenderable, type MarkdownOptions, type SyntaxStyle } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { useMemo } from "react";
import { useTheme } from "../../theme/theme";
import { mermaidToText } from "./mermaid";

/**
 * The agent's markdown, with ```mermaid fences drawn as diagrams.
 * Unfinished (still streaming) or invalid diagrams fall back to the plain code block.
 */
export function Markdown({ content, syntaxStyle, fg, streaming }: { content: string; syntaxStyle: SyntaxStyle; fg: string; streaming?: boolean }) {
  const renderer = useRenderer();
  const t = useTheme();
  const renderBlock = useMemo<MarkdownOptions["renderBlock"]>(
    () => (block, ctx) => {
      if (block.kind !== "code") return undefined;
      const code = block as typeof block & { lang?: string; text: string; closed?: boolean };
      const lang = (code.lang ?? "").trim().toLowerCase();

      if (lang === "mermaid" && code.closed) {
        const diagram = mermaidToText(code.text);
        if (diagram) {
          const box = new BoxRenderable(renderer, {
            border: true,
            borderStyle: "rounded",
            borderColor: t.border,
            title: " diagram ",
            titleAlignment: "left",
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "column",
            alignSelf: "flex-start",
            flexShrink: 0,
          });
          box.add(new TextRenderable(renderer, { content: diagram, fg: t.text, wrapMode: "none" }));
          return box;
        }
      }

      // Every other code block: a raised panel with a dim language label, so code never blends into prose.
      const inner = ctx.defaultRender();
      if (!inner) return undefined;
      const panel = new BoxRenderable(renderer, {
        backgroundColor: t.raised,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "column",
        flexShrink: 0,
      });
      if (lang) panel.add(new TextRenderable(renderer, { content: lang, fg: t.subtle }));
      panel.add(inner);
      return panel;
    },
    [renderer, t],
  );
  return (
    <markdown
      content={content}
      syntaxStyle={syntaxStyle}
      renderBlock={renderBlock}
      streaming={streaming}
      conceal
      fg={fg}
      tableOptions={{ style: "grid", widthMode: "content", columnFitter: "balanced", cellPaddingX: 1, borderColor: t.border }}
    />
  );
}
