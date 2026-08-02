import { Point } from './csvParser'

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dlat = ((lat2 - lat1) * Math.PI) / 180
  const dlon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dlat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dlon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function calcElapsed(points: Point[]): number[] {
  const t = [0]
  for (let i = 1; i < points.length; i++) {
    const s = points[i].speed
    if (s <= 0) { t.push(t[i - 1]); continue }
    t.push(t[i - 1] + haversineDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon) / s)
  }
  return t
}

export function timeAtPct(points: Point[], times: number[], pct: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    if (pct >= points[i].lapDistPct && pct <= points[i + 1].lapDistPct) {
      const f = (pct - points[i].lapDistPct) / (points[i + 1].lapDistPct - points[i].lapDistPct)
      return times[i] + f * (times[i + 1] - times[i])
    }
  }
  return times[times.length - 1]
}

export function niceTicks(min: number, max: number, fixedStep?: number): number[] {
  const range = max - min
  if (range === 0) return [min]
  const step = fixedStep ?? (range < 2 ? 0.1 : range < 20 ? 1 : range < 200 ? 10 : 100)
  const start = Math.ceil(min / step) * step
  const end = Math.floor(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step * 0.001; v += step) ticks.push(+v.toFixed(6))
  if (ticks.length === 0) ticks.push(min, max)
  return ticks
}

export type SpeedUnit = 'kmh' | 'mph'

export const SPEED_UNIT_LABEL: Record<SpeedUnit, string> = {
  kmh: 'km/h',
  mph: 'mph'
}

export function toSpeedUnit(val: number, unit: SpeedUnit): number {
  if (unit === 'mph') return val * 2.23694
  return val * 3.6
}

let measureCanvas: HTMLCanvasElement | null = null

export function measureTextWidth(text: string, fontSize: number): number {
  if (!measureCanvas) {
    if (typeof document === 'undefined') return text.length * fontSize * 0.6
    measureCanvas = document.createElement('canvas')
  }
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * fontSize * 0.6
  ctx.font = `${fontSize}px sans-serif`
  return ctx.measureText(text).width
}
