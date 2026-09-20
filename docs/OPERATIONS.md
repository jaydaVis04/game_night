# Running Victory Club

## Start and stop

Use your desktop launcher, `victory-club` if it is on your PATH, or run the launcher in the application folder:

```sh
sh scripts/launch.sh
```

On Windows run `scripts\launch.cmd`. Keep the terminal open. Press Ctrl+C in that terminal to stop cleanly. Starting a second copy against the same data directory is blocked. A separate `runtime-lock.sqlite` file coordinates server startup and maintenance using an operating-system lock that is released automatically if a process crashes. The lock file itself stays in place; do not delete it while the app is running.

The current night survives a restart. **New night** is the deliberate action that clears attendance, the current leader, and pending join requests. Lifetime win history survives. Previously printed QR codes for an old night no longer accept new requests.

## Settings for technical users

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP and WebSocket port. |
| `HOST` | `0.0.0.0` | Listen on all IPv4 network interfaces; use `127.0.0.1` for host-only operation. |
| `VICTORY_DATA_DIR` | `data` | Data folder; relative paths resolve against the app folder. An absolute path is useful when upgrading into a new folder. |
| `VICTORY_PUBLIC_URL` | Detected LAN address and port | Full reachable URL used in QR codes, e.g. `http://192.168.1.20:3000`. |
| `VICTORY_SKIP_SHORTCUTS` | Unset | Set to `1` during automated/headless installation to skip desktop and short-command creation. |
| `VICTORY_SHORTCUT_DIR` | Your Desktop folder | Optional desktop-launcher destination during installation. |
| `VICTORY_BIN_DIR` | `~/.local/bin` | Optional short-command destination on macOS/Linux during installation. |

For example, in macOS/Linux:

```sh
VICTORY_DATA_DIR=/path/to/victory-data PORT=3001 sh scripts/launch.sh
```

In PowerShell:

```powershell
$env:VICTORY_DATA_DIR = 'D:\VictoryData'
$env:PORT = '3001'
.\scripts\launch.cmd
```

The app does not automatically read `.env` files. Set environment variables in the terminal or your own startup wrapper. Use the same `VICTORY_DATA_DIR` for launching, backup, and account recovery.

## Back up a night

Stop Victory Club with Ctrl+C, then run in the application folder:

```sh
npm run backup
```

To choose a destination:

```sh
npm run backup -- /path/to/backups
```

If Node was installed privately, use `.runtime/node/bin/node scripts/backup.js` on macOS/Linux or `.runtime\node\node.exe scripts\backup.js` on Windows. Those direct forms also accept the destination folder as their final argument.

The command reserves the data folder against server startup, uses SQLite's backup API, checks database integrity, and copies every referenced sound clip. It creates a new timestamped folder without overwriting earlier backups. A backup is marked complete only after all copies finish. A `.incomplete` folder indicates failure and must not be used for restoration. Keep the whole completed folder, including `database.sqlite`, `sounds/`, `games-config.json`, and `backup.json`. Copy it to another physical disk periodically.

## Restore a backup

1. Stop every Victory Club process. Keep your existing data folder by moving it to a clearly named safety copy, such as `data-before-restore-2026-09-20`.
2. Create a new empty `data/` folder (or the folder selected by `VICTORY_DATA_DIR`). Copy `database.sqlite` and the whole `sounds/` directory from the completed backup into it. Do not copy `runtime-lock.sqlite` or its sidecars, `database.sqlite-wal`, or `database.sqlite-shm`; the backup command intentionally excludes them.
3. If you had customized `config/games.json`, review the backed-up `games-config.json` and copy it into `config/games.json` if you want those configuration overrides restored too. Database-managed game edits are already in the backup.
4. Start Victory Club. Check the roster, leaderboard, and sound clips before deleting the safety copy.

Backups include admin accounts and sessions. To sign every host out after a restore, run the recovery command below before restarting. Restore with the same app version or a newer compatible version; keep the prior application folder if you may need to roll back an upgrade.

## Upgrade without losing history

Stop the app and make a backup. For a Git checkout, run `git pull --ff-only`, then rerun the installer. For a ZIP download, extract the new release to a different folder, copy your old `data/` folder into it while stopped (or keep using your absolute `VICTORY_DATA_DIR`), and run the new installer. Preserve any intentional `config/games.json` edits. The installer rebuilds application assets and updates shortcuts; it does not clear the database. Existing accounts, players, and history remain.

## Forgotten host password

Stop the server and open a terminal in the app folder:

```sh
npm run reset-admin
```

With a private runtime use `.runtime/node/bin/node scripts/reset-admin.js` or `.runtime\node\node.exe scripts\reset-admin.js`. Enter an existing admin username, then enter the new password twice. Password entry is hidden, including no dots. Use 10–72 UTF-8 bytes (ordinary English characters are one byte each). The command replaces that account's password hash and signs **all** hosts out. It cannot be run through the website or with passwords in shell arguments.

If no account has been created yet, launch the app and use the first-run setup code shown in the server terminal instead. Setup codes stay on that terminal and are never included in the QR code.

## Phones cannot connect

- Connect the computer and phones to the same private Wi-Fi. A guest network, hotel network, school network, or router “client isolation” setting may prevent devices from reaching each other.
- Use the **LAN address** printed by the server, including `http://` and `:3000`. `localhost` on a phone means that phone, not your computer.
- Allow Node/Victory Club through the computer's firewall on private networks. Keep the computer awake and the server terminal running.
- Disconnect a VPN if it selects the wrong network interface. If the printed address is incorrect, set `VICTORY_PUBLIC_URL` to the computer's Wi-Fi IPv4 address and actual port, then restart.
- A Wi-Fi address can change after reconnecting or rebooting. Scan the newly displayed QR code. An old night's code expires after **New night**.
- If port 3000 is occupied, use `PORT=3001` (PowerShell: `$env:PORT='3001'`) and restart. All phones must use that same port.
- If the shared screen says it is reconnecting, leave it open; it automatically reconnects and refreshes state when the server returns. Old celebrations are not replayed.

Do not expose this HTTP server using port forwarding or an internet tunnel. The intended setting is trusted local devices on a household network.

## Audio tips

Use the screen's sound button once to allow browser playback. Keep phone join pages quiet and enable audio on the shared display. Browser autoplay restrictions can still block a clip; the visual celebration remains available. Uploads are decoded in the browser, so supported source formats depend on that browser; WAV and commonly supported MP3 files are good options. Trim selections become saved WAV files, so the original upload is no longer needed.

## Verification scope

The implementation includes automated backend and browser checks. The complete macOS ARM64 shell installer was exercised in an isolated folder containing spaces: private Node.js 24.21.0 download and checksum verification, dependency installation, production build, database setup, desktop/command creation, launch, and an HTTP state response. A second offline-cache installation preserved a pre-existing player and the seven default games. All generated shortcuts, caches, and data stayed inside the temporary fixture; the real home directory was untouched.

Maintenance checks cover repeatable setup, competing processes and crash-safe locks, SQLite integrity, complete audio copying, incomplete-backup handling, and preserving unrelated launcher files. The hidden-password recovery flow was exercised in a real terminal, then its new bcrypt hash and session invalidation were checked. All six Node.js 24.21.0 archive URLs and the official checksum manifest returned HTTP 200 when checked on September 20, 2026.

Windows desktop/PowerShell behavior, Linux desktop policies, a physical phone over your router, and Raspberry Pi hardware still require their respective environments. The macOS smoke check does not certify those platforms or replace a clean-machine OS installation test.
