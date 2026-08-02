import { useState, useRef, useEffect, useMemo } from 'react'
import styles from './Trackmap.module.css'
import { useLapData } from '../../contexts/LapDataContext'
import { useSettings } from '../../contexts/SettingsContext'
import { calcElapsed, timeAtPct } from '../../utils/graphHelpers'
import { toPixelPoints, screenToViewBox, projectLatLon, CORNER_COLORS, PixelPoint } from './projection'
import { usePanZoom } from './usePanZoom'

interface TrackmapProps {
  onInfoChange?: (text: string) => void
}

function Trackmap({ onInfoChange }: TrackmapProps): React.JSX.Element {
  const { laps, lapColors, hoveredLapPct, setHoveredLapPct, cornerHighlight, allCornerHighlights, referenceLapIndex } = useLapData()
  const { settings } = useSettings()

  const [svgOverlay, setSvgOverlay] = useState<string | null>(null)
  const [svgViewBox, setSvgViewBox] = useState('0 0 800 800')
  const [svgScale, setSvgScale] = useState(1)
  const [svgOffsetX, setSvgOffsetX] = useState(0)
  const [svgOffsetY, setSvgOffsetY] = useState(0)
  const [savedMaps, setSavedMaps] = useState<string[]>([])
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [mapSearch, setMapSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [timeSync, setTimeSync] = useState(false)
  const [boundaries, setBoundaries] = useState<{
    left: { lat: number; lon: number }[]
    right: { lat: number; lon: number }[]
  } | null>(null)
  const [generating, setGenerating] = useState(false)
  const saveInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<number[][]>([])

  const svgRef = useRef<SVGSVGElement>(null)
  const svgInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const projectionBoundsRef = useRef<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null)

  const pixelPoints = useMemo(() => {
    if (laps.length === 0) { projectionBoundsRef.current = null; return [] }
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
    return laps.map((lap, i) => toPixelPoints(lap.points, b.minLat, b.maxLat, b.minLon, b.maxLon, 800, 800, i))
  }, [laps])

  const boundaryPixelPoints = useMemo(() => {
    if (!boundaries || !projectionBoundsRef.current) return null
    const b = projectionBoundsRef.current
    const left = boundaries.left.map((p) => projectLatLon(p.lat, p.lon, b)).filter((p) => !isNaN(p.x) && !isNaN(p.y))
    const right = boundaries.right.map((p) => projectLatLon(p.lat, p.lon, b)).filter((p) => !isNaN(p.x) && !isNaN(p.y))
    return { left, right }
  }, [boundaries])

  const { pan, scale, handlePanMouseDown, dragging } = usePanZoom(svgRef, containerRef, pixelPoints, cornerHighlight)

  function scrub(e: React.MouseEvent, startVal: number, setter: (v: number) => void, factor: number, min: number, max: number) {
    e.preventDefault()
    const startX = e.clientX
    function onMove(e2: MouseEvent) { setter(Math.max(min, Math.min(max, startVal + (e2.clientX - startX) * factor))) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', onMove), { once: true })
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
    setBoundaries(null)
    const { svgContent, overlay } = await window.api.loadTrackOverlay(trackName)
    const match = svgContent.match(/viewBox=["']([^"']+)["']/)
    if (match) setSvgViewBox(match[1])
    const inner = svgContent.replace(/<svg[^>]*>/i, '').replace(/<\/svg>/i, '')
    setSvgOverlay(inner)
    setSvgScale(overlay.scale)
    setSvgOffsetX(overlay.offsetX)
    setSvgOffsetY(overlay.offsetY)
  }

  async function handleGenerateBoundaries() {
    const fastest = [...laps].sort((a, b) => a.totalTime - b.totalTime)[0]
    if (!fastest) return
    setGenerating(true)
    try {
      const result = await window.api.generateBoundaries(fastest.points)
      setBoundaries(result)
    } catch (err) {
      console.error('Failed to generate boundaries:', err)
    } finally {
      setGenerating(false)
      setDropdownOpen(false)
    }
  }

  useEffect(() => {
    window.api.listTracks().then(setSavedMaps).catch(() => {})
  }, [])

  useEffect(() => {
    setBoundaries(null)
  }, [laps])

  useEffect(() => {
    elapsedRef.current = laps.map((lap) => calcElapsed(lap.points))
  }, [laps])

  useEffect(() => {
    if (!dropdownOpen) return
    function onMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [dropdownOpen])

  const highlightSegments = useMemo(() => {
    if (cornerHighlight === null || pixelPoints.length === 0) return []
    const { startPct, endPct } = cornerHighlight
    const segs: PixelPoint[][] = []
    for (let i = 0; i < pixelPoints.length; i++) {
      const filtered = pixelPoints[i].filter((p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct)
      if (filtered.length > 0) segs.push(filtered)
    }
    return segs
  }, [cornerHighlight, pixelPoints])

  const allSegments = useMemo(() => {
    if (allCornerHighlights.length === 0 || pixelPoints.length === 0) return []
    const segs: { pts: PixelPoint[]; idx: number }[] = []
    for (const { startPct, endPct, idx } of allCornerHighlights) {
      for (let i = 0; i < pixelPoints.length; i++) {
        const filtered = pixelPoints[i].filter((p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct)
        if (filtered.length > 0) segs.push({ pts: filtered, idx })
      }
    }
    return segs
  }, [allCornerHighlights, pixelPoints])

  const hoveredPoints = useMemo(() => {
    if (hoveredLapPct === null || pixelPoints.length === 0) return []
    const found: PixelPoint[] = []
    const times = elapsedRef.current
    const refIdx = referenceLapIndex
    const targetTime = timeSync && refIdx >= 0 && times[refIdx]
      ? timeAtPct(laps[refIdx].points, times[refIdx], hoveredLapPct)
      : null
    for (let i = 0; i < pixelPoints.length; i++) {
      let bestIdx = -1
      let minDiff = Infinity
      if (targetTime !== null && times[i]) {
        for (let j = 0; j < times[i].length; j++) {
          const diff = Math.abs(times[i][j] - targetTime)
          if (diff < minDiff) { minDiff = diff; bestIdx = j }
        }
      } else {
        for (let j = 0; j < pixelPoints[i].length; j++) {
          const diff = Math.abs(pixelPoints[i][j].lapDistPct - hoveredLapPct)
          if (diff < minDiff) { minDiff = diff; bestIdx = j }
        }
      }
      if (bestIdx >= 0 && pixelPoints[i][bestIdx] && (targetTime !== null || minDiff < 0.01)) {
        found.push(pixelPoints[i][bestIdx])
      }
    }
    return found
  }, [hoveredLapPct, pixelPoints, timeSync, referenceLapIndex, laps])

  const filteredMaps = savedMaps.filter((n) => n.toLowerCase().includes(mapSearch.toLowerCase()))

  const syncLabel = timeSync ? 'time' : 'dist'
  const trackmapInfo = hoveredPoints.length > 0
    ? `Track Map (${syncLabel}) | ${(hoveredPoints[0].lapDistPct * 100).toFixed(1)}%`
    : laps.length > 0
      ? `Track Map (${syncLabel})`
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
        <div style={{ padding: 16, color: 'var(--color-text-placeholder)', fontSize: 13 }}>
          No lap data — use File → Import Lap
        </div>
      </div>
    )
  }

  return (
    <div className={styles.base}>
      <div style={{ display: 'flex', gap: 6, padding: '4px 8px', alignItems: 'center', fontSize: 12 }}>
        {import.meta.env.DEV && <button style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, padding: '1px 6px', borderRadius: 4 }} onClick={() => svgInputRef.current?.click()}>+ SVG</button>}
        <label style={{ cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={timeSync} onChange={(e) => setTimeSync(e.target.checked)} style={{ marginRight: 3 }} />
          Time sync
        </label>
        <input ref={svgInputRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleSvgImport} />
        {svgOverlay && (
          <>
            {import.meta.env.DEV && (
              <>
                <span
                  style={{ cursor: 'ew-resize', userSelect: 'none', color: 'var(--color-text)' }}
                  onMouseDown={(e) => scrub(e, svgScale, setSvgScale, 0.01, 0.1, 5)}
                >
                  {svgScale.toFixed(2)}x
                </span>
                <span
                  style={{ cursor: 'ew-resize', userSelect: 'none', color: 'var(--color-text)' }}
                  onMouseDown={(e) => scrub(e, svgOffsetX, setSvgOffsetX, 1, -800, 800)}
                >
                  X {svgOffsetX}px
                </span>
                <span
                  style={{ cursor: 'ew-resize', userSelect: 'none', color: 'var(--color-text)' }}
                  onMouseDown={(e) => scrub(e, svgOffsetY, setSvgOffsetY, 1, -800, 800)}
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
                  <button style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, padding: '1px 6px', borderRadius: 4 }} onClick={() => setShowSaveInput(true)}>Save</button>
                )}
              </>
            )}
            <button style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, padding: '1px 6px', borderRadius: 4 }} onClick={() => { setSvgOverlay(null); setSvgScale(1); setSvgOffsetX(0); setSvgOffsetY(0) }}>Remove</button>
          </>
        )}
        {savedMaps.length > 0 && (
          <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 12, padding: '1px 6px', borderRadius: 4 }} onClick={() => { setDropdownOpen(!dropdownOpen); setMapSearch('') }}>Tracks</button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--color-bg)', border: '1px solid var(--color-border)', zIndex: 1000, minWidth: 150 }}>
                <div
                  style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: generating ? 'var(--color-muted)' : '#4488ff', borderBottom: '1px solid var(--color-border)' }}
                  onClick={generating ? undefined : handleGenerateBoundaries}
                >
                  {generating ? 'Generating...' : 'Track not listed? Generate'}
                </div>
                <input
                  autoFocus
                  style={{ width: 'calc(100% - 8px)', margin: 4, fontSize: 11, padding: '2px 4px', boxSizing: 'border-box' }}
                  placeholder="search"
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && filteredMaps[0]) { handleLoadMap(filteredMaps[0]); setDropdownOpen(false) }}}
                />
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {filteredMaps.length === 0 ? (
                    <div style={{ padding: '2px 8px', fontSize: 11, color: 'var(--color-muted)' }}>no matches</div>
                  ) : filteredMaps.map((name) => (
                    <div
                      key={name}
                      style={{ padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)' }}
                      onClick={() => { handleLoadMap(name); setDropdownOpen(false) }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                opacity={0.3}
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
            {boundaryPixelPoints && (
              <>
                {boundaryPixelPoints.left.length > 0 && (
                  <polyline
                    key="b-l"
                    points={boundaryPixelPoints.left.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth={1.5 / scale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {boundaryPixelPoints.right.length > 0 && (
                  <polyline
                    key="b-r"
                    points={boundaryPixelPoints.right.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth={1.5 / scale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </>
            )}
            {pixelPoints.map((pts, i) => (
              <polyline
                key={i}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={lapColors[i]}
                strokeWidth={settings.trackLineWidth / scale}
              />
            ))}
            {hoveredPoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={settings.trackDotRadius / Math.min(3, scale)} fill={lapColors[p.lapIndex]} />
                <line
                  x1={p.x} y1={p.y}
                  x2={p.x + Math.sin(p.yaw) * settings.trackDotRadius * 2.3 / Math.min(2, scale)}
                  y2={p.y - Math.cos(p.yaw) * settings.trackDotRadius * 2.3 / Math.min(2, scale)}
                  stroke={lapColors[p.lapIndex]}
                  strokeWidth={(settings.trackDotRadius * 0.35 + 2) / Math.min(4, scale)}
                  strokeLinecap="round"
                />
              </g>
            ))}
          </g>
        </svg>
        {laps.length > 1 && (
          <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.55)', color: 'var(--color-text)', fontSize: 11, padding: '4px 8px', borderRadius: 4, lineHeight: 1.6 }}>
            {laps.map((lap, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: lapColors[i], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lap.name}</span>
                <span style={{ color: 'var(--color-muted)' }}>{lap.totalTime.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Trackmap
