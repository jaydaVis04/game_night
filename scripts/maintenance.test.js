import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.js';
import { acquireServerLock } from './runtime-lock.js';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'victory-maintenance-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(script, dataDir, args = []) {
  return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, VICTORY_DATA_DIR: dataDir },
  });
}

test('setup is repeatable, preserves records, and seeds exactly seven games', (t) => {
  const dir = fixture(t);
  assert.equal(run('setup.js', dir).status, 0);
  let db = openDatabase(dir);
  db.prepare('INSERT INTO players(id,name,name_key,created_at) VALUES (?,?,?,?)').run(
    'player-fixture',
    'Avery',
    'avery',
    new Date().toISOString(),
  );
  db.close();
  assert.equal(run('setup.js', dir).status, 0);
  db = openDatabase(dir);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM players').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM games').get().count, 7);
  db.close();
  acquireServerLock(dir)();
});

test(
  'server lock blocks maintenance and recovers a crashed owner',
  { timeout: 10000 },
  async (t) => {
    const dir = fixture(t);
    const release = acquireServerLock(dir);
    assert.throws(() => acquireServerLock(dir), /already using/);
    const attempt = run('setup.js', dir);
    assert.equal(attempt.status, 1);
    assert.match(attempt.stderr, /Stop the server/);
    release();
    const lockUrl = new URL('./runtime-lock.js', import.meta.url).href;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { acquireServerLock } from ${JSON.stringify(lockUrl)}; acquireServerLock(process.argv[1]); console.log('locked'); setInterval(() => {}, 1000);`,
        dir,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    t.after(() => {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
    });
    await once(child.stdout, 'data');
    assert.throws(() => acquireServerLock(dir), /already using/);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    const releaseRecovered = acquireServerLock(dir);
    releaseRecovered();
  },
);

test('backup snapshots persisted data and referenced audio without changing the source', (t) => {
  const dir = fixture(t);
  const dataDir = join(dir, 'data');
  const db = openDatabase(dataDir);
  db.prepare('INSERT INTO players(id,name,name_key,created_at) VALUES (?,?,?,?)').run(
    'player-fixture',
    'Avery',
    'avery',
    new Date().toISOString(),
  );
  mkdirSync(join(dataDir, 'sounds'));
  const clip = Buffer.from('An audio-copy fixture, including binary bytes: \u0000\u0001\u0002');
  writeFileSync(join(dataDir, 'sounds', 'clip.wav'), clip);
  db.prepare('INSERT INTO sounds(id,name,duration,filename,created_at) VALUES (?,?,?,?,?)').run(
    'clip',
    'Winner',
    1,
    'clip.wav',
    new Date().toISOString(),
  );
  db.close();
  const before = readFileSync(join(dataDir, 'database.sqlite'));
  const destination = join(dir, 'backups');
  const attempt = run('backup.js', dataDir, [destination]);
  assert.equal(attempt.status, 0, attempt.stderr);
  const [folder] = readdirSync(destination);
  assert.ok(!folder.endsWith('.incomplete'));
  const copy = join(destination, folder);
  assert.deepEqual(readFileSync(join(copy, 'sounds', 'clip.wav')), clip);
  const snapshot = new DatabaseSync(join(copy, 'database.sqlite'), { readOnly: true });
  assert.equal(snapshot.prepare('SELECT name FROM players').get().name, 'Avery');
  assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  snapshot.close();
  assert.equal(JSON.parse(readFileSync(join(copy, 'backup.json'), 'utf8')).soundClips, 1);
  assert.deepEqual(readFileSync(join(dataDir, 'database.sqlite')), before);
  const release = acquireServerLock(dataDir);
  const blocked = run('backup.js', dataDir, [destination]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Stop the server/);
  release();
  assert.equal(readdirSync(destination).length, 1);
});

test('missing audio prevents a backup from being marked complete', (t) => {
  const dir = fixture(t);
  const db = openDatabase(dir);
  db.prepare('INSERT INTO sounds(id,name,duration,filename,created_at) VALUES (?,?,?,?,?)').run(
    'missing',
    'Missing',
    1,
    'missing.wav',
    new Date().toISOString(),
  );
  db.close();
  const attempt = run('backup.js', dir);
  assert.equal(attempt.status, 1);
  assert.match(attempt.stderr, /unfinished backup/);
  assert.ok(readdirSync(join(dir, 'backups')).every((name) => name.endsWith('.incomplete')));
  acquireServerLock(dir)();
});

test('password recovery refuses noninteractive password input', (t) => {
  const attempt = run('reset-admin.js', fixture(t));
  assert.equal(attempt.status, 1);
  assert.match(attempt.stderr, /Passwords are entered privately/);
});

test(
  'desktop and command launchers stay in selected folders and preserve unrelated files',
  { skip: process.platform === 'win32' },
  (t) => {
    const dir = fixture(t);
    const bin = join(dir, 'command folder');
    const desktop = join(dir, 'desktop folder');
    const env = {
      ...process.env,
      VICTORY_BIN_DIR: bin,
      VICTORY_SHORTCUT_DIR: desktop,
      VICTORY_SKIP_SHORTCUTS: '0',
    };
    const args = [join(root, 'scripts', 'install-launcher.js')];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8', env });
    assert.equal(first.status, 0, first.stderr);
    const command = join(bin, 'victory-club');
    assert.match(readFileSync(command, 'utf8'), /Victory Club game-night launcher/);
    assert.equal(spawnSync('/bin/sh', ['-n', command]).status, 0);
    const desktopFile = join(
      desktop,
      process.platform === 'darwin' ? 'Victory Club.command' : 'Victory Club.desktop',
    );
    assert.equal(existsSync(desktopFile), true);
    writeFileSync(command, '#!/bin/sh\n# An unrelated user command\n');
    assert.equal(spawnSync(process.execPath, args, { env }).status, 0);
    assert.match(readFileSync(command, 'utf8'), /unrelated user command/);
    rmSync(command);
    const target = join(dir, 'unrelated-file');
    writeFileSync(target, 'Victory Club game-night launcher — user-owned content');
    symlinkSync(target, command);
    assert.equal(spawnSync(process.execPath, args, { env }).status, 0);
    assert.equal(
      readFileSync(target, 'utf8'),
      'Victory Club game-night launcher — user-owned content',
    );
  },
);
