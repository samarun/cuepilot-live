import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { formatTime } from './CueRow.jsx';
import { HorizontalMeter } from './Meters.jsx';

export function CueGridCard({ cue, onEdit }) {
  const { project, cueStates, meters, triggerCue, selectedCueId, selectedCueIds, selectCue, armedCueId, armCue } = useApp();
  const state = cueStates[cue.id]?.state || 'ready';
  const position = cueStates[cue.id]?.position || 0;
  const duration = cueStates[cue.id]?.duration || cue.duration || 0;
  const active = ['playing', 'paused', 'fading'].includes(state);
  const liveSafe = project.settings.operationMode === 'live';
  const armed = armedCueId === cue.id;
  const trigger = () => {
    if (state === 'playing') triggerCue(cue.id, 'pause');
    else if (state === 'paused') triggerCue(cue.id, 'resume');
    else if (liveSafe) armCue(cue.id);
    else triggerCue(cue.id, 'play');
  };
  return (
    <article className={`cue-grid-card cue-${cue.color || 'emerald'} ${active ? 'active' : ''} ${armed ? 'armed' : ''} ${selectedCueId === cue.id || selectedCueIds.includes(cue.id) ? 'selected' : ''}`} onClick={(event) => selectCue(cue.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })}>
      <div className="grid-card-top">
        <span className="grid-cue-number">{String(cue.number).padStart(2, '0')}</span>
        {cue.shortcut && <kbd>{cue.shortcut}</kbd>}
        <button className="icon-button" onClick={(event) => { event.stopPropagation(); onEdit(cue); }}><i className="bi bi-three-dots" /></button>
      </div>
      <button className="grid-trigger" aria-label={`${state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : liveSafe ? armed ? 'Disarm' : 'Arm' : 'Play'} ${cue.name}`} onClick={(event) => { event.stopPropagation(); trigger(); }}>
        <i className={`bi ${state === 'playing' ? 'bi-pause-fill' : state === 'paused' ? 'bi-play-fill' : liveSafe ? armed ? 'bi-shield-check' : 'bi-shield-plus' : 'bi-play-fill'}`} />
      </button>
      <h3>{cue.name}</h3>
      <p>{cue.description || cue.fileName}</p>
      <div className="grid-progress"><span style={{ width: `${duration ? Math.min(100, position / duration * 100) : 0}%` }} /></div>
      <HorizontalMeter value={meters.cues?.[cue.id]?.rms ?? -60} peak={meters.cues?.[cue.id]?.peak ?? -60} compact />
      <div className="grid-card-footer"><span>{formatTime(position)} / {formatTime(duration)}</span><span>{armed && !active ? 'armed' : cue.loop ? <i className="bi bi-repeat" /> : state}</span></div>
    </article>
  );
}
