import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import { fail } from './validation.js';

const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const secretToken = () => randomBytes(32).toString('base64url');
export function equalSecret(actual, expected) {
  return typeof actual === 'string' && timingSafeEqual(createHash('sha256').update(actual).digest(), createHash('sha256').update(expected).digest());
}

export function lanAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, entries]) => entries
    .filter(entry => !entry.internal && entry.family === 'IPv4')
    .map(entry => ({ name, address: entry.address })))
    .sort((a, b) => Number(/^(utun|tun|docker|bridge|vbox|vmnet)/.test(a.name)) - Number(/^(utun|tun|docker|bridge|vbox|vmnet)/.test(b.name)));
}

export function networkPolicy(publicUrl) {
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]', hostname().toLowerCase(), `${hostname().toLowerCase()}.local`]);
  for (const entry of lanAddresses()) allowed.add(entry.address);
  if (publicUrl) allowed.add(new URL(publicUrl).hostname);
  function validHost(req) {
    try {
      const url = new URL(`http://${req.headers.host}`);
      return allowed.has(url.hostname.toLowerCase()) && !url.username && !url.password;
    } catch { return false; }
  }
  function validOrigin(req) {
    if (!req.headers.origin) return true; // CLI clients still need the explicit custom request header.
    try {
      const origin = new URL(req.headers.origin);
      return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host && !origin.username && !origin.password;
    } catch { return false; }
  }
  return { validHost, validOrigin };
}

export function sessionMiddleware(db) {
  return (req, res, next) => {
    req.admin = null;
    req.sessionHash = null;
    const token = (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('victory_session='))?.slice(16);
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      req.sessionHash = hashToken(token);
      req.admin = db.prepare(`SELECT a.id,a.username FROM sessions s JOIN admins a ON a.id=s.admin_id
        WHERE s.token_hash=? AND s.expires_at > ?`).get(req.sessionHash, new Date().toISOString()) ?? null;
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Log in as a host to do that.' });
  next();
}

export function createSession(db, req, res, admin) {
  const token = secretToken();
  const now = new Date();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions(token_hash,admin_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(hashToken(token), admin.id, now.toISOString(), new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString());
  res.cookie('victory_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_SECONDS * 1000, path: '/' });
}

export function rateLimit({ max, windowMs }) {
  const buckets = new Map();
  let nextPrune = Date.now() + windowMs;
  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextPrune) {
      for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
      nextPrune = now + windowMs;
    }
    const key = req.socket.remoteAddress ?? 'unknown';
    let value = buckets.get(key);
    if (!value || value.until <= now) {
      value = { count: 0, until: now + windowMs };
      buckets.set(key, value);
    }
    if (++value.count > max) {
      res.setHeader('Retry-After', Math.ceil((value.until - now) / 1000));
      return next(Object.assign(new Error('Too many attempts. Wait a moment and try again.'), { status: 429 }));
    }
    next();
  };
}

export function validatePublicUrl(value) {
  if (!value) return undefined;
  let url;
  try { url = new URL(value); } catch { fail(400, 'VICTORY_PUBLIC_URL must be a full HTTP address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail(400, 'VICTORY_PUBLIC_URL must be an HTTP origin without a path, credentials, or query.');
  }
  return url.origin;
}
