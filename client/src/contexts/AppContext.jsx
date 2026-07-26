import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/apiClient.js';
import { audioEngine } from '../services/audioEngine.js';
import { resolveGoCue, resolvePlayPauseCue } from '../services/liveSafety.js';
import { historyActionFromEvent, isShortcutEntryTarget, isTextEditingTarget } from '../services/keyboardShortcuts.js';

const AppContext = createContext(null);

const defaultProject = {
  schemaVersion: 2,
  id: 'default-project',
  name: 'Sunday Live',
  cues: [],
  templates: [],
  settings: {
    masterVolume: 0.75,
    maxVoices: 16,
    defaultFadeMs: 800,
    lufsTarget: -23,
    meterRefreshHz: 30,
    keyboardEnabled: true,
    playbackMode: 'single',
    operationMode: 'rehearsal',
    liveTransition: 'cut',
    liveCrossfadeMs: 500,
    autoPlayNext: false,
    theme: 'dark'
  }
};

function shortcutFromEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  const ignored = ['Control', 'Alt', 'Shift', 'Meta'];
  if (!ignored.includes(event.key)) {
    let key = event.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
  }
  return parts.join('+');
}

function fileDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
    audio.src = objectUrl;
  });
}

function cueIdFromName(name) {
  const stem = name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'cue';
  return `${stem}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function cloneProject(project) {
  return typeof structuredClone === 'function' ? structuredClone(project) : JSON.parse(JSON.stringify(project));
}

const templateFields = ['description', 'volume', 'muted', 'loop', 'fadeInMs', 'fadeOutMs', 'color', 'triggerMode', 'followAction', 'group'];

export function AppProvider({ children }) {
  const [project, setProject] = useState(defaultProject);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [view, setView] = useState('cues');
  const [selectedCueId, setSelectedCueId] = useState(null);
  const [selectedCueIds, setSelectedCueIds] = useState([]);
  const [armedCueId, setArmedCueId] = useState(null);
  const [cueStates, setCueStates] = useState({});
  const [meters, setMeters] = useState({ master: null, cues: {} });
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [engineError, setEngineError] = useState('');
  const [serverConnected, setServerConnected] = useState(false);
  const [client, setClient] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState({ activeClientId: null, clients: [] });
  const [notifications, setNotifications] = useState([]);
  const [importing, setImporting] = useState(false);
  const saveTimer = useRef(null);
  const projectRef = useRef(project);
  const cueStatesRef = useRef(cueStates);
  const metersRef = useRef(meters);
  const selectedRef = useRef(selectedCueId);
  const armedRef = useRef(armedCueId);
  const eventSourceRef = useRef(null);
  const handledCommands = useRef(new Set());
  const completedCueHandler = useRef(() => {});
  const selectionAnchorRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const historyMergeRef = useRef(null);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0, undoLabel: '', redoLabel: '' });

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { cueStatesRef.current = cueStates; }, [cueStates]);
  useEffect(() => { metersRef.current = meters; }, [meters]);
  useEffect(() => { selectedRef.current = selectedCueId; }, [selectedCueId]);
  useEffect(() => { armedRef.current = armedCueId; }, [armedCueId]);

  const refreshHistoryState = useCallback(() => {
    const undoItem = undoStackRef.current.at(-1);
    const redoItem = redoStackRef.current.at(-1);
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
      undoLabel: undoItem?.label || '',
      redoLabel: redoItem?.label || ''
    });
  }, []);

  const recordHistory = useCallback((projectSnapshot, label, mergeKey = '') => {
    const now = Date.now();
    const previousMerge = historyMergeRef.current;
    const shouldMerge = mergeKey && previousMerge?.key === mergeKey && now - previousMerge.at < 700;
    if (!shouldMerge) {
      undoStackRef.current.push({ project: cloneProject(projectSnapshot), label });
      if (undoStackRef.current.length > 75) undoStackRef.current.shift();
    }
    historyMergeRef.current = mergeKey ? { key: mergeKey, at: now } : null;
    redoStackRef.current = [];
    refreshHistoryState();
  }, [refreshHistoryState]);

  const applyProjectChange = useCallback((label, updater, { mergeKey = '' } = {}) => {
    const current = projectRef.current;
    const next = updater(current);
    if (!next || next === current) return current;
    recordHistory(current, label, mergeKey);
    projectRef.current = next;
    setProject(next);
    return next;
  }, [recordHistory]);

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications((current) => [...current, { id, message, type }].slice(-4));
    window.setTimeout(() => setNotifications((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getProject(), api.status()])
      .then(([projectResponse, statusResponse]) => {
        if (cancelled) return;
        const next = { ...defaultProject, ...projectResponse.project, templates: projectResponse.project.templates || [], settings: { ...defaultProject.settings, ...(projectResponse.project.settings || {}) } };
        setProject(next);
        setSelectedCueId(next.cues[0]?.id || null);
        setSelectedCueIds(next.cues[0]?.id ? [next.cues[0].id] : []);
        setPlaybackStatus(statusResponse.playback || { activeClientId: null, clients: [] });
        setServerConnected(true);
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoaded(true);
        setSaveError(error.message);
        notify(`Server connection failed: ${error.message}`, 'danger');
      });
    return () => { cancelled = true; };
  }, [notify]);

  useEffect(() => {
    if (!loaded) return;
    const theme = project.settings?.theme || 'dark';
    document.documentElement.setAttribute('data-bs-theme', theme);
    document.documentElement.dataset.appTheme = theme;
    localStorage.setItem('cuepilot-theme', theme);
  }, [loaded, project.settings?.theme]);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      setSaveError('');
      try {
        await api.saveProject(projectRef.current);
        setServerConnected(true);
      } catch (error) {
        setSaveError(error.message);
        setServerConnected(false);
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [project, loaded]);

  useEffect(() => {
    const onStatus = (event) => {
      const { cueId, state, position } = event.detail;
      setCueStates((current) => ({ ...current, [cueId]: { ...(current[cueId] || {}), state, position } }));
      if (state === 'completed') window.setTimeout(() => completedCueHandler.current(cueId), 0);
    };
    const onMeters = (event) => {
      setMeters(event.detail);
      const updates = {};
      for (const [cueId, value] of Object.entries(event.detail.cues || {})) {
        updates[cueId] = { state: value.state, position: value.position, duration: value.duration };
      }
      if (Object.keys(updates).length) setCueStates((current) => {
        const next = { ...current };
        for (const [cueId, update] of Object.entries(updates)) next[cueId] = { ...(next[cueId] || {}), ...update };
        return next;
      });
    };
    const onEngine = () => setEngineEnabled(true);
    const onError = (event) => {
      setEngineError(event.detail.message);
      if (event.detail.cueId) setCueStates((current) => ({ ...current, [event.detail.cueId]: { ...(current[event.detail.cueId] || {}), state: 'error' } }));
      notify(event.detail.message, 'danger');
    };
    audioEngine.addEventListener('status', onStatus);
    audioEngine.addEventListener('meters', onMeters);
    audioEngine.addEventListener('engine', onEngine);
    audioEngine.addEventListener('error', onError);
    return () => {
      audioEngine.removeEventListener('status', onStatus);
      audioEngine.removeEventListener('meters', onMeters);
      audioEngine.removeEventListener('engine', onEngine);
      audioEngine.removeEventListener('error', onError);
    };
  }, [notify]);

  const enableAudio = useCallback(async () => {
    try {
      setEngineError('');
      await audioEngine.initialize();
      audioEngine.setMasterVolume(projectRef.current.settings.masterVolume);
      await audioEngine.preload(projectRef.current.cues);
      setEngineEnabled(true);
      notify('Audio engine enabled', 'success');
    } catch (error) {
      setEngineError(error.message);
      notify(error.message, 'danger');
    }
  }, [notify]);

  const cueById = useCallback((cueId) => projectRef.current.cues.find((cue) => cue.id === cueId), []);

  const selectCue = useCallback((cueId, { toggle = false, range = false } = {}) => {
    if (!cueById(cueId)) return;
    if (range && selectionAnchorRef.current) {
      const ids = projectRef.current.cues.map((cue) => cue.id);
      const start = ids.indexOf(selectionAnchorRef.current);
      const end = ids.indexOf(cueId);
      if (start >= 0 && end >= 0) {
        setSelectedCueId(cueId);
        setSelectedCueIds(ids.slice(Math.min(start, end), Math.max(start, end) + 1));
        return;
      }
    }
    if (toggle) {
      const next = selectedCueIds.includes(cueId) ? selectedCueIds.filter((id) => id !== cueId) : [...selectedCueIds, cueId];
      const resolved = next.length ? next : [cueId];
      setSelectedCueIds(resolved);
      setSelectedCueId(resolved.includes(cueId) ? cueId : resolved.at(-1));
      selectionAnchorRef.current = cueId;
      return;
    }
    selectionAnchorRef.current = cueId;
    setSelectedCueId(cueId);
    setSelectedCueIds([cueId]);
  }, [cueById, selectedCueIds]);

  const selectAllCues = useCallback((cueIds = projectRef.current.cues.map((cue) => cue.id)) => {
    const validIds = cueIds.filter((cueId) => cueById(cueId));
    setSelectedCueIds(validIds);
    if (validIds.length) {
      setSelectedCueId(validIds[0]);
      selectionAnchorRef.current = validIds[0];
    }
  }, [cueById]);

  const clearMultiSelection = useCallback(() => {
    const cueId = selectedRef.current;
    setSelectedCueIds(cueId ? [cueId] : []);
  }, []);

  const triggerCue = useCallback(async (cueId, action = 'play', payload = {}) => {
    const cue = cueById(cueId);
    if (!cue) return false;
    try {
      if (!audioEngine.context) await enableAudio();
      const exclusive = projectRef.current.settings.playbackMode !== 'layered';
      const liveSafe = projectRef.current.settings.operationMode === 'live';
      const transition = liveSafe ? projectRef.current.settings.liveTransition || 'cut' : 'cut';
      const crossfadeMs = Math.max(0, Number(projectRef.current.settings.liveCrossfadeMs || 0));
      const requestedOffset = payload.startTime ?? payload.position ?? null;
      switch (action) {
        case 'play': await audioEngine.play(cue, { offset: requestedOffset, exclusive, transition, crossfadeMs }); break;
        case 'restart': await audioEngine.restart(cue, { offset: requestedOffset, exclusive, transition, crossfadeMs }); break;
        case 'pause': audioEngine.pause(cueId); break;
        case 'resume': await audioEngine.resume(cue, { exclusive, transition, crossfadeMs }); break;
        case 'stop': await audioEngine.stop(cueId); break;
        case 'fade-out': await audioEngine.stop(cueId, { fadeMs: cue.fadeOutMs }); break;
        case 'toggle': await audioEngine.toggle(cue, { offset: requestedOffset, exclusive, transition, crossfadeMs }); break;
        case 'seek': await audioEngine.seek(cue, payload.position, { audition: Boolean(payload.audition), exclusive }); break;
        case 'scrub': await audioEngine.scrub(cue, payload.position); break;
        case 'scrub-end': audioEngine.stopScrubPreview(cueId); break;
        case 'volume': audioEngine.setCueVolume(cueId, payload.volume); break;
        case 'loop': audioEngine.setCueLoop(cueId, payload.enabled); break;
        default: return false;
      }
      if (['play', 'restart', 'toggle'].includes(action) && armedRef.current === cueId) setArmedCueId(null);
      setSelectedCueId(cueId);
      setSelectedCueIds([cueId]);
      return true;
    } catch (error) {
      setCueStates((current) => ({ ...current, [cueId]: { ...(current[cueId] || {}), state: 'error' } }));
      notify(`${cue.name}: ${error.message}`, 'danger');
      return false;
    }
  }, [cueById, enableAudio, notify]);

  const armCue = useCallback((cueId, { toggle = true } = {}) => {
    const cue = cueById(cueId);
    if (!cue) return;
    if (['playing', 'paused', 'fading'].includes(cueStatesRef.current[cueId]?.state)) {
      notify('The active cue does not need to be armed.', 'warning');
      return;
    }
    setSelectedCueId(cueId);
    setSelectedCueIds([cueId]);
    setArmedCueId((current) => toggle && current === cueId ? null : cueId);
  }, [cueById, notify]);

  useEffect(() => {
    completedCueHandler.current = async (cueId) => {
      const cues = projectRef.current.cues;
      const index = cues.findIndex((cue) => cue.id === cueId);
      const cue = cues[index];
      if (projectRef.current.settings.operationMode === 'live') return;
      if (!cue || cue.loop || (!projectRef.current.settings.autoPlayNext && cue.followAction !== 'next')) return;
      const nextCue = cues[index + 1];
      if (!nextCue) return;
      setSelectedCueId(nextCue.id);
      setSelectedCueIds([nextCue.id]);
      await triggerCue(nextCue.id, 'play');
    };
    return () => { completedCueHandler.current = () => {}; };
  }, [triggerCue]);

  const transport = useCallback(async (action) => {
    const cues = projectRef.current.cues;
    const selectedIndex = Math.max(0, cues.findIndex((cue) => cue.id === selectedRef.current));
    const byId = new Map(cues.map((cue) => [cue.id, cue]));
    switch (action) {
      case 'stop-all': await audioEngine.stopAll(false); return true;
      case 'fade-out-all': await audioEngine.stopAll(false); return true;
      case 'pause-all': audioEngine.pauseAll(); return true;
      case 'resume-all': audioEngine.resumeAll(byId); return true;
      case 'panic': await audioEngine.panic(); return true;
      case 'next': {
        const cueId = cues[Math.min(cues.length - 1, selectedIndex + 1)]?.id || null;
        setSelectedCueId(cueId);
        setSelectedCueIds(cueId ? [cueId] : []);
        return true;
      }
      case 'previous': {
        const cueId = cues[Math.max(0, selectedIndex - 1)]?.id || null;
        setSelectedCueId(cueId);
        setSelectedCueIds(cueId ? [cueId] : []);
        return true;
      }
      case 'go': {
        const liveSafe = projectRef.current.settings.operationMode === 'live';
        const targetCue = resolveGoCue(cues, selectedRef.current, armedRef.current, liveSafe);
        if (!targetCue) {
          if (liveSafe) notify('Select a cue, arm it, then press GO or Enter.', 'warning');
          return false;
        }
        return triggerCue(targetCue.id, 'play');
      }
      case 'play-pause': {
        const liveSafe = projectRef.current.settings.operationMode === 'live';
        const targetCue = resolvePlayPauseCue(cues, cueStatesRef.current, selectedRef.current, liveSafe);
        if (!targetCue) return false;
        const state = cueStatesRef.current[targetCue.id]?.state;
        if (state === 'playing') audioEngine.pause(targetCue.id);
        else if (state === 'paused') await audioEngine.resume(targetCue, { exclusive: projectRef.current.settings.playbackMode !== 'layered' });
        else await triggerCue(targetCue.id, 'play');
        if (!liveSafe) {
          setSelectedCueId(targetCue.id);
          setSelectedCueIds([targetCue.id]);
        }
        return true;
      }
      default: return false;
    }
  }, [notify, triggerCue]);

  useEffect(() => {
    let heartbeatTimer;
    let statusTimer;
    let active = true;
    async function connect() {
      try {
        const response = await api.registerClient(`CuePilot ${navigator.platform || 'Browser'}`);
        if (!active) return;
        setClient(response.client);
        const source = new EventSource(`/api/events?clientId=${encodeURIComponent(response.client.id)}`);
        eventSourceRef.current = source;
        source.addEventListener('ready', () => setServerConnected(true));
        source.addEventListener('command', async (event) => {
          const command = JSON.parse(event.data);
          if (handledCommands.current.has(command.commandId)) return;
          handledCommands.current.add(command.commandId);
          if (handledCommands.current.size > 200) handledCommands.current = new Set([...handledCommands.current].slice(-100));
          let executed = false;
          let message = '';
          try {
            if (command.type === 'arm' && command.cueId) {
              armCue(command.cueId, { toggle: false });
              executed = Boolean(cueById(command.cueId));
            } else if (command.cueId) executed = await triggerCue(command.cueId, command.type, command.payload || {});
            else executed = await transport(command.type);
            if (!executed) message = 'The playback engine rejected the command in its current state.';
          } catch (error) {
            message = error.message || 'Playback command failed.';
          }
          api.acknowledgeCommand(response.client.id, command.commandId, executed ? 'executed' : 'rejected', message).catch(() => {});
        });
        source.onerror = () => setServerConnected(false);
        heartbeatTimer = window.setInterval(() => api.heartbeat(response.client.id).then(() => setServerConnected(true)).catch(() => setServerConnected(false)), 4000);
        statusTimer = window.setInterval(async () => {
          try {
            const status = await api.status();
            setPlaybackStatus(status.playback || { activeClientId: null, clients: [] });
          } catch { setServerConnected(false); }
        }, 3000);
      } catch (error) {
        setServerConnected(false);
        notify(`Playback client registration failed: ${error.message}`, 'danger');
      }
    }
    connect();
    return () => {
      active = false;
      clearInterval(heartbeatTimer);
      clearInterval(statusTimer);
      eventSourceRef.current?.close();
    };
  }, [armCue, cueById, notify, transport, triggerCue]);

  useEffect(() => {
    if (!client?.id) return;
    const timer = window.setInterval(() => {
      const cuesById = new Map(projectRef.current.cues.map((cue) => [cue.id, cue]));
      const activeCues = Object.entries(cueStatesRef.current).filter(([, value]) => ['playing', 'paused', 'fading'].includes(value.state)).map(([cueId, value]) => {
        const cue = cuesById.get(cueId);
        const duration = value.duration || cue?.duration || 0;
        const position = value.position || 0;
        return {
          cueId,
          name: cue?.name || cueId,
          number: cue?.number || 0,
          state: value.state,
          position,
          duration,
          remaining: Math.max(0, duration - position),
          muted: Boolean(cue?.muted),
          loudness: metersRef.current.cues?.[cueId] ? metersRef.current.cues[cueId].rms - 0.691 : null
        };
      });
      const cueStatesSnapshot = Object.fromEntries(projectRef.current.cues.map((cue) => [cue.id, {
        state: cueStatesRef.current[cue.id]?.state || 'ready',
        muted: Boolean(cue.muted)
      }]));
      const selectedCue = cuesById.get(selectedRef.current);
      const armedCue = cuesById.get(armedRef.current);
      const transportState = activeCues.some((cue) => cue.state === 'playing') ? 'playing'
        : activeCues.some((cue) => cue.state === 'fading') ? 'fading'
          : activeCues.some((cue) => cue.state === 'paused') ? 'paused' : 'stopped';
      api.publishState(client.id, {
        status: engineEnabled ? 'ready' : 'audio-disabled',
        activeCues,
        cueStates: cueStatesSnapshot,
        selectedCue: selectedCue ? { cueId: selectedCue.id, name: selectedCue.name, number: selectedCue.number } : null,
        armedCue: armedCue ? { cueId: armedCue.id, name: armedCue.name, number: armedCue.number } : null,
        transportState,
        liveSafe: projectRef.current.settings.operationMode === 'live',
        meters: metersRef.current.master ? {
          peak: metersRef.current.master.peak,
          truePeak: metersRef.current.master.truePeak,
          rms: metersRef.current.master.rms,
          integrated: metersRef.current.master.integrated
        } : null
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [client?.id, engineEnabled]);

  const importFiles = useCallback(async (files) => {
    const supported = [...files].filter((file) => /\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name));
    if (!supported.length) return notify('Choose WAV, MP3, M4A, AAC, OGG, or FLAC files.', 'warning');
    setImporting(true);
    try {
      const newCues = [];
      for (const file of supported) {
        const [upload, duration] = await Promise.all([api.importMedia(file), fileDuration(file)]);
        const index = projectRef.current.cues.length + newCues.length;
        newCues.push({
          id: cueIdFromName(file.name),
          number: index + 1,
          name: file.name.replace(/\.[^.]+$/, ''),
          description: '',
          mediaUrl: upload.media.mediaUrl,
          fileName: upload.media.fileName,
          duration,
          shortcut: index < 9 ? String(index + 1) : '',
          volume: 1,
          muted: false,
          loop: false,
          loopCount: 0,
          fadeInMs: 15,
          fadeOutMs: projectRef.current.settings.defaultFadeMs || 800,
          color: ['emerald', 'blue', 'violet', 'amber', 'rose'][index % 5],
          triggerMode: 'restart',
          startTime: 0,
          endTime: 0,
          followAction: 'none',
          group: ''
        });
      }
      applyProjectChange(`Import ${newCues.length} cue${newCues.length === 1 ? '' : 's'}`, (current) => ({ ...current, cues: [...current.cues, ...newCues] }));
      setSelectedCueId(newCues[0]?.id || selectedRef.current);
      setSelectedCueIds(newCues.map((cue) => cue.id));
      if (audioEngine.context) audioEngine.preload(newCues);
      notify(`${newCues.length} audio cue${newCues.length === 1 ? '' : 's'} imported`, 'success');
    } catch (error) {
      notify(error.message, 'danger');
    } finally {
      setImporting(false);
    }
  }, [applyProjectChange, notify]);

  const updateCue = useCallback((cueId, changes, options = {}) => {
    const previous = projectRef.current.cues.find((cue) => cue.id === cueId);
    if (previous && changes.mediaUrl && changes.mediaUrl !== previous.mediaUrl) {
      audioEngine.stop(cueId, { immediate: true });
      audioEngine.invalidateCue(cueId);
    }
    const nextCue = previous ? { ...previous, ...changes } : null;
    const fields = Object.keys(changes).sort().join(',');
    applyProjectChange(options.label || 'Edit cue', (current) => ({
      ...current,
      cues: current.cues.map((cue) => cue.id === cueId ? { ...cue, ...changes } : cue)
    }), { mergeKey: options.mergeKey === undefined ? `cue:${cueId}:${fields}` : options.mergeKey });
    if (nextCue) audioEngine.updateCue(nextCue, changes);
  }, [applyProjectChange]);

  const updateCues = useCallback((cueIds, changes, options = {}) => {
    const ids = new Set(cueIds);
    if (!ids.size) return;
    applyProjectChange(options.label || `Edit ${ids.size} cues`, (current) => ({
      ...current,
      cues: current.cues.map((cue) => ids.has(cue.id) ? { ...cue, ...changes } : cue)
    }), { mergeKey: options.mergeKey || '' });
    for (const cueId of ids) {
      const cue = projectRef.current.cues.find((item) => item.id === cueId);
      if (cue) audioEngine.updateCue(cue, changes);
    }
  }, [applyProjectChange]);

  const replaceCueFile = useCallback(async (cueId, file) => {
    if (!file || !/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)) {
      notify('Choose a WAV, MP3, M4A, AAC, OGG, or FLAC file.', 'warning');
      return null;
    }
    const [upload, duration] = await Promise.all([api.importMedia(file), fileDuration(file)]);
    await audioEngine.stop(cueId, { immediate: true });
    audioEngine.invalidateCue(cueId);
    const changes = {
      mediaUrl: upload.media.mediaUrl,
      fileName: upload.media.fileName,
      duration,
      startTime: 0,
      endTime: 0
    };
    updateCue(cueId, changes, { label: 'Replace cue audio', mergeKey: '' });
    notify(`Audio replaced with ${file.name}`, 'success');
    return changes;
  }, [notify, updateCue]);

  const deleteCue = useCallback((cueId) => {
    audioEngine.stop(cueId, { immediate: true });
    audioEngine.invalidateCue(cueId);
    const next = applyProjectChange('Delete cue', (current) => {
      const cues = current.cues.filter((cue) => cue.id !== cueId).map((cue, index) => ({ ...cue, number: index + 1 }));
      return { ...current, cues };
    });
    const fallbackCueId = next.cues[0]?.id || null;
    setSelectedCueIds((current) => {
      const remaining = current.filter((id) => id !== cueId);
      return remaining.length ? remaining : fallbackCueId ? [fallbackCueId] : [];
    });
    if (selectedRef.current === cueId) setSelectedCueId(fallbackCueId);
    if (armedRef.current === cueId) setArmedCueId(null);
  }, [applyProjectChange]);

  const duplicateCue = useCallback((cueId) => {
    applyProjectChange('Duplicate cue', (current) => {
      const index = current.cues.findIndex((cue) => cue.id === cueId);
      if (index < 0) return current;
      const source = current.cues[index];
      const duplicate = { ...source, id: `${source.id}-copy-${Date.now().toString(36)}`, name: `${source.name} Copy`, shortcut: '' };
      const cues = [...current.cues];
      cues.splice(index + 1, 0, duplicate);
      return { ...current, cues: cues.map((cue, cueIndex) => ({ ...cue, number: cueIndex + 1 })) };
    });
  }, [applyProjectChange]);

  const reorderCue = useCallback((cueId, direction) => {
    applyProjectChange('Reorder cues', (current) => {
      const index = current.cues.findIndex((cue) => cue.id === cueId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.cues.length) return current;
      const cues = [...current.cues];
      [cues[index], cues[target]] = [cues[target], cues[index]];
      return { ...current, cues: cues.map((cue, cueIndex) => ({ ...cue, number: cueIndex + 1 })) };
    });
  }, [applyProjectChange]);

  const reorderCueTo = useCallback((cueId, targetCueId) => {
    if (cueId === targetCueId) return;
    applyProjectChange('Reorder cues', (current) => {
      const sourceIndex = current.cues.findIndex((cue) => cue.id === cueId);
      const targetIndex = current.cues.findIndex((cue) => cue.id === targetCueId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const cues = [...current.cues];
      const [moved] = cues.splice(sourceIndex, 1);
      cues.splice(targetIndex, 0, moved);
      return { ...current, cues: cues.map((cue, index) => ({ ...cue, number: index + 1 })) };
    });
  }, [applyProjectChange]);

  const createTemplateFromCue = useCallback((cueId, templateName) => {
    const cue = cueById(cueId);
    const name = String(templateName || '').trim();
    if (!cue || !name) return false;
    const values = Object.fromEntries(templateFields.map((field) => [field, cue[field]]));
    const template = { id: `template-${Date.now().toString(36)}`, name, values };
    applyProjectChange('Create cue template', (current) => ({ ...current, templates: [...(current.templates || []), template] }));
    notify(`Template “${name}” saved`, 'success');
    return true;
  }, [applyProjectChange, cueById, notify]);

  const applyCueTemplate = useCallback((templateId, cueIds) => {
    const template = (projectRef.current.templates || []).find((item) => item.id === templateId);
    if (!template) return;
    updateCues(cueIds, template.values || {}, { label: `Apply template ${template.name}` });
    notify(`Applied “${template.name}” to ${cueIds.length} cue${cueIds.length === 1 ? '' : 's'}`, 'success');
  }, [notify, updateCues]);

  const deleteCueTemplate = useCallback((templateId) => {
    applyProjectChange('Delete cue template', (current) => ({ ...current, templates: (current.templates || []).filter((item) => item.id !== templateId) }));
  }, [applyProjectChange]);

  const restoreProjectSnapshot = useCallback((snapshot) => {
    const previous = projectRef.current;
    const next = cloneProject(snapshot);
    const nextById = new Map(next.cues.map((cue) => [cue.id, cue]));
    for (const cue of previous.cues) {
      const restored = nextById.get(cue.id);
      if (!restored || restored.mediaUrl !== cue.mediaUrl) {
        audioEngine.stop(cue.id, { immediate: true });
        audioEngine.invalidateCue(cue.id);
      } else audioEngine.updateCue(restored, restored);
    }
    projectRef.current = next;
    setProject(next);
    const validSelected = selectedCueIds.filter((cueId) => nextById.has(cueId));
    const primary = nextById.has(selectedRef.current) ? selectedRef.current : next.cues[0]?.id || null;
    setSelectedCueId(primary);
    setSelectedCueIds(validSelected.length ? validSelected : primary ? [primary] : []);
    if (armedRef.current && !nextById.has(armedRef.current)) setArmedCueId(null);
  }, [selectedCueIds]);

  const undo = useCallback(() => {
    if (projectRef.current.settings.operationMode === 'live') return notify('Undo is locked in Live Safe mode.', 'warning');
    const item = undoStackRef.current.pop();
    if (!item) return;
    redoStackRef.current.push({ project: cloneProject(projectRef.current), label: item.label });
    historyMergeRef.current = null;
    restoreProjectSnapshot(item.project);
    refreshHistoryState();
    notify(`Undid: ${item.label}`, 'info');
  }, [notify, refreshHistoryState, restoreProjectSnapshot]);

  const redo = useCallback(() => {
    if (projectRef.current.settings.operationMode === 'live') return notify('Redo is locked in Live Safe mode.', 'warning');
    const item = redoStackRef.current.pop();
    if (!item) return;
    undoStackRef.current.push({ project: cloneProject(projectRef.current), label: item.label });
    historyMergeRef.current = null;
    restoreProjectSnapshot(item.project);
    refreshHistoryState();
    notify(`Redid: ${item.label}`, 'info');
  }, [notify, refreshHistoryState, restoreProjectSnapshot]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const historyAction = historyActionFromEvent(event);
      if (historyAction && !isTextEditingTarget(target)) {
        event.preventDefault();
        if (historyAction === 'redo') redo();
        else undo();
        return;
      }
      if (!projectRef.current.settings.keyboardEnabled || isShortcutEntryTarget(target)) return;
      const shortcut = shortcutFromEvent(event);
      const globalActions = { Space: 'play-pause', Enter: 'go', Escape: 'stop-all', 'Shift+Escape': 'panic', ArrowDown: 'next', ArrowUp: 'previous' };
      if (globalActions[shortcut]) {
        if (shortcut === 'Space' && event.repeat) return;
        event.preventDefault();
        transport(globalActions[shortcut]);
        return;
      }
      const cue = projectRef.current.cues.find((item) => item.shortcut && item.shortcut.toLowerCase() === shortcut.toLowerCase());
      if (cue) {
        event.preventDefault();
        triggerCue(cue.id, cue.triggerMode === 'toggle' ? 'toggle' : 'play');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [redo, transport, triggerCue, undo]);

  const updateSettings = useCallback((changes) => {
    setProject((current) => {
      const next = { ...current, settings: { ...current.settings, ...changes } };
      projectRef.current = next;
      return next;
    });
    if ('masterVolume' in changes) audioEngine.setMasterVolume(changes.masterVolume);
    if (changes.operationMode === 'rehearsal') setArmedCueId(null);
  }, []);

  const takeControl = useCallback(async () => {
    if (!client?.id) return;
    try {
      const response = await api.takeControl(client.id);
      setPlaybackStatus(response.playback);
      setClient((current) => current ? { ...current, active: true } : current);
      notify('This browser now owns playback', 'success');
    } catch (error) { notify(error.message, 'danger'); }
  }, [client?.id, notify]);

  const value = useMemo(() => ({
    project, setProject, loaded, saving, saveError, view, setView, selectedCueId, setSelectedCueId, selectedCueIds, selectCue, selectAllCues, clearMultiSelection, armedCueId, armCue,
    cueStates, meters, engineEnabled, engineError, serverConnected, client, playbackStatus, notifications,
    importing, enableAudio, triggerCue, transport, importFiles, updateCue, updateCues, replaceCueFile, deleteCue, duplicateCue, reorderCue, reorderCueTo,
    createTemplateFromCue, applyCueTemplate, deleteCueTemplate, historyState, undo, redo, updateSettings, takeControl, notify
  }), [project, loaded, saving, saveError, view, selectedCueId, selectedCueIds, selectCue, selectAllCues, clearMultiSelection, armedCueId, cueStates, meters, engineEnabled, engineError, serverConnected, client, playbackStatus, notifications, importing, enableAudio, triggerCue, transport, importFiles, updateCue, updateCues, replaceCueFile, deleteCue, duplicateCue, reorderCue, reorderCueTo, createTemplateFromCue, applyCueTemplate, deleteCueTemplate, historyState, undo, redo, updateSettings, takeControl, notify, armCue]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}

export { shortcutFromEvent };
