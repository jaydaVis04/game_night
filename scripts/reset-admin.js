import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { openDatabase, resolveDataDir } from '../server/db.js';
import { acquireServerLock } from './runtime-lock.js';

async function readUsername() {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await new Promise((resolve, reject) => {
      prompt.once('SIGINT', () => reject(new Error('Canceled. No password was changed.')));
      prompt.question('Existing admin username: ', resolve);
    });
  } finally {
    prompt.close();
  }
}

function readPassword(label) {
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(label);
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    const finish = (error) => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c')
        return finish(new Error('Canceled. No password was changed.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
        return;
      }
      if (
        key.ctrl ||
        key.meta ||
        ['escape', 'up', 'down', 'left', 'right', 'tab', 'delete', 'home', 'end'].includes(key.name)
      )
        return;
      if (text && !/[\u0000-\u001f\u007f]/u.test(text)) value += text;
    };
    stdin.on('keypress', onKey);
  });
}

let release;
let db;
try {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error(
      'Open a terminal and run npm run reset-admin. Passwords are entered privately; command-line passwords are not supported.',
    );
  const dataDir = resolveDataDir();
  await access(join(dataDir, 'database.sqlite'));
  release = acquireServerLock(dataDir);
  db = openDatabase(dataDir);
  console.log(
    'Reset an existing host account. This signs every host out.\nYour password will not appear while typing. Press Ctrl+C to cancel.\n',
  );
  const username = (await readUsername()).normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const admin = db.prepare('SELECT id, username FROM admins WHERE username_key = ?').get(username);
  if (!admin) throw new Error('That admin account does not exist. No changes were made.');
  const password = await readPassword('New password (10–72 UTF-8 bytes): ');
  if (Buffer.byteLength(password, 'utf8') < 10 || Buffer.byteLength(password, 'utf8') > 72)
    throw new Error('Use a password between 10 and 72 UTF-8 bytes. No changes were made.');
  const repeated = await readPassword('Repeat new password: ');
  if (password !== repeated) throw new Error('The passwords did not match. No changes were made.');
  const hash = await bcrypt.hash(password, 12);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
    db.exec('DELETE FROM sessions');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  console.log(
    `\nPassword updated for ${admin.username}. All host sessions were signed out.\nStart Victory Club and sign in with the new password.`,
  );
} catch (error) {
  console.error(`Recovery stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
  release?.();
}
