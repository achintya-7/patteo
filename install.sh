#!/bin/sh
# patteo installer for macOS and Linux (Windows: install.ps1). Run with --help for usage.
#
#   curl -fsSL https://raw.githubusercontent.com/achintya-7/patteo/main/install.sh | sh

set -eu

REPO="achintya-7/patteo"
BASE_URL="${PATTEO_BASE_URL:-https://github.com/$REPO/releases}"
VERSION="${PATTEO_VERSION:-latest}"
INSTALL_DIR="${PATTEO_INSTALL_DIR:-}"
UNINSTALL=0

say() { printf '%s\n' "$*"; }
err() { printf 'patteo install: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
patteo installer (macOS and Linux; on Windows it runs install.ps1)

  curl -fsSL https://raw.githubusercontent.com/achintya-7/patteo/main/install.sh | sh
  curl -fsSL https://raw.githubusercontent.com/achintya-7/patteo/main/install.sh | sh -s -- --version 0.1.0

Options (or the matching environment variables):
  -v, --version <x.y.z>   install a specific version   (PATTEO_VERSION, default: latest)
  -d, --dir <path>        install directory            (PATTEO_INSTALL_DIR, default: ~/.local/bin)
      --uninstall         remove the installed binary
  -h, --help              this text

The download is checked against the release's checksums.txt before anything is installed.
PATTEO_BASE_URL overrides where releases are downloaded from (mirrors, testing).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    -v|--version) [ $# -ge 2 ] || err "$1 needs a value"; VERSION="$2"; shift 2 ;;
    -d|--dir) [ $# -ge 2 ] || err "$1 needs a value"; INSTALL_DIR="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "unknown option: $1 (try --help)" ;;
  esac
done

# ── platform ─────────────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  MINGW*|MSYS*|CYGWIN*) OS=windows ;;
  *) err "unsupported operating system: $(uname -s)" ;;
esac

# Windows has its own installer; hand over rather than half-support Git Bash.
if [ "$OS" = windows ]; then
  command -v powershell >/dev/null 2>&1 || err "PowerShell not found; run install.ps1 from a PowerShell window"
  say "Windows detected: running the PowerShell installer"
  PS_URL="${PATTEO_PS_URL:-https://raw.githubusercontent.com/$REPO/main/install.ps1}"
  exec powershell -NoProfile -ExecutionPolicy Bypass -Command \
    "\$env:PATTEO_VERSION='$VERSION'; \$env:PATTEO_INSTALL_DIR='$INSTALL_DIR'; \$env:PATTEO_UNINSTALL='$UNINSTALL'; irm '$PS_URL' | iex"
fi

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) err "unsupported CPU architecture: $(uname -m)" ;;
esac

# An x64 shell on Apple Silicon (Rosetta) should still get the native build.
if [ "$OS" = darwin ] && [ "$ARCH" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
  ARCH=arm64
fi

# The Linux build links glibc; Alpine and other musl systems can use the Docker image instead.
if [ "$OS" = linux ] && (ldd --version 2>&1 || true) | grep -qi musl; then
  err "this Linux uses musl libc, which the release binary doesn't support; use the Docker image (see the README)"
fi

# ── destination ──────────────────────────────────────────────────────────────
[ -n "$INSTALL_DIR" ] || INSTALL_DIR="${HOME:?HOME is not set}/.local/bin"
TARGET="$INSTALL_DIR/patteo"

if [ "$UNINSTALL" = 1 ]; then
  if [ -e "$TARGET" ]; then rm -f "$TARGET" && say "Removed $TARGET"; else say "Nothing to remove at $TARGET"; fi
  say "Settings stay in ~/.config/patteo; delete that folder to remove them too."
  exit 0
fi

# ── download ─────────────────────────────────────────────────────────────────
ASSET="patteo-$OS-$ARCH.tar.gz"
if [ "$VERSION" = latest ]; then
  URL_BASE="$BASE_URL/latest/download"
else
  URL_BASE="$BASE_URL/download/v${VERSION#v}"
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  err "need curl or wget to download the release"
fi

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else err "need sha256sum or shasum to verify the download"
  fi
}

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t patteo)"
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Installing patteo ($VERSION) for $OS-$ARCH"
fetch "$URL_BASE/$ASSET" "$TMP/$ASSET" || err "download failed: $URL_BASE/$ASSET (is there a release for $OS-$ARCH?)"
fetch "$URL_BASE/checksums.txt" "$TMP/checksums.txt" || err "download failed: $URL_BASE/checksums.txt"

WANT="$(awk -v f="$ASSET" '$2 == f || $2 == "*" f { print $1 }' "$TMP/checksums.txt")"
[ -n "$WANT" ] || err "$ASSET is not listed in checksums.txt"
GOT="$(sha256_of "$TMP/$ASSET")"
[ "$WANT" = "$GOT" ] || err "checksum mismatch for $ASSET (expected $WANT, got $GOT); nothing was installed"

tar -xzf "$TMP/$ASSET" -C "$TMP" patteo || err "could not unpack $ASSET"
chmod +x "$TMP/patteo"

# ── install ──────────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR" 2>/dev/null || true
[ -w "$INSTALL_DIR" ] || err "$INSTALL_DIR is not writable; pass --dir <path> or fix its permissions"
# Move into place atomically so an upgrade never leaves a half-written binary.
cp "$TMP/patteo" "$TARGET.new" && mv -f "$TARGET.new" "$TARGET"

INSTALLED="$("$TARGET" --version 2>/dev/null || true)"
[ -n "$INSTALLED" ] || err "installed $TARGET but it does not run on this machine"
say "Installed $INSTALLED to $TARGET"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    say ""
    say "$INSTALL_DIR is not on your PATH. Add it:"
    case "${SHELL:-}" in
      */fish) say "  fish_add_path $INSTALL_DIR" ;;
      */zsh)  say "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc && exec zsh" ;;
      *)      say "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc && . ~/.bashrc" ;;
    esac
    ;;
esac
say ""
say "Run: patteo   (it connects to your local Paseo daemon automatically)"
