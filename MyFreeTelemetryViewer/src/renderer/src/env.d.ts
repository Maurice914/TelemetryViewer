/// <reference types="vite/client" />

interface TrackOverlay {
  scale: number
  offsetX: number
  offsetY: number
}

interface Window {
  api: {
    saveTrackOverlay: (trackName: string, svgContent: string, overlay: TrackOverlay) => Promise<void>
    listTracks: () => Promise<string[]>
    loadTrackOverlay: (trackName: string) => Promise<{ svgContent: string; overlay: TrackOverlay }>
    generateBoundaries: (points: { lat: number; lon: number; lapDistPct: number; throttle: number; brake: number; speed: number; rpm: number; steeringWheelAngle: number; gear: number; yaw: number; yawRate: number; latAccel: number; longAccel: number }[]) => Promise<{ left: { lat: number; lon: number }[]; right: { lat: number; lon: number }[] }>
    getTrackFingerprints: () => Promise<Record<string, { lat: number; lon: number }[]>>
    saveTrackFingerprint: (trackName: string, points: { lat: number; lon: number }[]) => Promise<boolean>
  }
}
