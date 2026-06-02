import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Point } from '../utils/csvParser'

const MAX_LAPS = 10

const LAP_COLORS = [
  '#cc0000',
  '#0066cc',
  '#2e8b57',
  '#cc6600',
  '#9933cc',
  '#cc3399',
  '#009999',
  '#8b4513',
  '#666600',
  '#336699'
]

export function getLapColor(index: number): string {
  return LAP_COLORS[index % LAP_COLORS.length]
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dlat = ((lat2 - lat1) * Math.PI) / 180
  const dlon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface LapData {
  name: string
  points: Point[]
  totalTime: number
}

interface LapDataContextType {
  laps: LapData[]
  addLap: (points: Point[], name: string) => void
  removeLap: (index: number) => void
  clearLaps: () => void
  hoveredLapPct: number | null
  setHoveredLapPct: (pct: number | null) => void
  selection: { startPct: number; endPct: number } | null
  setSelection: (sel: { startPct: number; endPct: number } | null) => void
  dragSelection: { startPct: number; endPct: number } | null
  setDragSelection: (sel: { startPct: number; endPct: number } | null) => void
  referenceLapIndex: number
  cornerHighlight: { startPct: number; endPct: number } | null
  setCornerHighlight: (seg: { startPct: number; endPct: number } | null) => void
  allCornerHighlights: { startPct: number; endPct: number; idx: number }[]
  setAllCornerHighlights: (segs: { startPct: number; endPct: number; idx: number }[]) => void
}

function computeTotalTime(points: Point[]): number {
  let totalTime = 0
  for (let i = 1; i < points.length; i++) {
    const speed = points[i].speed
    if (speed > 0) {
      const dDist = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
      totalTime += dDist / speed
    }
  }
  return totalTime
}

function findSlowestLapIndex(laps: LapData[]): number {
  if (laps.length === 0) return -1
  let slowest = 0
  for (let i = 1; i < laps.length; i++) {
    if (laps[i].totalTime > laps[slowest].totalTime) slowest = i
  }
  return slowest
}

const LapDataContext = createContext<LapDataContextType | null>(null)

export function LapDataProvider({ children }: { children: ReactNode }) {
  const [laps, setLaps] = useState<LapData[]>([])
  const [hoveredLapPct, setHoveredLapPct] = useState<number | null>(null)
  const [selection, setSelection] = useState<{ startPct: number; endPct: number } | null>(null)
  const [dragSelection, setDragSelection] = useState<{ startPct: number; endPct: number } | null>(
    null
  )
  const [cornerHighlight, setCornerHighlight] = useState<{
    startPct: number
    endPct: number
  } | null>(null)
  const [allCornerHighlights, setAllCornerHighlights] = useState<
    { startPct: number; endPct: number; idx: number }[]
  >([])

  const addLap = useCallback((points: Point[], name: string) => {
    setLaps((prev) => {
      if (prev.length >= MAX_LAPS) return prev
      const totalTime = computeTotalTime(points)
      return [...prev, { name, points, totalTime }]
    })
  }, [])

  const removeLap = useCallback((index: number) => {
    setLaps((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearLaps = useCallback(() => {
    setLaps([])
  }, [])

  const referenceLapIndex = findSlowestLapIndex(laps)

  return (
    <LapDataContext.Provider
      value={{
        laps,
        addLap,
        removeLap,
        clearLaps,
        hoveredLapPct,
        setHoveredLapPct,
        selection,
        setSelection,
        dragSelection,
        setDragSelection,
        referenceLapIndex,
        cornerHighlight,
        setCornerHighlight,
        allCornerHighlights,
        setAllCornerHighlights
      }}
    >
      {children}
    </LapDataContext.Provider>
  )
}

export function useLapData() {
  const ctx = useContext(LapDataContext)
  if (!ctx) throw new Error('useLapData must be used within LapDataProvider')
  return ctx
}

export type { Point }
