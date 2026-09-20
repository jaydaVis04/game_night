import { openDatabase, resolveDataDir } from '../server/db.js';
import { acquireServerLock } from './runtime-lock.js';

const dataDir = resolveDataDir();
let release;
let db;
try {
  release = acquireServerLock(dataDir);
  db = openDatabase(dataDir);
  const admins = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
  console.log(`\nVictory Club is ready.\nData: ${dataDir}`);
  console.log(admins ? 'Existing players, history, and admin accounts have been preserved.' : 'Start the server, then use its setup code to create your first host account.');
  console.log('Launch: npm start\n');
} catch (error) {
  console.error(`Setup could not finish: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
  release?.();
}
