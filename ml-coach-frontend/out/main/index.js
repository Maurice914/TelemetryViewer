"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const child_process = require("child_process");
const utils = require("@electron-toolkit/utils");
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? {} : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.handle("read-file", (_, filePath) => {
    return fs.readFileSync(filePath, "utf-8");
  });
  electron.ipcMain.handle("run-coaching", async (_event, { fastPoints, slowPoints }) => {
    const tmpDir = electron.app.getPath("temp");
    const fastPath = path.join(tmpDir, `coach-fast-${Date.now()}.csv`);
    const slowPath = path.join(tmpDir, `coach-slow-${Date.now()}.csv`);
    function pointsToCSV(points) {
      const header = "LapDistPct,Speed,Brake,Throttle,SteeringWheelAngle,RPM,Gear,Lat,Lon,LongAccel,LatAccel";
      const rows = points.map(
        (p) => `${p.lapDistPct},${p.speed},${p.brake},${p.throttle},${p.steeringWheelAngle},${p.rpm},${p.gear},${p.lat},${p.lon},0,0`
      );
      return header + "\n" + rows.join("\n");
    }
    let result;
    try {
      fs.writeFileSync(fastPath, pointsToCSV(fastPoints));
      fs.writeFileSync(slowPath, pointsToCSV(slowPoints));
      const bridgePath = path.join(electron.app.getAppPath(), "..", "project", "electron_bridge.py");
      const { stdout } = await new Promise((resolve, reject) => {
        child_process.execFile(
          "python",
          [bridgePath, fastPath, slowPath],
          { timeout: 3e4 },
          (err, stdout2, stderr) => {
            if (err) reject(err);
            else resolve({ stdout: stdout2, stderr });
          }
        );
      });
      result = stdout;
    } finally {
      try {
        fs.unlinkSync(fastPath);
      } catch {
      }
      try {
        fs.unlinkSync(slowPath);
      } catch {
      }
    }
    return JSON.parse(result);
  });
  const tracksDir = path.join(electron.app.getAppPath(), "src", "tracks");
  electron.ipcMain.handle("save-track-overlay", (_, trackName, svgContent, overlay) => {
    const trackDir = path.join(tracksDir, trackName, "svg");
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, "track.svg"), svgContent, "utf-8");
    fs.writeFileSync(path.join(trackDir, "overlay.json"), JSON.stringify(overlay), "utf-8");
  });
  electron.ipcMain.handle("list-tracks", () => {
    if (!fs.existsSync(tracksDir)) return [];
    return fs.readdirSync(tracksDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  });
  electron.ipcMain.handle("load-track-overlay", (_, trackName) => {
    const trackDir = path.join(tracksDir, trackName, "svg");
    const svgContent = fs.readFileSync(path.join(trackDir, "track.svg"), "utf-8");
    const overlay = JSON.parse(fs.readFileSync(path.join(trackDir, "overlay.json"), "utf-8"));
    return { svgContent, overlay };
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
