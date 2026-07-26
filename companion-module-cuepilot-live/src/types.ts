export type Cue = {
  id: string
  number: number
  name: string
  muted?: boolean
}

export type CueState = {
  state: string
  muted?: boolean
}

export type CueSummary = {
  cueId: string
  name: string
  number: number
  state?: string
  position?: number
  duration?: number
  remaining?: number
  loudness?: number | null
}

export type StatusResponse = {
  success: boolean
  playbackOwner?: {
    connected?: boolean
    healthy?: boolean
    engineStatus?: string
    label?: string | null
  }
  show?: {
    selectedCue?: CueSummary | null
    armedCue?: CueSummary | null
    activeCue?: CueSummary | null
    activeCues?: CueSummary[]
    cueStates?: Record<string, CueState>
    transportState?: string
    liveSafe?: boolean
    timing?: { position?: number; duration?: number; remaining?: number }
    meters?: { integrated?: number; truePeak?: number; peak?: number } | null
  }
}
