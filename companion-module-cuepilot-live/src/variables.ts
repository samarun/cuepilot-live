import type CuePilotInstance from './main.js'

function seconds(value: unknown): string {
  const total = Math.max(0, Number(value) || 0)
  const minutes = Math.floor(total / 60)
  const remaining = Math.floor(total % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export function updateVariableDefinitions(self: CuePilotInstance): void {
  self.setVariableDefinitions({
    connection_status: { name: 'Connection status' },
    engine_status: { name: 'Playback engine status' },
    transport_state: { name: 'Transport state' },
    live_safe: { name: 'Live Safe mode' },
    active_cue_id: { name: 'Active cue ID' },
    active_cue_name: { name: 'Active cue name' },
    active_cue_number: { name: 'Active cue number' },
    active_cue_state: { name: 'Active cue state' },
    active_cue_position: { name: 'Active cue position' },
    active_cue_remaining: { name: 'Active cue remaining' },
    active_cue_loudness: { name: 'Active cue loudness LUFS' },
    armed_cue_id: { name: 'Armed cue ID' },
    armed_cue_name: { name: 'Armed cue name' },
    armed_cue_number: { name: 'Armed cue number' },
    selected_cue_name: { name: 'Selected cue name' },
    playback_owner: { name: 'Playback owner' },
    integrated_lufs: { name: 'Integrated loudness LUFS' },
    true_peak_dbtp: { name: 'True peak dBTP' },
  })
}

export function variableValues(self: CuePilotInstance): Record<string, string | number | boolean> {
  const show = self.status?.show
  const active = show?.activeCue
  const armed = show?.armedCue
  return {
    connection_status: self.status ? 'connected' : 'disconnected',
    engine_status: self.status?.playbackOwner?.engineStatus || 'offline',
    transport_state: show?.transportState || 'stopped',
    live_safe: Boolean(show?.liveSafe),
    active_cue_id: active?.cueId || '',
    active_cue_name: active?.name || '',
    active_cue_number: active?.number || 0,
    active_cue_state: active?.state || 'stopped',
    active_cue_position: seconds(active?.position),
    active_cue_remaining: seconds(active?.remaining),
    active_cue_loudness: active?.loudness == null ? '' : Number(active.loudness).toFixed(1),
    armed_cue_id: armed?.cueId || '',
    armed_cue_name: armed?.name || '',
    armed_cue_number: armed?.number || 0,
    selected_cue_name: show?.selectedCue?.name || '',
    playback_owner: self.status?.playbackOwner?.label || '',
    integrated_lufs: show?.meters?.integrated == null ? '' : Number(show.meters.integrated).toFixed(1),
    true_peak_dbtp: show?.meters?.truePeak == null ? '' : Number(show.meters.truePeak).toFixed(1),
  }
}
