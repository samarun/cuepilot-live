import type CuePilotInstance from './main.js'

export function updateFeedbacks(self: CuePilotInstance): void {
  const cueOption = () => [{ id: 'cueId', type: 'dropdown', label: 'Cue', default: self.cueChoices()[0]?.id || '', choices: self.cueChoices() }]
  const cueFeedback = (name: string, state: string, bgcolor: number) => ({
    name,
    type: 'boolean',
    defaultStyle: { color: 0xffffff, bgcolor },
    options: cueOption(),
    callback: (event: any) => state === 'active'
      ? ['playing', 'fading'].includes(self.cueState(String(event.options.cueId)))
      : self.cueState(String(event.options.cueId)) === state,
  })

  self.setFeedbackDefinitions({
    cue_active: cueFeedback('Cue is active', 'active', 0x168653),
    cue_armed: {
      name: 'Cue is armed', type: 'boolean', defaultStyle: { color: 0x000000, bgcolor: 0xe8bd50 }, options: cueOption(),
      callback: (event: any) => self.status?.show?.armedCue?.cueId === String(event.options.cueId),
    },
    cue_paused: cueFeedback('Cue is paused', 'paused', 0xc28c19),
    cue_completed: cueFeedback('Cue is completed', 'completed', 0x7251d1),
    cue_error: cueFeedback('Cue has an error', 'error', 0xd84959),
    cue_muted: {
      name: 'Cue is muted', type: 'boolean', defaultStyle: { color: 0xffffff, bgcolor: 0xd84959 }, options: cueOption(),
      callback: (event: any) => self.cueMuted(String(event.options.cueId)),
    },
    engine_offline: {
      name: 'Playback engine is offline', type: 'boolean', defaultStyle: { color: 0xffffff, bgcolor: 0xd84959 }, options: [],
      callback: () => self.engineOffline(),
    },
  } as any)
}
