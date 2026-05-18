import { useState } from 'react'
import Trackmap from '../TrackMap/Trackmap'
import ThrottleGraph from '../Graphs/ThrottleGraph'
import BrakeGraph from '../Graphs/BrakeGraph'
import TimeDeltaGraph from '../Graphs/TimeDeltaGraph'

interface PaneSelectorProps {
  defaultComponent?: string
}

const COMPONENTS: Record<string, { component: React.ComponentType<{ onInfoChange?: (text: string) => void }>; defaultLabel: string }> = {
  trackmap: { component: Trackmap, defaultLabel: 'Track Map' },
  throttle: { component: ThrottleGraph, defaultLabel: 'Throttle' },
  brake: { component: BrakeGraph, defaultLabel: 'Brake' },
  delta: { component: TimeDeltaGraph, defaultLabel: 'Delta' },
  gear: { component: GearPlaceholder, defaultLabel: 'Gear' },
  empty: { component: EmptyPlaceholder, defaultLabel: '' },
}

function GearPlaceholder() {
  return <div style={{ padding: 16, color: '#888' }}>Gear graph coming soon</div>
}

function EmptyPlaceholder() {
  return null
}

function PaneSelector({ defaultComponent = 'empty' }: PaneSelectorProps) {
  const [paneId, setPaneId] = useState(defaultComponent)
  const [infoText, setInfoText] = useState('')

  function handlePaneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPaneId(e.target.value)
    setInfoText('')
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
        <select value={paneId} onChange={handlePaneChange} style={{ fontSize: 13, padding: '1px 4px' }}>
          <option value="trackmap">Track Map</option>
          <option value="throttle">Throttle</option>
          <option value="brake">Brake</option>
          <option value="delta">Delta</option>
          <option value="gear">Gear</option>
          <option value="empty">Empty</option>
        </select>
        <span>{displayText}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' , margin: 4}}>
        <Component onInfoChange={setInfoText} />
      </div>
    </div>
  )
}

export default PaneSelector
