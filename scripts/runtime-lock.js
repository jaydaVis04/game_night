import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

/** Share this lock between the server and maintenance commands. */
export function acquireServerLock(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = join(dataDir, 'server.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = openSync(filename, 'wx', 0o600);
      try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })); }
      finally { closeSync(descriptor); }
      return () => {
        try {
          if (JSON.parse(readFileSync(filename, 'utf8')).token === token) unlinkSync(filename);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(filename, 'utf8')); }
      catch (readError) {
        if (readError.code === 'ENOENT') continue;
        throw new Error(`Cannot read ${filename}. Stop all Victory Club processes, then move this lock file aside and retry.`);
      }
      if (processExists(owner.pid)) {
        throw new Error(`Victory Club is already using this data folder (process ${owner.pid}). Stop the server before running this command.`);
      }
      // A process that crashed can leave a lock behind. Only remove its exact lock.
      if (readFileSync(filename, 'utf8') === JSON.stringify(owner)) {
        try { unlinkSync(filename); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
      }
    }
  }
  throw new Error('Another Victory Club process is starting. Try again in a moment.');
}

export function assertServerStopped(dataDir) {
  const release = acquireServerLock(dataDir);
  release();
}
