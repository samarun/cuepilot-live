import React, { useState } from 'react';
import { useApp } from './contexts/AppContext.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { RightRail } from './components/RightRail.jsx';
import { TransportBar } from './components/TransportBar.jsx';
import { CueEditor } from './components/CueEditor.jsx';
import { CueListView } from './views/CueListView.jsx';
import { GridView } from './views/GridView.jsx';
import { MeterView } from './views/MeterView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { LogsView } from './views/LogsView.jsx';

const navItems = [
  { id: 'cues', label: 'Cues', icon: 'bi-sliders2' },
  { id: 'grid', label: 'Grid', icon: 'bi-grid' },
  { id: 'meters', label: 'Meters', icon: 'bi-bar-chart-fill' },
  { id: 'settings', label: 'Settings', icon: 'bi-gear' },
  { id: 'logs', label: 'Logs', icon: 'bi-journal-text' }
];

function Logo() {
  return <div className="brand"><div className="brand-mark"><span /><span /><span /><span /><span /></div><div><strong>CUEPILOT</strong><span>LIVE</span></div></div>;
}

function Sidebar() {
  const { view, setView, serverConnected, engineEnabled, client, playbackStatus, takeControl, project } = useApp();
  const active = playbackStatus.activeClientId === client?.id;
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><i className={`bi ${item.icon}`} /><span>{item.label}</span></button>)}
      </nav>
      <div className="sidebar-status">
        <span className="sidebar-label">Connection</span>
        <div className="status-line"><span className={`connection-dot ${serverConnected ? 'online' : ''}`} /><div><strong>Server</strong><small>{serverConnected ? 'Connected' : 'Offline'}</small></div></div>
        <div className="status-line"><span className={`connection-dot ${engineEnabled ? 'online' : ''}`} /><div><strong>Playback engine</strong><small>{engineEnabled ? 'Audio enabled' : 'Waiting'}</small></div></div>
        {!active && <button className="take-control-button" onClick={takeControl}><i className="bi bi-broadcast" /> Take Control</button>}
      </div>
      <div className="active-client-block">
        <span className="sidebar-label">Active client</span>
        <div className="active-client-row"><i className="bi bi-display" /><div><strong>{active ? 'This browser' : 'Another browser'}</strong><small>{client?.id?.slice(0, 8) || 'Registering…'}</small></div></div>
      </div>
      <div className="sidebar-project"><i className="bi bi-folder2-open" /><div><span>Project</span><strong>{project.name}</strong></div></div>
    </aside>
  );
}

function Header() {
  const { view, project, saving, saveError, engineEnabled, enableAudio, serverConnected, cueStates, updateSettings } = useApp();
  const title = navItems.find((item) => item.id === view)?.label || 'Cues';
  const activeCount = Object.values(cueStates).filter((state) => ['playing', 'paused', 'fading'].includes(state.state)).length;
  const liveSafe = project.settings.operationMode === 'live';
  return (
    <header className="app-header">
      <div><span className="header-kicker">{project.name}</span><h1>{title}</h1></div>
      <div className="header-actions">
        <div className={`save-state ${saveError ? 'error' : ''}`}><i className={`bi ${saveError ? 'bi-exclamation-triangle' : saving ? 'bi-arrow-repeat spin' : 'bi-cloud-check'}`} /><span>{saveError ? 'Save failed' : saving ? 'Saving' : 'Saved locally'}</span></div>
        {!engineEnabled && <button className="enable-audio-button" onClick={enableAudio}><i className="bi bi-volume-up-fill" /> Enable Audio</button>}
        <button className={`operation-mode-button ${liveSafe ? 'live-safe' : ''}`} onClick={() => updateSettings({ operationMode: liveSafe ? 'rehearsal' : 'live' })} title={liveSafe ? 'Switch to rehearsal mode' : 'Enable Live Safe mode'} aria-pressed={liveSafe}><i className={`bi ${liveSafe ? 'bi-shield-lock-fill' : 'bi-tools'}`} /> {liveSafe ? 'LIVE SAFE' : 'REHEARSAL'}</button>
        <ThemeToggle compact />
        <div className={`live-pill ${serverConnected ? 'online' : ''}`}><span />{activeCount ? `${activeCount} LIVE` : 'READY'}</div>
      </div>
    </header>
  );
}

function EmptyProjectWelcome({ onImport }) {
  return <div className="welcome-panel"><div className="welcome-orb"><i className="bi bi-soundwave" /></div><span className="section-eyebrow">Ready for show</span><h2>Build your first cue stack</h2><p>Import audio, assign keyboard shortcuts, and trigger cues from Bitfocus Companion over the local HTTP API.</p><button className="new-cue-button" onClick={onImport}><i className="bi bi-plus-lg" /> Import audio</button></div>;
}

export default function App() {
  const { view, project, loaded, importFiles, notifications, engineError, notify } = useApp();
  const [editingCue, setEditingCue] = useState(null);
  const inputRef = React.useRef(null);
  const showRightRail = ['cues', 'grid'].includes(view);
  const liveSafe = project.settings.operationMode === 'live';
  const editCue = (cue) => {
    if (liveSafe) return notify('Cue editing is locked in Live Safe mode.', 'warning');
    setEditingCue(cue);
  };
  React.useEffect(() => { if (liveSafe) setEditingCue(null); }, [liveSafe]);

  if (!loaded) return <div className="boot-screen"><Logo /><div className="boot-loader"><span /><span /><span /></div><p>Preparing the playback engine…</p></div>;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main className={`workspace ${showRightRail ? 'with-rail' : ''}`}>
          <section className="primary-workspace">
            {!project.cues.length && ['cues', 'grid'].includes(view) ? (
              <EmptyProjectWelcome onImport={() => inputRef.current?.click()} />
            ) : (
              <>
                {view === 'cues' && <CueListView onEdit={editCue} />}
                {view === 'grid' && <GridView onEdit={editCue} />}
              </>
            )}
            {view === 'meters' && <MeterView />}
            {view === 'settings' && <SettingsView />}
            {view === 'logs' && <LogsView />}
          </section>
          {showRightRail && <RightRail />}
        </main>
        <TransportBar />
      </div>
      <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(event) => importFiles(event.target.files)} />
      {editingCue && <CueEditor cue={editingCue} onClose={() => setEditingCue(null)} />}
      <div className="toast-stack" aria-live="polite">
        {engineError && <div className="app-toast danger"><i className="bi bi-exclamation-triangle" /><span>{engineError}</span></div>}
        {notifications.map((item) => <div key={item.id} className={`app-toast ${item.type}`}><i className={`bi ${item.type === 'success' ? 'bi-check-circle' : item.type === 'danger' ? 'bi-exclamation-triangle' : item.type === 'warning' ? 'bi-exclamation-circle' : 'bi-info-circle'}`} /><span>{item.message}</span></div>)}
      </div>
    </div>
  );
}
