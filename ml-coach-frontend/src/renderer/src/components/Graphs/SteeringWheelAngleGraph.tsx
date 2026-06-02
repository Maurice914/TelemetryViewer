import { useLapData, getLapColor } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface SteeringWheelAngleGraphProps {
  onInfoChange?: (text: string) => void
}

function SteeringWheelAngleGraph({ onInfoChange }: SteeringWheelAngleGraphProps) {
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
      label="Steering"
      dataKey="steeringWheelAngle"
      lines={laps.map((l, i) => ({ points: l.points, color: getLapColor(i) }))}
      centerBaseline
      onInfoChange={onInfoChange}
    />
  )
}

export default SteeringWheelAngleGraph
