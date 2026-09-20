import { Router, raw } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

/** Accept only the bounded PCM format produced by the local trim editor. */
export function inspectWave(buffer) {
  const invalid = () =>
    Object.assign(new Error('Choose an audio file and save a clip between 0.25 and 10 seconds.'), {
      status: 400,
    });
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > 4 * 1024 * 1024)
    throw invalid();
  if (
    buffer.toString('latin1', 0, 4) !== 'RIFF' ||
    buffer.toString('latin1', 8, 12) !== 'WAVE' ||
    buffer.toString('latin1', 12, 16) !== 'fmt ' ||
    buffer.toString('latin1', 36, 40) !== 'data'
  )
    throw invalid();
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const length = buffer.readUInt32LE(40);
  const blockAlign = channels * 2;
  if (
    buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 ||
    ![1, 2].includes(channels) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    buffer.readUInt16LE(34) !== 16 ||
    buffer.readUInt16LE(32) !== blockAlign ||
    buffer.readUInt32LE(28) !== sampleRate * blockAlign ||
    length !== buffer.length - 44 ||
    length % blockAlign !== 0
  )
    throw invalid();
  const duration = length / (sampleRate * blockAlign);
  if (duration < 0.249 || duration > 10.001) throw invalid();
  return { duration, channels, sampleRate };
}

function soundJson(row) {
  return { id: row.id, name: row.name, duration: row.duration, url: `/media/${row.id}.wav` };
}

export function createSoundRouter({ db, dataDir, requireAdmin, broadcast }) {
  const router = Router();
  const directory = resolve(dataDir, 'sounds');
  router.use(requireAdmin);
  router.get('/', (_req, res) =>
    res.json({
      sounds: db.prepare('SELECT * FROM sounds ORDER BY created_at DESC').all().map(soundJson),
    }),
  );
  router.post('/', raw({ type: 'audio/wav', limit: '4mb' }), async (req, res) => {
    const { duration } = inspectWave(req.body);
    let name;
    try {
      name = decodeURIComponent(req.get('X-Clip-Name') || '')
        .trim()
        .replace(/\s+/g, ' ');
    } catch {
      throw Object.assign(new Error('Give your clip a valid name.'), { status: 400 });
    }
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw Object.assign(new Error('Name your clip using 1 to 60 characters.'), { status: 400 });
    }
    await mkdir(directory, { recursive: true });
    const id = randomUUID();
    const filename = `${id}.wav`;
    const path = join(directory, filename);
    try {
      await writeFile(path, req.body, { flag: 'wx', mode: 0o600 });
      db.prepare(
        'INSERT INTO sounds (id,name,duration,filename,created_at) VALUES (?,?,?,?,?)',
      ).run(id, name, duration, filename, new Date().toISOString());
    } catch (error) {
      if (error.code !== 'EEXIST') await unlink(path).catch(() => {});
      throw error;
    }
    broadcast({ type: 'changed' });
    res.status(201).json({ sound: soundJson({ id, name, duration }) });
  });
  router.delete('/:id', async (req, res) => {
    const row = db.prepare('SELECT * FROM sounds WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'That sound has already been removed.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM sounds WHERE id = ?').run(row.id);
      const selected = db.prepare("SELECT value FROM settings WHERE key='soundId'").get();
      if (selected && JSON.parse(selected.value) === row.id) {
        db.prepare("UPDATE settings SET value=? WHERE key='soundId'").run(
          JSON.stringify('default'),
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    // A failed cleanup leaves only an unreachable file; never roll back the visible state.
    if (row.filename === `${row.id}.wav`)
      await unlink(join(directory, row.filename)).catch(() => {});
    broadcast({ type: 'changed' });
    res.json({ ok: true });
  });
  return router;
}

export function createMediaRouter({ db, dataDir }) {
  const router = Router();
  router.get('/:filename', (req, res, next) => {
    if (!/^[a-f0-9-]{36}\.wav$/.test(req.params.filename)) return res.sendStatus(404);
    const row = db
      .prepare('SELECT filename FROM sounds WHERE filename = ?')
      .get(req.params.filename);
    if (!row) return res.sendStatus(404);
    res.type('audio/wav');
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(resolve(dataDir, 'sounds', row.filename), (error) => {
      if (error)
        next(Object.assign(new Error('That sound is no longer available.'), { status: 404 }));
    });
  });
  return router;
}
