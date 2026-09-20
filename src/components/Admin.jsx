import { useEffect, useState } from 'react';
import { api, friendlyDate } from '../api.js';
import Icon from './Icons.jsx';
import { Avatar, EmptyState, Field, FormError, Modal, Toggle } from './Primitives.jsx';
import { ConfirmDialog, paletteStyle } from './Dialogs.jsx';
import { GameArt } from './Artwork.jsx';
import Soundboard from './Soundboard.jsx';

export default function Admin({ state, admin, onChange, onNotice, onLogout, onUndo }) {
  const [tab, setTab] = useState('settings');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  async function change(path, body, method = 'PATCH', message = 'Saved.') {
    setBusy(true);
    try {
      await api(path, { method, body });
      await onChange();
      onNotice(message);
    } catch (err) {
      onNotice(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-page">
      <div className="page-heading">
        <h1>
          A well-run
          <br />
          game night.
        </h1>
        <p>Welcome, {admin.username}. A few things behind the scenes.</p>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Host settings">
        {[
          ['settings', 'Settings'],
          ['players', 'Players'],
          ['games', 'Games & themes'],
          ['history', 'Win history'],
          ['accounts', 'Host accounts'],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            id={`tab-${key}`}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="admin-panel"
      >
        {tab === 'settings' ? (
          <div className="settings-layout">
            <div>
              <section className="settings-section">
                <h2>At the table</h2>
                <Toggle
                  checked={state.settings.currentlyWinning}
                  onChange={(value) => change('/settings', { currentlyWinning: value })}
                  label="Show who’s currently winning"
                  description="Tap a player’s name to mark the leader during a game. You update this by hand."
                  disabled={busy}
                />
                <div className="setting-information">
                  <Icon name="sparkle" />
                  <p>
                    Wins get a 10-second celebration. Sound is enabled separately on each screen.
                  </p>
                </div>
              </section>
              <section className="settings-section">
                <h2>A fresh night</h2>
                <p>
                  Clear tonight’s players and give everyone a new join code. All players and
                  lifetime wins stay in the club.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setDialog({ kind: 'new-night' })}
                >
                  Start a new night
                </button>
              </section>
              <section className="settings-section">
                <h2>Your local club</h2>
                <p>Phones and shared screens use this address while connected to the same Wi-Fi.</p>
                <label className="field">
                  <span>Server address</span>
                  <input
                    aria-label="Server address"
                    readOnly
                    value={state.lanUrl}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <button className="text-button" onClick={onLogout}>
                  <Icon name="logout" size={18} />
                  Sign out of {admin.username}
                </button>
              </section>
            </div>
            <section className="settings-section soundboard-section">
              <h2>The sound of winning</h2>
              <p>Give your victories their own soundtrack.</p>
              <Soundboard
                sounds={state.sounds}
                selectedSoundId={state.settings.soundId}
                onChange={onChange}
                onNotice={onNotice}
              />
            </section>
          </div>
        ) : null}
        {tab === 'players' ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Your people</h2>
                <p>Rename players or archive them. Their win history stays safe.</p>
              </div>
            </div>
            {state.players.length === 0 ? (
              <EmptyState title="An open invitation.">
                Add your first player from the table.
              </EmptyState>
            ) : (
              <div className="management-list">
                {state.players.map((player) => (
                  <div
                    className={`management-row ${player.archived ? 'archived' : ''}`}
                    key={player.id}
                  >
                    <Avatar name={player.name} />
                    <div className="management-copy">
                      <strong>{player.name}</strong>
                      <span>
                        {player.totalWins} lifetime wins{player.archived ? ' · Archived' : ''}
                      </span>
                    </div>
                    <button
                      className="button small secondary"
                      onClick={() => setDialog({ kind: 'player', player })}
                    >
                      Edit<span className="sr-only"> {player.name}</span>
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        player.archived
                          ? change(
                              `/players/${player.id}`,
                              { archived: false },
                              'PATCH',
                              'Player restored.',
                            )
                          : setDialog({ kind: 'archive-player', player })
                      }
                    >
                      {player.archived ? 'Restore' : 'Archive'}
                      <span className="sr-only"> {player.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
        {tab === 'games' ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Make it your game</h2>
                <p>Every game gets its own colors, motif, and mood.</p>
              </div>
              <button
                className="button primary"
                onClick={() => setDialog({ kind: 'game', game: null })}
              >
                <Icon name="plus" />
                Add game
              </button>
            </div>
            <div className="admin-game-grid">
              {state.games.map((game) => (
                <article className="admin-game" key={game.id}>
                  <div
                    className={`admin-game-preview theme-${game.themeKey}`}
                    style={paletteStyle(game.palette)}
                  >
                    <GameArt motif={game.motif} compact />
                  </div>
                  <div className="admin-game-copy">
                    <h3>{game.name}</h3>
                    <p>{game.archived ? 'Archived' : game.tagline}</p>
                    <div>
                      <button
                        className="button small secondary"
                        onClick={() => setDialog({ kind: 'game', game })}
                      >
                        Edit theme<span className="sr-only"> for {game.name}</span>
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          game.archived
                            ? change(
                                `/games/${game.id}`,
                                { archived: false },
                                'PATCH',
                                'Game restored.',
                              )
                            : setDialog({ kind: 'archive-game', game })
                        }
                      >
                        {game.archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
        {tab === 'history' ? <History refreshKey={state.recentWins} onUndo={onUndo} /> : null}
        {tab === 'accounts' ? <Accounts /> : null}
      </div>
      {dialog?.kind === 'new-night' ? (
        <ConfirmDialog
          title="A fresh table?"
          description="Tonight’s attendance, leader, and join requests will reset. All lifetime wins are kept. Share the new QR code with your players."
          action="Start new night"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api('/night/new', { method: 'POST', body: {} });
            await onChange();
            onNotice('A new night is ready.');
          }}
        />
      ) : null}
      {dialog?.kind === 'player' ? (
        <EditPlayer player={dialog.player} onClose={() => setDialog(null)} onChange={onChange} />
      ) : null}
      {dialog?.kind === 'game' ? (
        <GameEditor game={dialog.game} onClose={() => setDialog(null)} onChange={onChange} />
      ) : null}
      {dialog?.kind === 'archive-player' ? (
        <ConfirmDialog
          title={`Archive ${dialog.player.name}?`}
          description="They will leave tonight’s table and the leaderboard. Their win history is kept, and you can restore them here any time."
          action="Archive player"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api(`/players/${dialog.player.id}`, {
              method: 'PATCH',
              body: { archived: true },
            });
            await onChange();
          }}
        />
      ) : null}
      {dialog?.kind === 'archive-game' ? (
        <ConfirmDialog
          title={`Archive ${dialog.game.name}?`}
          description="This game will leave the picker. Past wins are kept, and you can restore it here any time."
          action="Archive game"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api(`/games/${dialog.game.id}`, { method: 'PATCH', body: { archived: true } });
            await onChange();
          }}
        />
      ) : null}
    </section>
  );
}

function EditPlayer({ player, onClose, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/players/${player.id}`, {
        method: 'PATCH',
        body: { name: new FormData(event.currentTarget).get('name') },
      });
      await onChange();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal title="A familiar face. A new name." onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <Field
          label="Player name"
          name="name"
          defaultValue={player.name}
          maxLength={60}
          required
          autoFocus
        />
        <FormError>{error}</FormError>
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </Modal>
  );
}

const defaultPalette = {
  background: '#f5f3fb',
  surface: '#ffffff',
  text: '#211c36',
  muted: '#6a657b',
  accent: '#6654d9',
  accentText: '#ffffff',
  secondary: '#f5cd61',
};
const motifNames = {
  dice: 'Dice & property',
  tournament: 'Tournament energy',
  cards: 'Royal cards',
  suits: 'Poker chips',
  space: 'Outer space',
  spotlight: 'Noir spotlight',
  mystery: 'Mansion mystery',
};
function GameEditor({ game, onClose, onChange }) {
  const [palette, setPalette] = useState(game?.palette || defaultPalette);
  const [motif, setMotif] = useState(game?.motif || 'dice');
  const [themeKey, setThemeKey] = useState(game?.themeKey || 'classic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(game ? `/games/${game.id}` : '/games', {
        method: game ? 'PATCH' : 'POST',
        body: { name: data.name, tagline: data.tagline, motif, themeKey, palette },
      });
      await onChange();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={game ? `Make ${game.name} your own.` : 'There’s always room for another game.'}
      description="Choose a mood and keep the colors easy to read across the room."
      onClose={onClose}
      className="game-editor"
    >
      <form className="stack-form" onSubmit={submit}>
        <div className="form-two-column">
          <Field
            label="Game name"
            name="name"
            defaultValue={game?.name || ''}
            maxLength={60}
            required
            autoFocus
          />
          <Field
            label="A short description"
            name="tagline"
            defaultValue={game?.tagline || ''}
            maxLength={120}
            required
          />
        </div>
        <div className="form-two-column">
          <label className="field">
            <span>Motif</span>
            <select value={motif} onChange={(e) => setMotif(e.target.value)}>
              {Object.entries(motifNames).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Typography & atmosphere</span>
            <select value={themeKey} onChange={(e) => setThemeKey(e.target.value)}>
              {[
                'classic',
                'monopoly',
                'challengers',
                'coup',
                'poker',
                'among-us',
                'mafia',
                'clue',
              ].map((key) => (
                <option value={key} key={key}>
                  {key === 'among-us'
                    ? 'Space'
                    : key === 'mafia'
                      ? 'Noir'
                      : key.charAt(0).toUpperCase() + key.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="palette-fields">
          {Object.entries(palette).map(([key, value]) => (
            <label key={key} className="color-field">
              <input
                type="color"
                value={value}
                onChange={(e) => setPalette((current) => ({ ...current, [key]: e.target.value }))}
                aria-label={`${key} color`}
              />
              <span>
                {
                  {
                    background: 'Background',
                    surface: 'Cards',
                    text: 'Text',
                    muted: 'Secondary text',
                    accent: 'Accent',
                    accentText: 'Button text',
                    secondary: 'Decoration',
                  }[key]
                }
              </span>
            </label>
          ))}
        </div>
        <div className={`theme-preview theme-${themeKey}`} style={paletteStyle(palette)}>
          <GameArt motif={motif} compact />
          <div>
            <h3>Your game night</h3>
            <p>A preview of your theme colors.</p>
            <span className="button primary">Ready to play</span>
          </div>
        </div>
        <FormError>{error}</FormError>
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : game ? 'Save theme' : 'Add game'}
        </button>
      </form>
    </Modal>
  );
}

function History({ refreshKey, onUndo }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    let active = true;
    api(`/history?limit=30&offset=${offset}`)
      .then((value) => {
        if (active) {
          setData(value);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [offset, refreshKey]);
  async function undo(id) {
    setBusy(id);
    try {
      await onUndo(id);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>The night’s receipts</h2>
          <p>Every win, across every game. Mistakes are easy to undo.</p>
        </div>
      </div>
      <FormError>{error}</FormError>
      {!data ? (
        <p>Loading win history…</p>
      ) : data.wins.length === 0 ? (
        <EmptyState title="The stories start here." icon="trophy">
          Log your first win and it will appear here.
        </EmptyState>
      ) : (
        <>
          <div className="history-list">
            {data.wins.map((win) => (
              <div className={`history-row ${win.reversedAt ? 'reversed' : ''}`} key={win.id}>
                <span className="history-trophy">
                  <Icon name="trophy" />
                </span>
                <div className="management-copy">
                  <strong>{win.playerName}</strong>
                  <span>{win.gameName}</span>
                </div>
                <time dateTime={win.createdAt}>{friendlyDate(win.createdAt)}</time>
                {win.reversedAt ? (
                  <span className="reversed-label">Undone</span>
                ) : (
                  <button
                    className="button small secondary"
                    onClick={() => undo(win.id)}
                    disabled={busy === win.id}
                  >
                    <Icon name="undo" size={16} />
                    Undo<span className="sr-only"> {win.playerName}’s win</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="pagination">
            <button
              className="button secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 30, data.total)} of {data.total}
            </span>
            <button
              className="button secondary"
              disabled={offset + 30 >= data.total}
              onClick={() => setOffset(offset + 30)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Accounts() {
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    api('/admins')
      .then((data) => {
        if (active) setAdmins(data.admins);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await api('/admins', {
        method: 'POST',
        body: Object.fromEntries(new FormData(form)),
      });
      setAdmins((current) => [...current, result.admin]);
      form.reset();
      setSuccess(`${result.admin.username} can now host a game night.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="accounts-layout">
      <section>
        <h2>A little help hosting</h2>
        <p>Hosts can manage the whole club. Players don’t need an account.</p>
        <div className="management-list">
          {admins.map((account) => (
            <div className="management-row" key={account.id}>
              <Avatar name={account.username} />
              <div className="management-copy">
                <strong>{account.username}</strong>
                <span>Host account</span>
              </div>
              <Icon name="lock" />
            </div>
          ))}
        </div>
      </section>
      <form className="stack-form account-form" onSubmit={submit}>
        <h3>Add a host</h3>
        <Field
          label="Username"
          name="username"
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          minLength={10}
          maxLength={72}
          required
          autoComplete="new-password"
          hint="At least 10 characters."
        />
        <FormError>{error}</FormError>
        {success ? (
          <p className="success-message" role="status">
            {success}
          </p>
        ) : null}
        <button className="button primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create host account'}
        </button>
      </form>
    </div>
  );
}
