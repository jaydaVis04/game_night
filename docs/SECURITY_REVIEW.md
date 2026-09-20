# Security and correctness review

This is a source review and targeted test record for a household LAN application, not a penetration-test certification. The bundled API/web security skills supplied OWASP checklists; their referenced detailed playbooks and report templates were not present. The review therefore used the available checklists, source inspection, and executable regression checks.

## Application boundary

One Node process serves a React interface, an Express API, public change notifications over WebSockets, local fonts/assets, and approved WAV clips. SQLite and audio files live outside the static web root. Household player names and rankings are intentionally visible to other devices on the network. Guests can submit join requests; hosts control all authoritative changes.

The server uses HTTP for ordinary home-Wi-Fi setup. Passwords and cookies are not encrypted in transit. It is intended for trusted devices on a private network, without router port forwarding or public tunnels. Production internet hosting, remote account systems, and enterprise security are outside the brief.

## Controls and evidence

| Area | Implemented controls | Verification |
| --- | --- | --- |
| Access control / API object and function authorization | Every roster, attendance, win, approval, settings, game, sound, and account mutation requires a host session. Read-only admin endpoints are protected. Join status requires its private request token. | Backend authorization matrix and phone-flow checks. |
| Authentication | Console-only unpredictable first-setup secret; multiple host accounts; bcrypt password hashes; opaque, hashed session tokens; HttpOnly/SameSite=Strict cookies; expiry/logout; bounded login attempts. | Setup-secret, multiple-host, cookie, expiry, login, logout, and recovery tests. |
| Input and injection | Bound SQL parameters; React text rendering; normalized names; validated types; fixed motif enums; six-digit color values; no executable theme configuration or arbitrary remote asset URLs. | Invalid names/palettes, hostile Host/Origin, and malformed request tests. |
| Cross-site requests | Mutations require a custom header and same-origin browser requests; host allowlist resists DNS rebinding; no permissive CORS; WebSocket upgrades check Origin and Host. | HTTP and WebSocket hostile-origin tests, raw hostile-Host request. |
| Uploads and paths | Only bounded, canonical PCM WAV clips accepted by server; strict RIFF lengths, rate, channels and duration checks; generated UUID filenames; original files decoded locally by the browser; media query restricted to recorded files. | WAV corruption cases, saved-clip persistence, media playback, deletion and unauthorized upload tests. |
| Resource consumption | JSON/audio body limits, password/name limits, auth/join rate limits, history pagination, socket payload/backpressure limits and heartbeat. | Validation and concurrent request tests. No claim of resilience to a malicious device flooding the entire LAN. |
| Business integrity | Transactional win totals/history, request IDs, reversible win events, atomic join resolution, explicit duplicate matching, stable player/game IDs, non-destructive archiving. | Concurrent retries/joins, tie ranking, undo, archived-history, and restart tests. |
| Configuration and data exposure | Security headers, generic unexpected-error responses, no public admin records/setup code/session secrets/pending names, data outside build output. | Public snapshot and protected endpoint matrix. |
| Dependencies and software integrity | Locked dependencies, original motifs/chime, local assets, official Node HTTPS downloads with SHA-256 verification, repeatable build. | Dependency audit and build; installer source/syntax and official artifact URL checks. Checksums come from the same trusted HTTPS distribution origin, not a separate signature verifier. |
| Logging and recovery | Per-win actor/time, retained reversals, startup failure messages, private backup folders, SQLite integrity check, stopped-server maintenance lock, password recovery that revokes all sessions. | Backup, lock, incomplete-copy and recovery checks. No centralized audit service is required or included. |
| SSRF and unsafe upstream consumption | Runtime makes no server-side requests to user-selected external services. No webhooks, OAuth, XML ingestion, or dynamic code evaluation. | Source inspection; browser runtime checked with external requests blocked. |

No cloud gateway, GraphQL, JWT, OAuth, or multi-tenant ownership model exists in this app; findings specific to those systems are inapplicable. Host accounts intentionally share full control of the single household database.

## Corrections made during implementation

- Theme editing checks contrast for primary and secondary text against background/card surfaces, and button text against its accent. Invalid colors receive an actionable error.
- Win retries preserve an operation ID and cannot duplicate totals or celebrations; reconnecting screens fetch current state without replaying old effects.
- Similar player names require the host to select a record or explicitly create another person.
- Trim inputs accept arbitrary fractional positions without native form step-validation preventing a valid save.
- Celebrations use the browser's modal-dialog focus behavior and support dismissal/undo from the keyboard.
- Recovery and backup reserve the data directory while the server is stopped, preventing maintenance from racing an active game.

## Verification limits

Automated checks use temporary databases and audio files, not household data. Browser playback tests validate decoding, selection, saved audio, and playback APIs; they do not prove physical speaker output or every phone's codec support. Desktop/mobile viewport checks do not substitute for a real device on a particular home router. Other operating systems' installer checks are recorded separately in the [operations guide](OPERATIONS.md#verification-scope).
