import { useState, useRef, useEffect } from 'react'
import styles from './Trackmap.module.css'
import { useLapData, Point } from '../../contexts/LapDataContext'
import { parseCSV } from '../../utils/csvParser'

interface PixelPoint {
  x: number
  y: number
  lapDistPct: number
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
  height: number
): PixelPoint[] {
  const padding = 50
  const drawW = width - 2 * padding
  const drawH = height - 2 * padding

  const midLat = (minLat + maxLat) / 2
  const cosLat = Math.cos((midLat * Math.PI) / 180)

  // Physical extents
  const latRange = maxLat - minLat
  const lonRange = (maxLon - minLon) * cosLat // corrected to real-world scale

  // Scale uniformly so track fits without distortion
  const scale = Math.min(drawW / lonRange, drawH / latRange)

  // Center the track in the box
  const offsetX = (drawW - lonRange * scale) / 2
  const offsetY = (drawH - latRange * scale) / 2

  return points.map((p) => {
    const x = padding + offsetX + (p.lon - minLon) * cosLat * scale
    const y = padding + offsetY + (latRange - (p.lat - minLat)) * scale
    return { x, y, lapDistPct: p.lapDistPct }
  })
}

function Trackmap({ onInfoChange }: TrackmapProps): React.JSX.Element {
  const { fastPoints, slowPoints, hoveredLapPct, setHoveredLapPct } = useLapData()
  const [leftLimitPoints, setLeftLimitPoints] = useState<PixelPoint[]>([])
  const [rightLimitPoints, setRightLimitPoints] = useState<PixelPoint[]>([])
  const [hoveredPoint, setHoveredPoint] = useState<PixelPoint | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)

  // Pan/zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  // Convert points to pixel coordinates
  const [fastPixelPoints, setFastPixelPoints] = useState<PixelPoint[]>([])
  const [slowPixelPoints, setSlowPixelPoints] = useState<PixelPoint[]>([])

  useEffect(() => {
    if (fastPoints.length === 0 && slowPoints.length === 0) return

    const allPoints = [...fastPoints, ...slowPoints]
    const minLat = Math.min(...allPoints.map((p) => p.lat))
    const maxLat = Math.max(...allPoints.map((p) => p.lat))
    const minLon = Math.min(...allPoints.map((p) => p.lon))
    const maxLon = Math.max(...allPoints.map((p) => p.lon))

    setFastPixelPoints(toPixelPoints(fastPoints, minLat, maxLat, minLon, maxLon, 800, 800))
    setSlowPixelPoints(toPixelPoints(slowPoints, minLat, maxLat, minLon, maxLon, 800, 800))
  }, [fastPoints, slowPoints])

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

        // Use same bounds as racing lines (fast + slow only)
        const allPoints = [...fastPoints, ...slowPoints]
        const minLat = Math.min(...allPoints.map((p) => p.lat))
        const maxLat = Math.max(...allPoints.map((p) => p.lat))
        const minLon = Math.min(...allPoints.map((p) => p.lon))
        const maxLon = Math.max(...allPoints.map((p) => p.lon))

        setLeftLimitPoints(toPixelPoints(leftRaw, minLat, maxLat, minLon, maxLon, 800, 800))
        setRightLimitPoints(toPixelPoints(rightRaw, minLat, maxLat, minLon, maxLon, 800, 800))
      } catch (err) {
        console.error('Failed to load track limits:', err)
      }
    }

    if (fastPoints.length > 0 || slowPoints.length > 0) {
      loadLimits()
    }
  }, [fastPoints, slowPoints])

  // Sync hovered point from graph hovers
  useEffect(() => {
    if (hoveredLapPct === null) {
      setHoveredPoint(null)
      return
    }

    const allPoints = [...fastPixelPoints, ...slowPixelPoints]
    let closest: PixelPoint | null = null
    let minDiff = Infinity

    for (const p of allPoints) {
      const diff = Math.abs(p.lapDistPct - hoveredLapPct)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }

    if (closest && minDiff < 0.01) {
      setHoveredPoint(closest)
    }
  }, [hoveredLapPct, fastPixelPoints, slowPixelPoints])

  // Report info text
  const trackmapInfo = hoveredPoint
    ? `Track Map | Hover: ${(hoveredPoint.lapDistPct * 100).toFixed(1)}%`
    : 'Track Map'

  useEffect(() => {
    onInfoChange?.(trackmapInfo)
  }, [trackmapInfo, onInfoChange])

  // Helper: convert screen coords to viewBox coords (0-800) accounting for padding
  function screenToViewBox(clientX: number, clientY: number, rect: DOMRect) {
    const scaleFactor = Math.min(rect.width, rect.height) / 800
    const paddingX = (rect.width - 800 * scaleFactor) / 2
    const paddingY = (rect.height - 800 * scaleFactor) / 2

    return {
      x: (clientX - rect.left - paddingX) / scaleFactor,
      y: (clientY - rect.top - paddingY) / scaleFactor
    }
  }

  // Pan handlers
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

  // Zoom handler
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const mouse = screenToViewBox(e.clientX, e.clientY, rect)

    let newScale = scale - e.deltaY * 0.001 * scale
    newScale = Math.max(0.5, Math.min(newScale, 50))

    // Zoom towards mouse: keep point under mouse fixed
    const newPanX = mouse.x - ((mouse.x - pan.x) / scale) * newScale
    const newPanY = mouse.y - ((mouse.y - pan.y) / scale) * newScale

    setPan({ x: newPanX, y: newPanY })
    setScale(newScale)
  }

  // handle mouse hover to show LapDistPct and sync to graphs
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const mouse = screenToViewBox(e.clientX, e.clientY, rect)

    // Reverse g transform: translate(pan.x, pan.y) scale(scale)
    const lx = (mouse.x - pan.x) / scale
    const ly = (mouse.y - pan.y) / scale

    let minDist = Infinity
    let closestPoint: PixelPoint | null = null
    const allPoints = [...fastPixelPoints, ...slowPixelPoints]

    for (const p of allPoints) {
      const dx = p.x - lx
      const dy = p.y - ly
      const dist = dx * dx + dy * dy
      if (dist < minDist && dist < 500) {
        minDist = dist
        closestPoint = p
      }
    }

    if (closestPoint !== null) {
      setHoveredPoint(closestPoint)
      setHoveredLapPct(closestPoint.lapDistPct)
    } else {
      setHoveredPoint(null)
      setHoveredLapPct(null)
    }
  }

  return (
    <div className={styles.base}>
      <div className={styles.mapContainer} onWheel={handleWheel}>
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
            {/* Track limits (black, underneath) */}
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
            {/* Slow driver (blue) */}
            <polyline
              points={slowPixelPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#0066cc"
              strokeWidth={1.3 / scale}
            />
            {/* Fast driver (red) */}
            <polyline
              points={fastPixelPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#cc0000"
              strokeWidth={1.3 / scale}
            />
            {/* Hovered point dot */}
            {hoveredPoint && (
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r={5 / scale}
                fill={
                  slowPixelPoints.some((p) => p.x === hoveredPoint.x && p.y === hoveredPoint.y)
                    ? '#0066cc'
                    : '#cc0000'
                }
              />
            )}
          </g>
        </svg>
      </div>
    </div>
  )
}

export default Trackmap
