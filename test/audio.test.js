import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWave } from '../src/audio.js';
import { inspectWave } from '../server/sounds.js';

function fixture({ duration = 12, sampleRate = 8000, channels = 2 } = {}) {
  const length = duration * sampleRate;
  return {
    sampleRate, length, numberOfChannels: channels,
    getChannelData(channel) {
      const data = new Float32Array(length);
      for (let frame = 0; frame < length; frame += 1) data[frame] = channel === 0 ? frame / length : -(frame / length);
      return data;
    },
  };
}

test('export stores only the selected slice with correct interleaved stereo samples', () => {
  const audio = fixture();
  const wave = Buffer.from(encodeWave(audio, 2, 5));
  assert.deepEqual(inspectWave(wave), { duration: 3, channels: 2, sampleRate: 8000 });
  assert.equal(wave.length, 44 + 3 * 8000 * 2 * 2);
  assert.ok(Math.abs(wave.readInt16LE(44) - (2 / 12) * 32767) < 2);
  assert.ok(Math.abs(wave.readInt16LE(46) + (2 / 12) * 32768) < 2);
});

test('a ten-second clip and a short quarter-second clip both survive server validation', () => {
  for (const duration of [0.25, 10]) {
    const wave = Buffer.from(encodeWave(fixture(), 0, duration));
    assert.equal(inspectWave(wave).duration, duration);
  }
});

test('rejects oversized selections before allocation', () => {
  assert.throws(() => encodeWave(fixture(), 0, 11), /10 seconds/);
});

test('rejects malformed, forged, unsupported and overlong uploads', () => {
  const original = Buffer.from(encodeWave(fixture(), 0, 1));
  const cases = [Buffer.from('<script>alert(1)</script>'), Buffer.alloc(0), original.subarray(0, 43)];
  for (const offset of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const corrupt = Buffer.from(original);
    corrupt.writeUInt32LE(0xffffffff, offset);
    cases.push(corrupt);
  }
  cases.push(Buffer.concat([original, Buffer.from([0])]));
  for (const offset of [0, 8, 12, 36]) {
    const corrupt = Buffer.from(original);
    for (let index = offset; index < offset + 4; index++) corrupt[index] |= 0x80;
    cases.push(corrupt);
  }
  for (const file of cases) assert.throws(() => inspectWave(file), { status: 400 });
});

test('samples are clipped to PCM range and extra channels are omitted', () => {
  const source = { sampleRate: 8000, length: 2000, numberOfChannels: 3, getChannelData(channel) { return new Float32Array(2000).fill(channel === 0 ? 3 : -3); } };
  const wave = Buffer.from(encodeWave(source, 0, 0.25));
  assert.equal(inspectWave(wave).channels, 2);
  assert.equal(wave.readInt16LE(44), 32767);
  assert.equal(wave.readInt16LE(46), -32768);
});
