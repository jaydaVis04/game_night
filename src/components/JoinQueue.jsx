import { useState } from 'react';
import { api } from '../api.js';
import { Avatar, EmptyState, FormError, Modal } from './Primitives.jsx';
import Icon from './Icons.jsx';

export default function JoinQueue({ requests, onClose, onChange, onNotice }) {
  return <Modal title="Who’s at the door?" description="A quick hello before they join the table." onClose={onClose} className="queue-modal">
    {requests.length === 0 ? <EmptyState title="Everyone’s accounted for." icon="check">New requests will appear here as your friends scan the QR code.</EmptyState> : <div className="join-queue">{requests.map(request => <JoinRequest key={request.id} request={request} onChange={onChange} onNotice={onNotice} />)}</div>}
  </Modal>;
}

function JoinRequest({ request, onChange, onNotice }) {
  const [selection, setSelection] = useState(request.matches.length ? '' : 'new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function resolve(action) {
    setBusy(true); setError('');
    try {
      const body = { action };
      if (action === 'approve') {
        if (selection === 'new') body.createNew = true;
        else body.playerId = selection;
      }
      await api(`/joins/${request.id}/resolve`, { method: 'POST', body });
      await onChange();
      onNotice(action === 'approve' ? `${request.name} is welcome at the table.` : 'Request declined.');
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <section className="join-request"><div className="join-request-heading"><Avatar name={request.name} /><div><h3>{request.name}</h3><p>Would like to join tonight</p></div></div>{request.matches.length ? <fieldset className="match-options"><legend>Could this be someone you know?</legend>{request.matches.map(match => <label key={match.id} className="match-option"><input type="radio" name={`match-${request.id}`} value={match.id} checked={selection === match.id} onChange={() => setSelection(match.id)} /><span><strong>{match.name}</strong><small>{match.totalWins} lifetime {match.totalWins === 1 ? 'win' : 'wins'}</small></span></label>)}<label className="match-option"><input type="radio" name={`match-${request.id}`} value="new" checked={selection === 'new'} onChange={() => setSelection('new')} /><span>Create a new player named {request.name}</span></label></fieldset> : <p className="subtle">A new face! Approving will create their player profile.</p>}<FormError>{error}</FormError><div className="queue-actions"><button className="button secondary" onClick={() => resolve('deny')} disabled={busy}>Decline</button><button className="button primary" onClick={() => resolve('approve')} disabled={busy || !selection}><Icon name="check" />{busy ? 'One moment…' : 'Approve player'}</button></div></section>;
}
