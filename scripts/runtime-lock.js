import { mkdirSync, chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/** A separate SQLite transaction provides a portable, crash-safe OS file lock. */
export function acquireServerLock(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = join(dataDir, 'runtime-lock.sqlite');
  let lock;
  try {
    lock = new DatabaseSync(filename, { timeout: 0 });
    chmodSync(filename, 0o600);
    lock.exec('PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS process_lock (id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE;');
  } catch (error) {
    lock?.close();
    if ([5, 6].includes(error.errcode & 0xff) || /database is (locked|busy)/i.test(error.message)) {
      throw new Error('Victory Club is already using this data folder. Stop the server before running this command.');
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { lock.exec('ROLLBACK'); } finally { lock.close(); }
  };
}

export function assertServerStopped(dataDir) {
  const release = acquireServerLock(dataDir);
  release();
}
