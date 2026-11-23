# patteo

A fast, keyboard-first terminal client for [Paseo](https://paseo.sh), built with Bun, [OpenTUI](https://opentui.com) (React) and `@getpaseo/client`.

## Install

**macOS and Linux** (x64 and arm64):

```bash
curl -fsSL https://raw.githubusercontent.com/achintya-7/patteo/main/install.sh | sh
```

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/achintya-7/patteo/main/install.ps1 | iex
```

**Homebrew** (macOS and Linux):

```bash
brew tap achintya-7/patteo https://github.com/achintya-7/patteo
brew install patteo
```

**Docker**:

```bash
# Linux: share the host network so the container reaches the daemon on 127.0.0.1:6767
docker run -it --rm --network host -v patteo-config:/home/patteo/.config/patteo ghcr.io/achintya-7/patteo
# Docker Desktop (macOS / Windows)
docker run -it --rm -v patteo-config:/home/patteo/.config/patteo ghcr.io/achintya-7/patteo --host host.docker.internal:6767
```

The Paseo daemon refuses host names it doesn't know (`Invalid Host header`), so for the Docker Desktop form start the
daemon with `PASEO_ALLOWED_HOSTS=host.docker.internal`. `docker build -t patteo .` builds the image yourself;
`docker build --target test .` runs the typecheck and tests on Linux.

The installers download the release for your platform, verify it against `checksums.txt`, and put `patteo` in
`~/.local/bin` (macOS/Linux) or `%LOCALAPPDATA%\patteo\bin` (Windows, added to your PATH). Options:
`--version 0.1.0`, `--dir <path>`, `--uninstall` (`-Version`, `-InstallDir`, `-Uninstall` in PowerShell). Run the same
command again to upgrade. The Linux binary needs glibc; on Alpine use the Docker image.

Then run `patteo` with Paseo Desktop (or `paseo daemon`) running; it finds the local daemon on its own.

**From source** (Bun 1.4+):

```bash
bun install
bun run dev                    # connect to the local daemon (~/.paseo)
bun run dev --host box:6767    # also connect to another daemon
bun run dev --theme gruvbox-dark
bun run dev --opaque           # paint the theme background (default keeps your terminal's own)
bun run build                  # single binary: dist/patteo
bun run package                # every platform's archive + checksums.txt in dist/release
```

## What it does

- **Workspaces sidebar**: projects ▸ workspaces with live status, branch, agent count and pending permissions.
- **Agent tabs per workspace**, remembered across restarts.
- **Live conversation**: your messages, the agent's markdown answers (code blocks, tables, mermaid diagrams), and its activity (thoughts, tool calls, todos) collapsed into one-line summaries once a turn ends.
- **Files / Changes / PR panel** (`C`, on the right like Desktop; left via Settings):
  - **Files**: the workspace's directory tree from the daemon (folders first, lazy, dotfiles toggle `.`), git markers on changed files and their folders; `⏎` opens a file in the main pane.
  - **Changes**: what the PR contains (branch vs base) by default, `m` switches to uncommitted or all; `⏎` opens a file's diff: added/removed rows are tinted, code is syntax-coloured from the daemon's tokens (keywords, strings, functions, types…), with line numbers.
  - **PR**: number, state, title, checks (failures first), review and merge status, URL; `o` opens it in your browser, `⏎` creates one when there is none.
- **Composer**: grows as you type (wrapped lines count) up to half the window, then scrolls; `⏎` sends, `⌥⏎` or `^J` adds a line (a terminal sends the same CR for shift+Enter, so it cannot be told apart from Enter). Send, steer a running agent, stop a turn, switch mode or model, and slash commands (`/fork`, `/stop`, `/new`, `/model`, `/mode`, `/settings`) with suggestions while you type.
- **Agent questions**: when an agent asks you something (Claude's AskUserQuestion and friends) a line above the composer says so (`? asks …`), a toast and the status bar (`? 1 asking · p`) flag it, and `p` opens a form: pick options (`1-9`, `⏎`, `␣` for multi-select), type your own answer (`o`), step through several questions, `d` to dismiss.
- **New agent** (provider / model / mode / first message), **archive agent**, **permission requests** (allow / deny / provider actions).
- **Add folder** (`A`): opens a directory as a workspace on the active daemon, with shell-style `Tab` completion (the daemon lists the directories, so it works for remote hosts), and `^G` to create the folder if it doesn't exist.
- **Hosts**: add (`host:port` or `ws://…`), switch, rename (`e`), reconnect (`r`), remove (`d`); each row shows version, hostname and the last connection error. SSH tunnels and pairing links are not supported (they need Desktop's transport).
- **Command palette**, **help**, **settings** with 15 built-in themes (Catppuccin, Gruvbox, GitHub, Tokyo Night, Nord, Dracula, One Dark, Rosé Pine, Solarized, Kanagawa) plus custom themes.
- **Transparent background** by default, animated loading states (respecting "reduce motion").

## Keys

| Key | Action |
| --- | --- |
| `^K` / `^P` | Command palette |
| `?` | All shortcuts |
| `,` | Settings |
| `Tab` | Switch pane · `^B` toggle sidebar |
| `n` / `^O` | New agent |
| `i` / `⏎` | Write a message (from the conversation) · `Esc` back to the conversation |
| `^X` / `Esc` | Stop the running turn (Esc in the conversation) |
| `⇧Tab` | Next mode · `M` change model |
| `p` | Review permission requests |
| `C` | Files / Changes / PR panel · `[ ]` or `1 2 3` tabs · `P` jumps to the PR tab |
| `A` | Add folder · `^G` creates it if missing |
| `H` | Hosts: switch · `a` add · `e` rename · `r` reconnect · `d` remove |
| `T` | Change theme |
| `e` / `r` | Expand activity / show thoughts |
| `/fork` | Fork the conversation into a new tab |
| `q` | Quit (never while typing) |

## Configuration

`~/.config/patteo/`:

- `config.json`: settings (also editable in the app with `,`). Remap keys with
  `"keymap": { "palette.open": ["ctrl+space"] }`; the command ids are listed under Settings → Keyboard.
- `themes/<name>.json`: custom themes, any subset of tokens over a base theme:
  `{ "extends": "nord", "accent": "#ff79c6" }`.
- `hosts.json`, `state.json`: hosts and UI state (tabs, selection).

Debug logs: `PATTEO_DEBUG=1 bun run dev`, then read `~/.config/patteo/patteo.log`.

## Releasing

Releases happen on their own: every push to `main` runs the **Release** workflow, which reads the commits since the
last `vX.Y.Z` tag and decides.

| Commits since the last release | Result |
|---|---|
| only docs, tests, CI or tooling | no release |
| a change to `src/`, `patches/`, dependencies | **patch** (`0.1.0` → `0.1.1`) |
| `feat:` / `feat(scope):` (or `[minor]`) | **minor** (`0.1.0` → `0.2.0`) |
| `feat!:`, `BREAKING CHANGE`, or `[major]` | **major** (`0.1.0` → `1.0.0`) |
| `[skip release]` in the message | that commit doesn't count |

The strongest commit wins. A release is the exact commit that was built and tested: it builds all platforms, runs
each binary on its own OS, publishes the GitHub release (the tag points at that commit), updates `Formula/patteo.rb`
and `package.json` on `main`, pushes the Docker image to ghcr.io, and installs the published release on Linux, macOS
and Windows. The version comes from the tags, so there is nothing to bump by hand.

To release by hand (force a bump, or preview), use **Actions → Release → Run workflow**: pick `patch`, `minor` or
`major`, or tick *dry run* to see the plan without publishing. Locally, `bun scripts/version.ts plan` prints what the
next push would do.

## Development

```bash
bun test                    # unit + render tests
bun run typecheck
bun run check:runtime       # headless smoke test against the local daemon
bun run check:stress        # drives the real UI: resizes, dialogs, composer, all themes
bun run check:e2e           # creates a throwaway agent (cheap model), talks to it, archives it
bun scripts/frames.tsx 120 30   # print screen captures (KEYS="j,return,wait" to drive it)
```

`patches/`: one Bun patch for `@opentui/core` 0.9.7. Its markdown renderer
reads a list item that a streaming update hasn't shown yet (`updateList` →
`shown.ordinal`), which crashed the agent view mid-reply. The patch guards those
lookups; `patches/@opentui%2Fcore@0.9.7.patch` is applied by `bun install`
(`patchedDependencies`). Drop it once upstream fixes the bug.

Some modules follow the structure of the Paseo app (Apache-2.0, © Mohamed Boudra).
