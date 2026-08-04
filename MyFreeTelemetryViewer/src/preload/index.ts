import { contextBridge, ipcRenderer } from 'electron'

const api = {
  saveTrackOverlay: (trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) =>
    ipcRenderer.invoke('save-track-overlay', trackName, svgContent, overlay),
  listTracks: () => ipcRenderer.invoke('list-tracks'),
  loadTrackOverlay: (trackName: string) => ipcRenderer.invoke('load-track-overlay', trackName),
  runCoaching: (data: { fastPoints: unknown[]; slowPoints: unknown[] }) =>
    ipcRenderer.invoke('run-coaching', data),
  generateBoundaries: (points: { lat: number; lon: number; lapDistPct: number; throttle: number; brake: number; speed: number; rpm: number; steeringWheelAngle: number; gear: number; yaw: number; yawRate: number; latAccel: number; longAccel: number }[]) =>
    ipcRenderer.invoke('generate-boundaries', points),
  getTrackFingerprints: () => ipcRenderer.invoke('get-track-fingerprints'),
  saveTrackFingerprint: (trackName: string, points: { lat: number; lon: number }[]) =>
    ipcRenderer.invoke('save-track-fingerprint', trackName, points)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
