import { useEffect, useRef, useState } from 'react';
import { enableAudio, encodeWave, getAudioContext, playVictory, previewBuffer, stopAudio } from '../audio.js';
import '../sound.css';

async function soundRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'X-Victory-Request': '1', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save that change. Try again.');
  return body;
}

const seconds = (value) => `${value.toFixed(1)}s`;

function Waveform({ buffer, start, end, onStart, onEnd }) {
  const canvas = useRef(null);
  const track = useRef(null);
  const duration = buffer.duration;
  useEffect(() => {
    const element = canvas.current;
    const render = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      const context = element.getContext('2d');
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);
      const samples = buffer.getChannelData(0);
      const bars = Math.max(1, Math.floor(width / 5));
      const stride = Math.max(1, Math.floor(samples.length / bars));
      context.fillStyle = '#7667a9';
      for (let bar = 0; bar < bars; bar += 1) {
        let peak = 0;
        // Sample the interval evenly, bounded even for long files.
        for (let index = bar * stride; index < Math.min(samples.length, (bar + 1) * stride); index += Math.max(1, Math.floor(stride / 80))) peak = Math.max(peak, Math.abs(samples[index]));
        const size = Math.max(3, peak * height * 0.8);
        context.fillRect(bar * 5, (height - size) / 2, 3, size);
      }
    };
    const observer = new ResizeObserver(render);
    observer.observe(element);
    render();
    return () => observer.disconnect();
  }, [buffer]);
  const handleMove = (event, change) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = track.current.getBoundingClientRect();
    change(Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width) * duration)));
  };
  const keys = (event, value, change) => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + 0.1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - 0.1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = duration;
    if (next !== undefined) { event.preventDefault(); change(next); }
  };
  return <div className="wave-track" ref={track}>
    <canvas ref={canvas} className="wave-canvas" aria-hidden="true" />
    <div className="wave-selection" style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }} aria-hidden="true" />
    {[['start', start, onStart], ['end', end, onEnd]].map(([name, value, change]) => <button
      key={name} type="button" className={`wave-handle wave-handle-${name}`} role="slider"
      aria-label={`Clip ${name}`} aria-valuemin={0} aria-valuemax={Number(duration.toFixed(2))}
      aria-valuenow={Number(value.toFixed(2))} aria-valuetext={seconds(value)}
      style={{ left: `${value / duration * 100}%` }}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={(event) => handleMove(event, change)}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onKeyDown={(event) => keys(event, value, change)}><span aria-hidden="true">Ⅱ</span></button>)}
  </div>;
}

export default function Soundboard({ sounds = [], selectedSoundId = 'default', onChange, onNotice }) {
  const [buffer, setBuffer] = useState(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removeId, setRemoveId] = useState(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; stopAudio(); }, []);

  const run = async (action) => {
    setError(''); setBusy(true);
    try { await action(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const loadFile = async (file) => {
    if (!file) return;
    const current = ++generation.current;
    setBuffer(null);
    await run(async () => {
      if (file.size > 30 * 1024 * 1024) throw new Error('Choose an audio file smaller than 30 MB.');
      let decoded;
      try { decoded = await getAudioContext().decodeAudioData(await file.arrayBuffer()); }
      catch { throw new Error('This browser could not read that audio. Try an MP3, WAV, or M4A file.'); }
      if (decoded.duration < 0.25 || decoded.duration > 600) throw new Error('Choose audio between a quarter-second and 10 minutes long.');
      if (current !== generation.current) return;
      setBuffer(decoded); setName(file.name.replace(/\.[^.]+$/, '').slice(0, 60));
      setStart(0); setEnd(Math.min(10, decoded.duration));
    });
  };
  const changeStart = (value) => {
    const next = Math.max(0, Math.min(buffer.duration - 0.25, value));
    setStart(next); setEnd(Math.min(buffer.duration, Math.max(next + 0.25, Math.min(end, next + 10))));
    stopAudio();
  };
  const changeEnd = (value) => {
    const next = Math.max(0.25, Math.min(buffer.duration, value));
    setEnd(next); setStart(Math.max(0, Math.min(next - 0.25, Math.max(start, next - 10))));
    stopAudio();
  };
  const selectSound = (id) => run(async () => {
    await soundRequest('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soundId: id }) });
    await onChange?.(); onNotice?.('Victory sound updated.');
  });
  const previewSound = (id) => run(async () => { await enableAudio(); await playVictory(id); });
  const save = (event) => {
    event.preventDefault();
    run(async () => {
      stopAudio();
      await soundRequest('/api/sounds', {
        method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Clip-Name': encodeURIComponent(name.trim()) },
        body: encodeWave(buffer, start, end),
      });
      setBuffer(null); setName(''); await onChange?.(); onNotice?.('Clip saved. Pick it below for your next victory.');
    });
  };
  return <section className="soundboard" aria-label="Soundboard">
    <div className="sound-intro"><h3>A sound worth winning for.</h3><p>Use our victory chime or make a 10-second moment of your own.</p></div>
    <label className={`sound-upload ${busy ? 'is-busy' : ''}`}>
      <span className="sound-upload-symbol" aria-hidden="true">♫</span>
      <span><strong>{busy ? 'Working on your audio…' : 'Choose an audio file'}</strong><small>MP3, WAV, M4A and other formats your browser supports. Up to 30 MB.</small></span>
      <input type="file" accept="audio/*" aria-label="Upload win sound" disabled={busy} onChange={(event) => { loadFile(event.target.files[0]); event.target.value = ''; }} />
    </label>
    {error ? <p role="alert" className="sound-error">{error}</p> : null}
    {buffer ? <form className="sound-editor" onSubmit={save}>
      <div className="sound-editor-heading"><h4>Find the good part</h4><span>{seconds(end - start)} selected</span></div>
      <p>Drag the handles or adjust the times. Your saved clip plays exactly this slice.</p>
      <Waveform buffer={buffer} start={start} end={end} onStart={changeStart} onEnd={changeEnd} />
      <div className="sound-time-fields">
        <label>Start (seconds)<input type="number" min="0" max={Number((buffer.duration - 0.25).toFixed(2))} step="any" value={Number(start.toFixed(2))} onChange={(event) => changeStart(Number(event.target.value))} /></label>
        <label>End (seconds)<input type="number" min="0.25" max={Number(buffer.duration.toFixed(2))} step="any" value={Number(end.toFixed(2))} onChange={(event) => changeEnd(Number(event.target.value))} /></label>
        <button type="button" className="sound-button" onClick={() => run(() => previewBuffer(buffer, start, end))} disabled={busy}>▶ Preview slice</button>
      </div>
      <label className="sound-name">Clip name<input value={name} required maxLength={60} onChange={(event) => setName(event.target.value)} /></label>
      <div className="sound-editor-actions"><button type="button" className="sound-button" disabled={busy} onClick={() => { setBuffer(null); stopAudio(); }}>Cancel</button><button type="submit" className="sound-button sound-button-primary" disabled={busy || !name.trim()}>Save clip</button></div>
    </form> : null}
    <div className="sound-library" aria-label="Saved win sounds">
      {[{ id: 'default', name: 'Victory chime', duration: 10 }, ...sounds.filter((sound) => sound.id !== 'default')].map((sound) => <div className={`sound-item ${selectedSoundId === sound.id ? 'selected' : ''}`} key={sound.id}>
        <button type="button" className="sound-preview" aria-label={`Preview ${sound.name}`} disabled={busy} onClick={() => previewSound(sound.id)}>▶</button>
        <div className="sound-description"><strong>{sound.name}</strong><span>{seconds(sound.duration)}{sound.id === 'default' ? ' · Built in' : ' · Saved clip'}</span></div>
        <button type="button" className="sound-button sound-select" disabled={busy || selectedSoundId === sound.id} onClick={() => selectSound(sound.id)}>{selectedSoundId === sound.id ? '✓ Selected' : 'Use sound'}</button>
        {sound.id !== 'default' ? <button type="button" className="sound-remove" aria-label={`Remove ${sound.name}`} disabled={busy} onClick={() => setRemoveId(removeId === sound.id ? null : sound.id)}>×</button> : null}
        {removeId === sound.id ? <div className="sound-delete-confirm"><span>Remove this saved clip?</span><button type="button" className="sound-button" onClick={() => setRemoveId(null)}>Keep it</button><button type="button" className="sound-button" disabled={busy} onClick={() => run(async () => { await soundRequest(`/api/sounds/${sound.id}`, { method: 'DELETE' }); setRemoveId(null); await onChange?.(); onNotice?.('Clip removed.'); })}>Remove clip</button></div> : null}
      </div>)}
    </div>
  </section>;
}
