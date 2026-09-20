# Build verification

Verified locally on September 20, 2026 using macOS ARM64, Node.js 24.21.0, and installed Chrome 153.

## Automated checks

- `npm test`: **23 passing tests** covering database persistence, per-game wins, truthful tied ranks, idempotency, concurrent joins, undo, archive behavior, account permissions, session expiry, hostile origins/hosts, abuse limits, live events, graceful shutdown, WAV validation, saved audio, backup integrity, crash-safe locks, and launcher preservation.
- `npm run test:e2e`: **5 passing browser workflows**, using isolated databases and real HTTP/WebSocket servers. Includes first-host setup, roster/game/win/undo/podium, mobile join and explicit identity matching, audio upload/trim/preview/save/reuse (including fractional short clips), extra admins, theme edits, a live second display and automatic ten-second celebration dismissal, seven themes, reduced motion, no horizontal overflow, and external requests blocked.
- `npm run build`: production bundle succeeds. Fonts, styles, scripts, QR generation, and the default chime are local.
- Dependency audit: no known vulnerabilities reported by `npm install` at verification time.

## Visual review

Reviewed rendered desktop roster, dark-theme podium, phone-width roster, and first-host setup. The fixed player bar remains white with black text. Theme text palettes are validated for contrast. Original vector/CSS motifs and theme-specific typography/shapes provide the visual changes. Browser screenshots are generated under `test-results/` and excluded from Git.

## Packaging

A complete macOS ARM64 installation passed from an isolated folder whose path contained spaces. It downloaded the private Node runtime, checked its official checksum, installed dependencies, built the app, initialized SQLite, and created both desktop and command launchers in temporary test directories. The launcher served an empty roster and exactly seven games. Reinstalling preserved a seeded test player and refreshed launchers. Password recovery was exercised in a real terminal, then the replacement hash and session revocation were checked.

Tests used temporary data. The production app begins with no players and no host account.

## Not exercised here

Windows and Linux installer execution, Raspberry Pi hardware, a physical phone on the household router, and physical speaker output require those environments. Cross-platform core checks and Linux browser checks are configured in `.github/workflows/check.yml`; they have not been run on a remote CI service during this build. The app remains intended for trusted LAN HTTP operation, as described in the [operations guide](OPERATIONS.md).
