import { Point } from './csvParser'
import { haversineDistance } from './graphHelpers'

export const FINGERPRINT_POINTS = 100
export const MATCH_THRESHOLD_M = 30
export const MAX_EXCEED = 3

export function downsampleToN(points: Point[], n: number): { lat: number; lon: number }[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.lapDistPct - b.lapDistPct)
  if (n >= sorted.length) return sorted.map((p) => ({ lat: p.lat, lon: p.lon }))
  const result: { lat: number; lon: number }[] = []
  for (let i = 0; i < n; i++) {
    const target = (i / n) * 1
    let lo = 0
    let hi = sorted.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid].lapDistPct < target) lo = mid + 1
      else hi = mid
    }
    result.push({ lat: sorted[lo].lat, lon: sorted[lo].lon })
  }
  return result
}

function nearestDistance(point: { lat: number; lon: number }, refs: { lat: number; lon: number }[]): number {
  let best = Infinity
  for (const r of refs) {
    const d = haversineDistance(point.lat, point.lon, r.lat, r.lon)
    if (d < best) best = d
  }
  return best
}

export interface FingerprintMap {
  [trackName: string]: { lat: number; lon: number }[]
}

export function findBestMatch(
  lapPoints: Point[],
  fingerprints: FingerprintMap,
  threshold = MATCH_THRESHOLD_M,
  maxExceed = MAX_EXCEED
): { track: string; exceeded: number; worst: number } | null {
  const probe = downsampleToN(lapPoints, FINGERPRINT_POINTS)
  let best: { track: string; exceeded: number; worst: number } | null = null
  for (const [track, refs] of Object.entries(fingerprints)) {
    if (refs.length === 0) continue
    let exceeded = 0
    let worst = 0
    for (const p of probe) {
      const d = nearestDistance(p, refs)
      if (d > worst) worst = d
      if (d > threshold) exceeded++
    }
    if (exceeded > maxExceed) continue
    if (!best || exceeded < best.exceeded || (exceeded === best.exceeded && worst < best.worst)) {
      best = { track, exceeded, worst }
    }
  }
  return best
}
