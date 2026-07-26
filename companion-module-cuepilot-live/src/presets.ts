import type CuePilotInstance from './main.js'

const white = 0xffffff
const black = 0x000000
const green = 0x168653
const dark = 0x17202b
const amber = 0xe8bd50
const red = 0xd84959

function actionStep(actionId: string, options: Record<string, unknown> = {}) {
  return [{ down: [{ actionId, options }], up: [] }]
}

export function updatePresets(self: CuePilotInstance): void {
  const presets: Record<string, any> = {
    go: {
      type: 'simple', name: 'GO', style: { text: 'GO\n$(this:armed_cue_name)', size: 'auto', color: black, bgcolor: green, show_topbar: false },
      steps: actionStep('go'), feedbacks: [{ feedbackId: 'engine_offline', options: {}, style: { bgcolor: red, color: white } }],
    },
    stop_all: {
      type: 'simple', name: 'Stop all', style: { text: 'STOP\nALL', size: 'auto', color: black, bgcolor: amber, show_topbar: false },
      steps: actionStep('stop_all'), feedbacks: [],
    },
    panic: {
      type: 'simple', name: 'Protected Panic', style: { text: 'PANIC\nPROTECTED', size: 'auto', color: white, bgcolor: red, show_topbar: false },
      steps: actionStep('panic'), feedbacks: [],
    },
  }

  for (const cue of self.cues) {
    presets[`cue_${cue.id}`] = {
      type: 'simple',
      name: `Play ${cue.name}`,
      style: { text: `${String(cue.number).padStart(3, '0')}\n${cue.name}`, size: 'auto', color: white, bgcolor: dark, show_topbar: false },
      steps: actionStep('play', { cueId: cue.id }),
      feedbacks: [
        { feedbackId: 'cue_active', options: { cueId: cue.id }, style: { bgcolor: green, color: white } },
        { feedbackId: 'cue_paused', options: { cueId: cue.id }, style: { bgcolor: amber, color: black } },
        { feedbackId: 'cue_error', options: { cueId: cue.id }, style: { bgcolor: red, color: white } },
      ],
    }
  }

  const structure = [
    { id: 'transport', name: 'Transport', definitions: [{ id: 'transport-controls', name: 'Transport controls', description: 'GO, Stop All, and protected Panic', type: 'simple', presets: ['go', 'stop_all', 'panic'] }] },
    { id: 'cues', name: 'Cues', definitions: [{ id: 'cue-buttons', name: 'Cue buttons', description: 'Play buttons with active, paused, and error feedback', type: 'simple', presets: self.cues.map((cue) => `cue_${cue.id}`) }] },
  ]

  self.setPresetDefinitions(structure as any, presets as any)
}
