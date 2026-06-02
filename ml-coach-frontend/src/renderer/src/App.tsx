import { useRef, useState, useEffect, useCallback } from 'react'
import './assets/main.css'
import Splitter from './components/Splitter/Splitter'
import PaneSelector from './components/PaneSelector/PaneSelector'
import { LapDataProvider, useLapData } from './contexts/LapDataContext'
import { parseCSV } from './utils/csvParser'

const STORAGE_KEY = 'telemetry-viewer-layout'

interface LayoutConfig {
  leftPanes: string[]
  rightPanes: string[]
  leftSizes: number[]
  rightSizes: number[]
  outerSizes: number[]
}

function loadLayout(): LayoutConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LayoutConfig
  } catch {
    return null
  }
}

function saveLayout(config: LayoutConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // storage full or unavailable — ignore
  }
}

function loadLayoutOrDefault(): LayoutConfig {
  return loadLayout() ?? {
    leftPanes: ['trackmap', 'throttle'],
    rightPanes: ['brake', 'delta'],
    leftSizes: [50, 50],
    rightSizes: [100],
    outerSizes: [50, 50]
  }
}

function Toolbar() {
  const { laps, addLap, removeLap, clearLaps, referenceLapIndex } = useLapData()
  const [menuOpen, setMenuOpen] = useState(false)
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
              style={{
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: 13
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e8e8e8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
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
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    display: 'inline-block',
                    flexShrink: 0
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {lap.name}
                </span>
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
                  onClick={() => {
                    clearLaps()
                    setMenuOpen(false)
                  }}
                  style={{
                    padding: '5px 12px',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#cc0000'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fdd'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  Clear All
                </div>
              </>
            )}
          </div>
        )}
      </div>
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

function App(): React.JSX.Element {
  const [initial] = useState(loadLayoutOrDefault)
  const [leftPanes, setLeftPanes] = useState<string[]>(initial.leftPanes)
  const [rightPanes, setRightPanes] = useState<string[]>(initial.rightPanes)
  const [outerSizes, setOuterSizes] = useState<number[]>(initial.outerSizes)
  const [leftSizes, setLeftSizes] = useState<number[]>(initial.leftSizes)
  const [rightSizes, setRightSizes] = useState<number[]>(initial.rightSizes)

  useEffect(() => {
    saveLayout({ leftPanes, rightPanes, leftSizes, rightSizes, outerSizes })
  }, [leftPanes, rightPanes, leftSizes, rightSizes, outerSizes])

  function addLeftPane() {
    setLeftPanes((prev) => [...prev, 'empty'])
  }
  function removeLeftPane(i: number) {
    setLeftPanes((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addRightPane() {
    setRightPanes((prev) => [...prev, 'empty'])
  }
  function removeRightPane(i: number) {
    setRightPanes((prev) => prev.filter((_, idx) => idx !== i))
  }
  function updateLeftPane(i: number, id: string) {
    setLeftPanes((prev) => {
      const next = [...prev]
      next[i] = id
      return next
    })
  }
  function updateRightPane(i: number, id: string) {
    setRightPanes((prev) => {
      const next = [...prev]
      next[i] = id
      return next
    })
  }

  return (
    <LapDataProvider>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Toolbar />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Splitter orientation="vertical" initialSizes={outerSizes} onSizesChange={setOuterSizes}>
            <Splitter orientation="horizontal" onAdd={addLeftPane} initialSizes={leftSizes} onSizesChange={setLeftSizes}>
              {leftPanes.map((comp, i) => (
                <PaneSelector
                  key={`left-${i}`}
                  defaultComponent={comp}
                  onRemove={leftPanes.length > 1 ? () => removeLeftPane(i) : undefined}
                  onComponentChange={(id) => updateLeftPane(i, id)}
                />
              ))}
            </Splitter>
            <Splitter orientation="horizontal" onAdd={addRightPane} initialSizes={rightSizes} onSizesChange={setRightSizes}>
              {rightPanes.map((comp, i) => (
                <PaneSelector
                  key={`right-${i}`}
                  defaultComponent={comp}
                  onRemove={rightPanes.length > 1 ? () => removeRightPane(i) : undefined}
                  onComponentChange={(id) => updateRightPane(i, id)}
                />
              ))}
            </Splitter>
          </Splitter>
        </div>
      </div>
    </LapDataProvider>
  )
}

export default App
