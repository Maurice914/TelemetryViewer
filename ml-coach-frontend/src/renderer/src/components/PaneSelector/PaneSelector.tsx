import { useState } from 'react'
import { useLapData } from '../../contexts/LapDataContext'
import Trackmap from '../TrackMap/Trackmap'
import Graph, { DataKey } from '../Graphs/Graph'
import TimeDeltaGraph from '../Graphs/TimeDeltaGraph'
import CoachingReport from '../CoachingReport/CoachingReport'

function makeGraph(label: string, dataKey: DataKey, centerBaseline?: boolean) {
  return function Wrapper({ onInfoChange }: { onInfoChange?: (text: string) => void }) {
    const { laps, lapColors } = useLapData()
    return laps.length === 0 ? null : (
      <Graph label={label} dataKey={dataKey} lines={laps.map((l, i) => ({ points: l.points, color: lapColors[i] }))} centerBaseline={centerBaseline} onInfoChange={onInfoChange} />
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
  {
    component: React.ComponentType<{ onInfoChange?: (text: string) => void }>
    defaultLabel: string
  }
> = {
  trackmap: { component: Trackmap, defaultLabel: 'Track Map' },
  throttle: { component: makeGraph('Throttle', 'throttle'), defaultLabel: 'Throttle' },
  brake: { component: makeGraph('Brake', 'brake'), defaultLabel: 'Brake' },
  speed: { component: makeGraph('Speed', 'speed'), defaultLabel: 'Speed' },
  rpm: { component: makeGraph('RPM', 'rpm'), defaultLabel: 'RPM' },
  steering: { component: makeGraph('Steering', 'steeringWheelAngle', true), defaultLabel: 'Steering' },
  gear: { component: makeGraph('Gear', 'gear'), defaultLabel: 'Gear' },
  delta: { component: TimeDeltaGraph, defaultLabel: 'Delta' },
  coaching: { component: CoachingReport, defaultLabel: 'Coaching Report' },
  empty: { component: EmptyPlaceholder, defaultLabel: '' }
}

function EmptyPlaceholder() {
  return null
}

function PaneSelector({ defaultComponent = 'empty', onRemove, onComponentChange }: PaneSelectorProps) {
  const [infoText, setInfoText] = useState('')

  function handlePaneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setInfoText('')
    onComponentChange?.(e.target.value)
  }

  const entry = COMPONENTS[defaultComponent] ?? COMPONENTS.empty
  const Component = entry.component
  const displayText = infoText || entry.defaultLabel

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
        <span style={{ flex: 1 }}>{displayText}</span>
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
