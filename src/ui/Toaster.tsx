import { useTerminalDimensions } from "@opentui/react";
import { useUi } from "../stores/context";
import { useTheme } from "../theme/theme";
import { truncate } from "./text";

/** Stacked toasts, bottom-right above the status bar. */
export function Toaster() {
  const t = useTheme();
  const toasts = useUi((s) => s.toasts);
  const { width, height } = useTerminalDimensions();
  if (!toasts.length) return null;
  const w = Math.min(48, width - 4);
  return (
    <box position="absolute" right={2} top={Math.max(0, height - 2 - toasts.length * 3)} width={w} zIndex={200} flexDirection="column">
      {toasts.map((toast) => {
        const color = toast.kind === "error" ? t.error : toast.kind === "success" ? t.success : t.accent;
        const glyph = toast.kind === "error" ? "✗" : toast.kind === "success" ? "✓" : "●";
        return (
          <box key={toast.id} height={3} border borderStyle="rounded" borderColor={color} backgroundColor={t.overlay} paddingLeft={1} paddingRight={1}>
            <text wrapMode="none">
              <span fg={color}>{`${glyph} `}</span>
              <span fg={t.text}>{truncate(toast.text, w - 6)}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}
