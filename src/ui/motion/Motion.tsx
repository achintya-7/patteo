import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../theme/theme";
import { useFrame } from "./clock";

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function spinnerGlyph(frame: number): string {
  return BRAILLE[frame % BRAILLE.length]!;
}

/** Braille spinner. Rendered as a <span>, so it must sit inside a <text>. */
export function SpinnerSpan({ color }: { color?: string }) {
  const t = useTheme();
  const frame = useFrame();
  return <span fg={color ?? t.info}>{spinnerGlyph(frame)}</span>;
}

/**
 * Text with a soft highlight sweeping left to right (for "Working…", "Thinking…").
 * Characters near the sweep are bright, the rest muted. Pure function for tests.
 */
export function shimmerColors(len: number, frame: number, width = 3): ("hi" | "mid" | "lo")[] {
  const span = len + width * 2;
  const pos = (frame % span) - width;
  return Array.from({ length: len }, (_, i) => {
    const d = Math.abs(i - pos);
    return d === 0 ? "hi" : d <= width ? "mid" : "lo";
  });
}

export function Shimmer({ text, color, base, bold }: { text: string; color?: string; base?: string; bold?: boolean }) {
  const t = useTheme();
  const frame = useFrame();
  const chars = [...text];
  const levels = shimmerColors(chars.length, frame);
  const hi = color ?? t.text;
  const lo = base ?? t.subtle;
  return (
    <>
      {chars.map((c, i) => (
        <span key={i} fg={levels[i] === "hi" ? hi : levels[i] === "mid" ? t.muted : lo} attributes={bold ? TextAttributes.BOLD : TextAttributes.NONE}>
          {c}
        </span>
      ))}
    </>
  );
}

/** "0:42", "12:05" — long waits read better than an unexplained spinner. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "⠹ Working… 0:42" with a sweeping shimmer — the agent-is-busy indicator. */
export function WorkingLine({ label = "Working…", color, since }: { label?: string; color?: string; since?: number }) {
  const t = useTheme();
  useFrame(); // re-render each animation tick so the elapsed time advances
  return (
    <text wrapMode="none">
      <SpinnerSpan color={color ?? t.accent} />
      <span>{" "}</span>
      <Shimmer text={label} color={color ?? t.text} />
      {since && since > 0 ? <span fg={t.subtle}>{`  ${formatElapsed(Date.now() - since)}`}</span> : null}
    </text>
  );
}

/**
 * Placeholder rows while content loads: soft bars with a highlight band moving down them.
 * `widths` are fractions of `width`.
 */
export function Skeleton({ rows = 4, width, widths, indent = 0, gap = 0 }: { rows?: number; width: number; widths?: number[]; indent?: number; gap?: number }) {
  const t = useTheme();
  const frame = useFrame();
  const pattern = widths ?? [0.72, 0.55, 0.86, 0.4, 0.64, 0.5];
  const band = Math.floor(frame / 2) % (rows + 3);
  return (
    <box flexDirection="column" flexShrink={0}>
      {Array.from({ length: rows }, (_, i) => {
        const w = Math.max(4, Math.floor((width - indent) * pattern[i % pattern.length]!));
        const lit = Math.abs(i - band) <= 0 ? t.border : t.element;
        return (
          <box key={i} height={1} marginBottom={gap} flexShrink={0}>
            <text wrapMode="none">
              <span>{" ".repeat(indent)}</span>
              <span fg={lit}>{"▬".repeat(w)}</span>
            </text>
          </box>
        );
      })}
    </box>
  );
}
