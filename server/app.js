import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { openDatabase, resolveDataDir, projectRoot, transaction, newNight } from './db.js';
import { getNight, getSettings, getPlayers, getGames, getWin, getHistory, getState } from './state.js';
import { fail, textValue, nameKey, booleanValue, requestKey, credentials, validateGame, similarity } from './validation.js';
import { lanAddresses, networkPolicy, validatePublicUrl, sessionMiddleware, requireAdmin, createSession, secretToken, equalSecret, rateLimit } from './security.js';
import { createSoundRouter, createMediaRouter } from './sounds.js';

export function createApplication({ dataDir = resolveDataDir(), port = 3000, host = '0.0.0.0', publicUrl, setupCode = secretToken().slice(0, 16) } = {}) {
  publicUrl = validatePublicUrl(publicUrl);
  const db = openDatabase(dataDir);
  const app = express();
  const server = createServer(app);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const policy = networkPolicy(publicUrl);
  const lanHost = lanAddresses()[0]?.address ?? '127.0.0.1';
  const getLanUrl = () => publicUrl ?? `http://${lanHost}:${server.address()?.port ?? port}`;
  const broadcast = (event = { type: 'changed' }) => {
    const payload = JSON.stringify(event);
    for (const client of sockets.clients) {
      if (client.readyState === WebSocket.OPEN) {
        if (client.bufferedAmount > 1024 * 1024) client.terminate();
        else client.send(payload);
      }
    }
  };
  const changed = () => broadcast({ type: 'changed' });
  const setupRequired = () => !db.prepare('SELECT id FROM admins LIMIT 1').get();
  const objectBody = (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return next(Object.assign(new Error('Send a JSON object.'), { status: 400 }));
    next();
  };
  const playerById = id => {
    if (typeof id !== 'string') fail(400, 'Choose a player.');
    const player = db.prepare('SELECT * FROM players WHERE id=?').get(id);
    if (!player) fail(404, 'That player was not found.');
    return player;
  };
  const activePlayer = id => {
    const player = playerById(id);
    if (player.archived || !db.prepare('SELECT 1 FROM attendance WHERE night_id=? AND player_id=? AND active=1').get(getNight(db).id, id)) {
      fail(409, 'Add this player to tonight before continuing.');
    }
    return player;
  };
  const saveAttendance = (playerId, active) => db.prepare(`INSERT INTO attendance(night_id,player_id,active) VALUES (?,?,?)
    ON CONFLICT(night_id,player_id) DO UPDATE SET active=excluded.active`).run(getNight(db).id, playerId, Number(active));
  const addPlayer = name => {
    const id = randomUUID();
    db.prepare('INSERT INTO players(id,name,name_key,created_at) VALUES (?,?,?,?)').run(id, name, nameKey(name), new Date().toISOString());
    saveAttendance(id, true);
    return id;
  };
  const matchPlayers = name => getPlayers(db).map(player => ({ id: player.id, name: player.name, totalWins: player.totalWins, similarity: similarity(name, player.name) }))
    .filter(player => player.similarity >= 0.66).sort((a, b) => b.similarity - a.similarity || b.totalWins - a.totalWins).slice(0, 5);

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'connect-src': ["'self'", 'ws:', 'wss:'], 'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'blob:'], 'upgrade-insecure-requests': null } },
    strictTransportSecurity: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  }));
  app.use((req, res, next) => {
    if (!policy.validHost(req)) return res.status(403).json({ error: 'Use the local address printed by Victory Club.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-Victory-Request') !== '1' || !policy.validOrigin(req))) {
      return res.status(403).json({ error: 'This request must come from Victory Club.' });
    }
    next();
  });
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '24kb' }));
  app.use(sessionMiddleware(db));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/state', (req, res) => res.json(getState(db, getLanUrl())));
  app.get('/api/auth/me', (req, res) => res.json({ admin: req.admin, setupRequired: setupRequired() }));
  const authLimit = rateLimit({ max: 20, windowMs: 10 * 60 * 1000 });
  app.post('/api/auth/setup', authLimit, objectBody, async (req, res) => {
    if (!setupRequired()) fail(409, 'The first host is already set up. Log in instead.');
    if (!equalSecret(req.body.setupCode, setupCode)) fail(403, 'Check the setup code in the server window.');
    const input = credentials(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const admin = transaction(db, () => {
      if (!setupRequired()) fail(409, 'The first host is already set up. Log in instead.');
      const admin = { id: randomUUID(), username: input.username };
      db.prepare('INSERT INTO admins(id,username,username_key,password_hash,created_at) VALUES (?,?,?,?,?)').run(admin.id, admin.username, input.usernameKey, hash, new Date().toISOString());
      createSession(db, req, res, admin);
      return admin;
    });
    changed();
    res.status(201).json({ admin });
  });
  app.post('/api/auth/login', authLimit, objectBody, async (req, res) => {
    const input = credentials(req.body);
    const row = db.prepare('SELECT * FROM admins WHERE username_key=?').get(input.usernameKey);
    // Always perform a full bcrypt comparison, including unknown usernames.
    const hash = row?.password_hash ?? '$2b$12$5rL8gn5cqFbOCW1KeflMpu9gPJCjTYBK7jnazCbDvezjGeLYyoaMm';
    if (!await bcrypt.compare(input.password, hash) || !row) fail(401, 'Username or password is incorrect.');
    const admin = { id: row.id, username: row.username };
    createSession(db, req, res, admin);
    res.json({ admin });
  });
  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
    res.clearCookie('victory_session', { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/admins', requireAdmin, (req, res) => res.json({ admins: db.prepare('SELECT id,username,created_at AS createdAt FROM admins ORDER BY created_at').all() }));
  app.post('/api/admins', requireAdmin, authLimit, objectBody, async (req, res) => {
    const input = credentials(req.body);
    if (db.prepare('SELECT id FROM admins WHERE username_key=?').get(input.usernameKey)) fail(409, 'That username is already taken.');
    const hash = await bcrypt.hash(input.password, 12);
    if (db.prepare('SELECT id FROM admins WHERE username_key=?').get(input.usernameKey)) fail(409, 'That username is already taken.');
    const admin = { id: randomUUID(), username: input.username };
    db.prepare('INSERT INTO admins(id,username,username_key,password_hash,created_at) VALUES (?,?,?,?,?)').run(admin.id, admin.username, input.usernameKey, hash, new Date().toISOString());
    res.status(201).json({ admin });
  });
  app.post('/api/players', requireAdmin, objectBody, (req, res) => {
    const name = textValue(req.body.name, 'Player name');
    const id = transaction(db, () => addPlayer(name));
    changed();
    res.status(201).json({ player: getPlayers(db).find(player => player.id === id) });
  });
  app.patch('/api/players/:id', requireAdmin, objectBody, (req, res) => {
    const player = playerById(req.params.id);
    const name = req.body.name === undefined ? player.name : textValue(req.body.name, 'Player name');
    const archived = req.body.archived === undefined ? Boolean(player.archived) : booleanValue(req.body.archived, 'Archived');
    transaction(db, () => {
      db.prepare('UPDATE players SET name=?,name_key=?,archived=? WHERE id=?').run(name, nameKey(name), Number(archived), player.id);
      if (archived) {
        saveAttendance(player.id, false);
        db.prepare('UPDATE nights SET leader_id=NULL WHERE ended_at IS NULL AND leader_id=?').run(player.id);
      }
    });
    changed();
    res.json({ player: getPlayers(db).find(p => p.id === player.id) });
  });
  app.post('/api/players/:id/attendance', requireAdmin, objectBody, (req, res) => {
    const player = playerById(req.params.id);
    const active = booleanValue(req.body.active, 'Playing tonight');
    if (player.archived && active) fail(409, 'Restore this player before adding them to tonight.');
    transaction(db, () => {
      saveAttendance(player.id, active);
      if (!active) db.prepare('UPDATE nights SET leader_id=NULL WHERE ended_at IS NULL AND leader_id=?').run(player.id);
    });
    changed();
    res.json({ ok: true });
  });
  app.post('/api/night/game', requireAdmin, objectBody, (req, res) => {
    const gameId = req.body.gameId;
    if (gameId !== null && (typeof gameId !== 'string' || !db.prepare('SELECT id FROM games WHERE id=? AND archived=0').get(gameId))) fail(400, 'Choose an available game.');
    db.prepare('UPDATE nights SET game_id=?,leader_id=NULL WHERE ended_at IS NULL').run(gameId);
    changed();
    res.json({ ok: true });
  });
  app.post('/api/night/new', requireAdmin, (req, res) => {
    transaction(db, () => newNight(db));
    changed();
    res.json({ ok: true });
  });
  app.post('/api/night/leader', requireAdmin, objectBody, (req, res) => {
    if (!getSettings(db).currentlyWinning) fail(409, 'Turn on the currently-winning setting first.');
    if (req.body.playerId !== null) activePlayer(req.body.playerId);
    db.prepare('UPDATE nights SET leader_id=? WHERE ended_at IS NULL').run(req.body.playerId);
    changed();
    res.json({ ok: true });
  });
  app.post('/api/wins', requireAdmin, objectBody, (req, res) => {
    const requestId = requestKey(req.body.requestId);
    const existing = db.prepare('SELECT * FROM wins WHERE request_id=?').get(requestId);
    if (existing) {
      if (existing.player_id !== req.body.playerId || existing.game_id !== req.body.gameId) fail(409, 'This request ID was already used for another win.');
      return res.json({ win: getWin(db, existing.id) });
    }
    const night = getNight(db);
    if (!night.gameId || req.body.gameId !== night.gameId) fail(409, 'Choose the current game before logging a win.');
    activePlayer(req.body.playerId);
    const id = randomUUID();
    transaction(db, () => {
      db.prepare('INSERT INTO wins(id,player_id,game_id,night_id,admin_id,request_id,created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, req.body.playerId, night.gameId, night.id, req.admin.id, requestId, new Date().toISOString());
      db.prepare('UPDATE players SET total_wins=total_wins+1 WHERE id=?').run(req.body.playerId);
      db.prepare('UPDATE nights SET leader_id=NULL WHERE id=?').run(night.id);
    });
    const win = getWin(db, id);
    changed();
    broadcast({ type: 'celebration', win, soundId: getSettings(db).soundId, duration: 10 });
    res.status(201).json({ win });
  });
  app.post('/api/wins/:id/undo', requireAdmin, (req, res) => {
    const win = getWin(db, req.params.id);
    if (!win) fail(404, 'That win was not found.');
    if (!win.reversedAt) {
      transaction(db, () => {
        db.prepare('UPDATE wins SET reversed_at=? WHERE id=?').run(new Date().toISOString(), win.id);
        db.prepare('UPDATE players SET total_wins=total_wins-1 WHERE id=?').run(win.playerId);
      });
      changed();
      broadcast({ type: 'undo', winId: win.id });
    }
    res.json({ ok: true });
  });
  app.get('/api/history', requireAdmin, (req, res) => {
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) fail(400, 'Choose a limit from 1–200 and a nonnegative offset.');
    res.json({ wins: getHistory(db, limit, offset), total: db.prepare('SELECT COUNT(*) AS total FROM wins').get().total });
  });
  app.patch('/api/settings', requireAdmin, objectBody, (req, res) => {
    const update = {};
    if (req.body.currentlyWinning !== undefined) update.currentlyWinning = booleanValue(req.body.currentlyWinning, 'Currently winning');
    if (req.body.soundId !== undefined) {
      if (typeof req.body.soundId !== 'string' || (req.body.soundId !== 'default' && !db.prepare('SELECT id FROM sounds WHERE id=?').get(req.body.soundId))) fail(400, 'Choose an available sound.');
      update.soundId = req.body.soundId;
    }
    transaction(db, () => {
      for (const [key, value] of Object.entries(update)) db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(value), key);
      if (update.currentlyWinning === false) db.prepare('UPDATE nights SET leader_id=NULL WHERE ended_at IS NULL').run();
    });
    changed();
    res.json({ settings: getSettings(db) });
  });
  function saveGame(game, isNew) {
    if (isNew) db.prepare('INSERT INTO games(id,name,theme_key,tagline,motif,palette,archived) VALUES (?,?,?,?,?,?,?)')
      .run(game.id, game.name, game.themeKey, game.tagline, game.motif, JSON.stringify(game.palette), Number(game.archived));
    else db.prepare('UPDATE games SET name=?,theme_key=?,tagline=?,motif=?,palette=?,archived=? WHERE id=?')
      .run(game.name, game.themeKey, game.tagline, game.motif, JSON.stringify(game.palette), Number(game.archived), game.id);
    if (game.archived) db.prepare('UPDATE nights SET game_id=NULL,leader_id=NULL WHERE ended_at IS NULL AND game_id=?').run(game.id);
  }
  app.post('/api/games', requireAdmin, objectBody, (req, res) => {
    const game = validateGame(req.body);
    if (db.prepare('SELECT id FROM games WHERE id=?').get(game.id)) fail(409, 'That game ID already exists.');
    transaction(db, () => saveGame(game, true));
    changed();
    res.status(201).json({ game });
  });
  app.patch('/api/games/:id', requireAdmin, objectBody, (req, res) => {
    const existing = getGames(db).find(game => game.id === req.params.id);
    if (!existing) fail(404, 'That game was not found.');
    const game = validateGame({ ...req.body, id: existing.id }, existing);
    transaction(db, () => saveGame(game, false));
    changed();
    res.json({ game });
  });
  function joinNight(code) {
    const night = getNight(db);
    if (night.code !== code.toUpperCase()) fail(404, 'This invitation has ended. Scan the latest code on the host screen.');
    return night;
  }
  app.get('/api/join/:code', (req, res) => {
    const night = joinNight(req.params.code);
    res.json({ valid: true, code: night.code, gameName: night.gameId ? db.prepare('SELECT name FROM games WHERE id=?').get(night.gameId).name : null });
  });
  app.post('/api/join/:code', rateLimit({ max: 30, windowMs: 60 * 1000 }), objectBody, (req, res) => {
    const night = joinNight(req.params.code);
    const name = textValue(req.body.name, 'Your name');
    const requestId = requestKey(req.body.requestId);
    const existing = db.prepare('SELECT id,name,status,token FROM join_requests WHERE night_id=? AND request_id=?').get(night.id, requestId);
    if (existing) {
      if (existing.name !== name) fail(409, 'This request ID was already used for another name.');
      return res.json({ request: existing });
    }
    const request = { id: randomUUID(), name, status: 'pending', token: secretToken() };
    db.prepare('INSERT INTO join_requests(id,night_id,name,request_id,token,created_at) VALUES (?,?,?,?,?,?)')
      .run(request.id, night.id, name, requestId, request.token, new Date().toISOString());
    changed();
    res.status(201).json({ request });
  });
  app.get('/api/join-status/:id', (req, res) => {
    const request = db.prepare('SELECT id,name,status,token FROM join_requests WHERE id=?').get(req.params.id);
    if (!request || !equalSecret(req.query.token, request.token)) fail(404, 'That join request was not found.');
    res.json({ request: { id: request.id, name: request.name, status: request.status } });
  });
  app.get('/api/joins', requireAdmin, (req, res) => {
    const requests = db.prepare("SELECT id,name,status,created_at AS createdAt FROM join_requests WHERE night_id=? AND status='pending' ORDER BY created_at")
      .all(getNight(db).id).map(request => ({ ...request, matches: matchPlayers(request.name) }));
    res.json({ requests });
  });
  app.post('/api/joins/:id/resolve', requireAdmin, objectBody, (req, res) => {
    if (!['approve', 'deny'].includes(req.body.action)) fail(400, 'Choose approve or deny.');
    const request = db.prepare('SELECT * FROM join_requests WHERE id=?').get(req.params.id);
    if (!request || request.night_id !== getNight(db).id) fail(404, 'This invitation has ended.');
    const desired = req.body.action === 'approve' ? 'approved' : 'denied';
    if (request.status === desired) return res.json({ ok: true });
    if (request.status !== 'pending') fail(409, 'This request was already resolved.');
    let playerId = null;
    if (desired === 'approved') {
      if (req.body.playerId !== undefined) playerId = playerById(req.body.playerId).id;
      else if (matchPlayers(request.name).length && req.body.createNew !== true) fail(409, 'Choose the matching player or explicitly create a new player.');
    }
    transaction(db, () => {
      if (desired === 'approved') {
        if (!playerId) playerId = addPlayer(request.name);
        else {
          db.prepare('UPDATE players SET archived=0 WHERE id=?').run(playerId);
          saveAttendance(playerId, true);
        }
      }
      db.prepare('UPDATE join_requests SET status=?,player_id=? WHERE id=?').run(desired, playerId, request.id);
    });
    changed();
    res.json({ ok: true });
  });
  app.get('/api/qr', async (req, res) => {
    const svg = await QRCode.toString(`${getLanUrl()}/join/${getNight(db).code}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#211C36', light: '#FFFFFF' } });
    res.type('image/svg+xml').send(svg);
  });
  app.use('/api/sounds', createSoundRouter({ db, dataDir, requireAdmin, broadcast }));
  app.use('/media', createMediaRouter({ db, dataDir }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'This action was not found.' }));
  const distDir = path.join(projectRoot, 'dist');
  app.use(express.static(distDir, { index: false, dotfiles: 'deny', maxAge: '1h' }));
  app.get('/{*path}', (req, res) => {
    if (existsSync(path.join(distDir, 'index.html'))) res.set('Cache-Control', 'no-cache').sendFile(path.join(distDir, 'index.html'));
    else res.status(503).type('text').send('Victory Club is not built yet. Run npm run build, then reload.');
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : error.status >= 400 && error.status <= 499 ? error.status : 500;
    if (status === 500) console.error('Victory Club request failed:', error.message);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : error.type === 'entity.parse.failed' ? 'The request contains invalid JSON.' : error.message });
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || !req.headers.origin || !policy.validHost(req) || !policy.validOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    sockets.handleUpgrade(req, socket, head, client => sockets.emit('connection', client, req));
  });
  sockets.on('connection', client => {
    client.alive = true;
    client.on('pong', () => { client.alive = true; });
    client.on('error', () => client.terminate());
  });
  const heartbeat = setInterval(() => {
    for (const client of sockets.clients) {
      if (!client.alive) client.terminate();
      else { client.alive = false; client.ping(); }
    }
  }, 30000);
  heartbeat.unref();
  let closing;
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(heartbeat);
      for (const client of sockets.clients) client.terminate();
      await new Promise(resolve => sockets.close(resolve));
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      db.close();
    })();
    return closing;
  }
  return { app, server, db, broadcast, close, setupCode, getLanUrl, host };
}
