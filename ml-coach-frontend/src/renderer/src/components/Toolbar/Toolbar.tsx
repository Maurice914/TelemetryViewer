import { useRef, useState, useEffect, useCallback } from 'react'
import { useLapData } from '../../contexts/LapDataContext'
import { useSettings } from '../../contexts/SettingsContext'
import { parseCSV } from '../../utils/csvParser'

function Toolbar() {
  const { laps, lapColors, addLap, removeLap, clearLaps, referenceLapIndex } = useLapData()
  const { settings, update, setLapColor } = useSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        const points = parseCSV(text)
        if (points.length === 0) {
          alert('Could not parse any valid data from the CSV file.')
          return
        }
        const name = file.name.replace(/\.csv$/i, '')
        addLap(points, name)
      }
      reader.readAsText(file)
      e.target.value = ''
      setMenuOpen(false)
    },
    [addLap]
  )

  function Row({ label, value: storeVal, min, max, step, decimals, onChange }: { label: string; value: number; min: number; max: number; step: number; decimals?: number; onChange: (v: number) => void }) {
    const [val, setVal] = useState(storeVal)
    useEffect(() => setVal(storeVal), [storeVal])
    const fmt = (n: number) => (decimals !== undefined ? n.toFixed(decimals) : n.toString())
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ width: 70, color: '#555' }}>{label}</span>
        <input
          type="range"
          min={min} max={max} step={step}
          value={val}
          onChange={(e) => setVal(parseFloat(e.target.value))}
          onMouseUp={() => onChange(val)}
          onKeyUp={() => onChange(val)}
          style={{ flex: 1, height: 16 }}
        />
        <span style={{ width: 30, textAlign: 'right', color: '#333', fontSize: 11 }}>{fmt(val)}</span>
      </div>
    )
  }

  const spanStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderBottom: '1px solid #ccc',
        background: '#f5f5f5',
        height: 30,
        flexShrink: 0,
        fontSize: 13,
        position: 'relative',
        userSelect: 'none'
      }}
    >
      <div ref={menuRef} style={{ position: 'relative', height: '100%' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            background: menuOpen ? '#ddd' : 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 500,
            borderRight: '1px solid #ccc',
            height: '100%',
            lineHeight: '22px'
          }}
        >
          File ▾
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            borderRight: '1px solid #ccc',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 500,
            height: '100%',
            lineHeight: '22px'
          }}
        >
          Settings
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              background: '#fff',
              border: '1px solid #ccc',
              boxShadow: '2px 2px 8px rgba(0,0,0,0.15)',
              zIndex: 100,
              minWidth: 200,
              padding: '4px 0'
            }}
          >
            <div
              onClick={() => inputRef.current?.click()}
              style={{ padding: '5px 12px', cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e8e8e8' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              Import Lap...
            </div>
            {laps.length > 0 && <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />}
            {laps.map((lap, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 12px',
                  fontSize: 12
                }}
              >
                <span
                  style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: lapColors[i] }}
                />
                <span style={spanStyle}>{lap.name}</span>
                {i === referenceLapIndex && laps.length > 1 && (
                  <span style={{ fontSize: 10, color: '#999', fontStyle: 'italic' }}>baseline</span>
                )}
                <button
                  onClick={() => removeLap(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#999',
                    fontSize: 12,
                    padding: '0 2px',
                    lineHeight: 1
                  }}
                  title="Remove lap"
                >
                  ✕
                </button>
              </div>
            ))}
            {laps.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
                <div
                  onClick={() => { clearLaps(); setMenuOpen(false) }}
                  style={{ padding: '5px 12px', cursor: 'pointer', fontSize: 13, color: '#cc0000' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fdd' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Clear All
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {settingsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
        >
          <div
            style={{ background: '#fff', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', width: 420, maxHeight: '80vh', padding: 16, position: 'relative', overflowY: 'auto', fontSize: 12 }}
          >
            <button
              onClick={() => setSettingsOpen(false)}
              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999', lineHeight: 1 }}
            >
              ✕
            </button>

            <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 13 }}>Track Map</div>
            <Row label="Line width" value={settings.trackLineWidth} min={0.1} max={5} step={0.1} decimals={1} onChange={(v) => update({ trackLineWidth: v })} />
            <Row label="Dot radius" value={settings.trackDotRadius} min={2} max={20} step={1} decimals={0} onChange={(v) => update({ trackDotRadius: v })} />

            <div style={{ marginTop: 10, marginBottom: 4, fontWeight: 600, fontSize: 13 }}>Graphs</div>
            <Row label="Line width" value={settings.graphLineWidth} min={0.1} max={5} step={0.1} decimals={1} onChange={(v) => update({ graphLineWidth: v })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input type="checkbox" checked={settings.showRuler} onChange={(e) => update({ showRuler: e.target.checked })} />
              Show ruler
            </label>

            <div style={{ marginTop: 10, marginBottom: 4, fontWeight: 600, fontSize: 13 }}>Lap Colors</div>
            {laps.map((lap, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <input
                  type="color"
                  value={lapColors[i]}
                  onChange={(e) => setLapColor(lap.name, e.target.value)}
                  style={{ width: 28, height: 20, padding: 0, border: 'none', cursor: 'pointer' }}
                />
                <span style={{ color: '#555' }}>{lap.name}</span>
              </div>
            ))}
            {laps.length === 0 && <div style={{ color: '#999' }}>No laps loaded</div>}
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFilePicked}
      />
      <span style={{ padding: '0 12px', fontSize: 12, color: laps.length > 0 ? '#666' : '#999' }}>
        {laps.length > 0
          ? `${laps.length} lap${laps.length !== 1 ? 's' : ''} loaded`
          : 'No laps — use File → Import Lap'}
      </span>
    </div>
  )
}

export default Toolbar
