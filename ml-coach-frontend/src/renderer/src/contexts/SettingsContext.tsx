import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface UserSettings {
  trackLineWidth: number
  trackDotRadius: number
  graphLineWidth: number
  showRuler: boolean
  lapColors: Record<string, string>
}

const defaults: UserSettings = {
  trackLineWidth: 1.3,
  trackDotRadius: 7,
  graphLineWidth: 1.3,
  showRuler: false,
  lapColors: {}
}

function load(): UserSettings {
  try {
    const raw = localStorage.getItem('telemetry-settings')
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

interface SettingsValue {
  settings: UserSettings
  update: (patch: Partial<UserSettings>) => void
  setLapColor: (name: string, color: string) => void
}

const ctx = createContext<SettingsValue>({
  settings: defaults,
  update: () => {},
  setLapColor: () => {}
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load)

  const update = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem('telemetry-settings', JSON.stringify(next))
      return next
    })
  }, [])

  const setLapColor = useCallback((name: string, color: string) => {
    setSettings((prev) => {
      const next = { ...prev, lapColors: { ...prev.lapColors, [name]: color } }
      localStorage.setItem('telemetry-settings', JSON.stringify(next))
      return next
    })
  }, [])

  return <ctx.Provider value={{ settings, update, setLapColor }}>{children}</ctx.Provider>
}

export function useSettings() {
  return useContext(ctx)
}
