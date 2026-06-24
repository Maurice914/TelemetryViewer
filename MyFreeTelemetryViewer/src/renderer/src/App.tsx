import { useState, useEffect, useCallback } from 'react'
import './assets/main.css'
import Splitter from './components/Splitter/Splitter'
import PaneSelector from './components/PaneSelector/PaneSelector'
import Toolbar from './components/Toolbar/Toolbar'
import { LapDataProvider } from './contexts/LapDataContext'
import { SettingsProvider } from './contexts/SettingsContext'

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

function usePaneState(initial: LayoutConfig) {
  const [leftPanes, setLeftPanes] = useState<string[]>(initial.leftPanes)
  const [rightPanes, setRightPanes] = useState<string[]>(initial.rightPanes)
  const [outerSizes, setOuterSizes] = useState<number[]>(initial.outerSizes)
  const [leftSizes, setLeftSizes] = useState<number[]>(initial.leftSizes)
  const [rightSizes, setRightSizes] = useState<number[]>(initial.rightSizes)

  useEffect(() => {
    saveLayout({ leftPanes, rightPanes, leftSizes, rightSizes, outerSizes })
  }, [leftPanes, rightPanes, leftSizes, rightSizes, outerSizes])

  const addPane = useCallback((side: 'left' | 'right') => {
    const setter = side === 'left' ? setLeftPanes : setRightPanes
    setter((prev) => [...prev, 'empty'])
  }, [])

  const removePane = useCallback((side: 'left' | 'right', i: number) => {
    const setter = side === 'left' ? setLeftPanes : setRightPanes
    setter((prev) => prev.filter((_, idx) => idx !== i))
  }, [])

  const updatePane = useCallback((side: 'left' | 'right', i: number, id: string) => {
    const setter = side === 'left' ? setLeftPanes : setRightPanes
    setter((prev) => {
      const next = [...prev]
      next[i] = id
      return next
    })
  }, [])

  return { leftPanes, rightPanes, outerSizes, leftSizes, rightSizes, setOuterSizes, setLeftSizes, setRightSizes, addPane, removePane, updatePane }
}

function App(): React.JSX.Element {
  const [initial] = useState(loadLayoutOrDefault)
  const { leftPanes, rightPanes, outerSizes, leftSizes, rightSizes, setOuterSizes, setLeftSizes, setRightSizes, addPane, removePane, updatePane } = usePaneState(initial)

  return (
    <SettingsProvider>
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
            <Splitter orientation="horizontal" onAdd={() => addPane('left')} initialSizes={leftSizes} onSizesChange={setLeftSizes}>
              {leftPanes.map((comp, i) => (
                <PaneSelector
                  key={`left-${i}`}
                  defaultComponent={comp}
                  onRemove={leftPanes.length > 1 ? () => removePane('left', i) : undefined}
                  onComponentChange={(id) => updatePane('left', i, id)}
                />
              ))}
            </Splitter>
            <Splitter orientation="horizontal" onAdd={() => addPane('right')} initialSizes={rightSizes} onSizesChange={setRightSizes}>
              {rightPanes.map((comp, i) => (
                <PaneSelector
                  key={`right-${i}`}
                  defaultComponent={comp}
                  onRemove={rightPanes.length > 1 ? () => removePane('right', i) : undefined}
                  onComponentChange={(id) => updatePane('right', i, id)}
                />
              ))}
            </Splitter>
          </Splitter>
        </div>
      </div>
    </LapDataProvider>
    </SettingsProvider>
  )
}

export default App
