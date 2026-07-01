import { useRef, useState, useEffect } from 'react'
import { Point } from '../../utils/csvParser'
import { useLapData } from '../../contexts/LapDataContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useGraphSelection } from '../../hooks/useGraphSelection'
import { niceTicks } from '../../utils/graphHelpers'
import Tooltip from './Tooltip'

export type DataKey = 'throttle' | 'brake' | 'speed' | 'rpm' | 'steeringWheelAngle' | 'gear'

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max || max < 2) return arr
  const step = arr.length / max
  const result: T[] = []
  for (let i = 0; i < max; i++) result.push(arr[Math.floor(i * step)])
  return result
}

interface GraphLine {
  points: Point[]
  color: string
  name: string
  strokeWidth?: number
}

interface GraphProps {
  dataKey: DataKey
  lines: GraphLine[]
  centerBaseline?: boolean
  onInfoChange?: (text: string) => void
}

function findClosestPoints(lines: GraphLine[], pct: number): { point: Point; lineIndex: number }[] {
  const result: { point: Point; lineIndex: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    let closest: Point | null = null
    let minDiff = Infinity
    for (const p of lines[i].points) {
      const diff = Math.abs(p.lapDistPct - pct)
      if (diff < minDiff) { minDiff = diff; closest = p }
    }
    if (closest && minDiff < 0.01) result.push({ point: closest, lineIndex: i })
  }
  return result
}

function formatTooltipVal(dataKey: DataKey, val: number): string {
  if (dataKey === 'throttle' || dataKey === 'brake') return `${(val * 100).toFixed(1)}%`
  if (dataKey === 'gear') return val.toFixed(0)
  return val.toFixed(1)
}

const RULER_W = 32

function Graph({ dataKey, lines, centerBaseline, onInfoChange }: GraphProps) {
  const { hoveredLapPct, setHoveredLapPct, selection } = useLapData()
  const { settings } = useSettings()
  const svgRef = useRef<SVGSVGElement>(null)
  const getVal = (p: Point) => p[dataKey as keyof Point] ?? 0
  const [hoveredInfo, setHoveredInfo] = useState<{ point: Point; lineIndex: number }[] | null>(null)
  const [isLocalHover, setIsLocalHover] = useState(false)
  const [mousePos, setMousePos] = useState({ clientX: 0, clientY: 0 })

  const rulerOff = settings.showRuler ? RULER_W : 0
  const { isSelecting, selectStart, selectEnd, getPctFromMouse, handleMouseDown: selectionMouseDown, trySelectInMove, handleMouseUp: selectionMouseUp, handleKeyDown: selectionKeyDown, getSelectionRect } = useGraphSelection(svgRef, rulerOff)

  const allVals = lines.flatMap((l) => l.points.map(getVal))
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)
  const valRange = maxVal - minVal || 1
  const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1

  function toY(val: number): number {
    if (centerBaseline) {
      return 50 - (val / maxAbs) * 50
    }
    return 100 - ((val - minVal) / valRange) * 100
  }

  const displayInfo = isLocalHover
    ? hoveredInfo
    : hoveredLapPct !== null
      ? findClosestPoints(lines, hoveredLapPct)
      : null

  let headerText = ''
  if (isSelecting) {
    headerText = `${(selectStart * 100).toFixed(1)}% - ${(selectEnd * 100).toFixed(1)}%`
  } else if (selection) {
    headerText = `${(selection.startPct * 100).toFixed(1)}% - ${(selection.endPct * 100).toFixed(1)}%`
  }
  if (displayInfo && displayInfo.length > 0) {
    headerText += `${headerText ? ' | ' : ''}${(displayInfo[0].point.lapDistPct * 100).toFixed(1)}%`
  }

  useEffect(() => {
    onInfoChange?.(headerText)
  }, [headerText, onInfoChange])

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
      const all: { point: Point; lineIndex: number }[] = []
      for (let i = 0; i < lines.length; i++) {
        let closestX: Point | null = null
        let minX = Infinity
        for (const p of lines[i].points) {
          const dx = Math.abs(p.lapDistPct - pct)
          if (dx < minX) { minX = dx; closestX = p }
        }
        if (closestX && minX < 0.01) all.push({ point: closestX, lineIndex: i })
      }
      setHoveredInfo(all.length > 0 ? all : null)
    }
  }

  function handleMouseUp() {
    selectionMouseUp()
  }

  function handleMouseLeave() {
    if (isSelecting) return
    setIsLocalHover(false)
    setHoveredLapPct(null)
    setHoveredInfo(null)
    setMousePos({ clientX: 0, clientY: 0 })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    selectionKeyDown(e)
  }

  function pointsToPolyline(points: Point[]): string {
    const svg = svgRef.current
    if (!svg) return ''
    const width = svg.clientWidth
    const dataW = width - (settings.showRuler ? RULER_W : 0)
    const height = svg.clientHeight
    const sampled = downsample(points, Math.ceil(width))

    if (!selection) {
      return sampled
        .map((p) => {
          const x = (settings.showRuler ? RULER_W : 0) + p.lapDistPct * dataW
          const y = (toY(getVal(p)) / 100) * height
          return `${x},${y}`
        })
        .join(' ')
    }
    const { startPct, endPct } = selection
    const range = endPct - startPct
    return sampled
      .filter((p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct)
      .map((p) => {
        const x = (settings.showRuler ? RULER_W : 0) + ((p.lapDistPct - startPct) / range) * dataW
        const y = (toY(getVal(p)) / 100) * height
        return `${x},${y}`
      })
      .join(' ')
  }

  function getHoveredDot() {
    const info = displayInfo
    if (!info || info.length === 0) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const dataW = width - (settings.showRuler ? RULER_W : 0)
    const height = svg.clientHeight
    return info.map((item, i) => {
      const x = (settings.showRuler ? RULER_W : 0) + (selection
        ? ((item.point.lapDistPct - selection.startPct) / (selection.endPct - selection.startPct)) * dataW
        : item.point.lapDistPct * dataW)
      const y = (toY(getVal(item.point)) / 100) * height
      return <circle key={i} cx={x} cy={y} r="3" fill={lines[item.lineIndex].color} />
    })
  }

  function getBaseline() {
    if (!centerBaseline) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const dataW = width - (settings.showRuler ? RULER_W : 0)
    const height = svg.clientHeight
    const y = height / 2
    return (
      <line x1={settings.showRuler ? RULER_W : 0} y1={y} x2={settings.showRuler ? width : dataW} y2={y} stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="4,4" />
    )
  }

  const tooltipText: React.ReactNode = displayInfo && displayInfo.length > 0
    ? displayInfo.map((item, i) => (
        <div key={i} style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: lines[item.lineIndex].color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lines[item.lineIndex].name}</span>
          <span>: {formatTooltipVal(dataKey, getVal(item.point))}</span>
        </div>
      ))
    : ''

  function getRuler() {
    if (!settings.showRuler) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight
    const ticks = niceTicks(minVal, maxVal)
    return (
      <g>
        <rect x={0} y={0} width={RULER_W} height={height} fill="var(--color-bg)" stroke="var(--color-border)" />
        {ticks.map((tick, i) => {
          const ty = (toY(tick) / 100) * height
          return (
            <g key={i}>
              <line x1={RULER_W} y1={ty} x2={width} y2={ty} stroke="var(--color-border)" strokeWidth={1} />
              <text x={3} y={ty + 3} fontSize={9} fill="var(--color-text-secondary)">{formatTooltipVal(dataKey, tick)}</text>
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <>
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
        {getBaseline()}
        {lines.map((line, i) => (
          <polyline
            key={i}
            points={pointsToPolyline(line.points)}
            fill="none"
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? settings.graphLineWidth}
          />
        ))}
        {getHoveredDot()}
      </svg>
      <Tooltip
        clientX={mousePos.clientX}
        clientY={mousePos.clientY}
        text={tooltipText}
        visible={!!displayInfo && !isSelecting && isLocalHover}
      />
    </>
  )
}

export default Graph
