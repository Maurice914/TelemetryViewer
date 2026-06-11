import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  saveTrackOverlay: (trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) =>
    ipcRenderer.invoke('save-track-overlay', trackName, svgContent, overlay),
  listTracks: () => ipcRenderer.invoke('list-tracks'),
  loadTrackOverlay: (trackName: string) => ipcRenderer.invoke('load-track-overlay', trackName),
  runCoaching: (data: { fastPoints: unknown[]; slowPoints: unknown[] }) =>
    ipcRenderer.invoke('run-coaching', data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
