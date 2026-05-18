import { useRef, useState, useEffect } from 'react'
import { useLapData, Point } from '../../contexts/LapDataContext'
import Tooltip from './Tooltip'

interface TimeDeltaGraphProps {
  onInfoChange?: (text: string) => void
}

// Haversine formula to calculate distance between two lat/lon points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Calculate total track length from lat/lon
function calculateTrackLength(points: Point[]): number {
  let totalDistance = 0
  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineDistance(
      points[i - 1].lat, points[i - 1].lon,
      points[i].lat, points[i].lon
    )
  }
  return totalDistance
}

// Calculate cumulative time elapsed at each point
function calculateTimeElapsed(points: Point[], trackLength: number): number[] {
  const times: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const speedMs = points[i].speed
    if (speedMs <= 0) {
      times.push(times[i - 1])
      continue
    }

    const dDist = (points[i].lapDistPct - points[i - 1].lapDistPct) * trackLength
    const dt = dDist / speedMs

    times.push(times[i - 1] + dt)
  }
  return times
}

// Interpolate time at a specific lapDistPct
function interpolateTimeAtPct(points: Point[], times: number[], targetPct: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const pct1 = points[i].lapDistPct
    const pct2 = points[i + 1].lapDistPct
    if (targetPct >= pct1 && targetPct <= pct2) {
      const t = (targetPct - pct1) / (pct2 - pct1)
      return times[i] + t * (times[i + 1] - times[i])
    }
  }
  return times[times.length - 1] // fallback to last value
}

function TimeDeltaGraph({ onInfoChange }: TimeDeltaGraphProps) {
  const { fastPoints, slowPoints, setHoveredLapPct, selection, setSelection } = useLapData()

  // Calculate track length and timeDelta
  let trackLength = 3219 // default
  let timeDeltas: number[] = []

  if (slowPoints.length > 0 && fastPoints.length > 0) {
    const sortedFast = [...fastPoints].sort((a, b) => a.lapDistPct - b.lapDistPct)
    const sortedSlow = [...slowPoints].sort((a, b) => a.lapDistPct - b.lapDistPct)
    trackLength = calculateTrackLength(sortedFast)
    const fastTimes = calculateTimeElapsed(sortedFast, trackLength)
    const slowTimes = calculateTimeElapsed(sortedSlow, trackLength)

    // Interpolate both to same grid (1000 points across lap)
    const numPoints = 1000
    timeDeltas = []
    for (let i = 0; i < numPoints; i++) {
      const targetPct = i / numPoints
      const fastTimeAtPct = interpolateTimeAtPct(sortedFast, fastTimes, targetPct)
      const slowTimeAtPct = interpolateTimeAtPct(sortedSlow, slowTimes, targetPct)
      timeDeltas.push(slowTimeAtPct - fastTimeAtPct)
    }
  }
  const minDelta = timeDeltas.length > 0 ? Math.min(...timeDeltas) : 0
  const maxDelta = timeDeltas.length > 0 ? Math.max(...timeDeltas) : 0
  const deltaRange = maxDelta - minDelta || 1
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredPct, setHoveredPct] = useState<number | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState(0)
  const [selectEnd, setSelectEnd] = useState(0)
  const [mousePos, setMousePos] = useState({ clientX: 0, clientY: 0 })

  useEffect(() => {
    const headerText = 'Delta'
    onInfoChange?.(headerText)
  }, [onInfoChange])

  function getPctFromMouse(e: React.MouseEvent<SVGSVGElement>): number | null {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = e.clientX - rect.left
    const width = rect.width
    const localPct = x / width

    if (selection) {
      return selection.startPct + localPct * (selection.endPct - selection.startPct)
    }
    return localPct
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const pct = getPctFromMouse(e)
    if (pct === null) return
    setSelectStart(pct)
    setSelectEnd(pct)
    setIsSelecting(true)
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const pct = getPctFromMouse(e)
    if (pct === null) return
    setMousePos({ clientX: e.clientX, clientY: e.clientY })

    if (isSelecting) {
      setSelectEnd(pct)
      return
    }

    if (pct >= 0 && pct <= 1) {
      setHoveredLapPct(pct)
      setHoveredPct(pct)
    }
  }

  function handleMouseUp() {
    if (!isSelecting) return
    setIsSelecting(false)
    const start = Math.min(selectStart, selectEnd)
    const end = Math.max(selectStart, selectEnd)
    if (end - start > 0.01) {
      setSelection({ startPct: start, endPct: end })
    }
  }

  function handleMouseLeave() {
    if (isSelecting) return
    setHoveredLapPct(null)
    setHoveredPct(null)
    setMousePos({ clientX: 0, clientY: 0 })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSelection(null)
      setIsSelecting(false)
    }
  }

  function getSelectionRect() {
    if (!isSelecting) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight

    let start = selectStart
    let end = selectEnd
    if (selection) {
      const range = selection.endPct - selection.startPct
      start = (selectStart - selection.startPct) / range
      end = (selectEnd - selection.startPct) / range
    }

    const min = Math.min(start, end)
    const max = Math.max(start, end)

    return (
      <rect
        x={min * width}
        y={0}
        width={(max - min) * width}
        height={height}
        fill="blue"
        opacity={0.15}
      />
    )
  }

  function getPolyline() {
    const svg = svgRef.current
    if (!svg || slowPoints.length === 0 || timeDeltas.length === 0) {
      return ''
    }

    const width = svg.clientWidth
    const height = svg.clientHeight

    function deltaToY(delta: number): number {
      return height * ((delta - minDelta) / deltaRange)
    }

    const numPoints = timeDeltas.length
    if (!selection) {
      const parts: string[] = []
      for (let i = 0; i < numPoints; i++) {
        const pct = i / numPoints
        const x = pct * width
        const y = deltaToY(timeDeltas[i])
        parts.push(`${x},${y}`)
      }
      return parts.join(' ')
    }

    const { startPct, endPct } = selection
    const selRange = endPct - startPct
    const parts: string[] = []
    for (let i = 0; i < numPoints; i++) {
      const pct = i / numPoints
      if (pct < startPct || pct > endPct) continue
      const x = ((pct - startPct) / selRange) * width
      const y = deltaToY(timeDeltas[i])
      parts.push(`${x},${y}`)
    }
    return parts.join(' ')
  }

  function getHoveredDot() {
    if (hoveredPct === null) return null
    const svg = svgRef.current
    if (!svg) return null

    const width = svg.clientWidth
    const height = svg.clientHeight
    const numPoints = timeDeltas.length

    const idx = Math.round(hoveredPct * numPoints)
    if (idx < 0 || idx >= numPoints || timeDeltas.length === 0) return null

    const delta = timeDeltas[idx]

    const y = height * ((delta - minDelta) / deltaRange)

    const x = selection
      ? ((hoveredPct - selection.startPct) / (selection.endPct - selection.startPct)) * width
      : hoveredPct * width
    return <circle cx={x} cy={y} r="3" fill="#cc0000" />
  }

  function getZeroLine() {
    if (timeDeltas.length === 0) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight

    const y = height * (1 - (0 - minDelta) / deltaRange)
    return (
      <line
        x1={0} y1={y} x2={width} y2={y}
        stroke="#999" strokeWidth="1" strokeDasharray="4,4"
      />
    )
  }

  const tooltipText = (() => {
    if (hoveredPct === null || timeDeltas.length === 0) return ''
    const idx = Math.round(hoveredPct * timeDeltas.length)
    const delta = timeDeltas[idx] ?? 0
    return `Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`
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
          <polyline
            points={getPolyline()}
            fill="none"
            stroke="#cc0000"
            strokeWidth="1.3"
          />
          {getHoveredDot()}
        </svg>
      </div>
      <Tooltip
        clientX={mousePos.clientX}
        clientY={mousePos.clientY}
        text={tooltipText}
        visible={hoveredPct !== null && !isSelecting}
      />
    </div>
  )
}

export default TimeDeltaGraph