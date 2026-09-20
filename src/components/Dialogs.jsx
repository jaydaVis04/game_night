import { useState } from 'react';
import { api } from '../api.js';
import Icon from './Icons.jsx';
import { Field, FormError, Modal } from './Primitives.jsx';
import { GameArt } from './Artwork.jsx';

export function LoginDialog({ setupRequired, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try { await api(setupRequired ? '/auth/setup' : '/auth/login', { method: 'POST', body: data }); await onDone(); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal title={setupRequired ? 'Welcome, first host.' : 'Back at the head of the table.'} description={setupRequired ? 'Create a host account to get your club started.' : 'Sign in to choose games, welcome players, and log wins.'} onClose={onClose}>
    <form onSubmit={submit} className="stack-form"><Field label="Username" name="username" autoComplete="username" required minLength={2} maxLength={40} autoFocus /><Field label="Password" name="password" type="password" autoComplete={setupRequired ? 'new-password' : 'current-password'} required minLength={setupRequired ? 10 : undefined} maxLength={72} hint={setupRequired ? 'At least 10 characters. Keep this just for your hosts.' : undefined} />{setupRequired ? <Field label="Setup code" name="setupCode" autoComplete="off" required hint="Find this code in the server window on the host’s computer." /> : null}<FormError>{error}</FormError><button className="button primary full-width" disabled={busy}>{busy ? 'One moment…' : setupRequired ? 'Create host account' : 'Sign in'}<Icon name="arrow" /></button></form>
  </Modal>;
}

export function AddPlayerDialog({ onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const name = new FormData(event.currentTarget).get('name');
    try { await api('/players', { method: 'POST', body: { name } }); await onDone(`${name.trim()} is at the table.`); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title="Make room for one more." description="Just a name. We’ll add them to tonight’s table." onClose={onClose}><form className="stack-form" onSubmit={submit}><Field name="name" label="Player name" placeholder="What should we call you?" autoFocus autoComplete="off" required maxLength={60} /><FormError>{error}</FormError><button className="button primary full-width" disabled={busy}><Icon name="plus" />{busy ? 'Adding…' : 'Add player'}</button></form></Modal>;
}

export function GamePicker({ games, gameId, onClose, onSelect }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function select(id) {
    setBusy(true); setError('');
    try { await onSelect(id); onClose(); } catch (err) { setError(err.message); setBusy(false); }
  }
  return <Modal className="game-picker" title="What’s on the table?" description="Pick a game. Set the mood. Let the rivalry begin." onClose={onClose}><FormError>{error}</FormError><div className="game-grid">{games.filter(game => !game.archived).map(game => <button className={`game-option theme-${game.themeKey} ${game.id === gameId ? 'selected' : ''}`} style={paletteStyle(game.palette)} key={game.id} onClick={() => select(game.id)} disabled={busy} aria-pressed={game.id === gameId}><GameArt motif={game.motif} /><span className="game-option-copy"><strong>{game.name}</strong><span>{game.tagline}</span></span>{game.id === gameId ? <span className="game-selected"><Icon name="check" size={15} />On the table</span> : <span className="game-option-arrow"><Icon name="arrow" /></span>}</button>)}</div>{gameId ? <button className="text-button" onClick={() => select(null)} disabled={busy}>Back to the club theme</button> : null}</Modal>;
}

export function JoinDialog({ state, onClose }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(state.joinUrl); setCopied(true); } catch { setCopied(false); }
  }
  return <Modal title="There’s a seat for you." description="Connect to the same Wi-Fi, then scan to join tonight." className="join-modal" onClose={onClose}><div className="large-qr"><img src={`/api/qr?night=${state.night.id}`} width="260" height="260" alt="Scan this QR code to join tonight" /></div><p className="join-code-label">Tonight’s code <strong>{state.night.code}</strong></p><label className="field"><span>Or open this link on your phone</span><input readOnly value={state.joinUrl} onFocus={e => e.target.select()} aria-label="Join link" /></label>{navigator.clipboard ? <button className="button secondary full-width" onClick={copy}>{copied ? 'Copied!' : 'Copy join link'}</button> : null}<p className="dialog-footnote">Your host will approve each player before they join the table.</p></Modal>;
}

export function ConfirmDialog({ title, description, action, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() { setBusy(true); try { await onConfirm(); onClose(); } catch (err) { setError(err.message); setBusy(false); } }
  return <Modal title={title} description={description} onClose={onClose}><FormError>{error}</FormError><div className="modal-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} onClick={confirm}>{busy ? 'One moment…' : action}</button></div></Modal>;
}

export function paletteStyle(palette = {}) {
  return Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`, value]));
}
