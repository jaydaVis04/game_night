#!/bin/sh
# One-time setup. No sudo and no system-wide Node changes.
set -eu
VICTORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$VICTORY_ROOT"
if [ ! -f package.json ]; then
  printf '%s\n' 'Extract the complete Victory Club download before running this installer.' >&2
  exit 1
fi
if [ -x "$VICTORY_ROOT/.runtime/node/bin/node" ]; then
  PATH="$VICTORY_ROOT/.runtime/node/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != '24' ]; then
  command -v curl >/dev/null 2>&1 || { printf '%s\n' 'Please install curl, then run this installer again.' >&2; exit 1; }
  command -v tar >/dev/null 2>&1 || { printf '%s\n' 'Please install tar, then run this installer again.' >&2; exit 1; }
  case $(uname -s) in Darwin) VICTORY_OS=darwin ;; Linux) VICTORY_OS=linux ;; *) printf '%s\n' 'Use install.cmd on Windows.' >&2; exit 1 ;; esac
  case $(uname -m) in arm64|aarch64) VICTORY_ARCH=arm64 ;; x86_64|amd64) VICTORY_ARCH=x64 ;; *) printf '%s\n' 'This installer supports 64-bit Intel/AMD and ARM. Install Node.js 24 manually on this system.' >&2; exit 1 ;; esac
  VICTORY_NODE_VERSION=24.21.0
  VICTORY_ARCHIVE="node-v$VICTORY_NODE_VERSION-$VICTORY_OS-$VICTORY_ARCH.tar.gz"
  VICTORY_DOWNLOAD="https://nodejs.org/dist/v$VICTORY_NODE_VERSION"
  mkdir -p "$VICTORY_ROOT/.runtime"
  VICTORY_STAGE=$(mktemp -d "$VICTORY_ROOT/.runtime/install.XXXXXXXX")
  cleanup() {
    if [ -n "${VICTORY_STAGE:-}" ] && [ -d "$VICTORY_STAGE" ]; then
      if [ -d "$VICTORY_STAGE/previous-node" ] && [ ! -e "$VICTORY_ROOT/.runtime/node" ]; then
        mv "$VICTORY_STAGE/previous-node" "$VICTORY_ROOT/.runtime/node"
      fi
      rm -r -- "$VICTORY_STAGE"
    fi
  }
  trap 'VICTORY_EXIT_STATUS=$?; trap - EXIT; cleanup; exit "$VICTORY_EXIT_STATUS"' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  printf '%s\n' "Downloading Node.js ${VICTORY_NODE_VERSION} for ${VICTORY_OS}/${VICTORY_ARCH}..."
  curl --fail --location --proto '=https' --tlsv1.2 --retry 2 "$VICTORY_DOWNLOAD/$VICTORY_ARCHIVE" -o "$VICTORY_STAGE/$VICTORY_ARCHIVE"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 2 "$VICTORY_DOWNLOAD/SHASUMS256.txt" -o "$VICTORY_STAGE/SHASUMS256.txt"
  VICTORY_EXPECTED=$(awk -v file="$VICTORY_ARCHIVE" '$2 == file {print $1}' "$VICTORY_STAGE/SHASUMS256.txt")
  if command -v sha256sum >/dev/null 2>&1; then
    VICTORY_ACTUAL=$(sha256sum "$VICTORY_STAGE/$VICTORY_ARCHIVE" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    VICTORY_ACTUAL=$(shasum -a 256 "$VICTORY_STAGE/$VICTORY_ARCHIVE" | awk '{print $1}')
  else
    printf '%s\n' 'SHA-256 verification requires sha256sum or shasum.' >&2
    exit 1
  fi
  if [ "${#VICTORY_EXPECTED}" -ne 64 ] || [ "$VICTORY_ACTUAL" != "$VICTORY_EXPECTED" ]; then
    printf '%s\n' 'Node.js checksum verification failed. The download was not installed.' >&2
    exit 1
  fi
  tar -xzf "$VICTORY_STAGE/$VICTORY_ARCHIVE" -C "$VICTORY_STAGE"
  if [ -e "$VICTORY_ROOT/.runtime/node" ]; then
    mv "$VICTORY_ROOT/.runtime/node" "$VICTORY_STAGE/previous-node"
  fi
  mv "$VICTORY_STAGE/node-v$VICTORY_NODE_VERSION-$VICTORY_OS-$VICTORY_ARCH" "$VICTORY_ROOT/.runtime/node"
  PATH="$VICTORY_ROOT/.runtime/node/bin:$PATH"
  export PATH
fi
printf '%s\n' 'Installing Victory Club…'
if [ -f package-lock.json ]; then npm ci --no-fund --no-audit; else npm install --no-fund --no-audit; fi
npm run build
npm run setup
node scripts/install-launcher.js
printf '\n%s\n' 'Ready! Open the Victory Club desktop launcher, or run: sh scripts/launch.sh'
printf '%s\n' 'Keep this folder in place; it contains the app and your game-night data.'
