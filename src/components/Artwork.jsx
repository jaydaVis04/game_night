export function TabletopArt() {
  return <div className="tabletop-art" aria-hidden="true"><svg viewBox="0 0 510 340" fill="none">
    <ellipse cx="270" cy="295" rx="201" ry="26" fill="#211C36" opacity=".07" />
    <g transform="translate(272 56) rotate(17)"><rect x="7" y="10" width="119" height="164" rx="15" fill="#403288" /><rect width="119" height="164" rx="15" fill="#F69E71" stroke="#211C36" strokeWidth="3" /><rect x="12" y="12" width="95" height="140" rx="8" stroke="#211C36" strokeWidth="2" /><path d="m60 40 10 27 28 11-28 10-10 29-10-29-28-10 28-11 10-27Z" fill="#211C36" /><circle cx="24" cy="24" r="3" fill="#211C36" /><circle cx="95" cy="140" r="3" fill="#211C36" /></g>
    <g transform="translate(210 86) rotate(-12)"><rect x="6" y="8" width="119" height="164" rx="15" fill="#403288" /><rect width="119" height="164" rx="15" fill="#FFFEF9" stroke="#211C36" strokeWidth="3" /><path d="M27 31h-8l4-12 4 12Zm-9 4h11" stroke="#6654D9" strokeWidth="2" /><path d="m59 51 26 32-26 34-25-34 25-32Z" fill="#6654D9" /><path d="m98 127-8 0 4 12 4-12Zm-9-4h11" stroke="#6654D9" strokeWidth="2" /></g>
    <g transform="translate(91 188) rotate(-15)"><rect x="7" y="9" width="95" height="95" rx="22" fill="#BD735D" /><rect width="95" height="95" rx="22" fill="#F5CD61" stroke="#211C36" strokeWidth="3" />{[[26,26],[69,26],[47.5,47.5],[26,69],[69,69]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="7" fill="#211C36" />)}</g>
    <g transform="translate(323 233)"><ellipse cx="45" cy="36" rx="47" ry="17" fill="#3A7660" stroke="#211C36" strokeWidth="3" /><path d="M-2 24v12M92 24v12" stroke="#211C36" strokeWidth="3" /><ellipse cx="45" cy="24" rx="47" ry="17" fill="#95CDB6" stroke="#211C36" strokeWidth="3" /><ellipse cx="45" cy="11" rx="47" ry="17" fill="#95CDB6" stroke="#211C36" strokeWidth="3" /><ellipse cx="45" cy="0" rx="47" ry="17" fill="#BDE3D3" stroke="#211C36" strokeWidth="3" /><ellipse cx="45" cy="0" rx="29" ry="10" stroke="#3A7660" strokeWidth="2" /><path d="M15-12 23-7m46-6-6 7M0 1h14m64 0h14M20 13l7-7m43 7-8-6" stroke="#3A7660" strokeWidth="3" /></g>
    <path d="m119 74 5 15 16 6-16 5-5 16-5-16-16-5 16-6 5-15Zm307 72 4 10 10 4-10 4-4 11-4-11-10-4 10-4 4-10Z" fill="#6654D9" /><circle cx="411" cy="70" r="6" fill="#F69E71" /><circle cx="68" cy="152" r="5" fill="#95CDB6" /><path d="m381 319 8-8m-243-164 7-9" stroke="#6654D9" strokeWidth="4" strokeLinecap="round" />
  </svg></div>;
}

export function GameArt({ motif, compact = false }) {
  return <div className={`game-art motif-${motif} ${compact ? 'compact' : ''}`} aria-hidden="true">
    {motif === 'dice' ? <><span className="board-line" /><span className="art-die">⚄</span><span className="art-house">⌂</span><span className="art-ticket">M</span></> : null}
    {motif === 'tournament' ? <><span className="tournament-lines" /><span className="art-bolt">ϟ</span><span className="art-tournament-star">✦</span></> : null}
    {motif === 'cards' ? <><span className="art-card art-card-back">✧</span><span className="art-card art-card-front">♛</span></> : null}
    {motif === 'suits' ? <><span className="art-chip chip-back" /><span className="art-chip chip-front">♠</span><span className="art-suit">♦</span></> : null}
    {motif === 'space' ? <><span className="art-planet" /><span className="art-orbit" /><span className="art-astronaut"><i /></span><span className="space-star star-a">✧</span><span className="space-star star-b">✦</span></> : null}
    {motif === 'spotlight' ? <><span className="art-spotlight" /><span className="art-city" /><span className="art-noir">?</span></> : null}
    {motif === 'mystery' ? <><span className="art-window" /><span className="art-magnifier" /><span className="art-key">⚿</span></> : null}
  </div>;
}
