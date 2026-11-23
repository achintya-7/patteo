import { useTerminalDimensions } from "@opentui/react";
import type { ReactNode } from "react";
import { useTheme } from "../../theme/theme";

/** Centered modal frame on a solid surface (opaque even in transparent mode). */
export function Overlay(props: { title: string; width?: number; height?: number; footer?: string; children: ReactNode }) {
  const t = useTheme();
  const dims = useTerminalDimensions();
  const width = Math.min(props.width ?? 70, dims.width - 4);
  const height = Math.min(props.height ?? 20, dims.height - 2);
  return (
    <box
      position="absolute"
      left={Math.max(0, Math.floor((dims.width - width) / 2))}
      top={Math.max(0, Math.floor((dims.height - height) / 3))}
      width={width}
      height={height}
      zIndex={100}
      border
      borderStyle="rounded"
      borderColor={t.accent}
      backgroundColor={t.overlay}
      title={` ${props.title} `}
      titleColor={t.accent}
      bottomTitle={props.footer ? ` ${props.footer} ` : undefined}
      bottomTitleAlignment="right"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
    >
      {props.children}
    </box>
  );
}

/** Inner width of an Overlay of the given width (border + padding). */
export const overlayInner = (width: number, termWidth: number) => Math.min(width, termWidth - 4) - 4;
