import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { formatTime } from './CueRow.jsx';
import { VerticalMeter, formatLufs } from './Meters.jsx';

export function RightRail() {
  const { project, selectedCueId, armedCueId, armCue, cueStates, meters, triggerCue, updateSettings, setView } = useApp();
  const activeCue = project.cues.find((cue) => cueStates[cue.id]?.state === 'playing') || project.cues.find((cue) => cue.id === selectedCueId) || project.cues[0];
  const state = activeCue ? cueStates[activeCue.id]?.state || 'ready' : 'ready';
  const position = activeCue ? cueStates[activeCue.id]?.position || 0 : 0;
  const duration = activeCue ? cueStates[activeCue.id]?.duration || activeCue.duration || 0 : 0;
  const playbackEnd = activeCue && Number(activeCue.endTime || 0) > 0 ? Math.min(Number(activeCue.endTime), duration) : duration;
  const liveSafe = project.settings.operationMode === 'live';
  const cueIsActive = ['playing', 'paused', 'fading'].includes(state);
  const cueIsArmed = activeCue?.id === armedCueId;
  const scrubMoved = React.useRef(false);
  const scrubWasPlaying = React.useRef(false);
  const scrubStartX = React.useRef(0);
  const scrubPointerId = React.useRef(null);
  const master = meters.master || { peak: -60, truePeak: -60, rms: -60, left: { rms: -60, peak: -60, truePeak: -60 }, right: { rms: -60, peak: -60, truePeak: -60 }, momentary: -70, shortTerm: -70, integrated: -70 };

  return (
    <aside className="right-rail">
      <section className="surface-card now-playing-card">
        <div className="section-eyebrow"><span className="pulse-dot" /> Now Playing <button className="icon-button ms-auto" title="Open full meter view" onClick={() => setView('meters')}><i className="bi bi-arrows-angle-expand" /></button></div>
        {activeCue ? (
          <>
            <h2>{activeCue.name}</h2>
            <p>{activeCue.description || activeCue.fileName}</p>
            <div className="now-time"><strong>{formatTime(position)}</strong><span>/ {formatTime(playbackEnd)}</span></div>
            <label className="now-seek"><span className="visually-hidden">Seek or scrub {activeCue.name}</span><input
              type="range"
              disabled={liveSafe}
              min="0"
              max={playbackEnd || 0}
              step="0.05"
              value={Math.min(position, playbackEnd || 0)}
              onPointerDown={(event) => {
                scrubMoved.current = false;
                scrubWasPlaying.current = state === 'playing';
                scrubStartX.current = event.clientX;
                scrubPointerId.current = event.pointerId;
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
              }}
              onPointerMove={(event) => {
                if (scrubPointerId.current === event.pointerId && Math.abs(event.clientX - scrubStartX.current) > 3) scrubMoved.current = true;
              }}
              onChange={(event) => {
                const nextPosition = Number(event.target.value);
                if (scrubWasPlaying.current) triggerCue(activeCue.id, 'seek', { position: nextPosition });
                else if (scrubMoved.current) triggerCue(activeCue.id, 'scrub', { position: nextPosition });
                else triggerCue(activeCue.id, 'seek', { position: nextPosition });
              }}
              onPointerUp={() => {
                if (!scrubWasPlaying.current) triggerCue(activeCue.id, 'scrub-end');
                scrubMoved.current = false;
                scrubWasPlaying.current = false;
                scrubPointerId.current = null;
              }}
              onPointerCancel={() => { triggerCue(activeCue.id, 'scrub-end'); scrubMoved.current = false; scrubWasPlaying.current = false; scrubPointerId.current = null; }}
            /></label>
            {(activeCue.startTime > 0 || activeCue.endTime > 0) && <div className="cue-boundary-note"><i className="bi bi-braces" /> Plays {formatTime(activeCue.startTime || 0)}–{formatTime(playbackEnd)}</div>}
            <div className="now-controls">
              <button onClick={() => triggerCue(activeCue.id, 'stop')} title="Stop"><i className="bi bi-stop-fill" /></button>
              <button className={`primary ${cueIsArmed && !cueIsActive ? 'armed' : ''}`} onClick={() => state === 'playing' ? triggerCue(activeCue.id, 'pause') : state === 'paused' ? triggerCue(activeCue.id, 'resume') : liveSafe ? armCue(activeCue.id) : triggerCue(activeCue.id, 'play')} title={state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : liveSafe ? cueIsArmed ? 'Disarm cue' : 'Arm cue' : 'Play'}><i className={`bi ${state === 'playing' ? 'bi-pause-fill' : state === 'paused' ? 'bi-play-fill' : liveSafe ? cueIsArmed ? 'bi-shield-check' : 'bi-shield-plus' : 'bi-play-fill'}`} /></button>
              <button disabled={liveSafe && !cueIsActive} className={activeCue.loop ? 'active' : ''} onClick={() => triggerCue(activeCue.id, 'restart')} title={liveSafe && !cueIsActive ? 'Arm and GO before restarting' : 'Restart'}><i className="bi bi-arrow-repeat" /></button>
            </div>
            <label className="now-follow-toggle"><span><i className="bi bi-list-ol" /><strong>{liveSafe ? 'Auto-play locked' : 'Auto-play next cue'}</strong></span><input disabled={liveSafe} className="form-check-input" type="checkbox" checked={!liveSafe && Boolean(project.settings.autoPlayNext)} onChange={(event) => updateSettings({ autoPlayNext: event.target.checked })} /></label>
          </>
        ) : <div className="empty-mini">Import audio to create your first cue.</div>}
      </section>

      <section className="surface-card meter-card">
        <div className="section-heading"><h2>Master Meters</h2><button className="icon-button" onClick={() => window.dispatchEvent(new CustomEvent('cuepilot-reset-loudness'))} title="Reset loudness"><i className="bi bi-arrow-counterclockwise" /></button></div>
        <div className="meter-card-content">
          <div className="meter-pair">
            <div className="meter-scale"><span>0</span><span>-12</span><span>-24</span><span>-36</span><span>-48</span><span>-60</span></div>
            <VerticalMeter label="L" value={master.left?.rms ?? -60} peak={master.left?.truePeak ?? master.left?.peak ?? -60} />
            <VerticalMeter label="R" value={master.right?.rms ?? -60} peak={master.right?.truePeak ?? master.right?.peak ?? -60} />
          </div>
          <div className="loudness-stack">
            <div><span>Integrated</span><strong>{formatLufs(master.integrated)}</strong></div>
            <div><span>Short term</span><strong>{formatLufs(master.shortTerm)}</strong></div>
            <div><span>Momentary</span><strong>{formatLufs(master.momentary)}</strong></div>
            <div className="meter-note">K-weighted · gated · 4× dBTP</div>
          </div>
        </div>
      </section>
    </aside>
  );
}
