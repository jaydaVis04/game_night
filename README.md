# Victory Club

A game-night leaderboard for your favorite people. Run it on one computer, put the leaderboard on a shared screen, and let friends join from their phones over the same Wi-Fi. Players need no account. Everything stays on your computer.

Seven original game themes ship with the app: **Monopoly, Challengers, Coup, Poker, Among Us, Murder Mafia, and Clue**. Challengers means the tournament card game *Challengers!!*. No official logos or artwork are included.

## Install once

Download this repository using **Code → Download ZIP** on [GitHub](https://github.com/jaydaVis04/game_night), extract the entire folder, and move it somewhere you intend to keep it. Setup needs internet; game nights do not.

- **macOS or Linux:** open Terminal in that folder and run `sh install.sh`.
- **Windows:** double-click `install.cmd` in the extracted folder.

The installer downloads a private [Node.js 24](https://nodejs.org/en/download) runtime if needed, checks the official SHA-256 checksum, installs the app, initializes its database, and creates a **Victory Club desktop launcher**. On macOS/Linux it also creates `~/.local/bin/victory-club`; use `victory-club` if that directory is on your PATH. There is no administrator/sudo requirement. Supported installer architectures: 64-bit Intel/AMD and ARM on macOS, Linux, and Windows. Linux needs `curl`, `tar`, and either `sha256sum` or `shasum`; Node's official binaries require a supported glibc-based distribution.

Next time, open the desktop launcher. Leave its terminal window open while playing. The terminal prints an address for the host and a **LAN address for phones**. Open the host address in your browser. On first launch, enter the setup code printed in that terminal to create your host account. Stop the server with **Ctrl+C** when everyone is done.

If desktop shortcuts are unavailable, start from the app folder with `sh scripts/launch.sh` (macOS/Linux) or `scripts\launch.cmd` (Windows). If you move the app folder, rerun the installer to refresh the shortcut. On Linux, your desktop may first ask you to allow launching the shortcut.

## Your first game night

1. Sign in as a host. Add players by name, or show the QR code so friends can request to join.
2. Approve each phone request. If a name resembles an existing player, choose that person or explicitly create someone new.
3. Select who is playing tonight and pick a game. The room changes to match.
4. Record the winner after a round. A ten-second celebration plays on connected displays; turn on sound on the shared screen with its sound button. Undo is available for mistakes.
5. Open the leaderboard any time. Wins are lifetime totals, with ties clearly labeled. **Players: N** counts the full unarchived roster; tonight's attendance is shown separately.

Host settings let you manage players and games, review win history, create more host accounts, upload and trim reusable victory sounds, or turn on the optional one-tap **currently winning** marker. That marker starts off. A new night clears attendance and the join queue while keeping players and win history. Restarting the app resumes the current night.

## Manual setup for developers

Install Node.js 24 and Git, then:

```sh
git clone https://github.com/jaydaVis04/game_night.git
cd game_night
npm ci
npm run build
npm run setup
npm start
```

The production server serves the built app and API together on port 3000. For development, `npm run dev` starts the API and Vite; open `http://localhost:5173`. Use the built production app for phones and a real game night. No hosted database, cloud account, Docker, or FFmpeg is needed.

```sh
npm test                # Persistence, API behavior, security, and audio validation
npm run build          # Production assets
npx playwright install chromium
npm run test:e2e        # Browser checks; uses a separate test database
```

## Data and maintenance

Data lives in `data/` beside the app: `database.sqlite`, saved `sounds/`, and a runtime lock. Do not remove that directory during upgrades. Stop the server and run `npm run backup` to create a complete, checked backup; put a copy on another drive. Backups contain admin password hashes and should be kept private. If the installer supplied Node, first add `.runtime/node/bin` to your shell's PATH (Windows: `.runtime\node`) or use that runtime's `node` with the scripts directly.

- [Operations guide](docs/OPERATIONS.md): backups, restore, upgrades, forgotten passwords, environment settings, and Wi-Fi troubleshooting.
- [Game configuration](docs/GAMES.md): add a game without rebuilding, theme fields, and original visual motifs.
- [Architecture](docs/ARCHITECTURE.md): data, permissions, live updates, audio, and future Raspberry Pi startup.

This app uses ordinary HTTP on a trusted home network. Keep it off the public internet; do not configure router port forwarding. Admin passwords and cookies are not encrypted in transit. Use a private Wi-Fi network whose devices you trust. All scripts, fonts, sound files, QR generation, and effects are served locally during play.

## Project notes

The [original brief](GAME_NIGHT_BUILD_BRIEF.md) records the requested product. [Implementation decisions](IMPLEMENTATION.md) record the agreed architecture and API contract. Installer code is supplied for macOS/Linux and Windows; see [verification notes](docs/OPERATIONS.md#verification-scope) for what has actually been exercised in this development environment.
