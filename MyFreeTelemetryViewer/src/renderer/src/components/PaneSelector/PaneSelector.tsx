import { useState } from 'react'
import { useLapData } from '../../contexts/LapDataContext'
import Trackmap from '../TrackMap/Trackmap'
import Graph, { DataKey } from '../Graphs/Graph'
import TimeDeltaGraph from '../Graphs/TimeDeltaGraph'
import CoachingReport from '../CoachingReport/CoachingReport'
import styles from './PaneSelector.module.css'

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
  onAddPane?: () => void
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

function PaneSelector({ defaultComponent = 'empty', onRemove, onComponentChange, onAddPane }: PaneSelectorProps) {
  const { selection, setSelection } = useLapData()
  const [infoText, setInfoText] = useState('')

  function handlePaneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setInfoText('')
    onComponentChange?.(e.target.value)
  }

  const Component = COMPONENTS[defaultComponent] ?? COMPONENTS.empty

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <select className={styles.select} value={defaultComponent} onChange={handlePaneChange}>
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
        {infoText && <span className={styles.infoText}>{infoText}</span>}
        {selection && (
          <button className={styles.unzoomBtn} onClick={() => setSelection(null)} title="Clear zoom">
            Unzoom
          </button>
        )}
        <span className={styles.spacer} />
        {onAddPane && (
          <button className={styles.addBtn} onClick={onAddPane} title="Add pane">
            +
          </button>
        )}
        {onRemove && (
          <button className={styles.removeBtn} onClick={onRemove} title="Remove pane">
            ✕
          </button>
        )}
      </div>
      <div className={styles.content}>
        <Component onInfoChange={setInfoText} />
      </div>
    </div>
  )
}

export default PaneSelector
