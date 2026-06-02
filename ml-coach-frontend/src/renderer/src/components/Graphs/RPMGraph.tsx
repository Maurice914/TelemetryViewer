import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface RPMGraphProps {
  onInfoChange?: (text: string) => void
}

function RPMGraph({ onInfoChange }: RPMGraphProps) {
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
      label="RPM"
      dataKey="rpm"
      lines={laps.map((l, i) => ({ points: l.points, color: getLapColor(i) }))}
      onInfoChange={onInfoChange}
    />
  )
}

export default RPMGraph
