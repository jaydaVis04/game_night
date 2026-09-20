export function getNight(db) {
  return db.prepare('SELECT id,code,started_at AS startedAt,game_id AS gameId,leader_id AS leaderId FROM nights WHERE ended_at IS NULL').get();
}

export function getSettings(db) {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(row => [row.key, JSON.parse(row.value)]));
}

export function getPlayers(db) {
  const night = getNight(db);
  const rows = db.prepare(`SELECT p.id,p.name,p.total_wins AS totalWins,p.archived,p.created_at AS createdAt,
    CASE WHEN p.archived=0 THEN COALESCE(a.active,0) ELSE 0 END AS active,
    COALESCE(w.tonightWins,0) AS tonightWins
    FROM players p LEFT JOIN attendance a ON a.player_id=p.id AND a.night_id=?
    LEFT JOIN (SELECT player_id,COUNT(*) AS tonightWins FROM wins WHERE night_id=? AND reversed_at IS NULL GROUP BY player_id) w ON w.player_id=p.id
    ORDER BY p.archived,p.total_wins DESC,p.name COLLATE NOCASE,p.id`).all(night.id, night.id);
  let lastWins = null;
  let rank = 0;
  let place = 0;
  return rows.map(row => {
    if (!row.archived) {
      place++;
      if (row.totalWins !== lastWins) rank = place;
      lastWins = row.totalWins;
    }
    return { ...row, active: Boolean(row.active), archived: Boolean(row.archived), rank: row.archived ? null : rank };
  });
}

export function getGames(db) {
  return db.prepare('SELECT id,name,theme_key AS themeKey,tagline,motif,palette,archived FROM games ORDER BY rowid').all()
    .map(row => ({ ...row, palette: JSON.parse(row.palette), archived: Boolean(row.archived) }));
}

export function getWin(db, id) {
  return db.prepare(`SELECT w.id,w.player_id AS playerId,p.name AS playerName,w.game_id AS gameId,g.name AS gameName,
    w.created_at AS createdAt,w.reversed_at AS reversedAt FROM wins w JOIN players p ON p.id=w.player_id
    JOIN games g ON g.id=w.game_id WHERE w.id=?`).get(id);
}

export function getHistory(db, limit = 100, offset = 0) {
  return db.prepare(`SELECT w.id,w.player_id AS playerId,p.name AS playerName,w.game_id AS gameId,g.name AS gameName,
    w.created_at AS createdAt,w.reversed_at AS reversedAt FROM wins w JOIN players p ON p.id=w.player_id
    JOIN games g ON g.id=w.game_id ORDER BY w.created_at DESC,w.rowid DESC LIMIT ? OFFSET ?`).all(limit, offset);
}

export function getState(db, lanUrl) {
  const night = getNight(db);
  return {
    players: getPlayers(db), games: getGames(db), night, settings: getSettings(db),
    sounds: db.prepare('SELECT id,name,duration FROM sounds ORDER BY created_at DESC').all().map(sound => ({ ...sound, url: `/media/${sound.id}.wav` })),
    recentWins: getHistory(db, 12), lanUrl, joinUrl: `${lanUrl}/join/${night.code}`,
    setupRequired: !db.prepare('SELECT id FROM admins LIMIT 1').get(),
  };
}
