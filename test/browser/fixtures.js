import { test as base, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../../server/app.js';

export const test = base.extend({
  club: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'victory-browser-'));
    const application = createApplication({
      dataDir: directory,
      port: 0,
      setupCode: 'browser-test-setup',
    });
    await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${application.server.address().port}`;
    try {
      await use({ ...application, directory, url });
    } finally {
      await application.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
});

export { expect };

export async function request(page, club, path, body, method = 'POST') {
  const response = await page.request.fetch(`${club.url}/api${path}`, {
    method,
    data: body,
    headers: { 'X-Victory-Request': '1' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function setupHost(page, club) {
  await request(page, club, '/auth/setup', {
    username: 'host',
    password: 'a-good-test-password',
    setupCode: 'browser-test-setup',
  });
}

export async function addPlayers(page, club, names) {
  const players = [];
  for (const name of names) players.push((await request(page, club, '/players', { name })).player);
  return players;
}

export function waveFixture(duration = 12) {
  const sampleRate = 8000;
  const bytes = sampleRate * duration * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);
  for (let sample = 0; sample < bytes / 2; sample++)
    buffer.writeInt16LE(
      Math.round(Math.sin((sample / sampleRate) * Math.PI * 880) * 5000),
      44 + sample * 2,
    );
  return buffer;
}
