const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const db = (linear) => linear > 0 ? 20 * Math.log10(linear) : -60;
const sinc = (value) => value === 0 ? 1 : Math.sin(Math.PI * value) / (Math.PI * value);

const TRUE_PEAK_KERNELS = [0.25, 0.5, 0.75].map((fraction) => {
  const coefficients = [];
  for (let offset = -7; offset <= 8; offset += 1) {
    const distance = fraction - offset;
    const window = Math.abs(distance) < 8 ? 0.5 + 0.5 * Math.cos(Math.PI * distance / 8) : 0;
    coefficients.push(sinc(distance) * window);
  }
  const normalisation = coefficients.reduce((sum, value) => sum + value, 0);
  return coefficients.map((value) => value / normalisation);
});

export function estimateTruePeak(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  for (let index = 7; index < samples.length - 8; index += 1) {
    for (const kernel of TRUE_PEAK_KERNELS) {
      let interpolated = 0;
      for (let tap = 0; tap < kernel.length; tap += 1) interpolated += samples[index + tap - 7] * kernel[tap];
      peak = Math.max(peak, Math.abs(interpolated));
    }
  }
  return peak;
}

export function energyToLufs(values) {
  if (!values.length) return -70;
  const energy = values.reduce((sum, value) => sum + value, 0) / values.length;
  return energy > 0 ? clamp(10 * Math.log10(energy) - 0.691, -70, 5) : -70;
}

export function gatedIntegratedLoudness(blocks) {
  const aboveAbsoluteGate = blocks.filter((energy) => energyToLufs([energy]) >= -70);
  if (!aboveAbsoluteGate.length) return -70;
  const threshold = Math.max(-70, energyToLufs(aboveAbsoluteGate) - 10);
  return energyToLufs(aboveAbsoluteGate.filter((energy) => energyToLufs([energy]) >= threshold));
}

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.context = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.leftAnalyser = null;
    this.rightAnalyser = null;
    this.kLeftAnalyser = null;
    this.kRightAnalyser = null;
    this.runtimes = new Map();
    this.buffers = new Map();
    this.queuedOffsets = new Map();
    this.scrubPreviewRuntime = null;
    this.masterVolume = 0.75;
    this.meterFrame = null;
    this.lastMeterEmit = 0;
    this.shortWindow = [];
    this.momentaryWindow = [];
    this.gatingBlocks = [];
    this.meterTicks = 0;
  }

  async initialize() {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('Web Audio API is not supported by this browser.');
    this.context = new Context({ latencyHint: 'interactive' });
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterAnalyser = this.context.createAnalyser();
    this.masterAnalyser.fftSize = 4096;
    this.masterAnalyser.smoothingTimeConstant = 0.35;
    const splitter = this.context.createChannelSplitter(2);
    this.leftAnalyser = this.context.createAnalyser();
    this.rightAnalyser = this.context.createAnalyser();
    this.leftAnalyser.fftSize = 4096;
    this.rightAnalyser.fftSize = 4096;
    this.kLeftAnalyser = this.createKWeightedAnalyser(splitter, 0);
    this.kRightAnalyser = this.createKWeightedAnalyser(splitter, 1);
    this.masterGain.connect(this.masterAnalyser);
    this.masterGain.connect(splitter);
    splitter.connect(this.leftAnalyser, 0);
    splitter.connect(this.rightAnalyser, 1);
    this.masterAnalyser.connect(this.context.destination);
    await this.context.resume();
    this.startMetering();
    this.emit('engine', { enabled: true, state: this.context.state });
  }

  createKWeightedAnalyser(splitter, channel) {
    let shelf;
    let highPass;
    if (Math.abs(this.context.sampleRate - 48_000) < 1) {
      shelf = this.context.createIIRFilter(
        [1.53512485958697, -2.69169618940638, 1.19839281085285],
        [1, -1.69065929318241, 0.73248077421585]
      );
      highPass = this.context.createIIRFilter(
        [1, -2, 1],
        [1, -1.99004745483398, 0.99007225036621]
      );
    } else {
      shelf = this.context.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 1681.974450955533;
      shelf.gain.value = 3.999843853973347;
      highPass = this.context.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 38.13547087602444;
      highPass.Q.value = 0.5003270373238773;
    }
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    splitter.connect(shelf, channel);
    shelf.connect(highPass);
    highPass.connect(analyser);
    return analyser;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async loadCue(cue) {
    if (!cue.mediaUrl) throw new Error('This cue has no audio file.');
    if (this.buffers.has(cue.id)) return this.buffers.get(cue.id);
    const response = await fetch(cue.mediaUrl);
    if (!response.ok) throw new Error(`Unable to load ${cue.fileName || cue.name}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
    this.buffers.set(cue.id, buffer);
    this.emit('loaded', { cueId: cue.id, duration: buffer.duration });
    return buffer;
  }

  invalidateCue(cueId) {
    this.buffers.delete(cueId);
    this.queuedOffsets.delete(cueId);
  }

  normaliseOffset(buffer, value, loop = false) {
    const offset = clamp(Number(value) || 0, 0, Math.max(0, buffer.duration));
    if (loop && buffer.duration > 0) return offset % buffer.duration;
    return Math.min(offset, Math.max(0, buffer.duration - 0.001));
  }

  playbackEnd(cue, buffer) {
    const requested = Number(cue.endTime || 0);
    return requested > 0 ? clamp(requested, 0.001, buffer.duration) : buffer.duration;
  }

  normaliseCueOffset(cue, buffer, value) {
    const end = this.playbackEnd(cue, buffer);
    const offset = Number(value) || 0;
    const loopStart = Math.min(Math.max(0, Number(cue.startTime || 0)), Math.max(0, end - 0.001));
    if (cue.loop && end > loopStart && offset >= end) return loopStart + ((offset - loopStart) % (end - loopStart));
    return clamp(offset, 0, Math.max(0, end - 0.001));
  }

  startRuntime(runtime) {
    const end = this.playbackEnd(runtime.cue, runtime.buffer);
    const remaining = Math.max(0.001, end - runtime.offset);
    const now = this.context.currentTime;
    const volume = runtime.cue.muted ? 0.0001 : Math.max(0.0001, Number(runtime.cue.volume ?? 1));
    let fadeIn = Math.max(0, Number(runtime.cue.fadeInMs || 0)) / 1000;
    let fadeOut = runtime.cue.loop ? 0 : Math.max(0, Number(runtime.cue.fadeOutMs || 0)) / 1000;
    if (fadeIn + fadeOut > remaining) {
      const scale = remaining / (fadeIn + fadeOut);
      fadeIn *= scale;
      fadeOut *= scale;
    }

    runtime.gain.gain.cancelScheduledValues(now);
    if (fadeIn > 0) {
      runtime.gain.gain.setValueAtTime(0.0001, now);
      runtime.gain.gain.exponentialRampToValueAtTime(volume, now + fadeIn);
    } else runtime.gain.gain.setValueAtTime(volume, now);
    if (fadeOut > 0) {
      runtime.gain.gain.setValueAtTime(volume, now + remaining - fadeOut);
      runtime.gain.gain.exponentialRampToValueAtTime(0.0001, now + remaining);
    }

    if (runtime.cue.loop) runtime.source.start(0, runtime.offset);
    else runtime.source.start(0, runtime.offset, remaining);
  }

  async preload(cues) {
    await this.initialize();
    for (const cue of cues) {
      if (!cue.mediaUrl || this.buffers.has(cue.id)) continue;
      this.loadCue(cue).catch((error) => this.emit('error', { cueId: cue.id, message: error.message }));
    }
  }

  createRuntime(cue, buffer, offset = 0) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.buffer = buffer;
    source.loop = Boolean(cue.loop);
    if (source.loop) {
      source.loopStart = Math.min(Math.max(0, Number(cue.startTime || 0)), Math.max(0, buffer.duration - 0.001));
      source.loopEnd = this.playbackEnd(cue, buffer);
      if (source.loopEnd <= source.loopStart) source.loopEnd = buffer.duration;
    }
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(this.masterGain);
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    const runtime = {
      cue,
      source,
      gain,
      analyser,
      buffer,
      offset,
      startedAt: this.context.currentTime,
      state: 'playing',
      suppressEnded: false
    };
    source.onended = () => {
      if (runtime.suppressEnded) return;
      if (this.runtimes.get(cue.id) === runtime) {
        runtime.state = 'completed';
        this.runtimes.delete(cue.id);
        this.queuedOffsets.delete(cue.id);
        this.emitStatus(cue.id, 'completed', this.playbackEnd(cue, runtime.buffer));
      }
    };
    return runtime;
  }

  async play(cue, { restart = false, offset = null, exclusive = false, transition = 'cut', crossfadeMs = 0 } = {}) {
    await this.initialize();
    this.stopScrubPreview();
    const existing = this.runtimes.get(cue.id);
    if (existing && existing.state === 'playing') {
      if (cue.triggerMode === 'ignore' && !restart) return;
      if (cue.triggerMode === 'toggle' && !restart) return this.stop(cue.id);
      await this.stop(cue.id, { immediate: true });
    }
    const buffer = await this.loadCue(cue);
    if (exclusive) await this.stopOthers(cue.id, transition !== 'crossfade', transition === 'crossfade' ? crossfadeMs : null);
    const requestedOffset = offset == null
      ? (restart ? cue.startTime : this.queuedOffsets.get(cue.id) ?? cue.startTime)
      : offset;
    const startOffset = this.normaliseCueOffset(cue, buffer, requestedOffset);
    this.queuedOffsets.delete(cue.id);
    const runtime = this.createRuntime(cue, buffer, startOffset);
    this.runtimes.set(cue.id, runtime);
    this.startRuntime(runtime);
    this.emitStatus(cue.id, 'playing', startOffset);
  }

  async resume(cue, { exclusive = false, transition = 'cut', crossfadeMs = 0 } = {}) {
    await this.initialize();
    const previous = this.runtimes.get(cue.id);
    if (!previous || previous.state !== 'paused') return this.play(cue, { exclusive });
    if (exclusive) await this.stopOthers(cue.id, transition !== 'crossfade', transition === 'crossfade' ? crossfadeMs : null);
    const runtime = this.createRuntime(cue, previous.buffer, this.normaliseCueOffset(cue, previous.buffer, previous.offset));
    this.runtimes.set(cue.id, runtime);
    this.startRuntime(runtime);
    this.emitStatus(cue.id, 'playing', previous.offset);
  }

  pause(cueId) {
    const runtime = this.runtimes.get(cueId);
    if (!runtime || runtime.state !== 'playing') return;
    runtime.offset = this.normaliseCueOffset(runtime.cue, runtime.buffer, runtime.offset + this.context.currentTime - runtime.startedAt);
    runtime.state = 'paused';
    runtime.suppressEnded = true;
    runtime.source.stop();
    this.runtimes.set(cueId, runtime);
    this.emitStatus(cueId, 'paused', runtime.offset);
  }

  async stop(cueId, { immediate = false, fadeMs = null } = {}) {
    this.stopScrubPreview(cueId);
    const runtime = this.runtimes.get(cueId);
    if (!runtime) {
      if (this.queuedOffsets.has(cueId)) {
        this.queuedOffsets.delete(cueId);
        this.emitStatus(cueId, 'stopped', 0);
      }
      return;
    }
    if (runtime.state === 'paused' || runtime.state === 'cued') {
      this.runtimes.delete(cueId);
      this.queuedOffsets.delete(cueId);
      this.emitStatus(cueId, 'stopped', 0);
      return;
    }
    const duration = immediate ? 0 : Math.max(0, Number(fadeMs ?? runtime.cue.fadeOutMs ?? 0)) / 1000;
    runtime.state = duration > 0 ? 'fading' : 'stopped';
    this.emitStatus(cueId, runtime.state, this.position(runtime));
    runtime.gain.gain.cancelScheduledValues(this.context.currentTime);
    runtime.gain.gain.setValueAtTime(Math.max(0.0001, runtime.gain.gain.value), this.context.currentTime);
    runtime.gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + Math.max(0.005, duration));
    runtime.suppressEnded = true;
    if (immediate) {
      runtime.gain.gain.cancelScheduledValues(this.context.currentTime);
      runtime.gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      runtime.source.stop(this.context.currentTime);
      this.runtimes.delete(cueId);
      this.queuedOffsets.delete(cueId);
      this.emitStatus(cueId, 'stopped', 0);
      return;
    }
    runtime.source.stop(this.context.currentTime + duration + 0.015);
    window.setTimeout(() => {
      if (this.runtimes.get(cueId) === runtime) this.runtimes.delete(cueId);
      this.emitStatus(cueId, 'stopped', 0);
    }, duration * 1000 + 40);
  }

  restart(cue, options = {}) { return this.play(cue, { ...options, restart: true }); }
  toggle(cue, options = {}) {
    const runtime = this.runtimes.get(cue.id);
    if (!runtime) return this.play(cue, options);
    if (runtime.state === 'paused') return this.resume(cue, options);
    return this.stop(cue.id);
  }
  setCueVolume(cueId, volume) {
    const runtime = this.runtimes.get(cueId);
    if (runtime?.gain) runtime.gain.gain.setTargetAtTime(clamp(Number(volume), 0, 1.5), this.context.currentTime, 0.015);
  }
  setCueLoop(cueId, enabled) {
    const runtime = this.runtimes.get(cueId);
    if (runtime?.source) runtime.source.loop = Boolean(enabled);
  }
  updateCue(cue, changes = {}) {
    const runtime = this.runtimes.get(cue.id);
    const buffer = runtime?.buffer || this.buffers.get(cue.id);
    const boundariesChanged = 'startTime' in changes || 'endTime' in changes;
    const loopChanged = 'loop' in changes;
    const envelopeChanged = 'fadeInMs' in changes || 'fadeOutMs' in changes;

    if (this.queuedOffsets.has(cue.id) && buffer && boundariesChanged) {
      this.queuedOffsets.set(cue.id, this.normaliseCueOffset(cue, buffer, this.queuedOffsets.get(cue.id)));
    }
    if (!runtime) return;

    if (('volume' in changes || 'muted' in changes) && runtime.gain) {
      const volume = cue.muted ? 0.0001 : clamp(Number(cue.volume), 0, 1.5);
      runtime.gain.gain.setTargetAtTime(Math.max(0.0001, volume), this.context.currentTime, 0.015);
    }

    // BufferSource duration and loop points are immutable after start. Rebuild
    // at the current position so live IN/OUT changes take effect immediately.
    if ((boundariesChanged || loopChanged || envelopeChanged) && runtime.state === 'playing') {
      const elapsedPosition = runtime.offset + Math.max(0, this.context.currentTime - runtime.startedAt);
      const end = this.playbackEnd(cue, runtime.buffer);
      const start = Math.min(Math.max(0, Number(cue.startTime || 0)), Math.max(0, end - 0.001));
      runtime.suppressEnded = true;
      try { runtime.source.stop(this.context.currentTime); } catch {}

      if (!cue.loop && elapsedPosition >= end - 0.001) {
        this.runtimes.delete(cue.id);
        this.queuedOffsets.delete(cue.id);
        this.emitStatus(cue.id, 'completed', end);
        return;
      }

      const offset = this.normaliseCueOffset(cue, runtime.buffer, Math.max(start, elapsedPosition));
      const next = this.createRuntime(cue, runtime.buffer, offset);
      this.runtimes.set(cue.id, next);
      this.startRuntime(next);
      this.emitStatus(cue.id, 'playing', offset);
      return;
    }

    runtime.cue = cue;
    if (runtime.state === 'paused' && boundariesChanged) {
      const end = this.playbackEnd(cue, runtime.buffer);
      const start = Math.min(Math.max(0, Number(cue.startTime || 0)), Math.max(0, end - 0.001));
      runtime.offset = this.normaliseCueOffset(cue, runtime.buffer, Math.max(start, runtime.offset));
      this.emitStatus(cue.id, 'paused', runtime.offset);
    }
  }
  setMasterVolume(volume) {
    this.masterVolume = clamp(Number(volume), 0, 1.25);
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.02);
  }
  async stopOthers(exceptCueId, immediate = true, fadeMs = null) {
    return Promise.all([...this.runtimes.keys()].filter((id) => id !== exceptCueId).map((id) => this.stop(id, { immediate, fadeMs })));
  }
  async seek(cue, position, { audition = false, exclusive = false } = {}) {
    await this.initialize();
    this.stopScrubPreview();
    const buffer = await this.loadCue(cue);
    const offset = this.normaliseCueOffset(cue, buffer, position);
    const runtime = this.runtimes.get(cue.id);
    if (audition && exclusive) await this.stopOthers(cue.id, true);
    if (runtime?.state === 'playing' || runtime?.state === 'fading') {
      runtime.suppressEnded = true;
      runtime.source.stop(this.context.currentTime);
      const next = this.createRuntime(cue, buffer, offset);
      this.runtimes.set(cue.id, next);
      this.startRuntime(next);
      this.emitStatus(cue.id, 'playing', offset);
      return;
    }
    if (runtime?.state === 'paused' && !audition) {
      runtime.offset = offset;
      this.emitStatus(cue.id, 'paused', offset);
      return;
    }
    if (audition) {
      const next = this.createRuntime(cue, buffer, offset);
      this.runtimes.set(cue.id, next);
      this.queuedOffsets.delete(cue.id);
      this.startRuntime(next);
      this.emitStatus(cue.id, 'playing', offset);
      return;
    }
    this.queuedOffsets.set(cue.id, offset);
    this.emitStatus(cue.id, 'cued', offset);
  }
  async scrub(cue, position) {
    await this.initialize();
    const buffer = await this.loadCue(cue);
    const offset = this.normaliseCueOffset(cue, buffer, position);
    const activeRuntime = this.runtimes.get(cue.id);
    if (activeRuntime?.state === 'playing' || activeRuntime?.state === 'fading') return this.seek(cue, offset);
    this.stopScrubPreview();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = cue.muted ? 0 : Math.max(0, Number(cue.volume ?? 1));
    source.connect(gain);
    gain.connect(this.masterGain);
    const end = this.playbackEnd(cue, buffer);
    const previewDuration = Math.min(0.09, Math.max(0.001, end - offset));
    const preview = { cueId: cue.id, source, gain };
    this.scrubPreviewRuntime = preview;
    source.onended = () => { if (this.scrubPreviewRuntime === preview) this.scrubPreviewRuntime = null; };
    source.start(0, offset, previewDuration);
    const runtime = this.runtimes.get(cue.id);
    if (runtime?.state === 'paused') runtime.offset = offset;
    else this.queuedOffsets.set(cue.id, offset);
    this.emitStatus(cue.id, runtime?.state === 'paused' ? 'paused' : 'cued', offset);
  }
  stopScrubPreview(cueId = null) {
    const preview = this.scrubPreviewRuntime;
    if (!preview || (cueId && preview.cueId !== cueId)) return;
    this.scrubPreviewRuntime = null;
    try { preview.source.stop(this.context?.currentTime || 0); } catch {}
  }
  stopAll(immediate = false) { this.stopScrubPreview(); return Promise.all([...this.runtimes.keys()].map((id) => this.stop(id, { immediate }))); }
  pauseAll() { for (const id of this.runtimes.keys()) this.pause(id); }
  resumeAll(cuesById) { for (const [id, runtime] of this.runtimes) if (runtime.state === 'paused') this.resume(cuesById.get(id)); }
  panic() { return this.stopAll(true); }

  position(runtime) {
    if (runtime.state === 'paused') return runtime.offset;
    return this.normaliseCueOffset(runtime.cue, runtime.buffer, runtime.offset + Math.max(0, this.context.currentTime - runtime.startedAt));
  }

  emitStatus(cueId, state, position) {
    this.emit('status', { cueId, state, position, activeCount: [...this.runtimes.values()].filter((runtime) => ['playing', 'fading'].includes(runtime.state)).length });
  }

  analyse(analyser, includeTruePeak = false) {
    if (!analyser) return { peak: -60, truePeak: -60, rms: -60, linearPeak: 0, linearTruePeak: 0, linearRms: 0 };
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    let sum = 0;
    for (const sample of data) {
      const absolute = Math.abs(sample);
      if (absolute > peak) peak = absolute;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / data.length);
    const truePeak = includeTruePeak ? estimateTruePeak(data) : peak;
    return { peak: clamp(db(peak), -60, 6), truePeak: clamp(db(truePeak), -60, 6), rms: clamp(db(rms), -60, 6), linearPeak: peak, linearTruePeak: truePeak, linearRms: rms };
  }

  energyToLufs(values) {
    return energyToLufs(values);
  }

  gatedIntegratedLoudness() {
    return gatedIntegratedLoudness(this.gatingBlocks);
  }

  startMetering() {
    const render = (time) => {
      if (time - this.lastMeterEmit >= 33) {
        this.lastMeterEmit = time;
        const left = this.analyse(this.leftAnalyser, true);
        const right = this.analyse(this.rightAnalyser, true);
        const kLeft = this.analyse(this.kLeftAnalyser);
        const kRight = this.analyse(this.kRightAnalyser);
        const samplePeak = Math.max(left.linearPeak, right.linearPeak);
        const truePeak = Math.max(left.linearTruePeak, right.linearTruePeak);
        const masterRms = Math.sqrt((left.linearRms ** 2 + right.linearRms ** 2) / 2);
        const master = {
          peak: clamp(db(samplePeak), -60, 6),
          truePeak: clamp(db(truePeak), -60, 6),
          rms: clamp(db(masterRms), -60, 6),
          linearPeak: samplePeak,
          linearTruePeak: truePeak,
          linearRms: masterRms
        };
        const energy = kLeft.linearRms ** 2 + kRight.linearRms ** 2;
        this.momentaryWindow.push(energy);
        if (this.momentaryWindow.length > 12) this.momentaryWindow.shift();
        this.shortWindow.push(energy);
        if (this.shortWindow.length > 90) this.shortWindow.shift();
        this.meterTicks += 1;
        if (this.meterTicks % 3 === 0 && this.momentaryWindow.length === 12) {
          this.gatingBlocks.push(this.momentaryWindow.reduce((sum, value) => sum + value, 0) / this.momentaryWindow.length);
        }
        const momentary = this.energyToLufs(this.momentaryWindow);
        const shortTerm = this.energyToLufs(this.shortWindow);
        const integrated = this.gatedIntegratedLoudness();
        const cues = {};
        for (const [cueId, runtime] of this.runtimes) {
          const meter = this.analyse(runtime.analyser);
          cues[cueId] = { ...meter, position: this.position(runtime), duration: runtime.buffer.duration, state: runtime.state };
        }
        this.emit('meters', { master: { ...master, left, right, momentary, shortTerm, integrated, standard: 'BS.1770-5 / EBU Mode', sampleRate: this.context.sampleRate }, cues });
      }
      this.meterFrame = requestAnimationFrame(render);
    };
    this.meterFrame = requestAnimationFrame(render);
  }

  resetLoudness() {
    this.shortWindow = [];
    this.momentaryWindow = [];
    this.gatingBlocks = [];
    this.meterTicks = 0;
  }
}

export const audioEngine = new AudioEngine();
