import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { parseCSV, Point } from '../utils/csvParser'

const FAST_CSV_PATH = 'C:\\Users\\mauri\\Documents\\projects\\MLCoachTest\\fast.csv'
const SLOW_CSV_PATH = 'C:\\Users\\mauri\\Documents\\projects\\MLCoachTest\\slow.csv'

interface LapDataContextType {
  fastPoints: Point[]
  slowPoints: Point[]
  hoveredLapPct: number | null
  setHoveredLapPct: (pct: number | null) => void
  selection: { startPct: number; endPct: number } | null
  setSelection: (sel: { startPct: number; endPct: number } | null) => void
}

const LapDataContext = createContext<LapDataContextType | null>(null)

function computeTimeDelta(fastPoints: Point[], slowPoints: Point[]): [Point[], Point[]] {
  if (fastPoints.length === 0 || slowPoints.length === 0) {
    return [fastPoints, slowPoints]
  }

  // Sort by lap distance
  const sortedFast = [...fastPoints].sort((a, b) => a.lapDistPct - b.lapDistPct)
  const sortedSlow = [...slowPoints].sort((a, b) => a.lapDistPct - b.lapDistPct)

  // Compute final time gap (last point - first point for each)
  const fastTotalTime = computeTotalTime(sortedFast)
  const slowTotalTime = computeTotalTime(sortedSlow)
  const finalDelta = slowTotalTime - fastTotalTime

  // Map each point's timeDelta based on its lap distance percentage
  // (Simple linear interpolation - delta grows linearly with distance)
  for (const p of fastPoints) {
    p.timeDelta = p.lapDistPct * finalDelta
  }
  for (const p of slowPoints) {
    p.timeDelta = p.lapDistPct * finalDelta
  }

  return [fastPoints, slowPoints]
}

function computeTotalTime(points: Point[]): number {
  let totalTime = 0
  for (let i = 1; i < points.length; i++) {
    const speed = points[i].speed
    if (speed > 0) {
      const dDist = (points[i].lapDistPct - points[i - 1].lapDistPct) * 3219 // track length
      const dt = dDist / speed
      totalTime += dt
    }
  }
  return totalTime
}

export function LapDataProvider({ children }: { children: ReactNode }) {
  const [fastPoints, setFastPoints] = useState<Point[]>([])
  const [slowPoints, setSlowPoints] = useState<Point[]>([])
  const [hoveredLapPct, setHoveredLapPct] = useState<number | null>(null)
  const [selection, setSelection] = useState<{ startPct: number; endPct: number } | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const fastCsv = await window.api.readFile(FAST_CSV_PATH) as string
        const slowCsv = await window.api.readFile(SLOW_CSV_PATH) as string
        const fastParsed = parseCSV(fastCsv)
        const slowParsed = parseCSV(slowCsv)

        const [fastWithDelta, slowWithDelta] = computeTimeDelta(fastParsed, slowParsed)
        setFastPoints(fastWithDelta)
        setSlowPoints(slowWithDelta)
      } catch (err) {
        console.error('Failed to load CSV data:', err)
      }
    }
    loadData()
  }, [])

  return (
    <LapDataContext.Provider value={{ fastPoints, slowPoints, hoveredLapPct, setHoveredLapPct, selection, setSelection }}>
      {children}
    </LapDataContext.Provider>
  )
}

export function useLapData() {
  const context = useContext(LapDataContext)
  if (!context) throw new Error('useLapData must be used within LapDataProvider')
  return context
}

export type { Point }