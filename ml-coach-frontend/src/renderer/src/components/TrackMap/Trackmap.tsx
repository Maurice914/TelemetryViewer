import { useState, useRef, useEffect } from 'react'
import styles from './Trackmap.module.css'
import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import { toPixelPoints, screenToViewBox, CORNER_COLORS, PixelPoint } from './projection'
import { usePanZoom } from './usePanZoom'

interface TrackmapProps {
  onInfoChange?: (text: string) => void
}

function Trackmap({ onInfoChange }: TrackmapProps): React.JSX.Element {
  const { laps, hoveredLapPct, setHoveredLapPct, cornerHighlight, allCornerHighlights } = useLapData()
  const [pixelPoints, setPixelPoints] = useState<PixelPoint[][]>([])

  const [hoveredPoints, setHoveredPoints] = useState<PixelPoint[]>([])
  const [highlightSegments, setHighlightSegments] = useState<PixelPoint[][]>([])
  const [allSegments, setAllSegments] = useState<{ pts: PixelPoint[]; idx: number }[]>([])
  const [svgOverlay, setSvgOverlay] = useState<string | null>(null)
  const [svgViewBox, setSvgViewBox] = useState('0 0 800 800')
  const [svgScale, setSvgScale] = useState(1)
  const [svgOffsetX, setSvgOffsetX] = useState(0)
  const [svgOffsetY, setSvgOffsetY] = useState(0)
  const [savedMaps, setSavedMaps] = useState<string[]>([])
  const [showSaveInput, setShowSaveInput] = useState(false)
  const saveInputRef = useRef<HTMLInputElement>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const projectionBoundsRef = useRef<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null)

  const { pan, scale, handlePanMouseDown, dragging } = usePanZoom(svgRef, containerRef, pixelPoints, cornerHighlight)

  function startScrubScale(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startVal = svgScale
    function onMove(e2: MouseEvent) {
      const dx = e2.clientX - startX
      setSvgScale(Math.max(0.1, Math.min(5, +(startVal + dx * 0.01).toFixed(2))))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startScrubOffsetX(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startVal = svgOffsetX
    function onMove(e2: MouseEvent) {
      const dx = e2.clientX - startX
      setSvgOffsetX(Math.max(-800, Math.min(800, startVal + dx)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startScrubOffset(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startVal = svgOffsetY
    function onMove(e2: MouseEvent) {
      const dx = e2.clientX - startX
      setSvgOffsetY(Math.max(-800, Math.min(800, startVal + dx)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleSvgImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const match = text.match(/viewBox=["']([^"']+)["']/)
      if (match) setSvgViewBox(match[1])
      const inner = text.replace(/<svg[^>]*>/i, '').replace(/<\/svg>/i, '')
      setSvgOverlay(inner)
    }
    reader.readAsText(file)
  }

  async function handleSaveSvg(e: React.FormEvent) {
    e.preventDefault()
    const name = saveInputRef.current?.value.trim()
    if (!svgOverlay || !name) return
    const fullSvg = `<svg viewBox="${svgViewBox}" xmlns="http://www.w3.org/2000/svg">${svgOverlay}</svg>`
    await window.api.saveTrackOverlay(name, fullSvg, { scale: svgScale, offsetX: svgOffsetX, offsetY: svgOffsetY })
    setShowSaveInput(false)
    setSavedMaps(await window.api.listTracks())
  }

  async function handleLoadMap(trackName: string) {
    if (!trackName) return
    const { svgContent, overlay } = await window.api.loadTrackOverlay(trackName)
    const match = svgContent.match(/viewBox=["']([^"']+)["']/)
    if (match) setSvgViewBox(match[1])
    const inner = svgContent.replace(/<svg[^>]*>/i, '').replace(/<\/svg>/i, '')
    setSvgOverlay(inner)
    setSvgScale(overlay.scale)
    setSvgOffsetX(overlay.offsetX)
    setSvgOffsetY(overlay.offsetY)
  }

  useEffect(() => {
    window.api.listTracks().then(setSavedMaps).catch(() => {})
  }, [])

  useEffect(() => {
    if (laps.length === 0) {
      setPixelPoints([])
      projectionBoundsRef.current = null
      return
    }

    if (!projectionBoundsRef.current) {
      const p = laps[0].points
      projectionBoundsRef.current = {
        minLat: Math.min(...p.map((p) => p.lat)),
        maxLat: Math.max(...p.map((p) => p.lat)),
        minLon: Math.min(...p.map((p) => p.lon)),
        maxLon: Math.max(...p.map((p) => p.lon)),
      }
    }

    const b = projectionBoundsRef.current
    setPixelPoints(
      laps.map((lap, i) => toPixelPoints(lap.points, b.minLat, b.maxLat, b.minLon, b.maxLon, 800, 800, i))
    )
  }, [laps])

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
      <div style={{ display: 'flex', gap: 6, padding: '4px 8px', alignItems: 'center', fontSize: 12 }}>
        <button onClick={() => svgInputRef.current?.click()}>+ SVG</button>
        <input ref={svgInputRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleSvgImport} />
        {svgOverlay && (
          <>
            <span
              style={{ cursor: 'ew-resize', userSelect: 'none' }}
              onMouseDown={startScrubScale}
            >
              {svgScale.toFixed(2)}x
            </span>
            <span
              style={{ cursor: 'ew-resize', userSelect: 'none' }}
              onMouseDown={startScrubOffsetX}
            >
              X {svgOffsetX}px
            </span>
            <span
              style={{ cursor: 'ew-resize', userSelect: 'none' }}
              onMouseDown={startScrubOffset}
            >
              Y {svgOffsetY}px
            </span>
            {showSaveInput ? (
              <form style={{ display: 'inline' }} onSubmit={handleSaveSvg}>
                <input
                  ref={saveInputRef}
                  autoFocus
                  style={{ width: 80, fontSize: 11 }}
                  onBlur={() => setShowSaveInput(false)}
                  placeholder="track name"
                />
              </form>
            ) : (
              <button onClick={() => setShowSaveInput(true)}>Save</button>
            )}
            <button onClick={() => { setSvgOverlay(null); setSvgScale(1); setSvgOffsetX(0); setSvgOffsetY(0) }}>Remove</button>
          </>
        )}
        {savedMaps.length > 0 && (
          <select
            style={{ fontSize: 11, padding: '1px 4px' }}
            defaultValue=""
            onChange={(e) => { const v = e.target.value; if (v) handleLoadMap(v) }}
          >
            <option value="" disabled>Maps</option>
            {savedMaps.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>
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
            {svgOverlay && (
              <g
                opacity={0.5}
                transform={`translate(${svgOffsetX + (800 - 800 * svgScale) / 2}, ${svgOffsetY + (800 - 800 * svgScale) / 2}) scale(${svgScale})`}
              >
                <svg viewBox={svgViewBox} width={800} height={800} dangerouslySetInnerHTML={{ __html: svgOverlay }} />
              </g>
            )}

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
            {pixelPoints.map((pts, i) => (
              <polyline
                key={i}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={getLapColor(i)}
                strokeWidth={1.3 / scale}
              />
            ))}
            {hoveredPoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={7 / Math.min(3, scale)} fill={getLapColor(p.lapIndex)} />
                <line
                  x1={p.x} y1={p.y}
                  x2={p.x + Math.sin(p.yaw) * 16 / Math.min(2, scale)}
                  y2={p.y - Math.cos(p.yaw) * 16 / Math.min(2, scale)}
                  stroke={getLapColor(p.lapIndex)}
                  strokeWidth={2.5 / Math.min(4, scale)}
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

export default Trackmap
