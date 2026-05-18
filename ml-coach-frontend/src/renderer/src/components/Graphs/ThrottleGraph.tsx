import { useLapData } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface ThrottleGraphProps {
  onInfoChange?: (text: string) => void
}

function ThrottleGraph({ onInfoChange }: ThrottleGraphProps) {
  const { fastPoints, slowPoints } = useLapData()
  return (
    <Graph
      label="Throttle"
      dataKey="throttle"
      lines={[
        { points: slowPoints, color: '#0066cc' },
        { points: fastPoints, color: '#cc0000' }
      ]}
      onInfoChange={onInfoChange}
    />
  )
}

export default ThrottleGraph
