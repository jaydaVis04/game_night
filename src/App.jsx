import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, requestId } from './api.js';
import { useVictory } from './useVictory.js';
import { enableAudio, stopAudio } from './audio.js';
import Icon from './components/Icons.jsx';
import { Home } from './components/Home.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import {
  AddPlayerDialog,
  GamePicker,
  JoinDialog,
  LoginDialog,
  paletteStyle,
} from './components/Dialogs.jsx';
import JoinQueue from './components/JoinQueue.jsx';
import Celebration from './components/Celebration.jsx';

const Admin = lazy(() => import('./components/Admin.jsx'));
const validViews = new Set(['table', 'leaderboard', 'host']);

export default function App() {
  const [view, setView] = useState(() =>
    validViews.has(location.hash.slice(1)) ? location.hash.slice(1) : 'table',
  );
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [celebrations, setCelebrations] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const seen = useRef(new Set());
  const winAttempt = useRef(null);
  const toastTimer = useRef(null);
  const onEvent = useCallback((event) => {
    if (event.type === 'celebration' && !seen.current.has(event.win.id)) {
      seen.current.add(event.win.id);
      if (seen.current.size > 1000) seen.current.delete(seen.current.values().next().value);
      setModal(null);
      setCelebrations((queue) => [...queue, event]);
    }
    if (event.type === 'undo')
      setCelebrations((queue) => queue.filter((item) => item.win.id !== event.winId));
  }, []);
  const { state, admin, joins, error, connected, refresh } = useVictory(onEvent);
  const game = state?.games.find((item) => item.id === state.night.gameId);

  const showNotice = useCallback((message, undoId) => {
    clearTimeout(toastTimer.current);
    setNotice({ message, undoId });
    toastTimer.current = setTimeout(() => setNotice(null), undoId ? 12000 : 7000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const change = () =>
      setView(validViews.has(location.hash.slice(1)) ? location.hash.slice(1) : 'table');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  function navigate(next) {
    setView(next);
    location.hash = next;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function mutate(path, body, message, method = 'POST') {
    setBusy(true);
    try {
      const result = await api(path, { method, body });
      await refresh();
      if (message) showNotice(message);
      return result;
    } catch (err) {
      showNotice(err.message);
      if (err.status === 401) {
        await refresh();
        setModal('login');
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }
  async function attendance(player) {
    try {
      await mutate(
        `/players/${player.id}/attendance`,
        { active: !player.active },
        player.active
          ? `${player.name} is sitting this one out.`
          : `${player.name} is playing tonight.`,
      );
    } catch {
      /* Shown in the toast. */
    }
  }
  async function lead(id, isLeader) {
    try {
      await mutate('/night/leader', { playerId: isLeader ? null : id });
    } catch {
      /* Shown in the toast. */
    }
  }
  async function logWin(player) {
    if (busy || !game) return;
    const key = `${player.id}:${game.id}`;
    if (winAttempt.current?.key !== key) winAttempt.current = { key, requestId: requestId() };
    try {
      const result = await mutate('/wins', {
        playerId: player.id,
        gameId: game.id,
        requestId: winAttempt.current.requestId,
      });
      winAttempt.current = null;
      showNotice(`${player.name} won ${game.name}.`, result.win.id);
    } catch {
      /* Preserve request ID so retrying cannot log the same win twice. */
    }
  }
  async function undo(id) {
    try {
      await mutate(`/wins/${id}/undo`, {}, 'Win undone. The leaderboard is up to date.');
      setCelebrations((queue) => queue.filter((item) => item.win.id !== id));
    } catch {
      /* Shown in the toast. */
    }
  }
  async function toggleSound() {
    if (soundEnabled) {
      stopAudio();
      setSoundEnabled(false);
    } else {
      try {
        await enableAudio();
        setSoundEnabled(true);
        showNotice('Victory sounds are on for this screen.');
      } catch (err) {
        showNotice(err.message);
      }
    }
  }
  async function logout() {
    try {
      await mutate('/auth/logout', {}, 'Signed out. Enjoy the game.');
      navigate('table');
    } catch {
      /* Shown in the toast. */
    }
  }

  if (!state)
    return (
      <div className="loading-page">
        <span className="loading-die" aria-hidden="true">
          ⚄
        </span>
        <h1>Setting the table.</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="button primary" onClick={refresh}>
              Try again
            </button>
          </>
        ) : (
          <p>Your next good night starts here.</p>
        )}
      </div>
    );
  const players = state.players.filter((player) => !player.archived);
  const activeCount = players.filter((player) => player.active).length;
  return (
    <div
      className={`app theme-${game?.themeKey || 'classic'}`}
      style={game ? paletteStyle(game.palette) : undefined}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="#table"
            onClick={() => navigate('table')}
            className="wordmark"
            aria-label="Victory Club home"
          >
            <span className="brand-mark">
              <Icon name="dice" size={25} />
            </span>
            victory club<span className="wordmark-period">.</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <button className={view === 'table' ? 'active' : ''} onClick={() => navigate('table')}>
              <Icon name="people" size={18} />
              The table
            </button>
            <button
              className={view === 'leaderboard' ? 'active' : ''}
              onClick={() => navigate('leaderboard')}
            >
              <Icon name="trophy" size={18} />
              Leaderboard
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button sound-toggle"
              aria-label={soundEnabled ? 'Mute victory sounds' : 'Enable victory sounds'}
              title={soundEnabled ? 'Sound on' : 'Sound off'}
              aria-pressed={soundEnabled}
              onClick={toggleSound}
            >
              <Icon name={soundEnabled ? 'sound' : 'mute'} />
            </button>
            {admin ? (
              <button
                className={`host-button ${view === 'host' ? 'active' : ''}`}
                onClick={() => navigate('host')}
              >
                <Icon name="settings" size={18} />
                <span>Host settings</span>
              </button>
            ) : (
              <button className="host-button" onClick={() => setModal('login')}>
                <Icon name="lock" size={16} />
                <span>{state.setupRequired ? 'Set up club' : 'Host sign in'}</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="main-container">
        {error ? (
          <div className="connection-banner" role="alert">
            {error}
            <button onClick={refresh}>Retry</button>
          </div>
        ) : !connected ? (
          <div className="connection-banner" role="status">
            Reconnecting for live updates… Your saved scores are safe.
          </div>
        ) : null}
        {admin && joins.length ? (
          <button className="pending-banner" onClick={() => setModal('queue')}>
            <span className="pending-avatar">
              <Icon name="people" size={19} />
            </span>
            <span>
              <strong>
                {joins.length} {joins.length === 1 ? 'friend is' : 'friends are'} waiting to join.
              </strong>{' '}
              A quick hello, then they’re in.
            </span>
            <span className="pending-action">
              Review requests <Icon name="chevron" size={18} />
            </span>
          </button>
        ) : null}
        {view === 'table' ? (
          <Home
            state={state}
            admin={admin}
            game={game}
            onAdd={() => setModal('add')}
            onPickGame={() => setModal('games')}
            onLogin={() => setModal('login')}
            onAttendance={attendance}
            onWin={logWin}
            onLead={lead}
            onJoin={() => setModal('join')}
            busy={busy}
          />
        ) : null}
        {view === 'leaderboard' ? (
          <Leaderboard state={state} onHome={() => navigate('table')} />
        ) : null}
        {view === 'host' ? (
          admin ? (
            <Suspense fallback={<p>Opening host settings…</p>}>
              <Admin
                state={state}
                admin={admin}
                onChange={refresh}
                onNotice={showNotice}
                onLogout={logout}
                onUndo={undo}
              />
            </Suspense>
          ) : (
            <div className="host-signin-prompt">
              <Icon name="lock" size={36} />
              <h1>Hosts, this way.</h1>
              <p>Sign in to manage your club.</p>
              <button className="button primary" onClick={() => setModal('login')}>
                {state.setupRequired ? 'Create host account' : 'Host sign in'}
              </button>
            </div>
          )
        ) : null}
        <footer className="page-footer">
          <span>Made for your kind of people.</span>
          <span>
            victory club<span aria-hidden="true"> ✦</span>
          </span>
        </footer>
      </main>
      <div className="player-counter">
        <div className="player-counter-inner">
          <span className="counter-count">
            <Icon name="people" size={21} />
            Players: <strong>{players.length}</strong>
          </span>
          <span className="counter-tonight">
            <span className="status-dot" />
            {activeCount} playing tonight
          </span>
          <button className="counter-join" onClick={() => setModal('join')}>
            <Icon name="qr" size={18} />
            <span>Join the table</span>
          </button>
        </div>
      </div>
      {notice ? (
        <div className="toast" role="status">
          <span>{notice.message}</span>
          {notice.undoId && admin ? (
            <button onClick={() => undo(notice.undoId)} disabled={busy}>
              Undo
            </button>
          ) : null}
          <button
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
      {modal === 'login' ? (
        <LoginDialog
          setupRequired={state.setupRequired}
          onClose={() => setModal(null)}
          onDone={async () => {
            await refresh();
            showNotice('Your table is ready.');
          }}
        />
      ) : null}
      {modal === 'add' && admin ? (
        <AddPlayerDialog
          onClose={() => setModal(null)}
          onDone={async (message) => {
            await refresh();
            showNotice(message);
          }}
        />
      ) : null}
      {modal === 'games' && admin ? (
        <GamePicker
          games={state.games}
          gameId={state.night.gameId}
          onClose={() => setModal(null)}
          onSelect={(id) => mutate('/night/game', { gameId: id })}
        />
      ) : null}
      {modal === 'join' ? <JoinDialog state={state} onClose={() => setModal(null)} /> : null}
      {modal === 'queue' && admin ? (
        <JoinQueue
          requests={joins}
          onClose={() => setModal(null)}
          onChange={refresh}
          onNotice={showNotice}
        />
      ) : null}
      {celebrations[0] ? (
        <Celebration
          event={celebrations[0]}
          soundEnabled={soundEnabled}
          onDismiss={() => setCelebrations((queue) => queue.slice(1))}
          onUndo={admin ? undo : undefined}
        />
      ) : null}
    </div>
  );
}
