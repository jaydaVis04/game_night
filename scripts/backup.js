import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, copyFile, writeFile, rename, access, chmod } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolveDataDir } from '../server/db.js';
import { acquireServerLock } from './runtime-lock.js';

const dataDir = resolveDataDir();
const destinationParent = process.argv[2] ? resolve(process.argv[2]) : join(dataDir, 'backups');
let release;
let source;
let snapshot;
let incomplete;
try {
  if (process.argv.length > 3) throw new Error('Usage: npm run backup -- [destination-folder]');
  await access(join(dataDir, 'database.sqlite'));
  release = acquireServerLock(dataDir);
  source = new DatabaseSync(join(dataDir, 'database.sqlite'), { readOnly: true, timeout: 5000 });
  const name = `victory-club-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  const destination = join(destinationParent, name);
  incomplete = `${destination}.incomplete`;
  await mkdir(destinationParent, { recursive: true, mode: 0o700 });
  await mkdir(incomplete, { mode: 0o700 });
  await mkdir(join(incomplete, 'sounds'), { mode: 0o700 });
  await backup(source, join(incomplete, 'database.sqlite'));
  await chmod(join(incomplete, 'database.sqlite'), 0o600);
  snapshot = new DatabaseSync(join(incomplete, 'database.sqlite'), { readOnly: true });
  const integrity = snapshot.prepare('PRAGMA integrity_check').get().integrity_check;
  if (integrity !== 'ok') throw new Error(`Database integrity check failed: ${integrity}`);
  const sounds = snapshot.prepare('SELECT id, name, filename, duration FROM sounds ORDER BY id').all();
  for (const sound of sounds) {
    if (basename(sound.filename) !== sound.filename || !sound.filename.endsWith('.wav')) throw new Error(`Invalid stored audio filename for ${sound.id}.`);
    await copyFile(join(dataDir, 'sounds', sound.filename), join(incomplete, 'sounds', sound.filename));
    await chmod(join(incomplete, 'sounds', sound.filename), 0o600);
  }
  await copyFile(fileURLToPath(new URL('../config/games.json', import.meta.url)), join(incomplete, 'games-config.json'));
  await writeFile(join(incomplete, 'backup.json'), `${JSON.stringify({
    format: 1,
    createdAt: new Date().toISOString(),
    application: 'Victory Club',
    nodeVersion: process.version,
    soundClips: sounds.length,
    players: snapshot.prepare('SELECT COUNT(*) AS count FROM players').get().count,
    wins: snapshot.prepare('SELECT COUNT(*) AS count FROM wins').get().count,
  }, null, 2)}\n`, { mode: 0o600 });
  snapshot.close();
  snapshot = null;
  await rename(incomplete, destination);
  incomplete = null;
  console.log(`Backup complete: ${destination}\nIncludes the database, ${sounds.length} saved sound clip(s), and a copy of game configuration.\nStore a copy on another drive. See docs/OPERATIONS.md for restoring.`);
} catch (error) {
  console.error(`Backup failed: ${error.message}`);
  if (incomplete) console.error(`An unfinished backup was left at ${incomplete}. Do not use it for restoration.`);
  process.exitCode = 1;
} finally {
  snapshot?.close();
  source?.close();
  release?.();
}
