import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import WebSocket from 'ws';
import { createApplication } from '../server/app.js';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'victory-backend-'));
  let application = createApplication({
    dataDir,
    port: 0,
    setupCode: 'test-setup-secret',
    ...options,
  });
  await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${application.server.address().port}`;
  let cookie = '';
  const request = async (
    url,
    body,
    { method = body === undefined ? 'GET' : 'POST', admin = true, headers = {} } = {},
  ) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        'X-Victory-Request': '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(admin && cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.get('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return {
      status: response.status,
      body: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text(),
      headers: response.headers,
    };
  };
  const setup = () =>
    request('/api/auth/setup', {
      username: 'Host',
      password: 'a-strong-local-password',
      setupCode: 'test-setup-secret',
    });
  t.after(async () => {
    await application.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    request,
    setup,
    get application() {
      return application;
    },
    get base() {
      return base;
    },
    restart: async () => {
      await application.close();
      application = createApplication({
        dataDir,
        port: 0,
        setupCode: 'test-setup-secret',
        ...options,
      });
      await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${application.server.address().port}`;
    },
  };
}

test('foundation: persistent roster, seven games, win totals, truthful ties, and reversible history', async (t) => {
  const f = await fixture(t);
  const empty = (await f.request('/api/state')).body;
  assert.equal(empty.games.length, 7);
  assert.deepEqual(empty.players, []);
  assert.equal(empty.settings.currentlyWinning, false);
  assert.equal(empty.night.gameId, null);
  assert.equal((await f.setup()).status, 201);
  const alice = (await f.request('/api/players', { name: 'Alice' })).body.player;
  const bob = (await f.request('/api/players', { name: 'Bob' })).body.player;
  const charlie = (await f.request('/api/players', { name: 'Charlie' })).body.player;
  assert.equal(alice.active, true);
  assert.equal(
    (await f.request('/api/wins', { playerId: alice.id, gameId: 'coup', requestId: randomUUID() }))
      .status,
    409,
  );
  await f.request('/api/night/game', { gameId: 'coup' });
  const op = { playerId: alice.id, gameId: 'coup', requestId: randomUUID() };
  const first = await f.request('/api/wins', op);
  assert.equal(first.status, 201);
  assert.equal((await f.request('/api/wins', op)).body.win.id, first.body.win.id);
  assert.equal((await f.request('/api/wins', { ...op, playerId: bob.id })).status, 409);
  await f.request('/api/wins', { playerId: bob.id, gameId: 'coup', requestId: randomUUID() });
  let state = (await f.request('/api/state')).body;
  assert.deepEqual(
    state.players.map((p) => [p.name, p.totalWins, p.rank]),
    [
      ['Alice', 1, 1],
      ['Bob', 1, 1],
      ['Charlie', 0, 3],
    ],
  );
  assert.equal(state.players[0].tonightWins, 1);
  await f.restart();
  state = (await f.request('/api/state')).body;
  assert.equal(state.night.id, empty.night.id);
  assert.equal(state.players[0].totalWins, 1);
  assert.equal((await f.request('/api/auth/me')).body.admin.username, 'Host');
  await f.request(`/api/wins/${first.body.win.id}/undo`, {});
  await f.request(`/api/wins/${first.body.win.id}/undo`, {});
  state = (await f.request('/api/state')).body;
  assert.equal(state.players.find((p) => p.id === alice.id).totalWins, 0);
  assert.equal((await f.request('/api/history')).body.total, 2);
  assert.ok(
    (await f.request('/api/history')).body.wins.find((w) => w.id === first.body.win.id).reversedAt,
  );
  await f.request(`/api/players/${charlie.id}`, { archived: true }, { method: 'PATCH' });
  state = (await f.request('/api/state')).body;
  assert.equal(state.players.find((p) => p.id === charlie.id).rank, null);
  assert.equal(state.players.find((p) => p.id === charlie.id).active, false);
  assert.equal(
    f.application.db.prepare('SELECT SUM(total_wins) AS total FROM players').get().total,
    f.application.db.prepare('SELECT COUNT(*) AS total FROM wins WHERE reversed_at IS NULL').get()
      .total,
  );
});

test('authorization: setup secret, cookie sessions, multiple hosts, CSRF, safe input, and expired sessions', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/players', { name: 'Intruder' })).status, 401);
  assert.equal(
    (
      await f.request('/api/auth/setup', {
        username: 'Host',
        password: 'a-strong-local-password',
        setupCode: 'wrong',
      })
    ).status,
    403,
  );
  const setup = await f.setup();
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(setup.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.equal((await f.setup()).status, 409);
  assert.equal(
    (
      await f.request(
        '/api/players',
        { name: 'Bad' },
        { headers: { Origin: 'https://malicious.example' } },
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.request('/api/players', { name: 'Bad' }, { headers: { 'X-Victory-Request': '0' } }))
      .status,
    403,
  );
  assert.equal((await f.request('/api/players', { name: '\u0000' })).status, 400);
  assert.equal(
    (await f.request('/api/admins', { username: 'Second Host', password: 'another-good-password' }))
      .status,
    201,
  );
  const hashes = f.application.db.prepare('SELECT password_hash FROM admins').all();
  assert.equal(hashes.length, 2);
  assert.ok(hashes.every((row) => row.password_hash.startsWith('$2b$12$')));
  await f.request('/api/auth/logout', {});
  assert.equal((await f.request('/api/admins')).status, 401);
  assert.equal(
    (
      await f.request('/api/auth/login', {
        username: 'second host',
        password: 'another-good-password',
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request('/api/auth/login', { username: 'Host', password: 'incorrect-password' }))
      .status,
    401,
  );
  f.application.db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await f.request('/api/players', { name: 'Expired' })).status, 401);
});

test('night lifecycle: leader clears on absence, game change, setting off, win, and new night', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const player = (await f.request('/api/players', { name: 'Ada' })).body.player;
  assert.equal((await f.request('/api/night/leader', { playerId: player.id })).status, 409);
  await f.request('/api/settings', { currentlyWinning: true }, { method: 'PATCH' });
  await f.request('/api/night/leader', { playerId: player.id });
  assert.equal((await f.request('/api/state')).body.night.leaderId, player.id);
  await f.request(`/api/players/${player.id}/attendance`, { active: false });
  assert.equal((await f.request('/api/state')).body.night.leaderId, null);
  assert.equal((await f.request('/api/night/leader', { playerId: player.id })).status, 409);
  await f.request(`/api/players/${player.id}/attendance`, { active: true });
  await f.request('/api/night/leader', { playerId: player.id });
  await f.request('/api/night/game', { gameId: 'poker' });
  assert.equal((await f.request('/api/state')).body.night.leaderId, null);
  await f.request('/api/night/leader', { playerId: player.id });
  await f.request('/api/settings', { currentlyWinning: false }, { method: 'PATCH' });
  assert.equal((await f.request('/api/state')).body.night.leaderId, null);
  await f.request('/api/settings', { currentlyWinning: true }, { method: 'PATCH' });
  await f.request('/api/night/leader', { playerId: player.id });
  await f.request('/api/wins', { playerId: player.id, gameId: 'poker', requestId: randomUUID() });
  assert.equal((await f.request('/api/state')).body.night.leaderId, null);
  const previousNight = (await f.request('/api/state')).body.night;
  const pending = (
    await f.request(
      `/api/join/${previousNight.code}`,
      { name: 'Guest', requestId: randomUUID() },
      { admin: false },
    )
  ).body.request;
  await f.request('/api/night/new', {});
  const state = (await f.request('/api/state')).body;
  assert.notEqual(state.night.id, previousNight.id);
  assert.notEqual(state.night.code, previousNight.code);
  assert.equal(state.night.gameId, null);
  assert.equal(state.players[0].active, false);
  assert.equal(state.players[0].tonightWins, 0);
  assert.equal(state.players[0].totalWins, 1);
  assert.equal((await f.request(`/api/join/${previousNight.code}`)).status, 404);
  assert.equal(
    (await f.request(`/api/join-status/${pending.id}?token=${pending.token}`)).body.request.status,
    'expired',
  );
});

test('join flow: private status, exact and fuzzy matches, explicit duplicate creation, deny, and repeat approval', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const player = (await f.request('/api/players', { name: 'Alice' })).body.player;
  const code = (await f.request('/api/state')).body.night.code;
  const op = { name: 'Alicé', requestId: randomUUID() };
  const submitted = (await f.request(`/api/join/${code}`, op, { admin: false })).body.request;
  assert.equal(
    (await f.request(`/api/join/${code}`, op, { admin: false })).body.request.id,
    submitted.id,
  );
  assert.equal((await f.request('/api/joins', undefined, { admin: false })).status, 401);
  assert.equal((await f.request(`/api/join-status/${submitted.id}`)).status, 404);
  assert.equal(
    (await f.request(`/api/join-status/${submitted.id}?token=${submitted.token}`)).body.request
      .status,
    'pending',
  );
  const queue = (await f.request('/api/joins')).body.requests;
  assert.equal(queue[0].matches[0].id, player.id);
  assert.equal(
    (await f.request(`/api/joins/${submitted.id}/resolve`, { action: 'approve' })).status,
    409,
  );
  assert.equal(
    (
      await f.request(`/api/joins/${submitted.id}/resolve`, {
        action: 'approve',
        playerId: player.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(`/api/joins/${submitted.id}/resolve`, {
        action: 'approve',
        playerId: player.id,
      })
    ).status,
    200,
  );
  assert.equal((await f.request('/api/state')).body.players.length, 1);
  assert.equal(
    (await f.request(`/api/join-status/${submitted.id}?token=${submitted.token}`)).body.request
      .status,
    'approved',
  );
  const duplicate = (
    await f.request(
      `/api/join/${code}`,
      { name: 'Alice', requestId: randomUUID() },
      { admin: false },
    )
  ).body.request;
  await f.request(`/api/joins/${duplicate.id}/resolve`, { action: 'approve', createNew: true });
  assert.equal((await f.request('/api/state')).body.players.length, 2);
  const denied = (
    await f.request(
      `/api/join/${code}`,
      { name: 'Denied guest', requestId: randomUUID() },
      { admin: false },
    )
  ).body.request;
  await f.request(`/api/joins/${denied.id}/resolve`, { action: 'deny' });
  assert.equal(
    (await f.request(`/api/join-status/${denied.id}?token=${denied.token}`)).body.request.status,
    'denied',
  );
  assert.equal(
    (await f.request(`/api/joins/${denied.id}/resolve`, { action: 'approve' })).status,
    409,
  );
});

test('game configuration: validated data, persistent admin edits, additional games without build, archive preserves wins', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const base = (await f.request('/api/state')).body.games[0];
  assert.equal(
    (await f.request('/api/games', { ...base, id: 'custom-game', name: 'Our Custom Game' })).status,
    201,
  );
  assert.equal(
    (
      await f.request('/api/games', {
        ...base,
        id: 'unsafe',
        palette: { ...base.palette, accent: 'url(https://bad)' },
      })
    ).status,
    400,
  );
  const lowContrast = await f.request('/api/games', {
    ...base,
    id: 'unreadable',
    palette: { ...base.palette, text: base.palette.background },
  });
  assert.equal(lowContrast.status, 400);
  assert.match(lowContrast.body.error, /contrast/);
  assert.equal(
    (await f.request('/api/games/monopoly', { name: 'Family Monopoly' }, { method: 'PATCH' }))
      .status,
    200,
  );
  await f.restart();
  assert.equal(
    (await f.request('/api/state')).body.games.find((game) => game.id === 'monopoly').name,
    'Family Monopoly',
  );
  assert.equal((await f.request('/api/state')).body.games.length, 8);
  await f.request('/api/night/game', { gameId: 'custom-game' });
  const player = (await f.request('/api/players', { name: 'A Player' })).body.player;
  await f.request('/api/wins', {
    playerId: player.id,
    gameId: 'custom-game',
    requestId: randomUUID(),
  });
  await f.request('/api/games/custom-game', { archived: true }, { method: 'PATCH' });
  assert.equal((await f.request('/api/state')).body.night.gameId, null);
  assert.equal((await f.request('/api/history')).body.wins[0].gameId, 'custom-game');
  assert.equal((await f.request('/api/night/game', { gameId: 'custom-game' })).status, 400);
});

test('live updates: public invalidation, exactly one celebration per win, undo, and no replay on reconnect', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const socket = new WebSocket(f.base.replace('http:', 'ws:') + '/ws', { origin: f.base });
  await once(socket, 'open');
  const events = [];
  socket.on('message', (value) => events.push(JSON.parse(value)));
  t.after(() => socket.terminate());
  const player = (await f.request('/api/players', { name: 'Live Player' })).body.player;
  await f.request('/api/night/game', { gameId: 'clue' });
  const op = { playerId: player.id, gameId: 'clue', requestId: randomUUID() };
  const win = (await f.request('/api/wins', op)).body.win;
  await f.request('/api/wins', op);
  await f.request(`/api/wins/${win.id}/undo`, {});
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(events.filter((event) => event.type === 'celebration').length, 1);
  assert.equal(events.find((event) => event.type === 'celebration').win.id, win.id);
  assert.ok(events.some((event) => event.type === 'undo' && event.winId === win.id));
  assert.ok(
    events
      .filter((event) => event.type === 'changed')
      .every((event) => Object.keys(event).length === 1),
  );
  const fresh = new WebSocket(f.base.replace('http:', 'ws:') + '/ws', { origin: f.base });
  await once(fresh, 'open');
  const freshEvents = [];
  fresh.on('message', (value) => freshEvents.push(JSON.parse(value)));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(freshEvents, []);
  fresh.terminate();
  const hostile = new WebSocket(f.base.replace('http:', 'ws:') + '/ws', {
    origin: 'https://malicious.example',
  });
  const [error] = await once(hostile, 'error');
  assert.match(error.message, /403/);
});

test('parallel requests: idempotent wins and independent joins do not lose data', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const player = (await f.request('/api/players', { name: 'Concurrent' })).body.player;
  await f.request('/api/night/game', { gameId: 'challengers' });
  const op = { playerId: player.id, gameId: 'challengers', requestId: randomUUID() };
  const wins = await Promise.all(Array.from({ length: 6 }, () => f.request('/api/wins', op)));
  assert.equal(new Set(wins.map((response) => response.body.win.id)).size, 1);
  assert.equal((await f.request('/api/state')).body.players[0].totalWins, 1);
  const code = (await f.request('/api/state')).body.night.code;
  const joins = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      f.request(
        `/api/join/${code}`,
        { name: `Guest ${i}`, requestId: randomUUID() },
        { admin: false },
      ),
    ),
  );
  assert.ok(joins.every((response) => response.status === 201));
  assert.equal((await f.request('/api/joins')).body.requests.length, 8);
});

test('public boundary: every privileged mutation is guarded and snapshots omit credentials and pending names', async (t) => {
  const f = await fixture(t);
  await f.setup();
  const code = (await f.request('/api/state')).body.night.code;
  const pending = (
    await f.request(
      `/api/join/${code}`,
      { name: 'Private Pending Name', requestId: randomUUID() },
      { admin: false },
    )
  ).body.request;
  for (const [method, url] of [
    ['POST', '/api/admins'],
    ['POST', '/api/players'],
    ['PATCH', '/api/players/nonexistent'],
    ['POST', '/api/players/nonexistent/attendance'],
    ['POST', '/api/night/game'],
    ['POST', '/api/night/new'],
    ['POST', '/api/night/leader'],
    ['POST', '/api/wins'],
    ['POST', '/api/wins/nonexistent/undo'],
    ['PATCH', '/api/settings'],
    ['POST', '/api/games'],
    ['PATCH', '/api/games/nonexistent'],
    ['POST', `/api/joins/${pending.id}/resolve`],
    ['POST', '/api/sounds'],
    ['DELETE', '/api/sounds/nonexistent'],
  ]) {
    assert.equal(
      (await f.request(url, {}, { method, admin: false })).status,
      401,
      `${method} ${url}`,
    );
  }
  const state = (await f.request('/api/state', undefined, { admin: false })).body;
  const serialized = JSON.stringify(state);
  for (const secret of [
    'password_hash',
    'token_hash',
    'test-setup-secret',
    pending.token,
    'Private Pending Name',
    'a-strong-local-password',
  ]) {
    assert.equal(serialized.includes(secret), false, `public snapshot should omit ${secret}`);
  }
  assert.equal((await f.request('/api/auth/me', undefined, { admin: false })).body.admin, null);
  assert.equal((await f.request('/api/history', undefined, { admin: false })).status, 401);
  const qr = await f.request('/api/qr', undefined, { admin: false });
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(qr.body, /^<svg/);
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${f.base}/api/state`,
      { headers: { Host: 'rebinding.invalid' } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on('error', reject);
    request.end();
  });
  assert.equal(invalidHostStatus, 403);
});

test('shutdown: abandoned request bodies cannot hold the database open past the grace period', async (t) => {
  const f = await fixture(t, { shutdownGraceMs: 75 });
  const socket = connect(f.application.server.address().port, '127.0.0.1');
  socket.on('error', () => {});
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const received = once(f.application.server, 'request');
  socket.write(
    `POST /api/auth/login HTTP/1.1\r\nHost: ${new URL(f.base).host}\r\nX-Victory-Request: 1\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{`,
  );
  await received;
  const started = Date.now();
  await f.application.close();
  assert.ok(Date.now() - started >= 60, 'allows the configured grace period');
  assert.ok(Date.now() - started < 1000, 'forces an abandoned connection closed');
  assert.throws(() => f.application.db.prepare('SELECT 1'), /not open/);
});

test('shutdown: an in-flight account save completes before the database closes', async (t) => {
  const f = await fixture(t, { shutdownGraceMs: 2000 });
  const received = once(f.application.server, 'request');
  const saving = f.setup();
  await received;
  const closing = f.application.close();
  assert.equal((await saving).status, 201);
  await closing;
  await f.restart();
  assert.equal((await f.request('/api/auth/me')).body.admin.username, 'Host');
});

test('abuse limits: setup attempts and public joins are throttled without trusting forwarded IP headers', async (t) => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await f.request(
      '/api/auth/setup',
      {
        username: 'Host',
        password: 'a-strong-local-password',
        setupCode: 'incorrect',
      },
      { headers: { 'X-Forwarded-For': `192.0.2.${attempt + 1}` } },
    );
    assert.equal(response.status, 403);
  }
  const blocked = await f.setup();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  const code = (await f.request('/api/state')).body.night.code;
  const operation = { name: 'A guest', requestId: randomUUID() };
  for (let attempt = 0; attempt < 30; attempt++) {
    assert.equal(
      (await f.request(`/api/join/${code}`, operation, { admin: false })).status,
      attempt === 0 ? 201 : 200,
    );
  }
  assert.equal((await f.request(`/api/join/${code}`, operation, { admin: false })).status, 429);
  assert.equal(
    f.application.db.prepare('SELECT COUNT(*) AS count FROM join_requests').get().count,
    1,
  );
});
