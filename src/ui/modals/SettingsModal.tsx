import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import pkg from "../../../package.json";
import { CONFIG_DIR } from "../../config/paths";
import { SETTINGS_FILE, type Settings } from "../../config/settings";
import { activeCommands } from "../../keyboard/dispatch";
import { keyLabel } from "../../keyboard/keys";
import { selection } from "../../keyboard/commands";
import { useApp, useSession, useSettings } from "../../stores/context";
import { THEMES } from "../../theme/themes";
import { useTheme } from "../../theme/theme";
import { padEnd, truncate } from "../text";
import { usableProviders } from "./NewAgentModal";

const SECTIONS = ["appearance", "agents", "hosts", "keyboard", "about"] as const;
type Section = (typeof SECTIONS)[number];
const TITLES: Record<Section, string> = { appearance: "Appearance", agents: "Agents", hosts: "Hosts", keyboard: "Keyboard", about: "About" };

interface Row {
  id: string;
  label: string;
  value: string;
  hint?: string;
  /** ←/→/⏎ change the value. */
  change?: (dir: 1 | -1) => void;
}

const cycleIn = <T,>(list: readonly T[], cur: T, dir: number): T => list[(Math.max(0, list.indexOf(cur)) + dir + list.length) % list.length]!;
const onOff = (b: boolean) => (b ? "on" : "off");

export function SettingsModal({ initialSection }: { initialSection?: string }) {
  const t = useTheme();
  const { ui, store, runtimes, settings: settingsStore } = useApp();
  const dims = useTerminalDimensions();
  const s = useSettings((x) => x.settings);
  const custom = useSettings((x) => x.customThemes);
  const hosts = useSession((x) => x.hosts);
  const hostOrder = useSession((x) => x.hostOrder);
  const activeHost = useSession((x) => x.activeHostId);
  const [section, setSection] = useState<Section>((SECTIONS as readonly string[]).includes(initialSection ?? "") ? (initialSection as Section) : "appearance");
  const [col, setCol] = useState<"nav" | "rows">(initialSection ? "rows" : "nav");
  const [row, setRow] = useState(0);
  const [providers, setProviders] = useState<ReturnType<typeof usableProviders>>([]);

  useEffect(() => {
    const hostId = selection({ ui, store }).hostId;
    if (hostId) runtimes.get(hostId)?.providers().then((p) => setProviders(usableProviders(p))).catch(() => {});
  }, []);

  const set = (patch: Partial<Settings>) => settingsStore.actions.update(patch);
  // Read live settings inside change handlers: several keys can arrive before a re-render.
  const live = () => settingsStore.getState().settings;
  const themeNames = [...THEMES.map((x) => x.name), ...custom.map((x) => x.name)];
  const themeLabel = (n: string) => THEMES.find((x) => x.name === n)?.label ?? n;
  const provider = providers.find((p) => p.provider === s.agentDefaults.provider);

  const rows: Record<Section, Row[]> = {
    appearance: [
      { id: "theme", label: "Theme", value: themeLabel(s.theme), hint: `${themeNames.indexOf(s.theme) + 1}/${themeNames.length} · live preview`, change: (d) => set({ theme: cycleIn(themeNames, live().theme, d) }) },
      { id: "transparent", label: "Transparent background", value: onOff(s.transparent), hint: "keep your terminal's own background", change: () => set({ transparent: !live().transparent }) },
      { id: "motion", label: "Animations", value: onOff(!s.reduceMotion), hint: "spinners, shimmer, skeletons", change: () => set({ reduceMotion: !live().reduceMotion }) },
      { id: "thoughts", label: "Show thoughts in full", value: onOff(s.showThoughts), change: () => set({ showThoughts: !live().showThoughts }) },
      { id: "activity", label: "Expand finished activity", value: onOff(s.expandActivity), change: () => set({ expandActivity: !live().expandActivity }) },
      { id: "panelSide", label: "Files & changes panel", value: s.panelSide === "left" ? "left" : "right", hint: "which side it opens on (C)", change: () => set({ panelSide: live().panelSide === "left" ? "right" : "left" }) },
      { id: "sidebar", label: "Sidebar width", value: s.sidebar, change: (d) => set({ sidebar: cycleIn(["narrow", "normal", "wide"] as const, live().sidebar, d) }) },
    ],
    agents: [
      {
        id: "provider",
        label: "Default provider",
        value: provider?.label ?? s.agentDefaults.provider ?? "same as current agent",
        change: (d) => {
          const ids = ["", ...providers.map((p) => p.provider)];
          const next = cycleIn(ids, live().agentDefaults.provider ?? "", d);
          set({ agentDefaults: { provider: next || undefined } });
        },
      },
      {
        id: "mode",
        label: "Default mode",
        value: provider?.modes.find((m) => m.id === s.agentDefaults.modeId)?.label ?? "provider default",
        hint: provider ? undefined : "pick a provider first",
        change: (d) => {
          if (!provider) return;
          const ids = ["", ...provider.modes.map((m) => m.id)];
          const next = cycleIn(ids, live().agentDefaults.modeId ?? "", d);
          set({ agentDefaults: { ...live().agentDefaults, modeId: next || undefined } });
        },
      },
    ],
    hosts: [
      ...hostOrder.map((id) => {
        const h = hosts[id]!;
        return {
          id: `host:${id}`,
          label: h.config.label,
          value: id === activeHost ? "active" : h.connection.status,
          hint: h.config.url,
          change: () => {
            store.actions.setActiveHost(id);
            runtimes.setDefaultHost(id);
          },
        };
      }),
      { id: "add", label: "Add a host…", value: "", change: () => ui.actions.openModal({ kind: "addHost" }) },
    ],
    keyboard: activeCommands()
      .filter((c) => c.keys.length)
      .map((c) => ({ id: c.id, label: c.title, value: c.keys.map(keyLabel).join("  "), hint: c.id })),
    about: [
      { id: "version", label: "patteo", value: String((pkg as { version?: string }).version ?? "dev") },
      { id: "daemon", label: "Daemon", value: activeHost && hosts[activeHost]?.serverVersion ? `v${hosts[activeHost]!.serverVersion}` : "unknown", hint: activeHost ? hosts[activeHost]?.config.url : undefined },
      { id: "config", label: "Settings file", value: truncate(SETTINGS_FILE, 60) },
      { id: "themes", label: "Custom themes", value: truncate(`${CONFIG_DIR}/themes/*.json`, 60), hint: `${custom.length} loaded` },
      { id: "keys", label: "Remap keys", value: 'config.json → "keymap": { "<command id>": ["ctrl+…"] }' },
    ],
  };
  const list = rows[section];
  const cur = Math.min(row, Math.max(0, list.length - 1));
  // Live navigation state for the key handler (fast key sequences).
  const nav = useRef({ section, col, row: cur, rows });
  nav.current.rows = rows;
  const setNav = (patch: Partial<{ section: Section; col: "nav" | "rows"; row: number }>) => {
    Object.assign(nav.current, patch);
    if (patch.section !== undefined) setSection(patch.section);
    if (patch.col !== undefined) setCol(patch.col);
    if (patch.row !== undefined) setRow(patch.row);
  };

  useKeyboard((k) => {
    const { section, col } = nav.current;
    const list = nav.current.rows[section];
    const cur = Math.min(nav.current.row, Math.max(0, list.length - 1));
    if (k.name === "escape" || (k.name === "q" && col === "nav")) {
      if (col === "rows") return setNav({ col: "nav" });
      return ui.actions.closeModal();
    }
    if (col === "nav") {
      const i = SECTIONS.indexOf(section);
      if (k.name === "up" || k.name === "k") return setNav({ section: SECTIONS[(i + SECTIONS.length - 1) % SECTIONS.length]!, row: 0 });
      if (k.name === "down" || k.name === "j") return setNav({ section: SECTIONS[(i + 1) % SECTIONS.length]!, row: 0 });
      if (k.name === "return" || k.name === "right" || k.name === "l" || k.name === "tab") return setNav({ col: "rows" });
      return;
    }
    if (k.name === "up" || k.name === "k") return setNav({ row: Math.max(0, cur - 1) });
    if (k.name === "down" || k.name === "j") return setNav({ row: Math.min(list.length - 1, cur + 1) });
    if (k.name === "tab" || (k.name === "left" && !list[cur]?.change)) return setNav({ col: "nav" });
    const r = list[cur];
    if (!r?.change) return;
    if (k.name === "left" || k.name === "h") return r.change(-1);
    if (k.name === "right" || k.name === "l" || k.name === "return" || k.name === "space") return r.change(1);
  });

  const width = Math.min(Math.max(56, dims.width - 2), 118);
  const height = Math.min(26, dims.height - 2);
  const navW = 16;
  const rowsW = width - navW - 5;
  const view = height - 4;
  // Columns are sized from the panel and the widest value in this section, so a short
  // value ("● on") never reserves the space a long one needs — and hints get the rest.
  const labelCol = Math.min(26, Math.max(12, Math.floor(rowsW * 0.36)));
  const valueW = (r: Row) => (r.value === "on" || r.value === "off" ? 4 : [...r.value].length + (r.change ? 3 : 0));
  const valueCol = Math.min(Math.max(10, ...list.map(valueW)), Math.floor(rowsW * 0.48));
  const cols = { label: labelCol, value: valueCol, hint: Math.max(0, rowsW - labelCol - valueCol - 2) };
  const start = Math.max(0, Math.min(cur - view + 1, list.length - view));
  return (
    <box
      position="absolute"
      left={Math.floor((dims.width - width) / 2)}
      top={Math.max(0, Math.floor((dims.height - height) / 3))}
      width={width}
      height={height}
      zIndex={100}
      border
      borderStyle="rounded"
      borderColor={t.accent}
      backgroundColor={t.overlay}
      title=" Settings "
      titleColor={t.accent}
      bottomTitle={col === "nav" ? " ↑↓ section · ⏎ open · esc close " : " ↑↓ move · ←→/⏎ change · esc back "}
      bottomTitleAlignment="right"
      flexDirection="row"
      paddingTop={1}
    >
      <box width={navW} flexDirection="column" flexShrink={0} paddingLeft={1}>
        {SECTIONS.map((sec) => {
          const on = sec === section;
          return (
            <box key={sec} height={1} backgroundColor={on ? (col === "nav" ? t.element : t.raised) : undefined}>
              <text fg={on ? t.text : t.muted} attributes={on ? TextAttributes.BOLD : TextAttributes.NONE}>{`${on ? "▌" : " "} ${TITLES[sec]}`}</text>
            </box>
          );
        })}
      </box>
      <box flexGrow={1} flexDirection="column" paddingLeft={2} paddingRight={1}>
        {list.slice(start, start + view).map((r, i) => {
          const on = col === "rows" && start + i === cur;
          const isBool = r.value === "on" || r.value === "off";
          // Fixed columns: a long value can no longer squeeze the hint to nothing,
          // and each cell truncates only when its own column is full.
          const valueW = cols.value;
          const hintW = cols.hint;
          const changer = !!r.change && !isBool && !!r.value;
          const valueText = isBool ? (r.value === "on" ? "● on" : "○ off") : truncate(r.value, Math.max(3, valueW - (changer ? 3 : 0)));
          const pad = Math.max(0, valueW - [...valueText].length - (changer ? 3 : 0));
          return (
            <box key={r.id} height={1} flexShrink={0} backgroundColor={on ? t.element : undefined}>
              <text wrapMode="none">
                <span fg={on ? t.accent : t.subtle}>{on ? "▌" : " "}</span>
                <span fg={on ? t.text : t.muted}>{padEnd(truncate(r.label, cols.label - 1), cols.label)}</span>
                {changer ? <span fg={on ? t.accent : t.subtle}>{"‹ "}</span> : null}
                <span fg={isBool ? (r.value === "on" ? t.success : t.subtle) : t.text} attributes={TextAttributes.BOLD}>
                  {valueText}
                </span>
                {changer ? <span fg={on ? t.accent : t.subtle}>{" ›"}</span> : null}
                {" ".repeat(pad)}
                {r.hint && hintW > 4 ? <span fg={t.subtle}>{` ${truncate(r.hint, hintW)}`}</span> : null}
              </text>
            </box>
          );
        })}
        {section === "appearance" ? <ThemePreview /> : null}
      </box>
    </box>
  );
}

/** A tiny sample of the current theme under the appearance rows. */
function ThemePreview() {
  const t = useTheme();
  return (
    <box marginTop={1} flexDirection="column" border borderStyle="rounded" borderColor={t.border} title=" preview " titleColor={t.subtle} paddingLeft={1}>
      <text wrapMode="none">
        <span fg={t.accent}>{"┃ "}</span>
        <span fg={t.text}>{"Fix the flaky test"}</span>
      </text>
      <text wrapMode="none">
        <span fg={t.subtle}>{"  │ $ bun test   "}</span>
        <span fg={t.success}>{"✓ 58 pass  "}</span>
        <span fg={t.error}>{"✗ 0 fail  "}</span>
        <span fg={t.warning}>{"⚠ 1 waiting"}</span>
      </text>
      <text wrapMode="none">
        <span fg={t.text}>{"  Done — "}</span>
        <span fg={t.info}>{"1 file"}</span>
        <span fg={t.text}>{" changed."}</span>
      </text>
    </box>
  );
}
