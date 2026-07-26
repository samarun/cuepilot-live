import React, { useEffect, useRef, useState } from 'react';
import { shortcutFromEvent, useApp } from '../contexts/AppContext.jsx';

export function CueEditor({ cue, onClose }) {
  const { updateCue, replaceCueFile, deleteCue, duplicateCue, reorderCue, project, notify } = useApp();
  const [draft, setDraft] = useState(cue);
  const [capturing, setCapturing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replacementInput = useRef(null);
  useEffect(() => setDraft(cue), [cue]);
  if (!cue) return null;

  const save = () => {
    if (!draft.name?.trim()) return notify('Cue name cannot be empty.', 'warning');
    const conflict = project.cues.find((item) => item.id !== cue.id && draft.shortcut && item.shortcut?.toLowerCase() === draft.shortcut.toLowerCase());
    if (conflict) return notify(`Shortcut ${draft.shortcut} is already assigned to ${conflict.name}`, 'warning');
    const duration = Math.max(0, Number(draft.duration || 0));
    const startTime = Math.min(Math.max(0, Number(draft.startTime || 0)), Math.max(0, duration - 0.01));
    const endTime = Number(draft.endTime || 0) > 0 ? Math.min(Number(draft.endTime), duration) : 0;
    if (endTime > 0 && endTime <= startTime) return notify('End time must be later than the start time.', 'warning');
    updateCue(cue.id, {
      ...draft,
      name: draft.name.trim(),
      startTime,
      endTime,
      followAction: draft.loop ? 'none' : draft.followAction
    });
    onClose();
  };

  return (
    <div className="editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cue-editor" role="dialog" aria-modal="true" aria-label={`Edit ${cue.name}`}>
        <div className="editor-header"><div><span className="section-eyebrow">Cue {String(cue.number).padStart(3, '0')}</span><h2>Edit cue</h2></div><button className="icon-button" onClick={onClose}><i className="bi bi-x-lg" /></button></div>
        <div className="editor-body">
          <label className="form-label">Cue name<input className="form-control" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="form-label">Description<textarea className="form-control" rows="2" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <div className="editor-grid-two">
            <label className="form-label">Keyboard shortcut
              <button
                type="button"
                className={`shortcut-capture ${capturing ? 'capturing' : ''}`}
                onClick={() => setCapturing(true)}
                onKeyDown={(event) => {
                  if (!capturing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const value = shortcutFromEvent(event);
                  if (value) { setDraft({ ...draft, shortcut: value }); setCapturing(false); }
                }}
              >{capturing ? 'Press keys…' : draft.shortcut || 'Assign shortcut'}</button>
            </label>
            <label className="form-label">Trigger mode<select className="form-select" value={draft.triggerMode || 'restart'} onChange={(event) => setDraft({ ...draft, triggerMode: event.target.value })}><option value="restart">Restart</option><option value="toggle">Toggle</option><option value="ignore">Ignore while playing</option></select></label>
          </div>
          <div className="editor-grid-three">
            <label className="form-label">Volume <span>{Math.round((draft.volume ?? 1) * 100)}%</span><input type="range" className="form-range" min="0" max="1.5" step="0.01" value={draft.volume ?? 1} onChange={(event) => setDraft({ ...draft, volume: Number(event.target.value) })} /></label>
            <label className="form-label">Fade in (ms)<input className="form-control" type="number" min="0" value={draft.fadeInMs || 0} onChange={(event) => setDraft({ ...draft, fadeInMs: Number(event.target.value) })} /></label>
            <label className="form-label">Fade out (ms)<input className="form-control" type="number" min="0" value={draft.fadeOutMs || 0} onChange={(event) => setDraft({ ...draft, fadeOutMs: Number(event.target.value) })} /></label>
          </div>
          <div className="editor-grid-three cue-boundary-grid">
            <label className="form-label">Start at (seconds)
              <input className="form-control" type="number" min="0" max={Math.max(0, Number(draft.duration || 0) - 0.01)} step="0.1" value={draft.startTime || 0} onChange={(event) => setDraft({ ...draft, startTime: Math.max(0, Number(event.target.value)) })} />
            </label>
            <label className="form-label">End at (seconds)
              <input className="form-control" type="number" min="0" max={Math.max(0, Number(draft.duration || 0))} step="0.1" value={draft.endTime || ''} placeholder="File end" onChange={(event) => setDraft({ ...draft, endTime: event.target.value === '' ? 0 : Math.max(0, Number(event.target.value)) })} />
            </label>
            <label className="form-label">When cue finishes
              <select className="form-select" value={draft.followAction || 'none'} onChange={(event) => setDraft({ ...draft, followAction: event.target.value })} disabled={Boolean(draft.loop)}>
                <option value="none">Stop</option>
                <option value="next">Play next cue</option>
              </select>
            </label>
          </div>
          <div className="editor-grid-two">
            <label className="form-label">Category<input className="form-control" list="cue-category-options" value={draft.group || ''} onChange={(event) => setDraft({ ...draft, group: event.target.value })} placeholder="Beds, SFX, Program, or custom" /><datalist id="cue-category-options"><option value="Beds" /><option value="SFX" /><option value="Program" />{[...new Set(project.cues.map((item) => item.group).filter((name) => name && !['Beds', 'SFX', 'Program'].includes(name)))].map((name) => <option key={name} value={name} />)}</datalist></label>
            <label className="form-label">Accent<select className="form-select" value={draft.color || 'emerald'} onChange={(event) => setDraft({ ...draft, color: event.target.value })}><option value="emerald">Emerald</option><option value="blue">Blue</option><option value="violet">Violet</option><option value="amber">Amber</option><option value="rose">Rose</option></select></label>
          </div>
          <label className="switch-row"><span><strong>Loop cue</strong><small>Continue playback until stopped</small></span><input className="form-check-input" type="checkbox" checked={Boolean(draft.loop)} onChange={(event) => setDraft({ ...draft, loop: event.target.checked })} /></label>
          <div className="file-reference"><i className="bi bi-file-earmark-music" /><div><strong>{draft.fileName}</strong><span>{draft.mediaUrl}</span></div><button type="button" className="replace-file-button" disabled={replacing} onClick={() => replacementInput.current?.click()}><i className={`bi ${replacing ? 'bi-arrow-repeat spin' : 'bi-arrow-left-right'}`} /> {replacing ? 'Replacing…' : 'Change audio'}</button></div>
          <input
            ref={replacementInput}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setReplacing(true);
              try {
                const changes = await replaceCueFile(cue.id, file);
                if (changes) setDraft((current) => ({ ...current, ...changes }));
              } catch (error) { notify(error.message, 'danger'); }
              finally { setReplacing(false); event.target.value = ''; }
            }}
          />
        </div>
        <div className="editor-secondary-actions">
          <button onClick={() => reorderCue(cue.id, -1)}><i className="bi bi-arrow-up" /> Move up</button>
          <button onClick={() => reorderCue(cue.id, 1)}><i className="bi bi-arrow-down" /> Move down</button>
          <button onClick={() => { duplicateCue(cue.id); onClose(); }}><i className="bi bi-copy" /> Duplicate</button>
          <button className="danger-text" onClick={() => { if (window.confirm(`Delete ${cue.name}?`)) { deleteCue(cue.id); onClose(); } }}><i className="bi bi-trash3" /> Delete</button>
        </div>
        <div className="editor-footer"><button className="btn btn-outline-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save cue</button></div>
      </section>
    </div>
  );
}
