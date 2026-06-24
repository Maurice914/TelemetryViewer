import { contextBridge, ipcRenderer } from 'electron'

const api = {
  saveTrackOverlay: (trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) =>
    ipcRenderer.invoke('save-track-overlay', trackName, svgContent, overlay),
  listTracks: () => ipcRenderer.invoke('list-tracks'),
  loadTrackOverlay: (trackName: string) => ipcRenderer.invoke('load-track-overlay', trackName),
  runCoaching: (data: { fastPoints: unknown[]; slowPoints: unknown[] }) =>
    ipcRenderer.invoke('run-coaching', data)
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
