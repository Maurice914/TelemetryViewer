import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface SpeedGraphProps {
  onInfoChange?: (text: string) => void
}

function SpeedGraph({ onInfoChange }: SpeedGraphProps) {
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
      label="Speed"
      dataKey="speed"
      lines={laps.map((l, i) => ({ points: l.points, color: getLapColor(i) }))}
      onInfoChange={onInfoChange}
    />
  )
}

export default SpeedGraph
