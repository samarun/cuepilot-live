import React, { useEffect, useRef, useState } from 'react';

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return Math.abs(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function displaySeconds(value) {
  return Number(value || 0).toFixed(1);
}

export function Waveform({
  cue,
  progress = 0,
  active = false,
  duration = 0,
  onSeek,
  onScrub,
  onScrubEnd,
  onBoundaryChange,
  onFadeChange,
  locked = false
}) {
  const canvasRef = useRef(null);
  const timelineRef = useRef(null);
  const interaction = useRef(null);
  const lastScrubAt = useRef(0);
  const cueStart = clamp(cue.startTime, 0, Math.max(0, duration - 0.05));
  const cueEnd = Number(cue.endTime || 0) > 0 ? clamp(cue.endTime, cueStart + 0.05, duration) : duration;
  const cueFadeInMs = Math.max(0, Number(cue.fadeInMs || 0));
  const cueFadeOutMs = Math.max(0, Number(cue.fadeOutMs || 0));
  const [trim, setTrim] = useState({ start: cueStart, end: cueEnd });
  const [fades, setFades] = useState({ inMs: cueFadeInMs, outMs: cueFadeOutMs });

  useEffect(() => {
    if (!interaction.current || !['start', 'end'].includes(interaction.current.mode)) {
      setTrim({ start: cueStart, end: cueEnd });
    }
  }, [cueStart, cueEnd]);

  useEffect(() => {
    if (!interaction.current || !['fade-in', 'fade-out'].includes(interaction.current.mode)) {
      setFades({ inMs: cueFadeInMs, outMs: cueFadeOutMs });
    }
  }, [cueFadeInMs, cueFadeOutMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    const muted = styles.getPropertyValue('--wave-muted').trim() || 'rgba(148,163,184,.35)';
    const accent = styles.getPropertyValue('--wave-accent').trim() || '#3ddc97';
    const seed = hash(cue.id || cue.name || 'cue');
    const bars = Math.max(35, Math.floor(width / 3.5));
    const center = height / 2;
    const played = Math.max(0, Math.min(1, progress));
    context.lineWidth = 1.4;
    context.lineCap = 'round';
    for (let index = 0; index < bars; index += 1) {
      const x = (index / (bars - 1)) * width;
      const wave = Math.sin(index * 0.73 + seed) * 0.33 + Math.sin(index * 0.17 + seed * 0.01) * 0.22;
      const noise = ((Math.sin(seed * (index + 1) * 0.00013) + 1) / 2) * 0.45;
      const envelope = Math.sin((index / bars) * Math.PI) * 0.65 + 0.25;
      const amplitude = Math.max(2, (Math.abs(wave) + noise) * envelope * center * 0.9);
      context.strokeStyle = index / bars <= played && active ? accent : muted;
      context.beginPath();
      context.moveTo(x, center - amplitude);
      context.lineTo(x, center + amplitude);
      context.stroke();
    }
  }, [cue.id, cue.name, progress, active]);

  const positionFromPointer = (event) => {
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!bounds || duration <= 0) return 0;
    return clamp(((event.clientX - bounds.left) / bounds.width) * duration, 0, duration);
  };

  const updateTrim = (mode, rawPosition) => {
    setTrim((current) => {
      if (mode === 'start') return { ...current, start: clamp(rawPosition, 0, Math.max(0, current.end - 0.05)) };
      return { ...current, end: clamp(rawPosition, Math.min(duration, current.start + 0.05), duration) };
    });
  };

  const commitTrim = (nextTrim = trim) => {
    const startTime = clamp(nextTrim.start, 0, Math.max(0, duration - 0.05));
    const end = clamp(nextTrim.end, startTime + 0.05, duration);
    onBoundaryChange?.({ startTime, endTime: Math.abs(end - duration) < 0.05 ? 0 : end });
  };

  const updateFade = (mode, rawPosition) => {
    const spanMs = Math.max(0, trim.end - trim.start) * 1000;
    setFades((current) => mode === 'fade-in'
      ? { ...current, inMs: clamp((rawPosition - trim.start) * 1000, 0, spanMs) }
      : { ...current, outMs: clamp((trim.end - rawPosition) * 1000, 0, spanMs) });
  };

  const commitFade = (mode, rawPosition) => {
    const spanMs = Math.max(0, trim.end - trim.start) * 1000;
    if (mode === 'fade-in') {
      const fadeInMs = Math.round(clamp((rawPosition - trim.start) * 1000, 0, spanMs));
      setFades((current) => ({ ...current, inMs: fadeInMs }));
      onFadeChange?.({ fadeInMs });
    } else {
      const fadeOutMs = Math.round(clamp((trim.end - rawPosition) * 1000, 0, spanMs));
      setFades((current) => ({ ...current, outMs: fadeOutMs }));
      onFadeChange?.({ fadeOutMs });
    }
  };

  const finishInteraction = (event, cancelled = false) => {
    const current = interaction.current;
    if (!current || (event.pointerId != null && current.pointerId !== event.pointerId)) return;
    if (current.mode === 'playhead' && current.moved) {
      // Always land exactly where the pointer was released. The short scrub
      // previews may be throttled, but the final cue position must not be.
      onSeek?.(positionFromPointer(event));
      onScrubEnd?.();
    }
    if (!cancelled && ['start', 'end'].includes(current.mode)) {
      const position = positionFromPointer(event);
      const nextTrim = current.mode === 'start'
        ? { ...trim, start: clamp(position, 0, Math.max(0, trim.end - 0.05)) }
        : { ...trim, end: clamp(position, Math.min(duration, trim.start + 0.05), duration) };
      setTrim(nextTrim);
      commitTrim(nextTrim);
    }
    if (!cancelled && ['fade-in', 'fade-out'].includes(current.mode)) commitFade(current.mode, positionFromPointer(event));
    interaction.current = null;
  };

  const startPercent = duration > 0 ? (trim.start / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trim.end / duration) * 100 : 100;
  const playheadPercent = Math.max(0, Math.min(100, progress * 100));
  const fadeInPercent = duration > 0 ? Math.min(endPercent - startPercent, (fades.inMs / 1000 / duration) * 100) : 0;
  const fadeOutPercent = duration > 0 ? Math.min(endPercent - startPercent, (fades.outMs / 1000 / duration) * 100) : 0;

  return (
    <div className="cue-timeline-wrap">
      <div
        ref={timelineRef}
        className={`cue-timeline ${locked ? 'locked' : ''}`}
        data-testid={`cue-timeline-${cue.id}`}
        role="slider"
        tabIndex={0}
        aria-label={`Seek and scrub ${cue.name}`}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(progress * duration * 10) / 10}
        aria-disabled={locked}
        onPointerDown={(event) => {
          if (locked || !onSeek || duration <= 0) return;
          event.stopPropagation();
          const mode = event.target.closest('[data-handle]')?.dataset.handle || 'playhead';
          const position = positionFromPointer(event);
          interaction.current = { pointerId: event.pointerId, mode, startX: event.clientX, moved: false };
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
          if (mode === 'playhead') onSeek(position);
          else if (mode === 'start' || mode === 'end') updateTrim(mode, position);
          else updateFade(mode, position);
        }}
        onPointerMove={(event) => {
          const current = interaction.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const position = positionFromPointer(event);
          current.moved = current.moved || Math.abs(event.clientX - current.startX) > 2;
          if (current.mode === 'playhead' && current.moved) {
            const now = performance.now();
            if (now - lastScrubAt.current > 35) {
              lastScrubAt.current = now;
              onScrub?.(position);
            }
          } else if (current.mode === 'start' || current.mode === 'end') updateTrim(current.mode, position);
          else updateFade(current.mode, position);
        }}
        onPointerUp={(event) => finishInteraction(event)}
        onPointerCancel={(event) => finishInteraction(event, true)}
        onKeyDown={(event) => {
          if (locked || !onSeek || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          onSeek(clamp(progress * duration + direction, 0, duration));
        }}
      >
        <canvas className="cue-waveform" ref={canvasRef} />
        <span className="cue-trim-shade before" style={{ width: `${startPercent}%` }} />
        <span className="cue-trim-shade after" style={{ left: `${endPercent}%` }} />
        <span className="cue-playhead" style={{ left: `${playheadPercent}%` }} />
        {fadeInPercent > 0 && <span className="cue-fade-zone in" style={{ left: `${startPercent}%`, width: `${fadeInPercent}%` }} />}
        {fadeOutPercent > 0 && <span className="cue-fade-zone out" style={{ left: `${endPercent - fadeOutPercent}%`, width: `${fadeOutPercent}%` }} />}
        <span className="cue-fade-handle in" data-handle="fade-in" style={{ left: `${startPercent + fadeInPercent}%` }} title="Drag fade-in duration" aria-hidden="true"><i className="bi bi-graph-up" /></span>
        <span className="cue-fade-handle out" data-handle="fade-out" style={{ left: `${endPercent - fadeOutPercent}%` }} title="Drag fade-out duration" aria-hidden="true"><i className="bi bi-graph-down" /></span>
        <span className="cue-trim-handle start" data-handle="start" style={{ left: `${startPercent}%` }} title="Drag cue start" aria-hidden="true"><span>IN</span></span>
        <span className="cue-trim-handle end" data-handle="end" style={{ left: `${endPercent}%` }} title="Drag cue end" aria-hidden="true"><span>OUT</span></span>
      </div>
      <div className="cue-boundary-controls" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <label>IN <input disabled={locked} aria-label={`Start time for ${cue.name}`} data-testid={`cue-start-${cue.id}`} type="number" min="0" max={Math.max(0, trim.end - 0.05)} step="0.1" value={displaySeconds(trim.start)} onChange={(event) => { const next = { ...trim, start: clamp(event.target.value, 0, Math.max(0, trim.end - 0.05)) }; setTrim(next); commitTrim(next); }} /></label>
        <span>Drag waveform to scrub</span>
        <label>OUT <input disabled={locked} aria-label={`End time for ${cue.name}`} data-testid={`cue-end-${cue.id}`} type="number" min={Math.min(duration, trim.start + 0.05)} max={duration} step="0.1" value={displaySeconds(trim.end)} onChange={(event) => { const next = { ...trim, end: clamp(event.target.value, Math.min(duration, trim.start + 0.05), duration) }; setTrim(next); commitTrim(next); }} /></label>
      </div>
      <div className="cue-fade-controls" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <label><i className="bi bi-graph-up" /> IN FADE <input disabled={locked} aria-label={`Fade in for ${cue.name}`} data-testid={`cue-fade-in-${cue.id}`} type="number" min="0" step="10" value={Math.round(fades.inMs)} onChange={(event) => { const fadeInMs = Math.max(0, Number(event.target.value) || 0); setFades((current) => ({ ...current, inMs: fadeInMs })); onFadeChange?.({ fadeInMs }); }} /> <span>ms</span></label>
        <label>OUT FADE <input disabled={locked} aria-label={`Fade out for ${cue.name}`} data-testid={`cue-fade-out-${cue.id}`} type="number" min="0" step="10" value={Math.round(fades.outMs)} onChange={(event) => { const fadeOutMs = Math.max(0, Number(event.target.value) || 0); setFades((current) => ({ ...current, outMs: fadeOutMs })); onFadeChange?.({ fadeOutMs }); }} /> <span>ms</span><i className="bi bi-graph-down" /></label>
      </div>
    </div>
  );
}
