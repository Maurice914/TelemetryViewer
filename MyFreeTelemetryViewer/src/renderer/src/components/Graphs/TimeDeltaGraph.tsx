import { useRef, useState, useEffect } from 'react'
import { useLapData } from '../../contexts/LapDataContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useGraphSelection } from '../../hooks/useGraphSelection'
import { calcElapsed, timeAtPct, niceTicks } from '../../utils/graphHelpers'
import Tooltip from './Tooltip'

const RULER_W = 32

interface TimeDeltaGraphProps {
  onInfoChange?: (text: string) => void
}

interface LapDelta {
  index: number
  name: string
  color: string
  deltas: number[]
}

function TimeDeltaGraph({ onInfoChange }: TimeDeltaGraphProps) {
  const { laps, lapColors, referenceLapIndex, hoveredLapPct, setHoveredLapPct, selection } = useLapData()
  const { settings } = useSettings()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredPct, setHoveredPct] = useState<number | null>(null)
  const [isLocalHover, setIsLocalHover] = useState(false)
  const [mousePos, setMousePos] = useState({ clientX: 0, clientY: 0 })

  const rulerOff = settings.showRuler ? RULER_W : 0
  const { isSelecting, getPctFromMouse, handleMouseDown: selectionMouseDown, trySelectInMove, handleMouseUp: selectionMouseUp, handleKeyDown: selectionKeyDown, getSelectionRect } = useGraphSelection(svgRef, rulerOff)

  const displayHoveredPct = isLocalHover ? hoveredPct : hoveredLapPct

  // Compute deltas for each non-reference lap against the reference (slowest)
  const lapDeltas: LapDelta[] = []
  const allDeltas: number[] = []

  if (laps.length >= 2 && referenceLapIndex >= 0) {
    const refLap = laps[referenceLapIndex]
    const sortedRef = [...refLap.points].sort((a, b) => a.lapDistPct - b.lapDistPct)
    const refTimes = calcElapsed(sortedRef)

    for (let i = 0; i < laps.length; i++) {
      if (i === referenceLapIndex) continue
      const lap = laps[i]
      const sortedLap = [...lap.points].sort((a, b) => a.lapDistPct - b.lapDistPct)
      const lapTimes = calcElapsed(sortedLap)

      const deltas: number[] = []
      const numPoints = 1000
      for (let j = 0; j < numPoints; j++) {
        const targetPct = j / numPoints
        const refTimeAtPct = timeAtPct(sortedRef, refTimes, targetPct)
        const lapTimeAtPct = timeAtPct(sortedLap, lapTimes, targetPct)
        deltas.push(lapTimeAtPct - refTimeAtPct)
      }
      lapDeltas.push({ index: i, name: lap.name, color: lapColors[i], deltas })
      allDeltas.push(...deltas)
    }
  }

  const minDelta = allDeltas.length > 0 ? Math.min(...allDeltas) : 0
  const maxDelta = allDeltas.length > 0 ? Math.max(...allDeltas) : 0
  const deltaRange = maxDelta - minDelta || 1

  useEffect(() => {
    onInfoChange?.(laps.length < 2 ? 'Import 2+ laps' : '')
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
    const dataW = width - (settings.showRuler ? RULER_W : 0)
    const offsetX = settings.showRuler ? RULER_W : 0
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
        const x = offsetX + pct * dataW
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
      const x = offsetX + ((pct - startPct) / selRange) * dataW
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
    const offsetX = settings.showRuler ? RULER_W : 0
    const height = svg.clientHeight

    const y = height * (1 - (0 - minDelta) / deltaRange)
    return (
      <line x1={offsetX} y1={y} x2={width} y2={y} stroke="#999" strokeWidth="1" strokeDasharray="4,4" />
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
    const offsetX = settings.showRuler ? RULER_W : 0
    const dataW = width - offsetX
    const x = offsetX + (selection
      ? ((displayHoveredPct - selection.startPct) / (selection.endPct - selection.startPct)) * dataW
      : displayHoveredPct * dataW)
    return <circle cx={x} cy={y} r="3" fill={lapDeltas[0].color} />
  }

  const tooltipText = (() => {
    if (displayHoveredPct === null || lapDeltas.length === 0) return ''
    const idx = Math.round(displayHoveredPct * lapDeltas[0].deltas.length)
    const delta = lapDeltas[0].deltas[idx] ?? 0
    const name = lapDeltas[0].name
    return `${name}: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`
  })()

  function getRuler() {
    if (!settings.showRuler) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight
    const ticks = niceTicks(minDelta, maxDelta)
    return (
      <g>
        <rect x={0} y={0} width={RULER_W} height={height} fill="#fafafa" stroke="#ddd" />
        {ticks.map((tick, i) => {
          const y = height * (1 - (tick - minDelta) / deltaRange)
          return (
            <g key={i}>
              <line x1={RULER_W} y1={y} x2={width} y2={y} stroke="#eee" strokeWidth={1} />
              <text x={3} y={y + 3} fontSize={9} fill="#888">{(tick >= 0 ? '+' : '') + tick.toFixed(1)}</text>
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: isSelecting ? 'col-resize' : 'crosshair', display: 'block', outline: 'none', userSelect: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {getSelectionRect()}
          {getRuler()}
          {getZeroLine()}
          {lapDeltas.map((ld) => (
            <polyline
              key={ld.index}
              points={getPolylinePoints(ld)}
              fill="none"
              stroke={ld.color}
              strokeWidth={settings.graphLineWidth}
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
