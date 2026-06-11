"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  readFile: (filePath) => electron.ipcRenderer.invoke("read-file", filePath),
  saveTrackOverlay: (trackName, svgContent, overlay) => electron.ipcRenderer.invoke("save-track-overlay", trackName, svgContent, overlay),
  listTracks: () => electron.ipcRenderer.invoke("list-tracks"),
  loadTrackOverlay: (trackName) => electron.ipcRenderer.invoke("load-track-overlay", trackName),
  runCoaching: (data) => electron.ipcRenderer.invoke("run-coaching", data)
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
