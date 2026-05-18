import { useRef, useState, useEffect } from 'react'
import { useLapData, Point } from '../../contexts/LapDataContext'
import Tooltip from './Tooltip'

type DataKey = 'throttle' | 'brake' | 'gear'

interface GraphLine {
  points: Point[]
  color: string
  strokeWidth?: number
}

interface GraphProps {
  label: string
  dataKey: DataKey
  lines: GraphLine[]
  onInfoChange?: (text: string) => void
}

function findClosestPoint(lines: GraphLine[], pct: number): { point: Point; lineIndex: number } | null {
  let closest: { point: Point; lineIndex: number } | null = null
  let minDiff = Infinity
  for (let i = 0; i < lines.length; i++) {
    for (const p of lines[i].points) {
      const diff = Math.abs(p.lapDistPct - pct)
      if (diff < minDiff) {
        minDiff = diff
        closest = { point: p, lineIndex: i }
      }
    }
  }
  return minDiff < 0.01 ? closest : null
}

function Graph({ label, dataKey, lines, onInfoChange }: GraphProps) {
  const { setHoveredLapPct, selection, setSelection } = useLapData()
  const svgRef = useRef<SVGSVGElement>(null)
  const getVal = (p: Point) => p[dataKey as keyof Point] ?? 0
  const [hoveredInfo, setHoveredInfo] = useState<{ point: Point; lineIndex: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState(0)
  const [selectEnd, setSelectEnd] = useState(0)
  const [mousePos, setMousePos] = useState({ clientX: 0, clientY: 0 })

  let headerText = label
  if (isSelecting) {
    headerText += ` | Selecting: ${(selectStart * 100).toFixed(1)}% - ${(selectEnd * 100).toFixed(1)}%`
  } else if (selection) {
    headerText += ` | Zoomed: ${(selection.startPct * 100).toFixed(1)}% - ${(selection.endPct * 100).toFixed(1)}%`
  }
  if (hoveredInfo) {
    headerText += ` | Hover: ${(hoveredInfo.point.lapDistPct * 100).toFixed(1)}%`
  }

  useEffect(() => {
    onInfoChange?.(headerText)
  }, [headerText, onInfoChange])

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
      setHoveredInfo(findClosestPoint(lines, pct))
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
    setHoveredInfo(null)
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

  function pointsToPolyline(points: Point[]): string {
    const svg = svgRef.current
    if (!svg) return ''
    const width = svg.clientWidth
    const height = svg.clientHeight

    if (!selection) {
      return points.map(p => {
        const x = p.lapDistPct * width
        const val = getVal(p)
        const y = height - (val * height)
        return `${x},${y}`
      }).join(' ')
    }
    const { startPct, endPct } = selection
    const range = endPct - startPct
    return points
      .filter(p => p.lapDistPct >= startPct && p.lapDistPct <= endPct)
      .map(p => {
        const x = ((p.lapDistPct - startPct) / range) * width
        const val = getVal(p)
        const y = height - (val * height)
        return `${x},${y}`
      }).join(' ')
  }

  function getHoveredDot() {
    if (!hoveredInfo) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight
    const x = selection
      ? ((hoveredInfo.point.lapDistPct - selection.startPct) / (selection.endPct - selection.startPct)) * width
      : hoveredInfo.point.lapDistPct * width
    const val = getVal(hoveredInfo.point)
    const y = height - (val * height)
    return (
      <circle
        cx={x}
        cy={y}
        r="3"
        fill={lines[hoveredInfo.lineIndex].color}
      />
    )
  }

  const tooltipText = hoveredInfo
    ? `${label}: ${(getVal(hoveredInfo.point) * 100).toFixed(1)}%`
    : ''

  return (
    <>
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
        {lines.map((line, i) => (
          <polyline
            key={i}
            points={pointsToPolyline(line.points)}
            fill="none"
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? 1.3}
          />
        ))}
        {getHoveredDot()}
      </svg>
      <Tooltip
        clientX={mousePos.clientX}
        clientY={mousePos.clientY}
        text={tooltipText}
        visible={!!hoveredInfo && !isSelecting}
      />
    </>
  )
}

export default Graph