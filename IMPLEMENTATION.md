# Victory Club implementation contract

The user authorized the entire build and regular local Git commits on September 20, 2026. The earlier analysis-only instruction has been superseded. Preserve the original brief as the product reference.

## Decisions

- Node 24 LTS, Express 5, built-in SQLite (`node:sqlite`), WebSockets (`ws`), React 19, Vite. Local assets and fonts; no cloud service. Small synchronous SQLite transactions are appropriate for one household; bcrypt and file operations use asynchronous APIs where practical.
- Single persistent active night resumes after restart. Start a new night explicitly to clear attendance, leader, and expire pending joins; lifetime wins survive.
- Players count = all non-archived players. Tonight count separate. Lifetime leaderboard default; competition ranks for ties, deterministic name/ID order for display, tie labels truthful.
- Guests read public state or submit a join. All mutations except first-admin setup/login/join require authenticated admin. First admin requires a secret setup code printed on the server console; secret never appears in public state. Random opaque cookie sessions in SQLite; same-origin custom request header and Origin checks.
- Exactly seven launch games; selected game initially null. Logging a win requires current game and active attendance. No sample players in the real database. One current leader; clear on win, game change, absence, new night, or disabling feature.
- Original default victory chime generated with Web Audio. Uploaded audio decoded in the browser; user trims a 0.25–10 second slice, exported to a real PCM WAV file stored on server. No FFmpeg dependency. Sound enable/mute is per display, phones stay quiet.
- Archiving preserves history; undo marks win reversed. Game definitions loaded from `config/games.json` on startup, DB edits persist until explicit config change. Extra records reuse declared motifs without rebuild.

## Design direction

Base palette: violet #6654D9, ink #211C36, paper #F5F3FB, peach #F69E71, yellow #F5CD61, mint #95CDB6. Bricolage Grotesque for bold display lettering, DM Sans for readable controls. Original vector/CSS dice, cards, chips, stars. Rounded tactile tokens and oversize numbers evoke tabletop pieces, with calm whitespace around the roster. Distinct game posters and ambient motifs carry the variety; shared controls stay predictable. Do not use a generic SaaS sidebar or repetitive metrics tiles.

Shared display: top wordmark/nav + host controls; welcoming title and tonight status; broad roster left and current-game poster/QR right; fixed white player-count bar. Leaderboard gives a centered first-place podium and full rankings. Mobile stacks content; join is a single name form plus submission status. Dialogs use native `dialog`, visible labels, focus management. Reduced motion and high contrast throughout.

## API contract (all JSON keys camelCase)

All mutations include `X-Victory-Request: 1`, JSON content type unless audio, same-origin cookies. Responses are JSON; errors `{error: string}` with appropriate status. `GET /api/state` returns:

```js
{
  players: [{id, name, totalWins, tonightWins, active, archived, createdAt, rank}],
  games: [{id, name, themeKey, tagline, motif, palette: {background,surface,text,muted,accent,accentText,secondary}, archived}],
  night: {id, code, startedAt, gameId, leaderId},
  settings: {currentlyWinning: false, soundId: 'default', celebrationSeconds: 10},
  sounds: [{id,name,duration,url}], // default represented by soundId 'default', no file
  recentWins: [{id,playerId,playerName,gameId,gameName,createdAt,reversedAt}],
  joinUrl, lanUrl, setupRequired: boolean
}
```

- `GET /api/auth/me` -> `{admin: {id,username}|null, setupRequired}`.
- `POST /api/auth/setup` body `{username,password,setupCode}` -> `{admin}` + cookie. Password 10–72 UTF-8 bytes, username 2–40 chars. `POST /api/auth/login {username,password}` -> `{admin}` + cookie. `POST /api/auth/logout` -> `{ok:true}`.
- `GET /api/admins` -> `{admins:[{id,username,createdAt}]}`; `POST /api/admins {username,password}` -> `{admin}`.
- `POST /api/players {name}` -> `{player}` (auto-attends tonight). `PATCH /api/players/:id {name?,archived?}` -> `{player}`. `POST /api/players/:id/attendance {active:boolean}` -> `{ok:true}`.
- `POST /api/night/game {gameId:string|null}` -> `{ok:true}`. `POST /api/night/new {}` -> `{ok:true}`. `POST /api/night/leader {playerId:string|null}` -> `{ok:true}`.
- `POST /api/wins {playerId,gameId,requestId}` -> `{win}`. Idempotency: reused requestId with identical operation returns original; incompatible reuse is 409. `POST /api/wins/:id/undo {}` -> `{ok:true}`; repeat undo safe.
- `GET /api/history?limit=100&offset=0` admin -> `{wins:[...recentWin], total}`.
- `PATCH /api/settings {currentlyWinning?,soundId?}` -> `{settings}`.
- `POST /api/games` admin accepts full game data, ID optional; `PATCH /api/games/:id` accepts name, tagline, themeKey, motif, palette, archived. Validate color values and motif/font enums. -> `{game}`.
- `GET /api/join/:code` public -> `{valid:true,gameName,code}`; stale code 404. `POST /api/join/:code {name,requestId}` -> `{request:{id,status,name,token}}`. `GET /api/join-status/:id?token=...` -> `{request:{id,status,name}}` only with secret request token. Phone polls this endpoint.
- `GET /api/joins` admin -> `{requests:[{id,name,status,createdAt,matches:[{id,name,totalWins,similarity}]}]}`. `POST /api/joins/:id/resolve {action:'approve'|'deny',playerId?:string,createNew?:boolean}` -> `{ok:true}`. If matches exist require explicit playerId or createNew.
- `GET /api/qr` -> QR SVG for current joinUrl.
- `POST /api/sounds` admin raw `audio/wav`, `X-Clip-Name: encodeURIComponent(name)` -> `{sound:{id,name,duration,url}}`. Root implements audio router, backend mounts it after auth/origin middleware. `DELETE /api/sounds/:id` -> `{ok:true}`; resets soundId to default if selected. `GET /media/:id.wav` public serves validated stored clips.

WebSocket `/ws` broadcasts only `{type:'changed'}` after persisted changes; clients refetch state and admin-only queue when relevant. Win insert also broadcasts `{type:'celebration', win:{id,playerId,playerName,gameId,gameName,createdAt}, soundId, duration:10}`. Undo broadcasts `{type:'undo',winId}`. No historical celebrations on reconnect. Never broadcast admin-only queue content; invalidate and refetch with credentials. Origin checked at upgrade. Heartbeat and client reconnect.

## Module ownership / interfaces

- Backend agent owns `server/` except `server/sounds.js`, and `config/games.json`, `test/backend.test.js`. Export `createApplication({dataDir, port=3000, host='0.0.0.0', publicUrl?, setupCode?})` from `server/app.js` returning `{app,server,db,broadcast,close,setupCode}`. Server is not listening until caller calls listen. `close()` async closes sockets/server/DB. db is raw DatabaseSync. `server/index.js` prints LAN address/setup code and listens. `server/db.js` exports `openDatabase(dataDir)` (raw DatabaseSync), default data path helper. Table `sounds(id TEXT PRIMARY KEY,name TEXT NOT NULL,duration REAL NOT NULL,filename TEXT NOT NULL,created_at TEXT NOT NULL)` and `settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)` where values JSON. Mount root's `createSoundRouter({db,dataDir,requireAdmin,broadcast})` exported from `server/sounds.js` on `/api/sounds`; also expose media via exported `createMediaRouter({db,dataDir})` on `/media`. Settings `soundId` JSON string. Public snapshot lists sounds with `/media/${id}.wav` urls.
- Frontend agent owns `src/` except `src/components/Soundboard.jsx`, `src/components/Celebration.jsx`, `src/audio.js`, `src/sound.css`. Main imports those components. `Soundboard({sounds,selectedSoundId,onChange,onNotice})` uses own API fetch; `onChange()` refreshes state; `onNotice(message)` shows toast. `Celebration({event,onDismiss,onUndo, soundEnabled})` uses event contract, queues in parent; onUndo(win.id). Export `enableAudio()` from audio.js to call inside button gesture.
- Root owns audio modules, integration/E2E tests, package/config and integration fixes. Root performs all Git commits; other agents do not commit.
- Packaging agent owns `scripts/`, root `install.sh`, `install.ps1`, `install.cmd`, `README.md`, `docs/`. Use `VICTORY_DATA_DIR` default `./data` resolved relative project root, `PORT`, `HOST`, `VICTORY_PUBLIC_URL`; setup CLI initializes DB and prints next steps. No running installers against user's home during development. Backup SQLite with node:sqlite backup API plus sounds. Recovery offline CLI prompts for username/password and invalidates sessions; coordinate actual DB schema with backend agent.

## Milestones / verification

Commit foundation/config, persistent core, game themes/UI, admin and joins, soundboard, packaging, and verified fixes in coherent units. Verify foundation before full integration. Node integration tests use temporary data dirs and random free ports. Browser tests use a separate temporary test data directory, real backend, Chromium desktop/mobile and reduced motion. Installer syntax and current-platform smoke test; report Windows/Linux checks honestly if no environment is available.
