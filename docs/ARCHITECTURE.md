# Architecture

Victory Club is one Node.js 24 process serving a built React/Vite app, Express routes, WebSocket notifications, local audio, and locally generated QR codes. SQLite stores household history in one local database with WAL enabled. The runtime does not contact external services. Dependencies and fonts are downloaded at install time and bundled for local use.

The database keeps players, games, nights, attendance, per-win events, pending joins, admins, hashed sessions, settings, and sound metadata. Lifetime totals derive from win history; undo marks a win reversed. Archiving keeps historical references intact. A single current night resumes after restart, and an explicit new night rotates the join code and clears attendance. The leaderboard uses competition ranks for ties with deterministic display ordering.

Unauthenticated visitors can read public state and submit a join request. Only authenticated admins can manage players/games, change attendance, pick a game, log/undo wins, approve joins, change settings, or create more admins. A secret printed on the server console protects first-admin creation. Passwords use bcrypt; session cookies reference opaque tokens whose hashes live in SQLite. Mutation routes check same-origin request headers and origins, and WebSocket upgrades check origin. The application is intended for trusted local HTTP, not internet deployment.

WebSockets announce persisted changes and transient celebrations. Clients refetch authoritative state after changes or reconnecting; admin-only join details are never broadcast to public sockets. Request IDs make win logging and join retries idempotent. A celebration follows a committed win, and reconnecting does not replay earlier celebrations.

Custom audio is decoded and visualized in the browser. A chosen 0.25–10 second range is rendered to a real PCM WAV file, validated on upload, stored in the data folder, and reused directly. This avoids a platform-specific transcoder dependency. An original default victory chime is generated with Web Audio. Sound activation is per display; motion respects reduced-motion preferences.

## Startup and future Raspberry Pi use

`server/index.js` is the standalone entry point. It resolves data paths, takes a process lock, initializes the app, listens on the configured interface, and prints LAN/setup information. `scripts/launch.sh` selects the runtime and invokes that entry point without opening a GUI. A later GPIO-button script or a systemd service can call the same launcher. No physical-button integration is included.

On a future 64-bit Raspberry Pi OS installation, use a compatible Node.js 24 ARM64 distribution, install/build once, and start the normal server. Use a persistent writable data directory, a stable LAN address, and graceful process shutdown. Actual Pi power-loss behavior, GPIO wiring, button debouncing, and service setup need testing on the target hardware.

## Relevant folders

| Path | Purpose |
| --- | --- |
| `server/` | Database, HTTP/WebSocket server, authentication, and audio validation/serving. |
| `src/` | Shared display, host tools, mobile join page, themes, and audio editor. |
| `config/games.json` | Default game definitions, palettes, and motifs. |
| `scripts/` | Setup, launch, development, coordinated backup, and offline account recovery. |
| `data/` | Local database and saved sounds; not committed. |
| `test/` | Isolated automated verification. |

The full endpoint and component contracts are recorded in `IMPLEMENTATION.md`.
