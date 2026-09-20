let audioContext;
let activeSource;
let playbackGeneration = 0;

export function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass)
    throw new Error('This browser cannot edit audio. Try a recent Chrome, Firefox, or Safari.');
  audioContext ||= new AudioContextClass();
  return audioContext;
}

export async function enableAudio() {
  const context = getAudioContext();
  await context.resume();
  if (context.state !== 'running') throw new Error('Tap Enable sound again to allow playback.');
  return context;
}

export function stopAudio() {
  playbackGeneration += 1;
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {
      /* Already ended. */
    }
    activeSource = undefined;
  }
}

export async function previewBuffer(buffer, start, end) {
  const context = await enableAudio();
  stopAudio();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0, start, end - start);
  activeSource = source;
}

function victoryChime(context) {
  // Original ten-second arpeggio, generated locally; no licensed recording.
  const length = 10 * context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / context.sampleRate;
    let sample = 0;
    for (let note = 0; note < notes.length; note += 1) {
      const elapsed = time - note * 0.19;
      if (elapsed >= 0) {
        const envelope = Math.min(1, elapsed / 0.012) * Math.exp(-elapsed * 1.25);
        sample +=
          0.075 *
          envelope *
          (Math.sin(2 * Math.PI * notes[note] * elapsed) +
            0.18 * Math.sin(4 * Math.PI * notes[note] * elapsed));
      }
    }
    samples[index] = sample;
  }
  return buffer;
}

let chime;
export async function playVictory(soundId = 'default') {
  const context = getAudioContext();
  if (context.state !== 'running')
    throw new Error('Enable sound on this screen to hear celebrations.');
  stopAudio();
  const generation = playbackGeneration;
  let buffer;
  if (soundId === 'default') {
    chime ||= victoryChime(context);
    buffer = chime;
  } else {
    try {
      const response = await fetch(`/media/${encodeURIComponent(soundId)}.wav`);
      if (!response.ok) throw new Error('The saved sound is unavailable.');
      buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      chime ||= victoryChime(context);
      buffer = chime;
    }
  }
  if (generation !== playbackGeneration) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0, 0, Math.min(10, buffer.duration));
  activeSource = source;
}

/** Export actual trimmed, interleaved 16-bit PCM, not just trim metadata. */
export function encodeWave(buffer, start, end) {
  const sampleRate = buffer.sampleRate;
  const channels = Math.min(2, buffer.numberOfChannels);
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(buffer.length, Math.floor(end * sampleRate));
  const frames = last - first;
  if (frames <= 0 || frames > sampleRate * 10 + 1)
    throw new Error('Select a clip no longer than 10 seconds.');
  const bytes = frames * channels * 2;
  const result = new ArrayBuffer(44 + bytes);
  const view = new DataView(result);
  const text = (offset, value) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  const channelData = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let frame = first; frame < last; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return result;
}
