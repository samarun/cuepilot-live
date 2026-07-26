import React, { useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { HorizontalMeter, formatLufs } from './Meters.jsx';
import { Waveform } from './Waveform.jsx';
import { StatusPill } from './StatusPill.jsx';

export function formatTime(seconds = 0) {
  if (!Number.isFinite(Number(seconds))) return '00:00';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

export function CueRow({ cue, onEdit, onDragStart, onDragEnd, onDragOver, onDrop, dragging }) {
  const { project, selectedCueId, selectedCueIds, selectCue, armedCueId, armCue, cueStates, meters, triggerCue, updateCue, replaceCueFile, duplicateCue, deleteCue, notify } = useApp();
  const replacementInput = useRef(null);
  const cancelInlineEdit = useRef(false);
  const cancelCategoryEdit = useRef(false);
  const [replacing, setReplacing] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [inlineDraft, setInlineDraft] = useState('');
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const state = cueStates[cue.id]?.state || 'ready';
  const position = cueStates[cue.id]?.position || 0;
  const duration = cueStates[cue.id]?.duration || cue.duration || 0;
  const meter = meters.cues?.[cue.id];
  const active = ['playing', 'paused', 'fading'].includes(state);
  const waveformActive = active || state === 'cued' || selectedCueId === cue.id;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const lufs = meter ? (meter.rms - 0.691) : null;
  const cueVolume = Math.max(0, Math.min(1.5, Number(cue.volume ?? 1)));
  const muted = Boolean(cue.muted);
  const liveSafe = project.settings.operationMode === 'live';
  const armed = armedCueId === cue.id;
  const multiSelected = selectedCueIds.includes(cue.id);
  const cueIndex = project.cues.findIndex((item) => item.id === cue.id);
  const followTarget = cue.followAction === 'next' ? project.cues[cueIndex + 1] : null;
  const categoryChoices = [...new Set(['Beds', 'SFX', 'Program', ...project.cues.map((item) => item.group).filter(Boolean)])];

  const mainAction = () => {
    if (state === 'playing') triggerCue(cue.id, 'pause');
    else if (state === 'paused') triggerCue(cue.id, 'resume');
    else if (liveSafe) armCue(cue.id);
    else triggerCue(cue.id, cue.triggerMode === 'toggle' ? 'toggle' : 'play');
  };

  const beginInlineEdit = (field) => {
    if (liveSafe) return notify('Cue editing is locked in Live Safe mode.', 'warning');
    cancelInlineEdit.current = false;
    selectCue(cue.id);
    setInlineDraft(field === 'name' ? cue.name : cue.description || '');
    setEditingField(field);
  };

  const saveInlineEdit = () => {
    if (!editingField) return;
    if (cancelInlineEdit.current) {
      cancelInlineEdit.current = false;
      setEditingField(null);
      return;
    }
    const value = inlineDraft.trim();
    if (editingField === 'name' && !value) {
      notify('Cue name cannot be empty.', 'warning');
      setInlineDraft(cue.name);
      setEditingField(null);
      return;
    }
    updateCue(cue.id, { [editingField]: value });
    setEditingField(null);
  };

  const inlineKeyDown = (event, originalValue) => {
    event.stopPropagation();
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      cancelInlineEdit.current = true;
      setInlineDraft(originalValue || '');
      event.currentTarget.blur();
    }
  };

  const saveCustomCategory = () => {
    if (cancelCategoryEdit.current) {
      cancelCategoryEdit.current = false;
      setEditingCategory(false);
      return;
    }
    const category = categoryDraft.trim().slice(0, 100);
    if (category) updateCue(cue.id, { group: category }, { label: `Create category ${category}`, mergeKey: '' });
    setEditingCategory(false);
  };

  return (
    <article
      className={`cue-row cue-${cue.color || 'emerald'} ${selectedCueId === cue.id ? 'selected' : ''} ${multiSelected ? 'multi-selected' : ''} ${armed ? 'armed' : ''} ${active ? 'active' : ''}`}
      onClick={(event) => selectCue(cue.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })}
      onDragStart={(event) => onDragStart?.(event, cue.id)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver?.(event, cue.id)}
      onDrop={(event) => onDrop?.(event, cue.id)}
      data-dragging={dragging ? 'true' : 'false'}
    >
      <div className="cue-number" title={liveSafe ? 'Reordering locked in Live Safe mode' : 'Drag to reorder'} draggable={!liveSafe}>
        <button type="button" className={`cue-select-button ${multiSelected ? 'selected' : ''}`} disabled={liveSafe} aria-label={`${multiSelected ? 'Remove' : 'Add'} ${cue.name} ${multiSelected ? 'from' : 'to'} selection`} aria-pressed={multiSelected} onClick={(event) => { event.stopPropagation(); selectCue(cue.id, { toggle: true }); }}><i className={`bi ${multiSelected ? 'bi-check-square-fill' : 'bi-square'}`} /></button>
        <span><i className={`bi ${liveSafe ? 'bi-lock-fill' : 'bi-grip-vertical'}`} />{String(cue.number).padStart(3, '0')}</span>
      </div>
      <button className={`cue-play-button ${active ? 'active' : ''} ${armed ? 'armed' : ''}`} onClick={(event) => { event.stopPropagation(); mainAction(); }} aria-label={`${state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : liveSafe ? armed ? 'Disarm' : 'Arm' : 'Play'} ${cue.name}`}>
        <i className={`bi ${state === 'playing' ? 'bi-pause-fill' : state === 'paused' ? 'bi-play-fill' : liveSafe ? armed ? 'bi-shield-check' : 'bi-shield-plus' : 'bi-play-fill'}`} />
      </button>
      <div className="cue-copy">
        <div className="cue-title-line">
          {editingField === 'name' ? (
            <input className="cue-inline-input name" autoFocus value={inlineDraft} onClick={(event) => event.stopPropagation()} onChange={(event) => setInlineDraft(event.target.value)} onBlur={saveInlineEdit} onKeyDown={(event) => inlineKeyDown(event, cue.name)} aria-label={`Edit name for ${cue.name}`} />
          ) : (
            <button type="button" className="cue-inline-text name" onClick={(event) => { event.stopPropagation(); beginInlineEdit('name'); }} title="Click to edit cue name"><span>{cue.name}</span><i className="bi bi-pencil" /></button>
          )}
          {cue.shortcut && <kbd>{cue.shortcut}</kbd>}
        </div>
        {editingField === 'description' ? (
          <input className="cue-inline-input description" autoFocus value={inlineDraft} onClick={(event) => event.stopPropagation()} onChange={(event) => setInlineDraft(event.target.value)} onBlur={saveInlineEdit} onKeyDown={(event) => inlineKeyDown(event, cue.description)} aria-label={`Edit description for ${cue.name}`} />
        ) : (
          <button type="button" className="cue-inline-text description" onClick={(event) => { event.stopPropagation(); beginInlineEdit('description'); }} title="Click to edit description"><span>{cue.description || 'Add description'}</span><i className="bi bi-pencil" /></button>
        )}
        <div className="cue-time-line">
          <span>{formatTime(position)} / {formatTime(duration)}</span>
          {(cue.startTime > 0 || cue.endTime > 0) && <span><i className="bi bi-clock-history" /> {formatTime(cue.startTime || 0)}–{formatTime(cue.endTime || duration)}</span>}
          {cue.loop && <span className="loop-label"><i className="bi bi-repeat" /> Loop</span>}
          <label className={`cue-category-select ${cue.group ? 'assigned' : ''}`} title="Cue category" onClick={(event) => event.stopPropagation()}>
            <i className="bi bi-collection" />
            {editingCategory ? (
              <input
                autoFocus
                value={categoryDraft}
                maxLength="100"
                placeholder="Category name"
                aria-label={`Custom category for ${cue.name}`}
                onChange={(event) => setCategoryDraft(event.target.value)}
                onBlur={saveCustomCategory}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    cancelCategoryEdit.current = true;
                    setCategoryDraft(cue.group || '');
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <select disabled={liveSafe} value={cue.group || ''} aria-label={`Category for ${cue.name}`} onChange={(event) => {
                if (event.target.value === '__custom__') {
                  cancelCategoryEdit.current = false;
                  setCategoryDraft('');
                  setEditingCategory(true);
                  return;
                }
                updateCue(cue.id, { group: event.target.value }, { label: 'Change cue category', mergeKey: '' });
              }}>
                <option value="">Set category</option>
                {categoryChoices.map((category) => <option key={category} value={category}>{category}</option>)}
                <option value="__custom__">＋ Custom category…</option>
              </select>
            )}
          </label>
          {cue.followAction === 'next' && <span className="follow-label" title={followTarget ? `Automatically plays ${followTarget.name}` : 'No following cue'}><i className="bi bi-lightning-charge-fill" /> AUTO → {followTarget ? String(followTarget.number).padStart(3, '0') : 'END'}</span>}
        </div>
      </div>
      <div className="cue-wave-column">
        <Waveform
          cue={cue}
          progress={progress}
          active={waveformActive}
          duration={duration}
          locked={liveSafe}
          onSeek={(nextPosition) => triggerCue(cue.id, 'seek', { position: nextPosition })}
          onScrub={(nextPosition) => triggerCue(cue.id, 'scrub', { position: nextPosition })}
          onScrubEnd={() => triggerCue(cue.id, 'scrub-end')}
          onBoundaryChange={(boundaries) => updateCue(cue.id, boundaries)}
          onFadeChange={(fades) => updateCue(cue.id, fades)}
        />
        <HorizontalMeter value={meter?.rms ?? -60} peak={meter?.peak ?? -60} compact label={cue.name} />
        <div className={`cue-volume-control ${muted ? 'muted' : ''}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="cue-mute-button"
            aria-label={`${muted ? 'Unmute' : 'Mute'} ${cue.name}`}
            aria-pressed={muted}
            title={`${muted ? 'Unmute' : 'Mute'} ${cue.name}`}
            onClick={() => updateCue(cue.id, { muted: !muted })}
          ><i className={`bi ${muted || cueVolume === 0 ? 'bi-volume-mute-fill' : cueVolume < 0.5 ? 'bi-volume-down-fill' : 'bi-volume-up-fill'}`} /></button>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.01"
            value={cueVolume}
            aria-label={`Volume for ${cue.name}`}
            data-testid={`cue-volume-${cue.id}`}
            style={{ '--cue-volume': `${(cueVolume / 1.5) * 100}%` }}
            onChange={(event) => updateCue(cue.id, { volume: Number(event.target.value) })}
          />
          <span>{muted ? 'MUTE' : `${Math.round(cueVolume * 100)}%`}</span>
        </div>
      </div>
      <div className="cue-loudness">
        <strong>{lufs == null ? '—' : formatLufs(lufs)}</strong>
        <span>estimated</span>
      </div>
      <div className="cue-status-column">
        <StatusPill status={armed && !active ? 'armed' : state} />
        <button type="button" disabled={liveSafe} className={`loop-button ${cue.loop ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); updateCue(cue.id, { loop: !cue.loop }); }} title={liveSafe ? 'Loop editing locked in Live Safe mode' : 'Toggle loop'}><i className="bi bi-repeat" /></button>
      </div>
      <div className="cue-actions dropdown" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button cue-menu-button" data-bs-toggle="dropdown" aria-expanded="false" title={`Actions for ${cue.name}`} aria-label={`Actions for ${cue.name}`}><i className="bi bi-three-dots" /></button>
        <ul className="dropdown-menu dropdown-menu-end">
          <li><button className="dropdown-item" disabled={liveSafe} onClick={() => onEdit(cue)}><i className="bi bi-sliders" /> Edit all settings</button></li>
          <li><button className="dropdown-item" disabled={liveSafe || replacing} onClick={() => replacementInput.current?.click()}><i className={`bi ${replacing ? 'bi-arrow-repeat spin' : 'bi-arrow-left-right'}`} /> Replace audio</button></li>
          <li><button className="dropdown-item" disabled={liveSafe} onClick={() => duplicateCue(cue.id)}><i className="bi bi-copy" /> Duplicate cue</button></li>
          <li><button className="dropdown-item" disabled={liveSafe && !active} onClick={() => triggerCue(cue.id, 'restart')}><i className="bi bi-arrow-clockwise" /> Restart</button></li>
          <li><button className="dropdown-item" onClick={() => triggerCue(cue.id, 'fade-out')}><i className="bi bi-volume-down" /> Fade out</button></li>
          <li><hr className="dropdown-divider" /></li>
          <li><button className="dropdown-item danger-text" disabled={liveSafe} onClick={() => { if (window.confirm(`Delete cue “${cue.name}”? The source audio file will be kept.`)) deleteCue(cue.id); }}><i className="bi bi-trash3" /> Delete cue</button></li>
        </ul>
        <input
          ref={replacementInput}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setReplacing(true);
            try { await replaceCueFile(cue.id, file); }
            catch (error) { notify(error.message, 'danger'); }
            finally { setReplacing(false); event.target.value = ''; }
          }}
        />
      </div>
    </article>
  );
}
