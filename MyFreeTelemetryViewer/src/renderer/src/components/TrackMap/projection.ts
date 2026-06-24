import { Point } from '../../utils/csvParser'

export interface PixelPoint {
  x: number
  y: number
  lapDistPct: number
  lapIndex: number
  yaw: number
}

export const CORNER_COLORS = ['#ff4444', '#44bb44', '#4488ff', '#ff8800', '#cc44cc', '#888888', '#44dddd', '#ff44aa']

export function toPixelPoints(
  points: Point[],
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  width: number,
  height: number,
  lapIndex: number
): PixelPoint[] {
  const padding = 50
  const drawW = width - 2 * padding
  const drawH = height - 2 * padding

  const midLat = (minLat + maxLat) / 2
  const cosLat = Math.cos((midLat * Math.PI) / 180)

  const latRange = maxLat - minLat
  const lonRange = (maxLon - minLon) * cosLat

  const scale = Math.min(drawW / lonRange, drawH / latRange)

  const offsetX = (drawW - lonRange * scale) / 2
  const offsetY = (drawH - latRange * scale) / 2

  const pts: ({
    x: number; y: number; lapDistPct: number; yawRate: number; latAccel: number; lapIndex: number
  })[] = points.map((p) => ({
    x: padding + offsetX + (p.lon - minLon) * cosLat * scale,
    y: padding + offsetY + (latRange - (p.lat - minLat)) * scale,
    lapDistPct: p.lapDistPct,
    yawRate: p.yawRate,
    latAccel: p.latAccel,
    lapIndex
  }))

  const hasYawRate = pts.some((p) => Math.abs(p.yawRate) > 0.0001)

  if (!hasYawRate) {
    return pts.map((pt, i, arr) => {
      let dx = 0; let dy = -1
      if (i < arr.length - 1) { dx = arr[i + 1].x - pt.x; dy = arr[i + 1].y - pt.y }
      else if (arr.length > 1) { dx = pt.x - arr[i - 1].x; dy = pt.y - arr[i - 1].y }
      const mag = Math.sqrt(dx * dx + dy * dy)
      let heading = 0
      if (mag > 0.001) heading = Math.atan2(dx, -dy) - 0.0035 * pt.latAccel
      return { x: pt.x, y: pt.y, lapDistPct: pt.lapDistPct, lapIndex, yaw: heading }
    })
  }

  const dt = 1 / 60
  const headings: number[] = new Array(pts.length)
  if (pts.length > 1) {
    const dx = pts[1].x - pts[0].x; const dy = pts[1].y - pts[0].y
    headings[0] = Math.sqrt(dx * dx + dy * dy) > 0.001 ? Math.atan2(dx, -dy) : 0
  } else {
    headings[0] = 0
  }
  for (let i = 1; i < pts.length; i++) {
    headings[i] = headings[i - 1] - pts[i - 1].yawRate * dt
  }

  return pts.map((pt, i) => ({
    x: pt.x, y: pt.y, lapDistPct: pt.lapDistPct, lapIndex, yaw: headings[i]
  }))
}

export function screenToViewBox(clientX: number, clientY: number, rect: DOMRect) {
  const scaleFactor = Math.min(rect.width, rect.height) / 800
  const paddingX = (rect.width - 800 * scaleFactor) / 2
  const paddingY = (rect.height - 800 * scaleFactor) / 2

  return {
    x: (clientX - rect.left - paddingX) / scaleFactor,
    y: (clientY - rect.top - paddingY) / scaleFactor
  }
}
