import { createApplication } from './app.js';
import { resolveDataDir } from './db.js';
import { acquireServerLock } from '../scripts/runtime-lock.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a whole number between 1 and 65535.');
  process.exit(1);
}

let releaseLock;
let application;
let stopping = false;
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  try {
    if (application) await application.close();
  } catch (error) {
    console.error('Could not close cleanly:', error.message);
    exitCode = 1;
  } finally {
    releaseLock?.();
    process.exitCode = exitCode;
  }
}

try {
  const dataDir = resolveDataDir();
  releaseLock = acquireServerLock(dataDir);
  application = createApplication({
    dataDir,
    port,
    host,
    publicUrl: process.env.VICTORY_PUBLIC_URL,
  });
  application.server.once('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Close the other server or set PORT to another number.`
        : `Victory Club could not start: ${error.message}`,
    );
    void stop(1);
  });
  application.server.listen(port, host, () => {
    console.log('\n  VICTORY CLUB — good company. great games.\n');
    console.log(`  This computer:  http://localhost:${port}`);
    console.log(`  Phones / Wi-Fi: ${application.getLanUrl()}`);
    console.log(`  Your data:      ${dataDir}`);
    if (!application.db.prepare('SELECT id FROM admins LIMIT 1').get()) {
      console.log(`\n  First host setup code: ${application.setupCode}`);
      console.log('  Open the app and enter this code to create your host account.');
    }
    console.log('\n  Keep this window open while you play. Press Ctrl+C to stop.\n');
  });
  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });
} catch (error) {
  console.error(`Victory Club could not start: ${error.message}`);
  await stop(1);
}
