import { useState } from 'react'
import Trackmap from '../TrackMap/Trackmap'
import ThrottleGraph from '../Graphs/ThrottleGraph'
import BrakeGraph from '../Graphs/BrakeGraph'
import SpeedGraph from '../Graphs/SpeedGraph'
import RPMGraph from '../Graphs/RPMGraph'
import SteeringWheelAngleGraph from '../Graphs/SteeringWheelAngleGraph'
import GearGraph from '../Graphs/GearGraph'
import TimeDeltaGraph from '../Graphs/TimeDeltaGraph'
import CoachingReport from '../CoachingReport/CoachingReport'

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
  throttle: { component: ThrottleGraph, defaultLabel: 'Throttle' },
  brake: { component: BrakeGraph, defaultLabel: 'Brake' },
  speed: { component: SpeedGraph, defaultLabel: 'Speed' },
  rpm: { component: RPMGraph, defaultLabel: 'RPM' },
  steering: { component: SteeringWheelAngleGraph, defaultLabel: 'Steering' },
  gear: { component: GearGraph, defaultLabel: 'Gear' },
  delta: { component: TimeDeltaGraph, defaultLabel: 'Delta' },
  coaching: { component: CoachingReport, defaultLabel: 'Coaching Report' },
  empty: { component: EmptyPlaceholder, defaultLabel: '' }
}

function EmptyPlaceholder() {
  return null
}

function PaneSelector({ defaultComponent = 'empty', onRemove, onComponentChange }: PaneSelectorProps) {
  const [paneId, setPaneId] = useState(defaultComponent)
  const [infoText, setInfoText] = useState('')

  function handlePaneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setPaneId(id)
    setInfoText('')
    onComponentChange?.(id)
  }

  const entry = COMPONENTS[paneId] ?? COMPONENTS.empty
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
          value={paneId}
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
