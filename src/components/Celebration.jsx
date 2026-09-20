import { useEffect, useRef, useState } from 'react';
import { playVictory, stopAudio } from '../audio.js';
import '../sound.css';

const colors = ['#f4ca5f', '#af9bfa', '#f69e71', '#a2d8c5', '#fff9ed'];

export default function Celebration({ event, onDismiss, onUndo, soundEnabled }) {
  const [audioMessage, setAudioMessage] = useState('');
  const dialog = useRef(null);
  const dismiss = useRef(onDismiss);
  const soundPreference = useRef(soundEnabled);
  dismiss.current = onDismiss;
  soundPreference.current = soundEnabled;
  useEffect(() => {
    if (!event) return undefined;
    const element = dialog.current;
    element?.showModal();
    let alive = true;
    setAudioMessage('');
    if (soundPreference.current)
      playVictory(event.soundId).catch((error) => {
        if (alive) setAudioMessage(error.message);
      });
    const timeout = setTimeout(
      () => dismiss.current?.(),
      Math.min(10, event.duration || 10) * 1000,
    );
    return () => {
      alive = false;
      clearTimeout(timeout);
      stopAudio();
      element?.close();
    };
  }, [event?.win?.id]);
  if (!event?.win) return null;
  return (
    <dialog
      className="celebration"
      ref={dialog}
      aria-label="Winner celebration"
      onCancel={(cancelEvent) => {
        cancelEvent.preventDefault();
        onDismiss?.();
      }}
    >
      <div className="celebration-confetti" aria-hidden="true">
        {Array.from({ length: 48 }, (_, index) => (
          <i
            key={index}
            style={{
              '--x': `${(index * 37) % 100}%`,
              '--delay': `${-(index % 11) * 0.31}s`,
              '--duration': `${3.5 + (index % 4)}s`,
              '--rotation': `${index * 29}deg`,
              '--confetti-color': colors[index % colors.length],
            }}
          />
        ))}
      </div>
      <button
        className="celebration-close"
        type="button"
        onClick={onDismiss}
        aria-label="Close celebration"
      >
        ×
      </button>
      <div className="celebration-center" role="status">
        <div className="celebration-trophy" aria-hidden="true">
          <svg viewBox="0 0 120 120" fill="none">
            <path d="M33 20h54v27c0 24-14 34-27 34S33 71 33 47V20Z" fill="#f4ca5f" />
            <path
              d="M33 30H17v16c0 15 10 22 24 22M87 30h16v16c0 15-10 22-24 22"
              stroke="#f4ca5f"
              strokeWidth="8"
            />
            <path d="M60 81v18M38 105h44" stroke="#f4ca5f" strokeWidth="9" strokeLinecap="round" />
            <path
              d="m60 33 4.4 9 10 1.5-7.2 7 1.7 10L60 55.8 51.1 61l1.7-10-7.2-7 10-1.5L60 33Z"
              fill="#9b6825"
            />
          </svg>
        </div>
        <p className="celebration-overline">One for the history books.</p>
        <h2>
          {event.win.playerName}
          <br />
          <span>takes the win!</span>
        </h2>
        <p className="celebration-game">{event.win.gameName}</p>
      </div>
      <div className="celebration-footer">
        {audioMessage ? <p>{audioMessage}</p> : null}
        <button type="button" onClick={onDismiss}>
          Keep playing
        </button>
        {onUndo ? (
          <button type="button" onClick={() => onUndo(event.win.id)}>
            Undo this win
          </button>
        ) : null}
      </div>
    </dialog>
  );
}
