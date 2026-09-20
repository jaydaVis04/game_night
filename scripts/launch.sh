#!/bin/sh
set -eu
VICTORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -x "$VICTORY_ROOT/.runtime/node/bin/node" ]; then
  PATH="$VICTORY_ROOT/.runtime/node/bin:$PATH"
  export PATH
fi
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != '24' ]; then
  printf '%s\n' 'Victory Club needs Node.js 24. Run the installer once: sh install.sh' >&2
  exit 1
fi
if [ ! -f "$VICTORY_ROOT/dist/index.html" ]; then
  printf '%s\n' 'The app has not been built. Run the installer once: sh install.sh' >&2
  exit 1
fi
cd "$VICTORY_ROOT"
exec node server/index.js "$@"
