import { mkdir, readFile, writeFile, chmod, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const marker = 'Victory Club game-night launcher';
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
async function writeLauncher(filename, content) {
  try {
    if ((await lstat(filename)).isSymbolicLink()) {
      console.log(`Preserved an existing symbolic link: ${filename}`);
      return false;
    }
    const existing = await readFile(filename, 'utf8');
    if (!existing.includes(marker)) {
      console.log(`Preserved an existing file: ${filename}`);
      return false;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(filename, content, { mode: 0o755 });
  await chmod(filename, 0o755);
  console.log(`Launcher: ${filename}`);
  return true;
}

if (process.env.VICTORY_SKIP_SHORTCUTS !== '1') {
  const bin = process.env.VICTORY_BIN_DIR || join(homedir(), '.local', 'bin');
  await mkdir(bin, { recursive: true });
  const script = `#!/bin/sh\n# ${marker}\nPATH=${quote(dirname(process.execPath))}:"$PATH"\nexport PATH\nexec /bin/sh ${quote(join(root, 'scripts', 'launch.sh'))} "$@"\n`;
  const shortCommand = await writeLauncher(join(bin, 'victory-club'), script);
  let desktop = process.env.VICTORY_SHORTCUT_DIR || join(homedir(), 'Desktop');
  if (process.platform === 'linux' && !process.env.VICTORY_SHORTCUT_DIR) {
    try {
      desktop = execFileSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' }).trim() || desktop;
    } catch {
      /* Standard fallback. */
    }
  }
  await mkdir(desktop, { recursive: true });
  if (process.platform === 'darwin')
    await writeLauncher(join(desktop, 'Victory Club.command'), script);
  else if (process.platform === 'linux') {
    const desktopQuote = (value) =>
      `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$').replaceAll('%', '%%')}"`;
    await writeLauncher(
      join(desktop, 'Victory Club.desktop'),
      `[Desktop Entry]\nType=Application\nVersion=1.0\nName=Victory Club\nComment=${marker}\nExec=${desktopQuote(process.execPath)} ${desktopQuote(join(root, 'server', 'index.js'))}\nTerminal=true\nCategories=Game;\n`,
    );
    console.log('If your desktop asks, choose “Allow launching” for Victory Club.');
  }
  if (shortCommand) {
    console.log(`Short command: ${join(bin, 'victory-club')}`);
    if (!process.env.PATH?.split(':').includes(bin))
      console.log(`To use “victory-club” from any terminal, add ${bin} to your PATH.`);
  }
}
