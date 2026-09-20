import { useState } from 'react';
import Icon from './Icons.jsx';
import { Avatar, EmptyState } from './Primitives.jsx';
import { GameArt, TabletopArt } from './Artwork.jsx';

export function Home({
  state,
  admin,
  game,
  onAdd,
  onPickGame,
  onLogin,
  onAttendance,
  onWin,
  onLead,
  onJoin,
  busy,
}) {
  const [filter, setFilter] = useState('everyone');
  const [search, setSearch] = useState('');
  const players = state.players.filter((player) => !player.archived);
  const active = players.filter((player) => player.active);
  const visible = players.filter(
    (player) =>
      (filter !== 'tonight' || player.active) &&
      player.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <section className="welcome">
        <div className="welcome-copy">
          <span className="night-status">
            <span className="status-dot" />
            {active.length
              ? `${active.length} at the table tonight`
              : 'Good company. Friendly competition.'}
          </span>
          <h1>
            {game ? (
              <>
                Let the games
                <br />
                begin.
              </>
            ) : (
              <>
                Make a night
                <br />
                of it.
              </>
            )}
          </h1>
          <p>
            {game
              ? `${game.name} is on the table. Big plays, close calls, and one more round.`
              : 'Gather your people. Pick a game. Give every win a place to live.'}
          </p>
          <button className="button primary welcome-action" onClick={admin ? onPickGame : onLogin}>
            <Icon name="dice" />
            {game ? 'Change game' : 'Pick a game'}
            <Icon name="arrow" />
          </button>
        </div>
        {game ? (
          <div className="welcome-game-art">
            <GameArt motif={game.motif} />
          </div>
        ) : (
          <TabletopArt />
        )}
        <span className="welcome-caption">A little rivalry. A lot of good nights.</span>
      </section>
      <div className="home-layout">
        <section className="roster-section" aria-labelledby="roster-heading">
          <div className="section-heading">
            <div>
              <h2 id="roster-heading">
                The usual suspects<span className="heading-dot">.</span>
              </h2>
              <p>Your people, and their well-earned bragging rights.</p>
            </div>
            <button className="button secondary" onClick={admin ? onAdd : onLogin}>
              <Icon name="plus" />
              Add player
            </button>
          </div>
          <div className="roster-toolbar">
            <div className="segmented" aria-label="Filter players">
              <button aria-pressed={filter === 'everyone'} onClick={() => setFilter('everyone')}>
                Everyone <span>{players.length}</span>
              </button>
              <button aria-pressed={filter === 'tonight'} onClick={() => setFilter('tonight')}>
                Playing tonight <span>{active.length}</span>
              </button>
            </div>
            {players.length > 6 ? (
              <label className="search-field">
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="Find a player"
                  aria-label="Find a player"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          {players.length === 0 ? (
            <EmptyState
              title="Every legend starts somewhere."
              icon="people"
              action={
                <button className="button primary" onClick={admin ? onAdd : onLogin}>
                  <Icon name="plus" />
                  {admin
                    ? 'Add your first player'
                    : state.setupRequired
                      ? 'Set up your club'
                      : 'Host sign in'}
                </button>
              }
            >
              Add your first player, or invite the group to join from their phones. The first win is
              still up for grabs.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState title={search ? 'No players found.' : 'Who’s in tonight?'}>
              {search
                ? 'Try a different name.'
                : 'Choose Everyone, then mark your players as playing tonight.'}
            </EmptyState>
          ) : (
            <div className="player-grid">
              {visible.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  admin={admin}
                  game={game}
                  isLeader={state.night.leaderId === player.id}
                  leaderEnabled={state.settings.currentlyWinning}
                  onAttendance={onAttendance}
                  onWin={onWin}
                  onLead={onLead}
                  busy={busy}
                />
              ))}
            </div>
          )}
          {admin && players.length > 0 ? (
            <p className="roster-hint">
              <Icon name="people" size={16} />
              Mark who’s playing tonight, then log their wins.
              {state.settings.currentlyWinning
                ? ' Tap a player’s name to mark the current leader.'
                : ''}
            </p>
          ) : null}
        </section>
        <aside className="home-rail">
          <section className={`current-game ${game ? 'has-game' : ''}`} aria-label="Current game">
            <div className="rail-heading">
              <span>{game ? 'On the table' : 'Up for anything?'}</span>
              <Icon name="dice" />
            </div>
            {game ? (
              <>
                <GameArt motif={game.motif} compact />
                <h3>{game.name}</h3>
                <p>{game.tagline}</p>
              </>
            ) : (
              <>
                <div className="mini-tabletop" aria-hidden="true">
                  <span>♠</span>
                  <span>⚄</span>
                  <span>✦</span>
                </div>
                <h3>
                  Seven games.
                  <br />
                  Endless rematches.
                </h3>
                <p>Set the mood for your next round.</p>
              </>
            )}
            <button className="button rail-button" onClick={admin ? onPickGame : onLogin}>
              {game ? 'Pick something else' : 'Find tonight’s game'}
              <Icon name="chevron" size={17} />
            </button>
          </section>
          <section className="join-card" aria-label="Join with QR code">
            <div>
              <Icon name="qr" size={22} />
              <h3>Pull up a chair.</h3>
              <p>Same Wi-Fi. Scan. You’re in.</p>
            </div>
            <button className="qr-button" onClick={onJoin} aria-label="Enlarge join QR code">
              <img
                src={`/api/qr?night=${state.night.id}`}
                alt="QR code to join this game night"
                width="96"
                height="96"
              />
            </button>
            <button className="text-button join-link" onClick={onJoin}>
              Join with QR code <Icon name="arrow" size={16} />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

function PlayerCard({
  player,
  admin,
  game,
  isLeader,
  leaderEnabled,
  onAttendance,
  onWin,
  onLead,
  busy,
}) {
  const canLead = admin && leaderEnabled && player.active && game;
  const nameContent = (
    <>
      <Avatar name={player.name} crowned={isLeader} />
      <span className="player-name">
        {player.name}
        {isLeader ? (
          <small className="leader-tag">Currently leading</small>
        ) : (
          <small>{player.active ? 'At the table' : 'Next time, perhaps'}</small>
        )}
      </span>
    </>
  );
  return (
    <article
      className={`player-card ${player.active ? 'is-playing' : ''} ${isLeader ? 'is-leader' : ''}`}
    >
      <div className="player-card-top">
        {canLead ? (
          <button
            className="player-identity player-lead-button"
            aria-label={`${isLeader ? 'Clear lead for' : 'Mark as currently winning:'} ${player.name}`}
            aria-pressed={isLeader}
            onClick={() => onLead(player.id, isLeader)}
            disabled={busy}
          >
            {nameContent}
          </button>
        ) : (
          <div className="player-identity">{nameContent}</div>
        )}
        <div className="player-wins">
          <strong>{player.totalWins}</strong>
          <span>{player.totalWins === 1 ? 'win' : 'wins'}</span>
        </div>
      </div>
      <div className="player-card-bottom">
        {admin ? (
          <button
            className={`attendance-button ${player.active ? 'active' : ''}`}
            aria-pressed={player.active}
            onClick={() => onAttendance(player)}
            disabled={busy}
          >
            <span className="attendance-mark">
              {player.active ? <Icon name="check" size={12} /> : <Icon name="plus" size={12} />}
            </span>
            {player.active ? 'Playing tonight' : 'Add to tonight'}
          </button>
        ) : (
          <span className="attendance-label">
            {player.active ? (
              <>
                <span className="status-dot" />
                Playing tonight
              </>
            ) : (
              'Lifetime record'
            )}
          </span>
        )}
        {admin ? (
          <button
            className="win-button"
            aria-label={`Log win for ${player.name}`}
            disabled={!player.active || !game || busy}
            onClick={() => onWin(player)}
            title={
              !game
                ? 'Pick a game first'
                : !player.active
                  ? 'Add this player to tonight first'
                  : `Log a ${game.name} win`
            }
          >
            <Icon name="trophy" size={16} />
            Log win
          </button>
        ) : player.tonightWins > 0 ? (
          <span className="tonight-wins">+{player.tonightWins} tonight</span>
        ) : null}
      </div>
    </article>
  );
}
