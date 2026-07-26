import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { audioEngine } from '../services/audioEngine.js';
import { formatTime } from './CueRow.jsx';

export function TransportBar() {
  const { project, selectedCueId, armedCueId, armCue, cueStates, meters, transport, updateSettings } = useApp();
  const active = Object.values(cueStates).filter((value) => ['playing', 'paused', 'fading'].includes(value.state));
  const selectedState = cueStates[selectedCueId]?.state || 'ready';
  const selectedIsPlaying = selectedState === 'playing';
  const selectedCue = project.cues.find((cue) => cue.id === selectedCueId);
  const armedCue = project.cues.find((cue) => cue.id === armedCueId);
  const liveSafe = project.settings.operationMode === 'live';
  const selectedCanArm = selectedCue && !['playing', 'paused', 'fading'].includes(selectedState);
  const remaining = project.cues.reduce((sum, cue) => {
    const state = cueStates[cue.id];
    if (!state || !['playing', 'paused'].includes(state.state)) return sum;
    return sum + Math.max(0, (state.duration || cue.duration || 0) - (state.position || 0));
  }, 0);
  const masterVolume = project.settings.masterVolume ?? 0.75;
  const peak = meters.master?.truePeak ?? meters.master?.peak ?? -60;
  const clip = peak >= -0.1;

  React.useEffect(() => {
    const reset = () => audioEngine.resetLoudness();
    window.addEventListener('cuepilot-reset-loudness', reset);
    return () => window.removeEventListener('cuepilot-reset-loudness', reset);
  }, []);

  return (
    <footer className="transport-bar">
      <div className="master-control">
        <div className={`master-knob ${clip ? 'clip' : ''}`} style={{ '--knob-value': `${masterVolume * 270 - 135}deg` }}>
          <span className="knob-indicator" />
        </div>
        <div className="master-copy"><strong>{(20 * Math.log10(Math.max(masterVolume, 0.0001))).toFixed(1)} dB</strong><span>Master Volume</span></div>
        <input aria-label="Master volume" type="range" min="0" max="1.25" step="0.01" value={masterVolume} onChange={(event) => updateSettings({ masterVolume: Number(event.target.value) })} />
      </div>
      <div className="transport-controls">
        <button onClick={() => transport('previous')} title="Previous cue"><i className="bi bi-skip-backward-fill" /></button>
        {liveSafe && <button className={`transport-arm ${armedCue ? 'armed' : ''}`} disabled={!selectedCanArm} onClick={() => armCue(selectedCueId)} title={armedCue?.id === selectedCueId ? `Disarm ${selectedCue.name}` : selectedCanArm ? `Arm ${selectedCue.name}` : 'Select an inactive cue to arm'} aria-pressed={armedCue?.id === selectedCueId}><i className={`bi ${armedCue?.id === selectedCueId ? 'bi-shield-check' : 'bi-shield-plus'}`} /><span>{armedCue ? String(armedCue.number).padStart(2, '0') : 'ARM'}</span></button>}
        <button
          className={`transport-go ${!liveSafe && selectedIsPlaying ? 'playing' : ''} ${liveSafe ? 'live-go' : ''}`}
          disabled={liveSafe && !armedCue}
          onClick={() => transport(liveSafe ? 'go' : 'play-pause')}
          title={liveSafe ? armedCue ? `GO — play armed cue ${armedCue.name} — Enter` : 'Arm a cue before GO' : selectedIsPlaying ? 'Pause selected cue — Space' : 'Play selected cue — Space'}
          aria-label={liveSafe ? armedCue ? `GO — play armed cue ${armedCue.name}` : 'GO — no cue armed' : selectedIsPlaying ? 'Pause selected cue' : 'Play selected cue'}
          aria-pressed={liveSafe ? undefined : selectedIsPlaying}
        ><i className={`bi ${!liveSafe && selectedIsPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`} /></button>
        <button onClick={() => transport('stop-all')} title="Stop all — Escape"><i className="bi bi-stop-fill" /></button>
        <button onClick={() => transport('next')} title="Next cue"><i className="bi bi-skip-forward-fill" /></button>
        <button className="panic" onClick={() => transport('panic')} title="Panic — Shift+Escape">PANIC</button>
      </div>
      <div className="transport-stats">
        <div><span>Active</span><strong>{active.length}</strong></div>
        <div><span>Remaining</span><strong>{formatTime(remaining)}</strong></div>
        <div><span>True peak</span><strong>{peak.toFixed(1)} dBTP</strong></div>
        <div><span>Clock</span><strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
      </div>
    </footer>
  );
}
