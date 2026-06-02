import { useState, useRef } from 'react'
import { useLapData } from '../../contexts/LapDataContext'

interface CoachingReportProps {
  onInfoChange?: (text: string) => void
}

function CoachingReport({ onInfoChange }: CoachingReportProps) {
  const { laps, setCornerHighlight, setSelection, setHoveredLapPct, setAllCornerHighlights } = useLapData()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [report, setReport] = useState<string | null>(null)
  const [corners, setCorners] = useState<CoachingCorner[]>([])
  const [coachingCorners, setCoachingCorners] = useState<CoachingCorner[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showCoaching, setShowCoaching] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  async function handleAnalyze() {
    if (laps.length < 2) return

    let fastest = 0
    for (let i = 1; i < laps.length; i++) {
      if (laps[i].totalTime < laps[fastest].totalTime) fastest = i
    }

    setLoading(true)
    setError(null)
    setReport(null)
    setCorners([])
    setCoachingCorners([])
    setShowAll(false)
    setShowCoaching(false)
    setAllCornerHighlights([])
    onInfoChange?.('Running coaching analysis...')

    try {
      const result = await window.api.runCoaching({
        fastPoints: laps[fastest].points,
        slowPoints: laps[selectedIndex].points
      })
      setReport(result.text)
      setCorners(result.all_corners)
      setCoachingCorners(result.data)
      onInfoChange?.('Coaching Report')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onInfoChange?.('Coaching Report')
    } finally {
      setLoading(false)
    }
  }

  function handleToggleAll() {
    if (!showAll) {
      const valid = corners.filter((c) => c.start_pct != null && c.end_pct != null)
      setAllCornerHighlights(valid.map((c, i) => ({ startPct: c.start_pct!, endPct: c.end_pct!, idx: i })))
      setShowCoaching(false)
    } else {
      setAllCornerHighlights([])
    }
    setShowAll(!showAll)
  }

  function handleToggleCoaching() {
    if (!showCoaching) {
      const valid = coachingCorners.filter((c) => c.start_pct != null && c.end_pct != null)
      setAllCornerHighlights(valid.map((c, i) => ({ startPct: c.start_pct!, endPct: c.end_pct!, idx: i })))
      setShowAll(false)
    } else {
      setAllCornerHighlights([])
    }
    setShowCoaching(!showCoaching)
  }

  function handleCornerClick(i: number) {
    const c = corners[i]
    if (c.start_pct == null || c.end_pct == null) return

    if (pinnedIdx === i) {
      setPinnedIdx(null)
      setCornerHighlight(null)
      setSelection(null)
      setHoveredLapPct(null)
    } else {
      setPinnedIdx(i)
      setCornerHighlight({ startPct: c.start_pct, endPct: c.end_pct })
      setSelection({ startPct: c.start_pct, endPct: c.end_pct })
      if (c.apex_pct != null) setHoveredLapPct(c.apex_pct)
    }
  }

  if (laps.length < 2) {
    return (
      <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
        Need at least 2 laps loaded to generate a coaching report.
      </div>
    )
  }

  const segments = report ? report.split(/\n(?=\[ )/) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Analyze lap:</span>
        <select
          value={selectedIndex}
          onChange={(e) => {
            setSelectedIndex(Number(e.target.value))
            setReport(null)
            setError(null)
            setCorners([])
          }}
          style={{ fontSize: 13, padding: '1px 4px', flex: 1 }}
        >
          {laps.map((lap, i) => (
            <option key={i} value={i}>{lap.name}</option>
          ))}
        </select>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{ fontSize: 13, padding: '2px 10px', cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Analyzing...' : 'Generate Report'}
        </button>
        {corners.length > 0 && (
          <>
            <button
              onClick={handleToggleAll}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                cursor: 'pointer',
                background: showAll ? '#4488ff' : '#eee',
                color: showAll ? '#fff' : '#333',
                border: showAll ? '1px solid #3366cc' : '1px solid #ccc',
                borderRadius: 3,
                fontWeight: showAll ? 700 : 400
              }}
            >
              {showAll ? '● All corners on map' : '○ Show all corners'}
            </button>
            <button
              onClick={handleToggleCoaching}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                cursor: 'pointer',
                background: showCoaching ? '#44bb44' : '#eee',
                color: showCoaching ? '#fff' : '#333',
                border: showCoaching ? '1px solid #338833' : '1px solid #ccc',
                borderRadius: 3,
                fontWeight: showCoaching ? 700 : 400
              }}
            >
              {showCoaching ? '● Coaching corners on map' : '○ Show coaching corners'}
            </button>
          </>
        )}
      </div>

      <div ref={textRef} style={{ flex: 1, overflow: 'auto', padding: '4px 8px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}>
        {loading && <div style={{ color: '#666' }}>Running Python analysis...</div>}
        {error && <div style={{ color: '#c00' }}>Error: {error}</div>}
        {report && (
          <>
            <div style={{ whiteSpace: 'pre-wrap' }}>{segments[0]}</div>
            {segments.slice(1).map((seg, i) => {
              const nameMatch = seg.match(/^\[ (.+?) \]/)
              const cornerIdx = nameMatch ? corners.findIndex((c) => c.corner === nameMatch[1]) : -1
              const isPinned = pinnedIdx === cornerIdx
              const isHovered = hoveredIdx === i && !isPinned
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => cornerIdx >= 0 && handleCornerClick(cornerIdx)}
                  style={{
                    whiteSpace: 'pre-wrap',
                    background: isPinned ? '#d4e8ff' : isHovered ? '#fff8dc' : 'transparent',
                    cursor: cornerIdx >= 0 ? 'pointer' : 'default',
                    borderRadius: 3,
                    padding: '0 4px',
                    margin: '0 -4px',
                    outline: isPinned ? '1px solid #66b0ff' : 'none'
                  }}
                >
                  {seg}
                </div>
              )
            })}
            {pinnedIdx !== null && (
              <div
                onClick={() => {
                  setPinnedIdx(null)
                  setCornerHighlight(null)
                  setSelection(null)
                  setHoveredLapPct(null)
                }}
                style={{ marginTop: 4, fontSize: 11, color: '#66b', cursor: 'pointer', userSelect: 'none' }}
              >
                ← Clear selection
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CoachingReport
