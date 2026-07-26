import React, { useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { CueGridCard } from '../components/CueGridCard.jsx';

export function GridView({ onEdit }) {
  const { project, importFiles, importing } = useApp();
  const input = useRef(null);
  const liveSafe = project.settings.operationMode === 'live';
  return (
    <div className="view-stack">
      <div className="view-toolbar grid-toolbar">
        <div><span className="section-eyebrow">Touch layout</span><h2>Button Grid</h2></div>
        <button className="new-cue-button" onClick={() => input.current?.click()} disabled={liveSafe || importing} title={liveSafe ? 'Importing locked in Live Safe mode' : ''}><i className={`bi ${liveSafe ? 'bi-lock-fill' : 'bi-plus-lg'}`} /> {liveSafe ? 'Locked' : 'Add audio'}</button>
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(event) => importFiles(event.target.files)} />
      </div>
      <div className="cue-grid">
        {project.cues.map((cue) => <CueGridCard key={cue.id} cue={cue} onEdit={onEdit} />)}
        {!project.cues.length && <button className="grid-empty" disabled={liveSafe} onClick={() => input.current?.click()}><i className={`bi ${liveSafe ? 'bi-lock-fill' : 'bi-file-earmark-music'}`} /><strong>{liveSafe ? 'Switch to Rehearsal to add cues' : 'Add your first audio cue'}</strong><span>Large, touch-friendly trigger buttons will appear here.</span></button>}
      </div>
    </div>
  );
}
