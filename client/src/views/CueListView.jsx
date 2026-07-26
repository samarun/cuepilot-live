import React, { useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { CueRow } from '../components/CueRow.jsx';

export function CueListView({ onEdit }) {
  const {
    project, importFiles, importing, reorderCueTo, selectedCueId, selectedCueIds, selectAllCues, clearMultiSelection,
    updateCues, createTemplateFromCue, applyCueTemplate, deleteCueTemplate, historyState, undo, redo
  } = useApp();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkVolume, setBulkVolume] = useState(1);
  const [templateId, setTemplateId] = useState('');
  const fileInput = useRef(null);
  const [draggingCueId, setDraggingCueId] = useState(null);
  const liveSafe = project.settings.operationMode === 'live';
  const groups = [...new Set(project.cues.map((cue) => cue.group).filter(Boolean))];
  const cues = project.cues.filter((cue) => {
    const matchesQuery = `${cue.name} ${cue.description} ${cue.fileName}`.toLowerCase().includes(query.toLowerCase());
    const matchesGroup = group === 'all' || cue.group === group;
    return matchesQuery && matchesGroup;
  });

  const onDrop = (event) => {
    event.preventDefault();
    if (liveSafe) return;
    importFiles(event.dataTransfer.files);
  };

  return (
    <div className="view-stack">
      <div className="view-toolbar">
        <div className="filter-select-wrap">
          <i className="bi bi-filter" />
          <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter cues by group">
            <option value="all">All cues</option>
            {groups.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <label className="search-box"><i className="bi bi-search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cues…" /></label>
        <button className="new-cue-button" onClick={() => fileInput.current?.click()} disabled={liveSafe || importing} title={liveSafe ? 'Importing locked in Live Safe mode' : ''}><i className={`bi ${importing ? 'bi-arrow-repeat spin' : liveSafe ? 'bi-lock-fill' : 'bi-plus-lg'}`} /> {importing ? 'Importing…' : liveSafe ? 'Locked' : 'New Cue'}</button>
        <input ref={fileInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" multiple hidden onChange={(event) => importFiles(event.target.files)} />
      </div>

      <div className="cue-management-toolbar" aria-label="Cue editing tools">
        <div className="history-controls">
          <button type="button" disabled={liveSafe || !historyState.undo} onClick={undo} title={historyState.undoLabel ? `Undo ${historyState.undoLabel} — Command/Ctrl+Z` : 'Nothing to undo'}><i className="bi bi-arrow-counterclockwise" /> Undo</button>
          <button type="button" disabled={liveSafe || !historyState.redo} onClick={redo} title={historyState.redoLabel ? `Redo ${historyState.redoLabel} — Command/Ctrl+Shift+Z` : 'Nothing to redo'}><i className="bi bi-arrow-clockwise" /> Redo</button>
        </div>
        <div className="selection-summary">
          <strong>{selectedCueIds.length}</strong><span>selected</span>
          <button type="button" disabled={liveSafe || !cues.length} onClick={() => selectAllCues(cues.map((cue) => cue.id))}>Select visible</button>
          {selectedCueIds.length > 1 && <button type="button" onClick={clearMultiSelection}>Clear</button>}
        </div>
        <div className="bulk-controls">
          <label title="Set volume on all selected cues"><i className="bi bi-volume-up" /><input disabled={liveSafe || !selectedCueIds.length} aria-label="Bulk cue volume" type="range" min="0" max="1.5" step="0.01" value={bulkVolume} onChange={(event) => { const volume = Number(event.target.value); setBulkVolume(volume); updateCues(selectedCueIds, { volume }, { label: 'Bulk volume change', mergeKey: `bulk-volume:${[...selectedCueIds].sort().join(',')}` }); }} /><span>{Math.round(bulkVolume * 100)}%</span></label>
          <button type="button" disabled={liveSafe || !selectedCueIds.length} onClick={() => updateCues(selectedCueIds, { muted: true }, { label: 'Mute selected cues' })}><i className="bi bi-volume-mute-fill" /> Mute</button>
          <button type="button" disabled={liveSafe || !selectedCueIds.length} onClick={() => updateCues(selectedCueIds, { muted: false }, { label: 'Unmute selected cues' })}><i className="bi bi-volume-up-fill" /> Unmute</button>
        </div>
        <div className="group-controls">
          <input disabled={liveSafe || !selectedCueIds.length} list="cue-groups" value={bulkGroup} onChange={(event) => setBulkGroup(event.target.value)} placeholder="Category" aria-label="Category for selected cues" />
          <datalist id="cue-groups">{groups.map((name) => <option key={name} value={name} />)}</datalist>
          <button type="button" disabled={liveSafe || !selectedCueIds.length} onClick={() => updateCues(selectedCueIds, { group: bulkGroup.trim() }, { label: bulkGroup.trim() ? `Assign category ${bulkGroup.trim()}` : 'Clear cue category' })}><i className="bi bi-collection" /> Set</button>
        </div>
        <div className="template-controls">
          <select disabled={liveSafe || !project.templates?.length} value={templateId} onChange={(event) => setTemplateId(event.target.value)} aria-label="Cue template"><option value="">Cue template…</option>{(project.templates || []).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
          <button type="button" disabled={liveSafe || !templateId || !selectedCueIds.length} onClick={() => applyCueTemplate(templateId, selectedCueIds)}><i className="bi bi-magic" /> Apply</button>
          <button type="button" disabled={liveSafe || !selectedCueId} onClick={() => { const name = window.prompt('Template name'); if (name) createTemplateFromCue(selectedCueId, name); }}><i className="bi bi-bookmark-plus" /> Save</button>
          <button type="button" className="icon-only" disabled={liveSafe || !templateId} onClick={() => { if (window.confirm('Delete this cue template?')) { deleteCueTemplate(templateId); setTemplateId(''); } }} title="Delete selected template" aria-label="Delete selected template"><i className="bi bi-trash3" /></button>
        </div>
      </div>

      <div className="cue-list">
        {cues.map((cue) => (
          <CueRow
            key={cue.id}
            cue={cue}
            onEdit={onEdit}
            dragging={draggingCueId === cue.id}
            onDragStart={(event, cueId) => { if (liveSafe) return; setDraggingCueId(cueId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', cueId); }}
            onDragEnd={() => setDraggingCueId(null)}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
            onDrop={(event, targetCueId) => { event.preventDefault(); if (liveSafe) return; const sourceCueId = draggingCueId || event.dataTransfer.getData('text/plain'); if (sourceCueId) reorderCueTo(sourceCueId, targetCueId); setDraggingCueId(null); }}
          />
        ))}
        {!cues.length && project.cues.length > 0 && <div className="empty-state"><i className="bi bi-search" /><h3>No cues match</h3><p>Try a different search or group filter.</p></div>}
      </div>

      <button className="drop-zone" disabled={liveSafe} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => fileInput.current?.click()}>
        <i className={`bi ${liveSafe ? 'bi-lock-fill' : 'bi-plus-circle'}`} />
        <span>{liveSafe ? 'Cue importing locked in Live Safe mode' : 'Drop audio files here or click to import'}</span>
        <small>WAV, MP3, M4A, AAC, OGG and FLAC</small>
      </button>
    </div>
  );
}
