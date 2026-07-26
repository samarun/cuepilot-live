import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { defaultConfig, getConfigFields, type ModuleConfig } from './config.js'
import type { Cue, StatusResponse } from './types.js'
import { updateActions } from './actions.js'
import { updateFeedbacks } from './feedbacks.js'
import { updatePresets } from './presets.js'
import { updateVariableDefinitions, variableValues } from './variables.js'

export default class CuePilotInstance extends InstanceBase<any> {
  config: ModuleConfig = defaultConfig
  cues: Cue[] = []
  status: StatusResponse | null = null
  pollTimer: ReturnType<typeof setInterval> | null = null
  refreshing = false
  cueSignature = ''

  async init(config: ModuleConfig): Promise<void> {
    this.config = { ...defaultConfig, ...config }
    updateActions(this)
    updateFeedbacks(this)
    updateVariableDefinitions(this)
    updatePresets(this)
    await this.refresh()
    this.startPolling()
  }

  async destroy(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    this.config = { ...defaultConfig, ...config }
    this.startPolling()
    await this.refresh()
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return getConfigFields()
  }

  baseUrl(): string {
    const host = this.config.host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `http://${host}:${this.config.port}`
  }

  async request(path: string, options: RequestInit = {}): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    try {
      const headers = new Headers(options.headers)
      headers.set('Accept', 'application/json')
      if (options.body) headers.set('Content-Type', 'application/json')
      if (this.config.token) headers.set('Authorization', `Bearer ${this.config.token}`)
      const response = await fetch(`${this.baseUrl()}${path}`, { ...options, headers, signal: controller.signal })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error?.message || `CuePilot request failed (${response.status})`)
      return payload
    } finally {
      clearTimeout(timer)
    }
  }

  async execute(path: string): Promise<void> {
    const accepted = await this.request(path, { method: 'POST', body: '{}' })
    if (!accepted.commandId) return
    const deadline = Date.now() + 3500
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const result = await this.request(`/api/v1/commands/${encodeURIComponent(accepted.commandId)}`)
      const status = result.command?.status
      if (status === 'executed') return
      if (status === 'rejected' || status === 'timed-out') throw new Error(result.command?.message || `CuePilot command ${status}`)
    }
    throw new Error('CuePilot command acknowledgement timed out')
  }

  async executeCue(cueId: string, action: string): Promise<void> {
    if (!cueId) throw new Error('Select a cue')
    await this.execute(`/api/v1/cues/${encodeURIComponent(cueId)}/${action}`)
  }

  cueChoices(): Array<{ id: string; label: string }> {
    return this.cues.map((cue) => ({ id: cue.id, label: `${String(cue.number).padStart(3, '0')} · ${cue.name}` }))
  }

  cueState(cueId: string): string {
    return this.status?.show?.cueStates?.[cueId]?.state || 'ready'
  }

  cueMuted(cueId: string): boolean {
    return Boolean(this.status?.show?.cueStates?.[cueId]?.muted ?? this.cues.find((cue) => cue.id === cueId)?.muted)
  }

  engineOffline(): boolean {
    return !this.status?.playbackOwner?.healthy || this.status?.playbackOwner?.engineStatus !== 'ready'
  }

  startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    const interval = Math.max(250, Math.min(5000, Number(this.config.pollInterval) || 500))
    this.pollTimer = setInterval(() => void this.refresh(), interval)
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const [statusResponse, cuesResponse] = await Promise.all([
        this.request('/api/v1/status'),
        this.request('/api/v1/cues'),
      ])
      this.status = statusResponse as StatusResponse
      this.cues = Array.isArray(cuesResponse.cues) ? cuesResponse.cues : []
      const nextSignature = this.cues.map((cue) => `${cue.id}:${cue.number}:${cue.name}`).join('|')
      if (nextSignature !== this.cueSignature) {
        this.cueSignature = nextSignature
        updateActions(this)
        updateFeedbacks(this)
        updatePresets(this)
      }
      this.setVariableValues(variableValues(this))
      this.checkAllFeedbacks()
      this.updateStatus(InstanceStatus.Ok)
    } catch (error) {
      this.status = null
      this.setVariableValues(variableValues(this))
      this.checkAllFeedbacks()
      this.updateStatus(InstanceStatus.ConnectionFailure, error instanceof Error ? error.message : 'Connection failed')
    } finally {
      this.refreshing = false
    }
  }
}
