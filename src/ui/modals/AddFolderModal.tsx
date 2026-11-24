/**
 * "Add folder": opens a directory as a workspace on the active daemon, the same
 * operation Desktop's folder picker performs. Typing a path that doesn't exist can
 * create it (^G) instead of failing silently.
 */
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { homedir } from "node:os";
import { join } from "node:path";
import { useRef, useState } from "react";
import { selection } from "../../keyboard/commands";
import { useApp } from "../../stores/context";
import { useTheme } from "../../theme/theme";
import { Overlay } from "./Overlay";
import { completeFolder } from "./folder-complete";

/** Expands `~`, strips quotes and trailing slashes; the daemon needs an absolute path. */
export function normalizeFolderPath(input: string, home = homedir()): { path: string } | { error: string } {
  let s = input.trim().replace(/^['"]+|['"]+$/g, "");
  if (!s) return { error: "Enter a folder, e.g. ~/Lab/new-project" };
  if (s === "~") s = home;
  else if (s.startsWith("~/")) s = join(home, s.slice(2));
  if (!s.startsWith("/")) return { error: "Use an absolute path (the daemon, not your shell, resolves it)" };
  return { path: s.replace(/\/+$/, "") || "/" };
}

export function AddFolderModal({ thenAgent }: { thenAgent?: boolean } = {}) {
  const t = useTheme();
  const { ui, store, runtimes } = useApp();
  const { width } = useTerminalDimensions();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const inFlight = useRef(false);
  /** Directory listings, so Tab is instant after the first look. */
  const listings = useRef(new Map<string, string[]>());

  /** Opens the folder; with `agent`, also starts a new agent in it (the sidebar's "not in the list yet" case). */
  const submit = async (create: boolean, agent = false) => {
    if (inFlight.current) return;
    const parsed = normalizeFolderPath(path);
    if ("error" in parsed) return setError(parsed.error);
    const { hostId } = selection({ ui, store });
    if (!hostId) return setError("No active host");
    const runtime = runtimes.get(hostId);
    if (!runtime) return setError("Host not connected");
    inFlight.current = true;
    setBusy(true);
    try {
      const handle = await runtime.openFolder(parsed.path, create);
      ui.actions.selectWorkspace(hostId, handle.id);
      ui.actions.setPickerOpen(false);
      if (agent) {
        const label = parsed.path.split("/").filter(Boolean).pop() ?? parsed.path;
        ui.actions.openModal({ kind: "newAgent", target: { hostId, workspaceId: handle.id, cwd: parsed.path, label } });
        return;
      }
      ui.actions.closeModal();
      ui.actions.setFocus("main");
      ui.actions.toast(`Opened ${parsed.path}`, "success");
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)}${create ? "" : " · ^G creates it"}`);
      inFlight.current = false;
      setBusy(false);
    }
  };

  const complete = async () => {
    const { hostId } = selection({ ui, store });
    const runtime = hostId ? runtimes.get(hostId) : undefined;
    if (!runtime) return;
    // The daemon lists directories, so completion is right for remote hosts too.
    const probe = completeFolder(path, [], homedir());
    let entries = listings.current.get(probe.listDir);
    if (!entries) {
      try {
        entries = await runtime.listDirs(probe.listDir);
      } catch {
        setCandidates([]);
        setError(`Can't read ${probe.listDir}`);
        return;
      }
      listings.current.set(probe.listDir, entries);
    }
    const done = completeFolder(path, entries, homedir());
    setPath(done.value);
    // A single match is already in the field; only several need a list.
    setCandidates(done.candidates.length > 1 ? done.candidates : []);
    setError(null);
  };

  useKeyboard((k) => {
    if (busy) return;
    if (k.name === "escape") return ui.actions.closeModal();
    if (k.name === "tab") return void complete();
    // "New agent" from the sidebar with nothing selected lands here: the folder is the point.
    if (k.name === "return") return void submit(false, !!thenAgent);
    if (k.ctrl && k.name === "n") return void submit(true, true); // a folder that isn't set up yet, then an agent in it
    if (k.ctrl && k.name === "g") return void submit(true);
  });

  return (
    <Overlay
      title="Add folder"
      width={Math.min(84, Math.max(52, width - 8))}
      // As tall as its content, plus room for the completion candidates when they are showing.
      // Border (2) + label + input (3) + hint (1 with candidates, 2 without) + candidates + error.
      height={(candidates.length ? 7 : 8)
        + (candidates.length ? Math.min(6, candidates.length) + (candidates.length > 6 ? 1 : 0) : 0)
        + (error ? 1 : 0)}
      footer={busy ? "opening…" : "tab complete · ⏎ open · ^N open + new agent · ^G create · esc"}
    >
      <text fg={t.muted} attributes={TextAttributes.BOLD}>{"Folder"}</text>
      <box border borderStyle="rounded" borderColor={t.accent} height={3} paddingLeft={1}>
        <input
          focused={!busy}
          value={path}
          placeholder="~/Lab/my-project"
          onInput={(v: string) => {
            setPath(v);
            setError(null);
          }}
          textColor={t.text}
          placeholderColor={t.subtle}
          backgroundColor={t.overlay}
          focusedBackgroundColor={t.overlay}
          cursorColor={t.accent}
        />
      </box>
      {candidates.length > 0 ? (
        <box flexDirection="column" flexShrink={0}>
          {candidates.slice(0, 6).map((name) => (
            <text key={name} fg={name === candidates[0] ? t.text : t.muted} wrapMode="none">{`  ${name}/`}</text>
          ))}
          {candidates.length > 6 ? <text fg={t.subtle}>{`  … ${candidates.length - 6} more`}</text> : null}
        </box>
      ) : null}
      {error ? (
        <text fg={t.error} wrapMode="word">{error}</text>
      ) : (
        <text fg={t.subtle} wrapMode="word">
          {/* With candidates on screen the dialog stays compact: one line instead of the explainer. */}
          {candidates.length ? "^N opens it and starts an agent there" : "The folder becomes a workspace on this daemon. A git repository gets its branches and worktrees."}
        </text>
      )}
    </Overlay>
  );
}
