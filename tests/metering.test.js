import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, energyToLufs, estimateTruePeak, gatedIntegratedLoudness } from '../client/src/services/audioEngine.js';

const energyAtLufs = (lufs) => 10 ** ((lufs + 0.691) / 10);

test('loudness conversion follows the BS.1770 offset', () => {
  assert.ok(Math.abs(energyToLufs([energyAtLufs(-23)]) + 23) < 0.001);
});

test('integrated loudness applies the absolute and relative gates', () => {
  const blocks = [energyAtLufs(-20), energyAtLufs(-20), energyAtLufs(-40), energyAtLufs(-80)];
  assert.ok(Math.abs(gatedIntegratedLoudness(blocks) + 20) < 0.01);
});

test('4x true-peak interpolation never under-reads sample peak', () => {
  const samples = Float32Array.from({ length: 256 }, (_, index) => Math.sin(index * Math.PI * 0.49));
  const samplePeak = Math.max(...samples.map((value) => Math.abs(value)));
  assert.ok(estimateTruePeak(samples) >= samplePeak);
});

test('cue end boundaries clamp seek positions and playback end', () => {
  const engine = new AudioEngine();
  const buffer = { duration: 120 };
  const cue = { endTime: 45, loop: false };
  assert.equal(engine.playbackEnd(cue, buffer), 45);
  assert.equal(engine.normaliseCueOffset(cue, buffer, 90), 44.999);
});

test('changing OUT during playback rebuilds the running source with the new boundary', () => {
  const engine = new AudioEngine();
  const stopped = [];
  const started = [];
  engine.context = { currentTime: 6 };
  engine.runtimes.set('cue-1', {
    cue: { id: 'cue-1', endTime: 20, loop: false },
    buffer: { duration: 30 },
    offset: 2,
    startedAt: 2,
    state: 'playing',
    suppressEnded: false,
    source: { stop: () => stopped.push(true) }
  });
  engine.createRuntime = (cue, buffer, offset) => ({ cue, buffer, offset, state: 'playing' });
  engine.startRuntime = (runtime) => started.push(runtime);
  engine.emitStatus = () => {};

  engine.updateCue({ id: 'cue-1', startTime: 0, endTime: 9, loop: false }, { endTime: 9 });

  assert.equal(stopped.length, 1);
  assert.equal(started.length, 1);
  assert.equal(started[0].offset, 6);
  assert.equal(started[0].cue.endTime, 9);
});

test('moving OUT behind the playhead completes the cue immediately', () => {
  const engine = new AudioEngine();
  const statuses = [];
  engine.context = { currentTime: 10 };
  engine.runtimes.set('cue-1', {
    cue: { id: 'cue-1', endTime: 20, loop: false },
    buffer: { duration: 30 },
    offset: 4,
    startedAt: 4,
    state: 'playing',
    suppressEnded: false,
    source: { stop: () => {} }
  });
  engine.emitStatus = (...args) => statuses.push(args);

  engine.updateCue({ id: 'cue-1', startTime: 0, endTime: 8, loop: false }, { endTime: 8 });

  assert.equal(engine.runtimes.has('cue-1'), false);
  assert.deepEqual(statuses.at(-1), ['cue-1', 'completed', 8]);
});

test('runtime envelopes fade in from IN and fade out into OUT', () => {
  const engine = new AudioEngine();
  const automation = [];
  const starts = [];
  engine.context = { currentTime: 10 };
  const runtime = {
    cue: { endTime: 10, loop: false, volume: 0.8, fadeInMs: 1000, fadeOutMs: 2000 },
    buffer: { duration: 20 },
    offset: 2,
    gain: { gain: {
      cancelScheduledValues: (time) => automation.push(['cancel', time]),
      setValueAtTime: (value, time) => automation.push(['set', value, time]),
      exponentialRampToValueAtTime: (value, time) => automation.push(['ramp', value, time])
    } },
    source: { start: (...args) => starts.push(args) }
  };

  engine.startRuntime(runtime);

  assert.deepEqual(starts, [[0, 2, 8]]);
  assert.deepEqual(automation, [
    ['cancel', 10],
    ['set', 0.0001, 10],
    ['ramp', 0.8, 11],
    ['set', 0.8, 16],
    ['ramp', 0.0001, 18]
  ]);
});

test('mute silences a running cue and unmute restores its stored volume', () => {
  const engine = new AudioEngine();
  const targets = [];
  engine.context = { currentTime: 4 };
  engine.runtimes.set('cue-1', {
    cue: { id: 'cue-1', volume: 0.72, muted: false },
    state: 'paused',
    gain: { gain: { setTargetAtTime: (...args) => targets.push(args) } },
    buffer: { duration: 20 },
    offset: 3
  });

  engine.updateCue({ id: 'cue-1', volume: 0.72, muted: true }, { muted: true });
  engine.updateCue({ id: 'cue-1', volume: 0.72, muted: false }, { muted: false });

  assert.deepEqual(targets, [[0.0001, 4, 0.015], [0.72, 4, 0.015]]);
});

test('crossfade stops other cues with the requested fade duration', async () => {
  const engine = new AudioEngine();
  const stops = [];
  engine.runtimes.set('old-cue', {});
  engine.runtimes.set('new-cue', {});
  engine.stop = async (cueId, options) => stops.push([cueId, options]);

  await engine.stopOthers('new-cue', false, 650);

  assert.deepEqual(stops, [['old-cue', { immediate: false, fadeMs: 650 }]]);
});
