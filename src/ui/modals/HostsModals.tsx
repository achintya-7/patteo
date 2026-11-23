import { TextAttributes, type InputRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import { normalizeHostInput } from "../../config/hosts";
import { useApp, useSession } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { Overlay, overlayInner } from "./Overlay";
import { SelectList, type ListItem } from "./SelectList";

export function HostsModal() {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const { width } = useTerminalDimensions();
  const hosts = useSession((s) => s.hosts);
  const order = useSession((s) => s.hostOrder);
  const active = useSession((s) => s.activeHostId);
  const items: ListItem[] = order.map((id) => {
    const h = hosts[id]!;
    const c = h.connection.status;
    const retry = h.connection.status === "disconnected" && h.connection.retryAt ? `retry in ${Math.max(0, Math.ceil((h.connection.retryAt - Date.now()) / 1000))}s` : null;
    const problem = h.connection.status === "disconnected" ? h.connection.error ?? retry : null;
    const detail = [h.config.url, h.serverVersion ? `v${h.serverVersion}` : null, h.hostname, problem].filter(Boolean).join(" · ");
    return {
      id,
      label: h.config.label,
      detail,
      hint: id === active ? "active" : c,
      marker: { glyph: "●", color: c === "connected" ? t.success : c === "connecting" ? t.warning : t.error },
    };
  });
  items.push({ id: "__add", label: "Add a host…", marker: { glyph: "+", color: t.accent } });
  return (
    <Overlay title="Hosts" width={74} height={Math.min(24, 7 + items.length * 2)} footer="⏎ switch · a add · e rename · r reconnect · d remove · esc">
      <SelectList
        items={items}
        filterable={false}
        initialId={active ?? undefined}
        width={overlayInner(70, width)}
        height={items.length * 2 + 1}
        onCancel={() => ui.actions.closeModal()}
        onKey={(k, it) => {
          if (k.name === "a") {
            ui.actions.openModal({ kind: "addHost" });
            return true;
          }
          if (k.name === "e" && it && it.id !== "__add") {
            ui.actions.openModal({ kind: "editHost", id: it.id, label: it.label });
            return true;
          }
          if (k.name === "r" && it && it.id !== "__add") {
            void runtimes.reconnectHost(it.id);
            ui.actions.toast(`Reconnecting ${it.label}…`);
            return true;
          }
          if (k.name === "d" && it && it.id !== "__add") {
            if (order.length <= 1) {
              ui.actions.toast("Keep at least one host", "error");
              return true;
            }
            ui.actions.openModal({ kind: "confirm", title: "Remove host?", body: `Forget "${it.label}"? Its daemon keeps running; you can add it again later.`, confirmLabel: "Remove", action: "host.remove", payload: it.id });
            return true;
          }
          return false;
        }}
        onSelect={(it) => {
          if (it.id === "__add") return ui.actions.openModal({ kind: "addHost" });
          store.actions.setActiveHost(it.id);
          runtimes.setDefaultHost(it.id);
          ui.actions.closeModal();
          ui.actions.toast(`Switched to ${it.label}`, "success");
        }}
      />
    </Overlay>
  );
}

/** Parses the address field; returns a ws(s) URL or an error message. */
export function parseHostAddress(input: string): { url: string } | { error: string } {
  const s = input.trim();
  if (!s) return { error: "Enter an address, e.g. 192.168.1.20:6767" };
  if (s.startsWith("ssh://")) return { error: "SSH hosts aren't supported yet. Use host:port (e.g. over Tailscale)." };
  if (/app\.paseo\.sh\/#offer=/.test(s)) return { error: "Pairing links aren't supported yet. Use host:port." };
  try {
    return { url: normalizeHostInput(s) };
  } catch {
    return { error: "Use host:port, a port, or ws://host:port" };
  }
}

export function AddHostModal() {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const [field, setField] = useState<"address" | "label">("address");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseHostAddress(address);
    if ("error" in parsed) return setError(parsed.error);
    const name = label.trim() || address.trim();
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "host"}-${Math.random().toString(36).slice(2, 6)}`;
    runtimes.addHost({ id, label: name, url: parsed.url });
    store.actions.setActiveHost(id);
    ui.actions.closeModal();
    ui.actions.toast(`Connecting to ${name}…`);
  };

  useKeyboard((k) => {
    if (k.name === "escape") return ui.actions.closeModal();
    if (k.name === "tab" || k.name === "down" || k.name === "up") return setField((f) => (f === "address" ? "label" : "address"));
    if (k.name === "return") return submit();
  });

  const row = (name: "address" | "label", title: string, value: string, set: (v: string) => void, placeholder: string) => (
    <box flexDirection="column" marginBottom={1}>
      <text fg={field === name ? t.accent : t.muted} attributes={field === name ? TextAttributes.BOLD : TextAttributes.NONE}>{title}</text>
      <box border borderStyle="rounded" borderColor={field === name ? t.accent : t.border} height={3} paddingLeft={1}>
        <input
          focused={field === name}
          value={value}
          placeholder={placeholder}
          onInput={(v: string) => {
            set(v);
            setError(null);
          }}
          textColor={t.text}
          placeholderColor={t.subtle}
          backgroundColor={t.overlay}
          focusedBackgroundColor={t.overlay}
          cursorColor={t.accent}
        />
      </box>
    </box>
  );

  return (
    <Overlay title="Add host" width={60} height={15} footer="tab next field · ⏎ add · esc cancel">
      {row("address", "Address", address, setAddress, "192.168.1.20:6767 or ws://box:6767")}
      {row("label", "Name (optional)", label, setLabel, "workstation")}
      {error ? <text fg={t.error}>{error}</text> : <text fg={t.subtle}>{"The daemon must listen on that address (see paseo daemon status)."}</text>}
    </Overlay>
  );
}

/** Renames a host (the URL/connection stays as it is). */
export function EditHostModal({ hostId, label }: { hostId: string; label: string }) {
  const t = useTheme();
  const { ui, runtimes } = useApp();
  const [value, setValue] = useState(label);
  const inputRef = useRef<InputRenderable>(null);
  // Select the current name so the first keystroke replaces it, like a rename dialog.
  useEffect(() => {
    inputRef.current?.selectAll();
  }, []);
  const save = () => {
    const name = value.trim();
    if (!name) return;
    runtimes.renameHost(hostId, name);
    ui.actions.closeModal();
    ui.actions.toast(`Renamed to ${name}`, "success");
  };
  useKeyboard((k) => {
    if (k.name === "escape") return ui.actions.closeModal();
    if (k.name === "return") return save();
  });
  return (
    <Overlay title="Rename host" width={58} height={9} footer="⏎ save · esc cancel">
      <text fg={t.muted}>{"Name"}</text>
      <box border borderStyle="rounded" borderColor={t.accent} height={3} paddingLeft={1}>
        <input
          ref={inputRef}
          focused
          value={value}
          placeholder={label}
          onInput={(v: string) => setValue(v)}
          textColor={t.text}
          placeholderColor={t.subtle}
          backgroundColor={t.overlay}
          focusedBackgroundColor={t.overlay}
          cursorColor={t.accent}
        />
      </box>
    </Overlay>
  );
}
