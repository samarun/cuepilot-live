import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
  host: string
  port: number
  token: string
  pollInterval: number
  enablePanic: boolean
}

export const defaultConfig: ModuleConfig = {
  host: '127.0.0.1',
  port: 8090,
  token: '',
  pollInterval: 500,
  enablePanic: false,
}

export function getConfigFields(): SomeCompanionConfigField[] {
  return [
    { type: 'textinput', id: 'host', label: 'CuePilot host', width: 8, default: defaultConfig.host },
    { type: 'number', id: 'port', label: 'Port', width: 4, min: 1, max: 65535, default: defaultConfig.port },
    { type: 'textinput', id: 'token', label: 'Bearer token (required for LAN)', width: 12, default: '' },
    { type: 'number', id: 'pollInterval', label: 'Feedback refresh (ms)', width: 6, min: 250, max: 5000, default: defaultConfig.pollInterval },
    { type: 'checkbox', id: 'enablePanic', label: 'Enable destructive Panic action', width: 6, default: false },
  ]
}
