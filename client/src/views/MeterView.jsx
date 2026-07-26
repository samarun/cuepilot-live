import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { VerticalMeter, formatDb, formatLufs } from '../components/Meters.jsx';
import { formatTime } from '../components/CueRow.jsx';

export function MeterView() {
  const { project, meters, cueStates } = useApp();
  const master = meters.master || { left: { rms: -60, peak: -60, truePeak: -60 }, right: { rms: -60, peak: -60, truePeak: -60 }, momentary: -70, shortTerm: -70, integrated: -70, peak: -60, truePeak: -60, rms: -60 };
  const activeCues = project.cues.filter((cue) => ['playing', 'paused', 'fading'].includes(cueStates[cue.id]?.state));
  return (
    <div className="meter-view">
      <section className="hero-meter surface-card">
        <div className="hero-meter-header"><div><span className="section-eyebrow">Program output</span><h2>Master Loudness</h2></div><div className="target-badge">Target {project.settings.lufsTarget ?? -23} LUFS</div></div>
        <div className="hero-meter-body">
          <div className="hero-bars">
            <VerticalMeter label="LEFT" value={master.left?.rms ?? -60} peak={master.left?.truePeak ?? master.left?.peak ?? -60} />
            <VerticalMeter label="RIGHT" value={master.right?.rms ?? -60} peak={master.right?.truePeak ?? master.right?.peak ?? -60} />
          </div>
          <div className="hero-loudness-number"><span>Integrated</span><strong>{Number.isFinite(master.integrated) ? master.integrated.toFixed(1) : '—'}</strong><em>LUFS</em></div>
          <div className="loudness-metric-grid">
            <div><span>Momentary</span><strong>{formatLufs(master.momentary)}</strong></div>
            <div><span>Short term</span><strong>{formatLufs(master.shortTerm)}</strong></div>
            <div><span>True peak</span><strong>{Number.isFinite(master.truePeak) ? `${master.truePeak.toFixed(1)} dBTP` : '—'}</strong></div>
            <div><span>RMS</span><strong>{formatDb(master.rms)}</strong></div>
          </div>
        </div>
        <p className="standards-note"><i className="bi bi-info-circle" /> BS.1770-style K-weighting, 400 ms blocks with absolute/relative gating, and 4× oversampled true peak are active. Validate against the EBU test set and calibrate the complete output chain before compliance use.</p>
      </section>

      <section className="active-meter-section">
        <div className="section-heading"><div><span className="section-eyebrow">Voices</span><h2>Active cue meters</h2></div><span>{activeCues.length} active</span></div>
        <div className="active-meter-grid">
          {activeCues.map((cue) => {
            const meter = meters.cues?.[cue.id] || { peak: -60, rms: -60 };
            const state = cueStates[cue.id] || {};
            return <article className={`active-meter-card cue-${cue.color}`} key={cue.id}><div className="active-meter-copy"><span>{String(cue.number).padStart(3, '0')}</span><h3>{cue.name}</h3><p>{state.state}</p><strong>{formatTime(state.position)} / {formatTime(state.duration || cue.duration)}</strong></div><div className="mini-verticals"><VerticalMeter label="PK" value={meter.peak} peak={meter.peak} /><VerticalMeter label="RMS" value={meter.rms} peak={meter.peak} /></div></article>;
          })}
          {!activeCues.length && <div className="empty-state surface-card"><i className="bi bi-soundwave" /><h3>No active cues</h3><p>Trigger a cue to see its live metering.</p></div>}
        </div>
      </section>
    </div>
  );
}
