import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';

export function SettingsView() {
  const { project, setProject, updateSettings, client, playbackStatus, takeControl, serverConnected } = useApp();
  const settings = project.settings;
  const active = playbackStatus.activeClientId === client?.id;
  return (
    <div className="settings-view">
      <section className="settings-section surface-card">
        <div className="settings-section-header"><div><span className="section-eyebrow">Appearance</span><h2>Interface</h2></div><ThemeToggle /></div>
        <div className="settings-grid">
          <label className="setting-field"><span>Operating mode</span><select className="form-select" value={settings.operationMode || 'rehearsal'} onChange={(event) => updateSettings({ operationMode: event.target.value })}><option value="rehearsal">Rehearsal — Space follows selection</option><option value="live">Live Safe — arm cues before GO</option></select></label>
          <label className="setting-field"><span>Project name</span><input className="form-control" value={project.name} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="setting-field"><span>LUFS target</span><select className="form-select" value={settings.lufsTarget} onChange={(event) => updateSettings({ lufsTarget: Number(event.target.value) })}><option value="-24">-24 LKFS — US broadcast</option><option value="-23">-23 LUFS — EBU R128</option><option value="-16">-16 LUFS — online</option><option value="-14">-14 LUFS — music preview</option></select></label>
          <label className="setting-field"><span>Default fade (ms)</span><input className="form-control" type="number" min="0" value={settings.defaultFadeMs} onChange={(event) => updateSettings({ defaultFadeMs: Number(event.target.value) })} /></label>
          <label className="setting-field"><span>Maximum voices</span><input className="form-control" type="number" min="1" max="64" value={settings.maxVoices} onChange={(event) => updateSettings({ maxVoices: Number(event.target.value) })} /></label>
          <label className="setting-field"><span>Trigger behaviour</span><select className="form-select" value={settings.playbackMode || 'single'} onChange={(event) => updateSettings({ playbackMode: event.target.value })}><option value="single">Single cue — stop the previous cue</option><option value="layered">Layered — allow cues to overlap</option></select></label>
          <label className="setting-field"><span>Live cue transition</span><select className="form-select" value={settings.liveTransition || 'cut'} onChange={(event) => updateSettings({ liveTransition: event.target.value })}><option value="cut">Hard cut</option><option value="crossfade">Crossfade</option></select></label>
          {settings.liveTransition === 'crossfade' && <label className="setting-field"><span>Crossfade duration (ms)</span><input className="form-control" type="number" min="0" step="50" value={settings.liveCrossfadeMs ?? 500} onChange={(event) => updateSettings({ liveCrossfadeMs: Math.max(0, Number(event.target.value)) })} /></label>}
        </div>
        <label className="switch-row"><span><strong>Keyboard triggering</strong><small>Space controls playback; Enter fires the armed cue in Live Safe mode</small></span><input className="form-check-input" type="checkbox" checked={Boolean(settings.keyboardEnabled)} onChange={(event) => updateSettings({ keyboardEnabled: event.target.checked })} /></label>
        <label className="switch-row"><span><strong>Auto-play cues in order</strong><small>When a cue finishes naturally, start the next cue in the arranged list</small></span><input className="form-check-input" type="checkbox" checked={Boolean(settings.autoPlayNext)} onChange={(event) => updateSettings({ autoPlayNext: event.target.checked })} /></label>
      </section>

      <section className="settings-section surface-card">
        <div className="settings-section-header"><div><span className="section-eyebrow">Playback ownership</span><h2>Browser engine</h2></div><span className={`connection-badge ${serverConnected ? 'connected' : ''}`}><span />{serverConnected ? 'Server connected' : 'Disconnected'}</span></div>
        <div className="playback-client-card"><div className="client-icon"><i className="bi bi-display" /></div><div><strong>{client?.label || 'Registering browser…'}</strong><span>{client?.id ? `Client ${client.id.slice(0, 8)}` : 'No client ID'}</span></div><div className={`ownership-state ${active ? 'active' : ''}`}>{active ? 'Active playback engine' : 'Standby client'}</div>{!active && <button className="btn btn-primary" onClick={takeControl}>Take Playback Control</button>}</div>
        <p className="settings-help">Only the active playback browser responds to Companion triggers. Keep this tab open during the event.</p>
      </section>

      <section className="settings-section surface-card">
        <div className="settings-section-header"><div><span className="section-eyebrow">Companion</span><h2>HTTP endpoints</h2></div><span className="api-pill">POST</span></div>
        <div className="endpoint-list">
          <code>http://127.0.0.1:8090/api/cues/&lt;cue-id&gt;/play</code>
          <code>http://127.0.0.1:8090/api/cues/&lt;cue-id&gt;/fade-out</code>
          <code>http://127.0.0.1:8090/api/cues/&lt;cue-id&gt;/seek&nbsp;&nbsp; {`{"position": 42.5}`}</code>
          <code>http://127.0.0.1:8090/api/transport/stop-all</code>
          <code>http://127.0.0.1:8090/api/transport/panic</code>
        </div>
        <p className="settings-help">Use Bitfocus Companion’s Generic HTTP module. The default server is localhost-only; edit <code>config/settings.json</code> to allow LAN access and add an API token.</p>
      </section>
    </div>
  );
}
