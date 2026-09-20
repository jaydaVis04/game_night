import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/app.js';
import { encodeWave } from '../src/audio.js';

test('saved sounds: authentication, bounded files, persistence, playback, selection and removal', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'victory-sounds-'));
  let application = createApplication({ dataDir, setupCode: 'audio-setup-test' });
  let base;
  const start = async () => {
    await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${application.server.address().port}`;
  };
  await start();
  t.after(async () => {
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const wave = Buffer.from(
    encodeWave(
      {
        sampleRate: 8000,
        length: 16000,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(16000).fill(0.1),
      },
      0,
      2,
    ),
  );
  const headers = {
    'X-Victory-Request': '1',
    'Content-Type': 'audio/wav',
    'X-Clip-Name': encodeURIComponent('Our victory ♪'),
  };
  assert.equal(
    (await fetch(`${base}/api/sounds`, { method: 'POST', headers, body: wave })).status,
    401,
  );
  const setup = await fetch(`${base}/api/auth/setup`, {
    method: 'POST',
    headers: { 'X-Victory-Request': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'sound-host',
      password: 'a-valid-local-password',
      setupCode: 'audio-setup-test',
    }),
  });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const authed = { ...headers, Cookie: cookie };
  assert.equal(
    (
      await fetch(`${base}/api/sounds`, {
        method: 'POST',
        headers: authed,
        body: Buffer.from('<html>not audio</html>'),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/api/sounds`, {
        method: 'POST',
        headers: { ...authed, 'X-Clip-Name': '%' },
        body: wave,
      })
    ).status,
    400,
  );
  const response = await fetch(`${base}/api/sounds`, {
    method: 'POST',
    headers: authed,
    body: wave,
  });
  assert.equal(response.status, 201);
  const { sound } = await response.json();
  assert.equal(sound.duration, 2);
  assert.equal(sound.name, 'Our victory ♪');
  assert.deepEqual(await readFile(join(dataDir, 'sounds', `${sound.id}.wav`)), wave);
  const selected = await fetch(`${base}/api/settings`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'X-Victory-Request': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ soundId: sound.id }),
  });
  assert.equal(selected.status, 200);
  await application.close();
  application = createApplication({ dataDir });
  await start();
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.settings.soundId, sound.id);
  assert.equal(state.sounds[0].id, sound.id);
  const playback = await fetch(base + sound.url);
  assert.match(playback.headers.get('content-type'), /audio\/wav/);
  assert.deepEqual(Buffer.from(await playback.arrayBuffer()), wave);
  await unlink(join(dataDir, 'sounds', `${sound.id}.wav`));
  const missing = await fetch(base + sound.url);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'That sound is no longer available.');
  assert.equal(
    (
      await fetch(`${base}/api/sounds/${sound.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie, 'X-Victory-Request': '1' },
      })
    ).status,
    200,
  );
  const after = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(after.sounds, []);
  assert.equal(after.settings.soundId, 'default');
  assert.equal((await fetch(base + sound.url)).status, 404);
});
