import { useRef, useState, useEffect } from 'react'
import { useLapData, getLapColor, LapData } from '../../contexts/LapDataContext'
import { useGraphSelection } from '../../hooks/useGraphSelection'
import Tooltip from './Tooltip'

interface TimeDeltaGraphProps {
  onInfoChange?: (text: string) => void
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

function calculateTimeElapsed(points: LapData['points']): number[] {
  const times: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const speedMs = points[i].speed
    if (speedMs <= 0) {
      times.push(times[i - 1])
      continue
    }
    const dDist = haversineDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    )
    times.push(times[i - 1] + dDist / speedMs)
  }
  return times
}

function interpolateTimeAtPct(
  points: LapData['points'],
  times: number[],
  targetPct: number
): number {
  for (let i = 0; i < points.length - 1; i++) {
    const pct1 = points[i].lapDistPct
    const pct2 = points[i + 1].lapDistPct
    if (targetPct >= pct1 && targetPct <= pct2) {
      const t = (targetPct - pct1) / (pct2 - pct1)
      return times[i] + t * (times[i + 1] - times[i])
    }
  }
  return times[times.length - 1]
}

interface LapDelta {
  index: number
  name: string
  color: string
  deltas: number[]
}

function TimeDeltaGraph({ onInfoChange }: TimeDeltaGraphProps) {
  const { laps, referenceLapIndex, hoveredLapPct, setHoveredLapPct, selection } = useLapData()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredPct, setHoveredPct] = useState<number | null>(null)
  const [isLocalHover, setIsLocalHover] = useState(false)
  const [mousePos, setMousePos] = useState({ clientX: 0, clientY: 0 })

  const { isSelecting, getPctFromMouse, handleMouseDown: selectionMouseDown, trySelectInMove, handleMouseUp: selectionMouseUp, handleKeyDown: selectionKeyDown, getSelectionRect } = useGraphSelection(svgRef)

  const displayHoveredPct = isLocalHover ? hoveredPct : hoveredLapPct

  // Compute deltas for each non-reference lap against the reference (slowest)
  const lapDeltas: LapDelta[] = []
  const allDeltas: number[] = []

  if (laps.length >= 2 && referenceLapIndex >= 0) {
    const refLap = laps[referenceLapIndex]
    const sortedRef = [...refLap.points].sort((a, b) => a.lapDistPct - b.lapDistPct)
    const refTimes = calculateTimeElapsed(sortedRef)

    for (let i = 0; i < laps.length; i++) {
      if (i === referenceLapIndex) continue
      const lap = laps[i]
      const sortedLap = [...lap.points].sort((a, b) => a.lapDistPct - b.lapDistPct)
      const lapTimes = calculateTimeElapsed(sortedLap)

      const deltas: number[] = []
      const numPoints = 1000
      for (let j = 0; j < numPoints; j++) {
        const targetPct = j / numPoints
        const refTimeAtPct = interpolateTimeAtPct(sortedRef, refTimes, targetPct)
        const lapTimeAtPct = interpolateTimeAtPct(sortedLap, lapTimes, targetPct)
        deltas.push(lapTimeAtPct - refTimeAtPct)
      }
      lapDeltas.push({ index: i, name: lap.name, color: getLapColor(i), deltas })
      allDeltas.push(...deltas)
    }
  }

  const minDelta = allDeltas.length > 0 ? Math.min(...allDeltas) : 0
  const maxDelta = allDeltas.length > 0 ? Math.max(...allDeltas) : 0
  const deltaRange = maxDelta - minDelta || 1

  useEffect(() => {
    const headerText = laps.length >= 2 ? 'Delta' : 'Delta (import 2+ laps)'
    onInfoChange?.(headerText)
  }, [onInfoChange, laps.length])

  if (laps.length < 2) {
    return (
      <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
        Import at least 2 laps to see time delta
      </div>
    )
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    selectionMouseDown(e)
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    setMousePos({ clientX: e.clientX, clientY: e.clientY })
    if (trySelectInMove(e)) return

    const pct = getPctFromMouse(e)
    if (pct === null) return
    if (pct >= 0 && pct <= 1) {
      setIsLocalHover(true)
      setHoveredLapPct(pct)
      setHoveredPct(pct)
    }
  }

  function handleMouseUp() {
    selectionMouseUp()
  }

  function handleMouseLeave() {
    if (isSelecting) return
    setIsLocalHover(false)
    setHoveredLapPct(null)
    setHoveredPct(null)
    setMousePos({ clientX: 0, clientY: 0 })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    selectionKeyDown(e)
  }

  function getPolylinePoints(ld: LapDelta) {
    const svg = svgRef.current
    if (!svg) return ''

    const width = svg.clientWidth
    const height = svg.clientHeight

    function deltaToY(delta: number): number {
      return height * (1 - (delta - minDelta) / deltaRange)
    }

    const origN = ld.deltas.length
    const targetN = Math.min(origN, Math.max(Math.ceil(width), 2))
    const step = origN / targetN

    if (!selection) {
      const parts: string[] = []
      for (let i = 0; i < targetN; i++) {
        const idx = Math.floor(i * step)
        const pct = idx / origN
        const x = pct * width
        const y = deltaToY(ld.deltas[idx])
        parts.push(`${x},${y}`)
      }
      return parts.join(' ')
    }

    const { startPct, endPct } = selection
    const selRange = endPct - startPct
    const parts: string[] = []
    for (let i = 0; i < targetN; i++) {
      const idx = Math.floor(i * step)
      const pct = idx / origN
      if (pct < startPct || pct > endPct) continue
      const x = ((pct - startPct) / selRange) * width
      const y = deltaToY(ld.deltas[idx])
      parts.push(`${x},${y}`)
    }
    return parts.join(' ')
  }

  function getZeroLine() {
    if (allDeltas.length === 0) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight

    const y = height * (1 - (0 - minDelta) / deltaRange)
    return (
      <line x1={0} y1={y} x2={width} y2={y} stroke="#999" strokeWidth="1" strokeDasharray="4,4" />
    )
  }

  function getHoveredDot() {
    if (displayHoveredPct === null || lapDeltas.length === 0) return null
    const svg = svgRef.current
    if (!svg) return null

    const width = svg.clientWidth
    const height = svg.clientHeight
    const numPoints = lapDeltas[0].deltas.length
    const idx = Math.round(displayHoveredPct * numPoints)
    if (idx < 0 || idx >= numPoints) return null

    // Show dot for the first lap delta only
    const delta = lapDeltas[0].deltas[idx]
    const y = height * (1 - (delta - minDelta) / deltaRange)
    const x = selection
      ? ((displayHoveredPct - selection.startPct) / (selection.endPct - selection.startPct)) * width
      : displayHoveredPct * width
    return <circle cx={x} cy={y} r="3" fill={lapDeltas[0].color} />
  }

  const tooltipText = (() => {
    if (displayHoveredPct === null || lapDeltas.length === 0) return ''
    const idx = Math.round(displayHoveredPct * lapDeltas[0].deltas.length)
    const delta = lapDeltas[0].deltas[idx] ?? 0
    const name = lapDeltas[0].name
    return `${name}: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`
  })()

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: isSelecting ? 'col-resize' : 'crosshair', display: 'block' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {getSelectionRect()}
          {getZeroLine()}
          {lapDeltas.map((ld) => (
            <polyline
              key={ld.index}
              points={getPolylinePoints(ld)}
              fill="none"
              stroke={ld.color}
              strokeWidth="1.3"
            />
          ))}
          {getHoveredDot()}
        </svg>
      </div>
      <Tooltip
        clientX={mousePos.clientX}
        clientY={mousePos.clientY}
        text={tooltipText}
        visible={displayHoveredPct !== null && !isSelecting && isLocalHover}
      />
    </div>
  )
}

export default TimeDeltaGraph
