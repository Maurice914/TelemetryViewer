import { useState } from 'react'
import { useLapData } from '../../contexts/LapDataContext'
import Trackmap from '../TrackMap/Trackmap'
import Graph, { DataKey } from '../Graphs/Graph'
import TimeDeltaGraph from '../Graphs/TimeDeltaGraph'
import CoachingReport from '../CoachingReport/CoachingReport'

function makeGraph(dataKey: DataKey, centerBaseline?: boolean) {
  return function Wrapper({ onInfoChange }: { onInfoChange?: (text: string) => void }) {
    const { laps, lapColors } = useLapData()
    return laps.length === 0 ? null : (
      <Graph dataKey={dataKey} lines={laps.map((l, i) => ({ points: l.points, color: lapColors[i], name: l.name }))} centerBaseline={centerBaseline} onInfoChange={onInfoChange} />
    )
  }
}

interface PaneSelectorProps {
  defaultComponent?: string
  onRemove?: () => void
  onComponentChange?: (componentId: string) => void
}

const COMPONENTS: Record<
  string,
  React.ComponentType<{ onInfoChange?: (text: string) => void }>
> = {
  trackmap: Trackmap,
  throttle: makeGraph('throttle'),
  brake: makeGraph('brake'),
  speed: makeGraph('speed'),
  rpm: makeGraph('rpm'),
  steering: makeGraph('steeringWheelAngle', true),
  gear: makeGraph('gear'),
  delta: TimeDeltaGraph,
  coaching: CoachingReport,
  empty: EmptyPlaceholder
}

function EmptyPlaceholder() {
  return null
}

function PaneSelector({ defaultComponent = 'empty', onRemove, onComponentChange }: PaneSelectorProps) {
  const { selection, setSelection } = useLapData()
  const [infoText, setInfoText] = useState('')

  function handlePaneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setInfoText('')
    onComponentChange?.(e.target.value)
  }

  const Component = COMPONENTS[defaultComponent] ?? COMPONENTS.empty

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 4px',
          fontSize: 14,
          flexShrink: 0,
          borderBottom: '1px solid #ccc',
          background: '#f5f5f5'
        }}
      >
        <select
          value={defaultComponent}
          onChange={handlePaneChange}
          style={{ fontSize: 13, padding: '1px 4px' }}
        >
          <option value="trackmap">Track Map</option>
          <option value="throttle">Throttle</option>
          <option value="brake">Brake</option>
          <option value="speed">Speed</option>
          <option value="rpm">RPM</option>
          <option value="steering">Steering</option>
          <option value="gear">Gear</option>
          <option value="delta">Delta</option>
          <option value="coaching">Coaching Report</option>
          <option value="empty">Empty</option>
        </select>
        {infoText && <span style={{ flex: 1 }}>{infoText}</span>}
        {selection && (
          <button
            onClick={() => setSelection(null)}
            style={{
              cursor: 'pointer',
              color: '#333',
              fontSize: 12,
              padding: '1px 8px',
              lineHeight: 1.4,
              border: '1px solid #888',
              borderRadius: 3,
              background: '#e8e8e8'
            }}
            title="Clear zoom"
          >
            Unzoom
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#999',
              fontSize: 13,
              padding: '0 2px',
              lineHeight: 1
            }}
            title="Remove pane"
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', margin: 4 }}>
        <Component onInfoChange={setInfoText} />
      </div>
    </div>
  )
}

export default PaneSelector
