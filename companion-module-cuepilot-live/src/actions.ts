import type CuePilotInstance from './main.js'

const cueActions = [
  ['play', 'Cue: Play'],
  ['pause', 'Cue: Pause'],
  ['resume', 'Cue: Resume'],
  ['stop', 'Cue: Stop'],
  ['toggle', 'Cue: Toggle playback'],
  ['arm', 'Cue: Arm'],
  ['fade-out', 'Cue: Fade out'],
] as const

export function updateActions(self: CuePilotInstance): void {
  const choices = self.cueChoices()
  const defaultCue = choices[0]?.id || ''
  const definitions: Record<string, any> = {}

  for (const [action, name] of cueActions) {
    definitions[action.replace('-', '_')] = {
      name,
      options: [{ id: 'cueId', type: 'dropdown', label: 'Cue', default: defaultCue, choices }],
      callback: async (event: any) => {
        try {
          await self.executeCue(String(event.options.cueId || ''), action)
          await self.refresh()
        } catch (error) {
          self.log('error', error instanceof Error ? error.message : 'Cue command failed')
        }
      },
    }
  }

  definitions.go = {
    name: 'Transport: GO',
    options: [],
    callback: async () => {
      try { await self.execute('/api/v1/transport/go'); await self.refresh() }
      catch (error) { self.log('error', error instanceof Error ? error.message : 'GO failed') }
    },
  }
  definitions.stop_all = {
    name: 'Transport: Stop all',
    options: [],
    callback: async () => {
      try { await self.execute('/api/v1/transport/stop-all'); await self.refresh() }
      catch (error) { self.log('error', error instanceof Error ? error.message : 'Stop all failed') }
    },
  }
  definitions.panic = {
    name: 'Transport: Panic',
    description: 'Requires Enable Panic in the connection configuration',
    options: [],
    callback: async () => {
      if (!self.config.enablePanic) {
        self.log('warn', 'Panic is protected. Enable it in the CuePilot connection configuration first.')
        return
      }
      try { await self.execute('/api/v1/transport/panic'); await self.refresh() }
      catch (error) { self.log('error', error instanceof Error ? error.message : 'Panic failed') }
    },
  }

  self.setActionDefinitions(definitions)
}
