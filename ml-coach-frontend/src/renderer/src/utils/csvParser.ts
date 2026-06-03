export interface Point {
  lat: number
  lon: number
  lapDistPct: number
  throttle: number
  brake: number
  speed: number
  rpm: number
  steeringWheelAngle: number
  gear: number
  yaw: number
  yawRate: number
  latAccel: number
  longAccel: number
  timeDelta: number | null
}

export function parseCSV(csvText: string): Point[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const latIdx = headers.indexOf('lat')
  const lonIdx = headers.indexOf('lon')
  const lapDistPctIdx = headers.indexOf('lapdistpct')
  const throttleIdx = headers.indexOf('throttle')
  const brakeIdx = headers.indexOf('brake')
  const speedIdx = headers.indexOf('speed')
  const rpmIdx = headers.indexOf('rpm')
  const steeringIdx = headers.indexOf('steeringwheelangle')
  const gearIdx = headers.indexOf('gear')
  const yawIdx = headers.indexOf('yaw')
  const yawRateIdx = headers.indexOf('yawrate')
  const latAccelIdx = headers.indexOf('lataccel')
  const longAccelIdx = headers.indexOf('longaccel')

  if (
    latIdx === -1 ||
    lonIdx === -1 ||
    lapDistPctIdx === -1 ||
    throttleIdx === -1 ||
    brakeIdx === -1 ||
    speedIdx === -1
  )
    return []

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(',')
      const lat = parseFloat(cols[latIdx])
      const lon = parseFloat(cols[lonIdx])
      const lapDistPct = parseFloat(cols[lapDistPctIdx])
      const throttle = parseFloat(cols[throttleIdx])
      const brake = parseFloat(cols[brakeIdx])
      const speed = parseFloat(cols[speedIdx])
      const rpm = rpmIdx !== -1 ? parseFloat(cols[rpmIdx]) : 0
      const steeringWheelAngle = steeringIdx !== -1 ? parseFloat(cols[steeringIdx]) : 0
      const gear = gearIdx !== -1 ? parseFloat(cols[gearIdx]) : 0
      const yaw = yawIdx !== -1 ? parseFloat(cols[yawIdx]) : 0
      const yawRate = yawRateIdx !== -1 ? parseFloat(cols[yawRateIdx]) : 0
      const latAccel = latAccelIdx !== -1 ? parseFloat(cols[latAccelIdx]) : 0
      const longAccel = longAccelIdx !== -1 ? parseFloat(cols[longAccelIdx]) : 0
      return {
        lat,
        lon,
        lapDistPct,
        throttle,
        brake,
        speed,
        rpm,
        steeringWheelAngle,
        gear,
        yaw,
        yawRate,
        latAccel,
        longAccel,
        timeDelta: null
      }
    })
    .filter(
      (p) =>
        !isNaN(p.lat) &&
        !isNaN(p.lon) &&
        !isNaN(p.lapDistPct) &&
        !isNaN(p.throttle) &&
        !isNaN(p.brake) &&
        !isNaN(p.speed)
    )
}
