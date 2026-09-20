# Game Night Leaderboard — Build Brief

Current status: the user authorized the complete implementation and regular Git commits on September 20, 2026. The original analysis-only instruction below is retained as conversation history and has been superseded. See IMPLEMENTATION.md for the build decisions and README.md for operation.

This document preserves the user's build brief for future work. The analysis notes after the brief are provisional considerations, not changes to the requirements or approved implementation decisions.

## Original build brief

Working title — rename freely ("Game Night Champions," "Victory Board," etc.). Hand this whole document to an AI coding assistant (e.g. Claude Code) or a developer to build the app end to end.

### Summary

Build a web-based, self-hosted leaderboard app for tracking wins at recurring game nights. A host launches a local server — from a laptop today, from a Raspberry Pi in the future — and everyone on the same Wi-Fi connects to it in a browser: some on a shared screen, some on their own phones after joining by QR code. It should feel like a polished party product, not a spreadsheet — vibrant, gently animated, fully re-themed for whichever game is on, and effortless for people who aren't techy.

Build it in phases (below). Get Phase 1 solid before layering on the rest.

### 1. Core Flow

1. Host starts the server; everyone connects over the same network in a browser.
2. Home screen: full player roster with total wins, who's playing tonight, an "Add Player" button, a "Pick a Game" button, a "Join with QR code" prompt, and a persistent bottom bar — white card, black text — reading Players: N.
3. Host picks a game from the base 7 → the whole screen re-themes to match.
4. During play the host logs wins. Optionally (off by default) they enable a "currently winning" indicator and tap to update it live.
5. Logging a win triggers a celebration: a short animation plus sound.
6. Leaderboard: top 3 shown podium-style, full rankings below, reachable any time.
7. Admin functions — managing players/games, settings — sit behind a login.

### 2. Feature Requirements

#### 2.1 Leaderboard & Database

- Persistent local database (e.g. SQLite) storing players (name, total wins, date added), games, and a per-win log (player, game, timestamp) — so future views can break wins down by game, not just show totals.
- Leaderboard: top 3 in a podium layout (1st centered/largest; gold/silver/bronze accents work well), full ranked list underneath.
- Adding a player is a one-field form (name only) — no account needed to be a player, only to be an admin.
- The Players: N counter (white card, black text) stays visible on the main shared-screen views.

#### 2.2 Games & Theming

Ship exactly these 7 at launch: Monopoly, Challengers, Coup, Poker, Among Us, Mafia (shown as "Murder Mafia"), Clue.

Model games as data, not hardcoded screens (name, theme key, palette, assets), so adding game #8 later is a config change, not a rebuild.

Picking a game re-skins the whole active screen: colors, background, type, iconography, a touch of ambient motion. Suggested directions (refine freely):

- Monopoly — board-game green/red/cream; a subtle dice or token animation.
- Challengers — energetic tournament colors (electric blue/orange); scoreboard-style motion.
- Coup — Renaissance intrigue: deep purple and gold; card-flip flourishes.
- Poker — green felt, black and gold; drifting chips or suit icons.
- Among Us — space pastels with a hint of suspicion-red; a tiny floating-crewmate or starfield drift.
- Murder Mafia — noir: deep red and near-black, a single slow-moving spotlight.
- Clue — mystery-mansion purple/burgundy with brass accents; flickering candlelight or a slow magnifying-glass pan.

Use original colors and motifs inspired by each game's vibe rather than reproducing official logos or artwork.

Keep motion ambient and subtle — never flashing, cluttered, or noisy. Every theme must keep strong text/background contrast; this is a "read it from across the room" app.

#### 2.3 QR Join Flow (Jackbox-style)

- Host screen shows a QR code (plus a short link/code as backup) for the current session.
- Scanning opens a tiny mobile page: a name field and a "Join" button, nothing else.
- Submissions land in a pending queue the host sees live; the host taps to approve or deny each one.
- Approved players are added to the database (or matched to an existing record) and to tonight's active list.
- Be smart about it: if a submitted name closely matches an existing player, ask the host to confirm a match instead of silently creating a duplicate.

#### 2.4 Admin Accounts & Settings

- Username/password login; support creating multiple accounts, not one fixed admin.
- Hash passwords (e.g. bcrypt) — never store them in plain text.
- Admin dashboard: manage players and games, review win history, and a Settings page covering theme configuration, soundboard management, and the currently-winning toggle (below).

#### 2.5 Winner Celebration & Custom Soundboard

- A logged win triggers a full-screen celebration (confetti/spotlight/theme-appropriate effect) plus sound, running about 10 seconds.
- Let the host upload their own audio file as a win sound.
- Include a trim editor — waveform with draggable start/end handles, like Instagram's audio trim — so they can choose which ~10-second slice plays.
- Save trimmed clips so they're reusable without re-trimming each time.

#### 2.6 "Currently Winning" Indicator (optional, off by default)

- A settings toggle, off by default. Once on, it adds a control for the host to mark who's currently leading, mid-game.
- Since the host has to keep this updated by hand, the interaction must be one tap — e.g. tapping a player's card — never a multi-step form.

### 3. Design & Non-Functional Requirements

- Built for non-technical people: every action — add a player, pick a game, approve a join, log a win, change a setting — should need no explanation. Big touch targets, plain language, easy to undo.
- Distinctive, not generic: real per-theme color and motion design, not a palette swap on one template.
- Two screen contexts, designed differently: the shared host display (laptop/TV, read from across a room — bold, high-contrast) and the phone join flow (small, thumb-friendly, minimal typing).
- Fully web-based, hosted locally — no external services required.
- Comfortable on a home Wi-Fi network with several phones connected alongside the host screen at once.

### 4. Suggested Technical Approach

Adjust freely, but optimize for minimal setup and nothing that needs external accounts or paid services.

- Backend: a lightweight server (Node/Express or Python/Flask) with WebSockets so the leaderboard, join queue, and currently-winning indicator update live everywhere without a refresh.
- Database: SQLite — one local file, no separate DB server, easy to back up.
- QR codes: any standard QR-generation library, tied to a session join link.
- Auth: hashed passwords, simple sessions.
- Audio: browser `<audio>` for playback; a small waveform component for the upload/trim flow.

### 5. Installation & Deployment

- Provide a one-step installer (shell script for macOS/Linux, batch/PowerShell for Windows) that installs dependencies, sets up the database, and — importantly — adds a desktop shortcut or a command-line alias/symlink, so future launches are one click or one short command, not a repeat of setup.
- Keep a documented "clone from GitHub and run manually" path for technical users, but the installer above should be the expected route for everyone else.
- On startup, display the LAN address plainly (e.g. `http://192.168.x.x:3000`) so phones know where to go.
- Future, not part of this build: a Raspberry Pi variant where a physical button triggers server startup, and other devices join the same way over the network. Structure the startup logic so it could later be called from a script fired by a GPIO button press. Default to a normal web server on a laptop/desktop for now.

### 6. Suggested Build Phases

1. Foundation — database schema; home screen (roster, add player, Players: N card); full leaderboard with top-3 podium. No theming or admin yet.
2. Games & Theming — "Pick a Game" screen for all 7 base games; the config-driven re-theming engine.
3. Admin & Settings — accounts/login, admin dashboard, settings page, currently-winning toggle and its one-tap control.
4. QR Join Flow — QR/link generation, mobile join page, host approval queue, smart duplicate handling.
5. Winner Effects & Soundboard — celebration animation, default sounds, custom upload + trim editor.
6. Packaging & Deployment — installer with shortcut/symlink, LAN address display, documented GitHub path, Raspberry-Pi-ready startup hook.

### Notes & Assumptions

- "Challengers" is assumed to mean the tournament card game Challengers!! — flag it if something else was meant.
- Wins are logged per game (not just totaled) so future filtering/stats are possible without a rework.
- No limit assumed on the number of players or admin accounts.

### Out of Scope (for now)

- Remote/cloud hosting — LAN-only.
- Native mobile apps — browser only.
- Multiple independent leaderboards for different groups — one shared household database.
- Building the actual Raspberry Pi button integration — just leave room for it.

### Current user instruction

"put it as a .md to remember if needed for memory retention. please dont do anything yet, just perform a deep analysis on it. respond with yes when completed"

## Analysis notes for future implementation

These notes analyze the supplied requirements. No stack, package, interface design, or unresolved product choice below has been approved or implemented. Current platform and library behavior should be verified when implementation begins.

### Product boundaries and state

The app has three distinct experiences: a shared display readable across a room, authenticated host/admin controls, and a minimal phone join page. A player record is a household identity, not a login account. Admin accounts operate the app and need not correspond to players. A shared screen may also be the authenticated host screen, but a public spectator must not inherit its privileges.

Persistent household history and tonight's attendance are separate concepts. An explicit game-night/session record is needed to connect the selected game, active players, join requests, join code, and optional current leader. Ending a night should clear or close temporary session state without deleting players or wins. Starting a new night, resuming after restart, and crossing midnight need deliberate behavior; none is specified yet.

Only one household leaderboard is in scope. A current session does not imply support for concurrent tables or multiple independent game nights. Those would add product scope. The brief also does not require game rules, scoring engines, remote play, player passwords, or a native app.

### Data integrity and reversibility

A provisional model includes players, games, game nights, attendance, win events, join requests, admin accounts, authentication sessions, settings, audio sources, and saved clips. Stable IDs should connect these records; display names are editable labels. Database migrations should preserve history as later phases add tables and fields.

Each committed win needs a player, game, and server timestamp. A session reference would support tonight-specific views later. The win log should be the source of truth for total wins. If totals are also stored on player rows to follow the brief literally or improve performance, update them in the same transaction and make them reconcilable from the log. A manually editable total without corresponding win history would undermine the requested future per-game statistics.

Undo should reverse the selected win consistently across totals, history, and all connected screens. Preserving a reversal marker or correction record is preferable to losing the history of the action. Referenced players and games need an archive/deactivation policy so management actions cannot break old wins. Database and audio assets should have an explicit backup/restore story; backing up only SQLite would omit uploaded clips.

Repeated taps, request retries, simultaneous admins, and reconnects must not accidentally record the same action twice. Server-side validation, transaction boundaries, and operation identifiers should cover both logging wins and approving joins. A win must be committed before its celebration is broadcast.

### Phase dependencies

Phase 1 should establish the durable schema, roster, counting semantics, rankings, and empty states before adding themed presentation. Its schema should already accommodate games and per-game win events. There is a sequencing gap: Phase 1 requires meaningful win totals, while the game picker arrives in Phase 2. Before implementing win entry, choose whether Phase 1 has a minimal game selector or whether real win logging begins in Phase 2. Do not create production wins with an invented eighth game or silently omit the game association.

Server-authoritative state and a synchronization boundary are useful foundations even if some real-time screens arrive later. Phase 3 must secure existing mutation endpoints as well as new admin pages. Phase 4 depends on session lifecycle, identity matching, and host authorization. Phase 5 consumes committed win events and adds audio assets. Packaging is last, but portable data paths, migration commands, and a callable server entry point need to be considered from the beginning.

The intentionally unauthenticated Phase 1 is an intermediate development milestone. Its missing access controls must not be mistaken for the final access model.

### Authorization and local operation

The brief protects admin functions but leaves the exact boundary for adding players, selecting games, logging wins, and approving joins unstated. A reasonable provisional model is public reading and join submission, with host/admin authentication for authoritative changes. The one-field add-player form still does not require a player account under that model.

First-admin setup needs a local bootstrap mechanism that cannot be claimed by an arbitrary phone. Subsequent admin creation should have a defined authenticated flow. Password hashing, login throttling, logout/session expiry, server-side authorization, and protection against cross-site requests and unauthorized socket connections belong in the admin phase. Uploaded audio and theme configuration require size/type/content validation; configuration should be data rather than executable browser code.

LAN-only deployment still requires an intentional network boundary. Listening on a network interface enables phones to connect, but the app should not assume every reachable client is an administrator. Any choice between simple LAN HTTP and more complex HTTPS setup needs an explicit threat model and compatible session-cookie settings. Do not expose admin credentials or privileged tokens in QR codes.

Offline runtime requires locally served fonts, icons, scripts, styles, QR generation, and default sounds. Installation may download dependencies; that is a separate question from requiring an external service during a game night. Verify runtime with internet access disabled.

### Joining and identity

A join request should progress through explicit pending, approved, denied, or expired states. The phone needs clear feedback after submission even though its initial screen contains only the name field and Join button. The host should see possible existing-player matches and be able to choose one or create a new record. Approval and attendance creation should be atomic, and a repeated approval must not duplicate a player or attendance entry.

Normalize names for comparison while preserving their display spelling. Exact, case-insensitive, and fuzzy matches can suggest candidates, but a similar name is not proof of identity. Two real people may share a name. Do not silently merge records or overwrite an existing player's name based on a join submission. Determine how to distinguish matching names without expanding the phone form beyond the requested single field.

The QR code must use an address reachable from phones, not localhost. A short code alone needs a known local entry page or base address; it cannot provide internet-style discovery without additional infrastructure. Session expiry/rotation, selecting among multiple network interfaces, and a manual host-address override should be considered. Guest-Wi-Fi isolation, firewall denial, and a changed LAN address need understandable troubleshooting guidance.

### Synchronization and celebrations

The server should own wins, attendance, the selected game, the pending queue, and the optional leader. Clients need an initial snapshot and a way to recover after missing updates. Event identifiers or state revisions can prevent duplicate application. A page reload should restore current state without replaying old celebrations.

Celebrations are temporary presentation events, not durable evidence of a win. Define what happens when another win is logged during the approximately ten-second effect, when a win is undone during playback, or when a screen reconnects halfway through. The animation must not prevent an urgent correction. Phone join clients do not need the full host-display celebration payload or admin data.

Browser audio activation and background playback behavior need validation on target devices. Provide an understandable sound-enable interaction when required, and retain visual feedback if playback fails. A sensible default is sound on the host/shared display, avoiding several phones playing the same clip out of sync; the brief does not yet specify this policy.

### Themes, accessibility, and interaction

Seven launch games means seven data records, with Murder Mafia as the visible Mafia name. Separate stable game identity from editable titles and theme definitions. Runtime-loaded theme data can support another game without a rebuild, provided palettes, local assets, typography, and ambient motifs use a sufficiently expressive declarative format. A completely new animation primitive may still require code; avoid promising unlimited custom behavior through palette fields alone.

Distinct themes need more than changing accent colors, while shared controls must remain immediately recognizable. Keep the player-count card white with black text across every theme. Test readability on a television, long player names, a long roster, and small phones. Ambient effects and celebrations need reduced-motion behavior, keyboard access, visible focus, and semantic controls. Suggested candle flicker should be interpreted in a way that respects the explicit no-flashing requirement.

The optional leader indicator is separate from a recorded win. Its one-tap action needs to be visually distinct from win logging to avoid accidental wins. Its setting defaults off. Clearing the leader when the game changes, the night ends, or a leader leaves requires defined behavior. Multiple simultaneous leaders are not specified.

### Audio scope

The editor needs a waveform, start/end handles, playback preview, visible selected duration, usable touch targets, and a keyboard-accessible alternative. Preserve saved trim choices across restarts. Decide whether a saved clip is a separately rendered file or a source plus persisted time offsets; the latter satisfies reuse only if timing and playback are reliable, but may not match the intended meaning of a saved trimmed clip.

File formats, decoding, duration limits, clip length tolerance, unsupported files, and storage limits need a deliberate policy. Pre-rendering clips may introduce a transcoding dependency that must work in the one-step installers and on future ARM hardware. Short uploads should not fail merely because they are under ten seconds. Default sounds must be locally bundled and original or appropriately licensed.

### Packaging and operational acceptance

The normal launch path should invoke the server directly without repeating installation. Installers should be rerunnable, handle spaces in paths, preserve data during upgrades, and create an appropriate shortcut or command on each supported desktop platform. Keep application data outside replaceable build output. Startup should apply safe migrations and print the selected LAN URL clearly.

A reusable startup entry point should work without a GUI so a future GPIO wrapper can call it. Raspberry Pi hardware integration is explicitly deferred. Platform and CPU support for database, password-hashing, and audio dependencies should be checked before choosing packages. Document a clean manual clone/install/run path, stopping the server, backing up data, and common LAN failures.

### Open product choices to resolve during future work

- Does Players: N count the full non-archived roster or tonight's attendance? The provisional interpretation is roster size, with tonight's count labeled separately.
- Are rankings lifetime totals, tonight's wins, or both? Lifetime totals are the primary stated requirement; additional views are not automatically in scope.
- How should tied totals appear in ranks and podium positions, including zero wins and fewer than three players?
- How does the host begin/end a night, and does an interrupted night resume after restart?
- Which authoritative actions require host/admin login, and how is the initial admin securely created or recovered?
- Are shared/team victories or multiple winners in a single round needed? The current brief describes per-player wins without a round model.
- Does the optional leader allow one or several people, and when is it cleared?
- What exactly constitutes a reusable trimmed clip, and how are sounds assigned: globally, per game, or per player?
- Does adding a game through configuration require an immediate hot reload or only a server restart? Both avoid rebuilding.
- Which screens play celebration audio, and what should happen during overlapping wins or an undo?

These questions are recorded for later; the current instruction does not request implementation or an interactive requirements interview.

### Completion evidence for the eventual build

1. Foundation: player creation and persistence work after restart; totals reconcile with win records; the count, full ranking, top-three arrangement, ties, empty roster, and long names behave consistently.
2. Games: exactly seven launch entries appear; each produces a distinct readable presentation; the count card stays white/black; an additional data-defined game can be loaded without rebuilding.
3. Admin: multiple accounts work; passwords are hashed; unauthorized writes fail at the server; the optional leader starts disabled and updates with one tap when enabled.
4. Joining: a real phone reaches the LAN URL; the host receives pending requests live; approval, denial, duplicate suggestions, explicit matching, and reconnects work without accidental duplicate records.
5. Effects and sound: a committed win produces one celebration per intended display; audio failures preserve visual feedback; uploaded clips can be trimmed, previewed, saved, and reused after restart; reduced motion and undo remain usable.
6. Packaging: supported desktop installers work from a clean setup, produce a reusable launcher, preserve existing data on rerun, show the correct LAN address, and support documented manual launch and offline runtime. Future Pi startup requires no redesign of the server entry point.

Verification should combine meaningful persistence/authorization/concurrency checks with browser, mobile, visual, audio, and operating-system testing. Platform checks that have not actually run must be reported as unverified, not assumed successful.
