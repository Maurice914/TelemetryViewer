import { useLapData } from '../../contexts/LapDataContext'
import Graph from './Graph'

interface BrakeGraphProps {
  onInfoChange?: (text: string) => void
}

function BrakeGraph({ onInfoChange }: BrakeGraphProps) {
  const { fastPoints, slowPoints } = useLapData()
  return (
    <Graph
      label="Brake"
      dataKey="brake"
      lines={[
        { points: slowPoints, color: '#0066cc' },
        { points: fastPoints, color: '#cc0000' },
      ]}
      onInfoChange={onInfoChange}
    />
  )
}

export default BrakeGraph
