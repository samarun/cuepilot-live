export function resolvePlayPauseCue(cues, cueStates, selectedCueId, liveSafe) {
  const playingCue = cues.find((cue) => cueStates[cue.id]?.state === 'playing');
  const pausedCue = cues.find((cue) => cueStates[cue.id]?.state === 'paused');
  const selectedCue = cues.find((cue) => cue.id === selectedCueId);
  return liveSafe ? (playingCue || pausedCue || null) : (selectedCue || playingCue || pausedCue || null);
}

export function resolveGoCue(cues, selectedCueId, armedCueId, liveSafe) {
  const cueId = liveSafe ? armedCueId : selectedCueId;
  return cues.find((cue) => cue.id === cueId) || null;
}
