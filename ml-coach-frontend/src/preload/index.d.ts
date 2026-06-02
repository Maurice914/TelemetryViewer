import { ElectronAPI } from '@electron-toolkit/preload'

export interface CoachingCorner {
  corner: string
  time_lost: number
  speed_diff: number | null
  thr_diff: number | null
  flags: string[]
  apex_pct?: number
  start_pct?: number
  end_pct?: number
  braking: Record<string, unknown>
  steering: Record<string, unknown>
  line: Record<string, unknown>
}

export interface CoachingResult {
  text: string
  data: CoachingCorner[]
  all_corners: CoachingCorner[]
  track_length: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readFile: (filePath: string) => Promise<string>
      runCoaching: (data: {
        fastPoints: { lapDistPct: number; speed: number; brake: number; throttle: number; steeringWheelAngle: number; rpm: number; gear: number; lat: number; lon: number }[]
        slowPoints: { lapDistPct: number; speed: number; brake: number; throttle: number; steeringWheelAngle: number; rpm: number; gear: number; lat: number; lon: number }[]
      }) => Promise<CoachingResult>
    }
  }
}
