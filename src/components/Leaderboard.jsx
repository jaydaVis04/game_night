import { useState } from 'react';
import Icon from './Icons.jsx';
import { Avatar, EmptyState } from './Primitives.jsx';

export default function Leaderboard({ state, onHome }) {
  const [period, setPeriod] = useState('all');
  const winKey = period === 'all' ? 'totalWins' : 'tonightWins';
  const ranked = state.players
    .filter(
      (player) => !player.archived && (period === 'all' || player.active || player.tonightWins > 0),
    )
    .toSorted(
      (a, b) =>
        b[winKey] - a[winKey] ||
        a.name.localeCompare(b.name) ||
        String(a.id).localeCompare(String(b.id)),
    );
  let lastScore = -1;
  let rank = 0;
  const players = ranked.map((player, index) => {
    if (player[winKey] !== lastScore) rank = index + 1;
    lastScore = player[winKey];
    return { ...player, shownRank: rank, score: player[winKey] };
  });
  const top = players.slice(0, 3);
  const hasWins = players.some((player) => player.score > 0);
  return (
    <section className="leaderboard-page">
      <div className="page-heading centered">
        <span className="page-symbol">
          <Icon name="trophy" size={30} />
        </span>
        <h1>
          Bragging rights,
          <br />
          beautifully earned.
        </h1>
        <p>Every win counts. The rematch is always on.</p>
        <div className="segmented">
          <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
            All time
          </button>
          <button aria-pressed={period === 'tonight'} onClick={() => setPeriod('tonight')}>
            Tonight
          </button>
        </div>
      </div>
      {players.length === 0 ? (
        <EmptyState
          title="The podium is waiting."
          icon="trophy"
          action={
            <button className="button primary" onClick={onHome}>
              Back to the table
            </button>
          }
        >
          Bring your players to the table and log the first win.
        </EmptyState>
      ) : (
        <>
          {!hasWins ? (
            <div className="first-win-note">
              <Icon name="sparkle" />
              <span>All square. Who’s taking the first win?</span>
            </div>
          ) : null}
          <div className="podium" aria-label="Top three players">
            {[1, 0, 2].map((index) =>
              top[index] ? (
                <div
                  key={top[index].id}
                  className={`podium-place podium-position-${index + 1} rank-${Math.min(top[index].shownRank, 3)}`}
                >
                  <div className="podium-person">
                    <Avatar
                      name={top[index].name}
                      size="large"
                      crowned={top[index].score > 0 && top[index].shownRank === 1}
                    />
                    <h2>{top[index].name}</h2>
                    <span>
                      {top[index].score} {top[index].score === 1 ? 'win' : 'wins'}
                    </span>
                  </div>
                  <div className="podium-block">
                    <span className="podium-rank">{top[index].shownRank}</span>
                    <span>
                      {players.filter((p) => p.score === top[index].score).length > 1
                        ? 'Tied'
                        : top[index].shownRank === 1
                          ? 'Top of the table'
                          : top[index].shownRank === 2
                            ? 'Close behind'
                            : 'On the podium'}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  key={index}
                  className={`podium-place podium-position-${index + 1} podium-vacant`}
                  aria-hidden="true"
                />
              ),
            )}
          </div>
          <div className="rankings">
            <div className="section-heading">
              <h2>The full lineup</h2>
              <span className="subtle">
                {players.length} {players.length === 1 ? 'player' : 'players'}
              </span>
            </div>
            <div className="ranking-header">
              <span>Rank</span>
              <span>Player</span>
              <span>{period === 'all' ? 'Total wins' : 'Tonight’s wins'}</span>
            </div>
            {players.map((player) => (
              <div className="ranking-row" key={player.id}>
                <span
                  className={`rank-number ${player.score > 0 ? `rank-${Math.min(player.shownRank, 4)}` : ''}`}
                >
                  {player.shownRank}
                </span>
                <div className="rank-player">
                  <Avatar name={player.name} />
                  <span>
                    {player.name}
                    {player.active ? <small>Playing tonight</small> : null}
                  </span>
                </div>
                <strong>
                  {player.score}
                  <Icon name="trophy" size={18} />
                </strong>
              </div>
            ))}
            <p className="ranking-footnote">
              Equal wins share a rank. Ties are displayed alphabetically.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
