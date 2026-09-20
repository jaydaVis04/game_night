import { useEffect, useRef, useState } from 'react';
import { api, requestId } from '../api.js';
import { Field, FormError } from './Primitives.jsx';
import Icon from './Icons.jsx';

function storedRequest(code) {
  try {
    return JSON.parse(sessionStorage.getItem(`victory-join-v1:${code}`));
  } catch {
    return null;
  }
}

export default function JoinPage({ code }) {
  const [night, setNight] = useState(null);
  const [request, setRequest] = useState(() => storedRequest(code));
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState('');
  const attempt = useRef({ id: requestId(), name: '' });
  useEffect(() => {
    let active = true;
    api(`/join/${encodeURIComponent(code)}`)
      .then((data) => {
        if (active) {
          setNight(data);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          if (err.status === 404) setInvalid(true);
        }
      });
    return () => {
      active = false;
    };
  }, [code]);
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    let active = true;
    let timer;
    async function poll() {
      try {
        const result = await api(
          `/join-status/${encodeURIComponent(request.id)}?token=${encodeURIComponent(request.token)}`,
        );
        if (!active) return;
        setConnection('');
        if (result.request.status !== 'pending') {
          const next = { ...request, ...result.request };
          setRequest(next);
          try {
            sessionStorage.setItem(`victory-join-v1:${code}`, JSON.stringify(next));
          } catch {
            /* Storage can be disabled. */
          }
          return;
        }
      } catch (err) {
        if (!active) return;
        if (err.status === 404) {
          setRequest({ ...request, status: 'expired' });
          return;
        }
        setConnection('Reconnecting to your host…');
      }
      if (active) timer = setTimeout(poll, 2200);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [request?.id, request?.status, code]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    if (attempt.current.name !== name) attempt.current = { id: requestId(), name };
    try {
      const result = await api(`/join/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: { name, requestId: attempt.current.id },
      });
      setRequest(result.request);
      try {
        sessionStorage.setItem(`victory-join-v1:${code}`, JSON.stringify(result.request));
      } catch {
        /* Joining works without browser storage. */
      }
    } catch (err) {
      setError(err.message);
      if (err.status === 404) setInvalid(true);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setRequest(null);
    attempt.current = { id: requestId(), name: '' };
    try {
      sessionStorage.removeItem(`victory-join-v1:${code}`);
    } catch {
      /* Optional storage. */
    }
  }
  const status = request?.status;
  return (
    <main className="phone-page">
      <a href="/" className="wordmark">
        <span className="brand-mark">
          <Icon name="dice" size={24} />
        </span>
        victory club<span className="wordmark-period">.</span>
      </a>
      <div className="phone-content">
        <div className="phone-token" aria-hidden="true">
          {status === 'approved' ? (
            <Icon name="check" size={46} />
          ) : status === 'pending' ? (
            <Icon name="clock" size={42} />
          ) : (
            <Icon name="dice" size={46} />
          )}
        </div>
        {invalid ? (
          <>
            <h1>
              This night
              <br />
              has wrapped up.
            </h1>
            <p>Ask your host for tonight’s QR code, then scan it to join the new table.</p>
          </>
        ) : !night && !request ? (
          <>
            <h1>
              Your seat
              <br />
              is waiting.
            </h1>
            {error ? (
              <>
                <FormError>{error}</FormError>
                <button className="button secondary full-width" onClick={() => location.reload()}>
                  Try again
                </button>
              </>
            ) : (
              <p>Finding your table…</p>
            )}
          </>
        ) : status === 'pending' ? (
          <>
            <h1>
              You’re on
              <br />
              the guest list.
            </h1>
            <p>
              Hey {request.name}! Your host just needs to let you in. You can leave this page open.
            </p>
            <div className="phone-status">
              <span className="status-dot" />
              Waiting for your host
            </div>
            {connection ? (
              <p role="status" className="phone-connection">
                {connection}
              </p>
            ) : null}
          </>
        ) : status === 'approved' ? (
          <>
            <h1>
              You’re in,
              <br />
              {request.name}.
            </h1>
            <p>Your place at the table is ready. Put your phone down and make your next move.</p>
            <div className="phone-status approved">
              <Icon name="check" />
              Playing tonight
            </div>
            <a className="text-button" href="/">
              See the leaderboard <Icon name="arrow" size={18} />
            </a>
          </>
        ) : status === 'denied' || status === 'expired' ? (
          <>
            <h1>
              {status === 'expired' ? 'A new night.' : 'Not this time.'}
              <br />A fresh start.
            </h1>
            <p>
              {status === 'expired'
                ? 'This request has expired. Scan the host’s current QR code to join.'
                : 'Your host declined this request. Check with them, or try again with a name they’ll recognize.'}
            </p>
            {status === 'denied' ? (
              <button className="button primary full-width" onClick={reset}>
                Try another name
              </button>
            ) : null}
          </>
        ) : (
          <>
            <h1>
              Pull up
              <br />a chair.
            </h1>
            <p>
              {night?.gameName
                ? `${night.gameName} is on the table. What should we call you?`
                : 'The good kind of competition starts with your name.'}
            </p>
            <form className="stack-form" onSubmit={submit}>
              <Field
                label="Your name"
                name="name"
                placeholder="Your game-night name"
                required
                maxLength={60}
                autoComplete="given-name"
                enterKeyHint="go"
              />
              <FormError>{error}</FormError>
              <button className="button primary full-width" disabled={busy}>
                {busy ? 'Joining…' : 'Join tonight'}
                <Icon name="arrow" />
              </button>
            </form>
            <small className="phone-note">No account. Just good company.</small>
          </>
        )}
      </div>
      <footer className="phone-footer">A little rivalry. A lot of good nights.</footer>
    </main>
  );
}
