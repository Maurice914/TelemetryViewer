import { useState, useRef, useEffect } from 'react'
import styles from './Trackmap.module.css'
import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import { parseCSV, Point } from '../../utils/csvParser'

interface PixelPoint {
  x: number
  y: number
  lapDistPct: number
  lapIndex: number
}

interface TrackmapProps {
  onInfoChange?: (text: string) => void
}

function toPixelPoints(
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

  return points.map((p) => {
    const x = padding + offsetX + (p.lon - minLon) * cosLat * scale
    const y = padding + offsetY + (latRange - (p.lat - minLat)) * scale
    return { x, y, lapDistPct: p.lapDistPct, lapIndex }
  })
}

function Trackmap({ onInfoChange }: TrackmapProps): React.JSX.Element {
  const { laps, hoveredLapPct, setHoveredLapPct, cornerHighlight, allCornerHighlights } = useLapData()
  const [pixelPoints, setPixelPoints] = useState<PixelPoint[][]>([])
  const [leftLimitPoints, setLeftLimitPoints] = useState<PixelPoint[]>([])
  const [rightLimitPoints, setRightLimitPoints] = useState<PixelPoint[]>([])
  const [hoveredPoints, setHoveredPoints] = useState<PixelPoint[]>([])
  const [highlightSegments, setHighlightSegments] = useState<PixelPoint[][]>([])
  const [allSegments, setAllSegments] = useState<{ pts: PixelPoint[]; idx: number }[]>([])

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const panRef = useRef(pan)
  const scaleRef = useRef(scale)
  const prevViewRef = useRef<{ pan: { x: number; y: number }; scale: number } | null>(null)
  panRef.current = pan
  scaleRef.current = scale

  // Convert all laps to pixel coordinates
  useEffect(() => {
    if (laps.length === 0) {
      setPixelPoints([])
      return
    }

    const allPoints = laps.flatMap((l) => l.points)
    const minLat = Math.min(...allPoints.map((p) => p.lat))
    const maxLat = Math.max(...allPoints.map((p) => p.lat))
    const minLon = Math.min(...allPoints.map((p) => p.lon))
    const maxLon = Math.max(...allPoints.map((p) => p.lon))

    setPixelPoints(
      laps.map((lap, i) => toPixelPoints(lap.points, minLat, maxLat, minLon, maxLon, 800, 800, i))
    )
  }, [laps])

  // Compute highlighted corner segments from coaching report
  useEffect(() => {
    if (cornerHighlight === null || pixelPoints.length === 0) {
      setHighlightSegments([])
      return
    }

    const { startPct, endPct } = cornerHighlight
    const segs: PixelPoint[][] = []

    for (let i = 0; i < pixelPoints.length; i++) {
      const filtered = pixelPoints[i].filter(
        (p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct
      )
      if (filtered.length > 0) segs.push(filtered)
    }
    setHighlightSegments(segs)
  }, [cornerHighlight, pixelPoints])

  const CORNER_COLORS = ['#ff4444', '#44bb44', '#4488ff', '#ff8800', '#cc44cc', '#888888', '#44dddd', '#ff44aa']

  // Compute all corner highlight segments
  useEffect(() => {
    if (allCornerHighlights.length === 0 || pixelPoints.length === 0) {
      setAllSegments([])
      return
    }
    const segs: { pts: PixelPoint[]; idx: number }[] = []
    for (const { startPct, endPct, idx } of allCornerHighlights) {
      for (let i = 0; i < pixelPoints.length; i++) {
        const filtered = pixelPoints[i].filter(
          (p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct
        )
        if (filtered.length > 0) segs.push({ pts: filtered, idx })
      }
    }
    setAllSegments(segs)
  }, [allCornerHighlights, pixelPoints])

  // Zoom into highlighted corner segment
  useEffect(() => {
    if (cornerHighlight === null) {
      if (prevViewRef.current) {
        setPan(prevViewRef.current.pan)
        setScale(prevViewRef.current.scale)
        prevViewRef.current = null
      }
      return
    }

    if (pixelPoints.length === 0) return

    if (!prevViewRef.current) {
      prevViewRef.current = { pan: { ...panRef.current }, scale: scaleRef.current }
    }

    const { startPct, endPct } = cornerHighlight
    const allPts = pixelPoints.flat().filter(
      (p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct
    )

    if (allPts.length === 0) return

    const xs = allPts.map((p) => p.x)
    const ys = allPts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const boxW = maxX - minX || 1
    const boxH = maxY - minY || 1
    const padding = 40
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const targetScale = Math.min(
      560 / (boxW + 2 * padding),
      560 / (boxH + 2 * padding)
    )
    const clampedScale = Math.max(0.5, Math.min(targetScale, 50))

    setPan({ x: 400 - centerX * clampedScale, y: 400 - centerY * clampedScale })
    setScale(clampedScale)
  }, [cornerHighlight, pixelPoints])

  // Load track limits
  useEffect(() => {
    async function loadLimits() {
      try {
        const leftCsv = (await window.api.readFile(
          'C:\\Users\\mauri\\Documents\\projects\\MLCoachTest\\ml-coach-frontend\\src\\tracks\\Summit-Point-Raceway\\Summit-Point-Raceway-Limits-Left.csv'
        )) as string
        const rightCsv = (await window.api.readFile(
          'C:\\Users\\mauri\\Documents\\projects\\MLCoachTest\\ml-coach-frontend\\src\\tracks\\Summit-Point-Raceway\\Summit-Point-Raceway-Limits-Right.csv'
        )) as string

        const leftRaw = parseCSV(leftCsv)
        const rightRaw = parseCSV(rightCsv)

        const allPoints = laps.flatMap((l) => l.points)
        if (allPoints.length === 0) return
        const minLat = Math.min(...allPoints.map((p) => p.lat))
        const maxLat = Math.max(...allPoints.map((p) => p.lat))
        const minLon = Math.min(...allPoints.map((p) => p.lon))
        const maxLon = Math.max(...allPoints.map((p) => p.lon))

        setLeftLimitPoints(toPixelPoints(leftRaw, minLat, maxLat, minLon, maxLon, 800, 800, -1))
        setRightLimitPoints(toPixelPoints(rightRaw, minLat, maxLat, minLon, maxLon, 800, 800, -1))
      } catch (err) {
        console.error('Failed to load track limits:', err)
      }
    }

    if (laps.length > 0) {
      loadLimits()
    }
  }, [laps])

  // Sync hovered points from graph hovers
  useEffect(() => {
    if (hoveredLapPct === null) {
      setHoveredPoints([])
      return
    }

    const found: PixelPoint[] = []
    for (let i = 0; i < pixelPoints.length; i++) {
      let closest: PixelPoint | null = null
      let minDiff = Infinity
      for (const p of pixelPoints[i]) {
        const diff = Math.abs(p.lapDistPct - hoveredLapPct)
        if (diff < minDiff) {
          minDiff = diff
          closest = p
        }
      }
      if (closest && minDiff < 0.01) found.push(closest)
    }
    setHoveredPoints(found)
  }, [hoveredLapPct, pixelPoints])

  const trackmapInfo = hoveredPoints.length > 0
    ? `Track Map | Hover: ${(hoveredPoints[0].lapDistPct * 100).toFixed(1)}%`
    : laps.length > 0
      ? 'Track Map'
      : 'Track Map (import a lap)'

  useEffect(() => {
    onInfoChange?.(trackmapInfo)
  }, [trackmapInfo, onInfoChange])

  function screenToViewBox(clientX: number, clientY: number, rect: DOMRect) {
    const scaleFactor = Math.min(rect.width, rect.height) / 800
    const paddingX = (rect.width - 800 * scaleFactor) / 2
    const paddingY = (rect.height - 800 * scaleFactor) / 2

    return {
      x: (clientX - rect.left - paddingX) / scaleFactor,
      y: (clientY - rect.top - paddingY) / scaleFactor
    }
  }

  function handlePanMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y
    }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()

      const dx = e.clientX - dragStart.current.mouseX
      const dy = e.clientY - dragStart.current.mouseY

      const scaleFactor = Math.min(rect.width, rect.height) / 800

      setPan({
        x: dragStart.current.panX + dx / scaleFactor,
        y: dragStart.current.panY + dy / scaleFactor
      })
    }

    function handleMouseUp() {
      dragging.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const mouse = screenToViewBox(e.clientX, e.clientY, rect)

      let newScale = scale - e.deltaY * 0.001 * scale
      newScale = Math.max(0.5, Math.min(newScale, 50))

      const newPanX = mouse.x - ((mouse.x - pan.x) / scale) * newScale
      const newPanY = mouse.y - ((mouse.y - pan.y) / scale) * newScale

      setPan({ x: newPanX, y: newPanY })
      setScale(newScale)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scale, pan])

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const mouse = screenToViewBox(e.clientX, e.clientY, rect)

    const lx = (mouse.x - pan.x) / scale
    const ly = (mouse.y - pan.y) / scale

    let minDist = Infinity
    let closestPoint: PixelPoint | null = null
    const flat = pixelPoints.flat()

    for (const p of flat) {
      const dx = p.x - lx
      const dy = p.y - ly
      const dist = dx * dx + dy * dy
      if (dist < minDist && dist < 500) {
        minDist = dist
        closestPoint = p
      }
    }

    if (closestPoint !== null) {
      setHoveredLapPct(closestPoint.lapDistPct)
    } else {
      setHoveredLapPct(null)
    }
  }

  if (laps.length === 0) {
    return (
      <div className={styles.base}>
        <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
          No lap data — use File → Import Lap
        </div>
      </div>
    )
  }

  return (
    <div className={styles.base}>
      <div className={styles.mapContainer} ref={containerRef}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 800 800"
          style={{ display: 'block', cursor: dragging.current ? 'grabbing' : 'grab' }}
          onMouseDown={handlePanMouseDown}
          onMouseMove={handleMouseMove}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Track limits */}
            <polyline
              points={leftLimitPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="black"
              strokeWidth={2.4 / scale}
              opacity="0.7"
            />
            <polyline
              points={rightLimitPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="black"
              strokeWidth={2.4 / scale}
              opacity="0.7"
            />
            {/* All corners highlight (glow + main) */}
            {allSegments.map((seg, i) => {
              const color = CORNER_COLORS[seg.idx % CORNER_COLORS.length]
              return (
                <polyline
                  key={`all-glow-${i}`}
                  points={seg.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={14 / scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.3}
                />
              )
            })}
            {allSegments.map((seg, i) => {
              const color = CORNER_COLORS[seg.idx % CORNER_COLORS.length]
              return (
                <polyline
                  key={`all-${i}`}
                  points={seg.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={5 / scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.95}
                />
              )
            })}
            {/* Highlighted corner segment (active selection) */}
            {highlightSegments.map((pts, i) => (
              <polyline
                key={`hl-${i}`}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#ffcc00"
                strokeWidth={4 / scale}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {/* Lap polylines */}
            {pixelPoints.map((pts, i) => (
              <polyline
                key={i}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={getLapColor(i)}
                strokeWidth={1.3 / scale}
              />
            ))}
            {/* Hovered points (one per lap) */}
            {hoveredPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5 / scale}
                fill={getLapColor(p.lapIndex)}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

export default Trackmap
