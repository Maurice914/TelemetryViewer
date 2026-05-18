export interface Point {
  lat: number
  lon: number
  lapDistPct: number
  throttle: number
  brake: number
  speed: number
  timeDelta: number | null
}

export function parseCSV(csvText: string): Point[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const latIdx = headers.indexOf('Lat')
  const lonIdx = headers.indexOf('Lon')
  const lapDistPctIdx = headers.indexOf('LapDistPct')
  const throttleIdx = headers.indexOf('Throttle')
  const brakeIdx = headers.indexOf('Brake')
  const speedIdx = headers.indexOf('Speed')

  if (latIdx === -1 || lonIdx === -1 || lapDistPctIdx === -1 || throttleIdx === -1 || brakeIdx === -1 || speedIdx === -1) return []

  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const lat = parseFloat(cols[latIdx])
    const lon = parseFloat(cols[lonIdx])
    const lapDistPct = parseFloat(cols[lapDistPctIdx])
    const throttle = parseFloat(cols[throttleIdx])
    const brake = parseFloat(cols[brakeIdx])
    const speed = parseFloat(cols[speedIdx])
    return { lat, lon, lapDistPct, throttle, brake, speed, timeDelta: null }
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lon) && !isNaN(p.lapDistPct) && !isNaN(p.throttle) && !isNaN(p.brake) && !isNaN(p.speed))
}
