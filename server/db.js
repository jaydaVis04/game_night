import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID, randomInt } from 'node:crypto';
import { validateGame } from './validation.js';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function resolveDataDir(override) {
  return path.resolve(projectRoot, override ?? process.env.VICTORY_DATA_DIR ?? 'data');
}

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function newNight(db) {
  const id = randomUUID();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (db.prepare('SELECT id FROM nights WHERE code = ?').get(code));
  const now = new Date().toISOString();
  db.prepare("UPDATE join_requests SET status = 'expired' WHERE status = 'pending'").run();
  db.prepare('UPDATE nights SET ended_at = ? WHERE ended_at IS NULL').run(now);
  db.prepare('INSERT INTO nights (id, code, started_at) VALUES (?, ?, ?)').run(id, code, now);
  return id;
}

export function openDatabase(dataDir = resolveDataDir()) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = path.join(dataDir, 'database.sqlite');
  const db = new DatabaseSync(databasePath);
  chmodSync(databasePath, 0o600);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) {
    db.close();
    throw new Error('This database needs a newer version of Victory Club.');
  }
  if (version < 1) transaction(db, () => {
    db.exec(`
      CREATE TABLE players (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL,
        total_wins INTEGER NOT NULL DEFAULT 0 CHECK(total_wins >= 0),
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX players_name_key ON players(name_key);
      CREATE TABLE games (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, theme_key TEXT NOT NULL, tagline TEXT NOT NULL,
        motif TEXT NOT NULL, palette TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
        config_hash TEXT
      ) STRICT;
      CREATE TABLE nights (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, started_at TEXT NOT NULL, ended_at TEXT,
        game_id TEXT REFERENCES games(id), leader_id TEXT REFERENCES players(id)
      ) STRICT;
      CREATE UNIQUE INDEX nights_one_active ON nights((1)) WHERE ended_at IS NULL;
      CREATE TABLE attendance (
        night_id TEXT NOT NULL REFERENCES nights(id), player_id TEXT NOT NULL REFERENCES players(id),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), PRIMARY KEY(night_id, player_id)
      ) STRICT;
      CREATE TABLE admins (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX sessions_expiry ON sessions(expires_at);
      CREATE TABLE wins (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), game_id TEXT NOT NULL REFERENCES games(id),
        night_id TEXT NOT NULL REFERENCES nights(id), admin_id TEXT REFERENCES admins(id),
        request_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, reversed_at TEXT
      ) STRICT;
      CREATE INDEX wins_player_game ON wins(player_id, game_id) WHERE reversed_at IS NULL;
      CREATE INDEX wins_night ON wins(night_id, player_id) WHERE reversed_at IS NULL;
      CREATE INDEX wins_recent ON wins(created_at DESC);
      CREATE TABLE join_requests (
        id TEXT PRIMARY KEY, night_id TEXT NOT NULL REFERENCES nights(id), name TEXT NOT NULL,
        request_id TEXT NOT NULL, token TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','expired')),
        player_id TEXT REFERENCES players(id), created_at TEXT NOT NULL,
        UNIQUE(night_id, request_id)
      ) STRICT;
      CREATE INDEX joins_night_status ON join_requests(night_id, status);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE sounds (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, duration REAL NOT NULL, filename TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version=1;
    `);
  });
  try {
    const config = JSON.parse(readFileSync(path.join(projectRoot, 'config/games.json'), 'utf8'));
    if (!Array.isArray(config) || !config.length) throw new Error('config/games.json must contain games.');
    const seen = new Set();
    const games = config.map(data => {
      const game = validateGame(data);
      if (seen.has(game.id)) throw new Error(`Duplicate game ID: ${game.id}`);
      seen.add(game.id);
      return game;
    });
    transaction(db, () => {
      const upsert = db.prepare(`INSERT INTO games (id,name,theme_key,tagline,motif,palette,archived,config_hash) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,theme_key=excluded.theme_key,tagline=excluded.tagline,
          motif=excluded.motif,palette=excluded.palette,archived=excluded.archived,config_hash=excluded.config_hash
        WHERE games.config_hash IS NOT excluded.config_hash`);
      for (const game of games) {
        const hash = createHash('sha256').update(JSON.stringify(game)).digest('hex');
        upsert.run(game.id, game.name, game.themeKey, game.tagline, game.motif, JSON.stringify(game.palette), Number(game.archived), hash);
      }
      const set = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
      for (const [key, value] of Object.entries({ currentlyWinning: false, soundId: 'default', celebrationSeconds: 10 })) set.run(key, JSON.stringify(value));
      if (!db.prepare('SELECT id FROM nights WHERE ended_at IS NULL').get()) newNight(db);
      db.prepare('UPDATE nights SET game_id=NULL,leader_id=NULL WHERE ended_at IS NULL AND game_id IN (SELECT id FROM games WHERE archived=1)').run();
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
