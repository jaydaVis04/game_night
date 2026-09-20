import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function useVictory(onEvent) {
  const [state, setState] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [joins, setJoins] = useState([]);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const latest = useRef(0);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    try {
      const [snapshot, auth] = await Promise.all([api('/state'), api('/auth/me')]);
      let pending = [];
      if (auth.admin) pending = (await api('/joins')).requests;
      if (request === latest.current) {
        setState(snapshot);
        setAdmin(auth.admin);
        setJoins(pending.filter(join => join.status === 'pending'));
        setError('');
      }
    } catch (err) {
      if (request === latest.current) setError(err.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let socket;
    let reconnect;
    let attempts = 0;
    let debounce;
    const connect = () => {
      if (!active) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      socket.onopen = () => { attempts = 0; setConnected(true); refresh(); };
      socket.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data);
          if (event.type === 'changed') {
            clearTimeout(debounce);
            debounce = setTimeout(refresh, 70);
          } else eventRef.current(event);
        } catch { /* Ignore an incomplete event; the next snapshot repairs state. */ }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnect = setTimeout(connect, Math.min(15000, 800 * 2 ** attempts++));
      };
    };
    refresh();
    connect();
    const poll = setInterval(refresh, 30000);
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      ++latest.current;
      clearTimeout(reconnect);
      clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', visibility);
      socket?.close();
    };
  }, [refresh]);

  return { state, admin, joins, error, connected, refresh };
}
