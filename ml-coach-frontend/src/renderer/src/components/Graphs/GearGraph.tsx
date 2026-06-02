import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface GearGraphProps {
  onInfoChange?: (text: string) => void
}

function GearGraph({ onInfoChange }: GearGraphProps) {
  const { laps } = useLapData()

  if (laps.length === 0) {
    return (
      <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
        No lap data — use File → Import Lap
      </div>
    )
  }

  return (
    <Graph
      label="Gear"
      dataKey="gear"
      lines={laps.map((l, i) => ({ points: l.points, color: getLapColor(i) }))}
      onInfoChange={onInfoChange}
    />
  )
}

export default GearGraph
