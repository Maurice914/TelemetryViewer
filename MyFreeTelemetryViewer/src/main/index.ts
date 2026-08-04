import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err))
  process.on('uncaughtException', (err) => console.error('Uncaught exception:', err))

  electronApp.setAppUserModelId('com.maurice914.telemetryviewer')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const devDir = join(app.getAppPath(), 'src', 'tracks')
  const prodDir = join(process.resourcesPath, 'src', 'tracks')

  function getTracksDir(): string {
    return existsSync(devDir) ? devDir : prodDir
  }

  ipcMain.handle('save-track-overlay', (_: unknown, trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) => {
    const dir = join(getTracksDir(), trackName, 'svg')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'track.svg'), svgContent, 'utf-8')
    writeFileSync(join(dir, 'overlay.json'), JSON.stringify(overlay), 'utf-8')
  })

  ipcMain.handle('list-tracks', () => {
    const dir = getTracksDir()
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  })

  ipcMain.handle('load-track-overlay', (_, trackName: string) => {
    const dir = join(getTracksDir(), trackName, 'svg')
    const svgContent = readFileSync(join(dir, 'track.svg'), 'utf-8')
    const overlay = JSON.parse(readFileSync(join(dir, 'overlay.json'), 'utf-8'))
    return { svgContent, overlay }
  })

  ipcMain.handle('get-track-fingerprints', () => {
    const result: Record<string, { lat: number; lon: number }[]> = {}
    const readInto = (path: string, override: boolean) => {
      if (!existsSync(path)) return
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, { lat: number; lon: number }[]>
        for (const [key, value] of Object.entries(parsed)) {
          if (override) result[key] = value
          else if (!(key in result)) result[key] = value
        }
      } catch {
        /* ignore */
      }
    }
    readInto(join(getTracksDir(), 'tracks.json'), false)
    readInto(join(app.getPath('userData'), 'tracks.json'), true)
    return result
  })

  ipcMain.handle('save-track-fingerprint', (_event, trackName: string, points: { lat: number; lon: number }[]) => {
    const path = is.dev
      ? join(getTracksDir(), 'tracks.json')
      : join(app.getPath('userData'), 'tracks.json')
    let data: Record<string, { lat: number; lon: number }[]> = {}
    try {
      if (existsSync(path)) data = JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      /* ignore */
    }
    data[trackName] = points
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    return true
  })

  ipcMain.handle('generate-boundaries', async (_event, points: { lat: number; lon: number; lapDistPct: number; throttle: number; brake: number; speed: number; rpm: number; steeringWheelAngle: number; gear: number; yaw: number; yawRate: number; latAccel: number; longAccel: number }[]) => {
    const tmpDir = join(app.getPath('temp'), 'telemetry-viewer')
    mkdirSync(tmpDir, { recursive: true })
    const csvPath = join(tmpDir, `telemetry-${Date.now()}.csv`)
    const outputPath = join(tmpDir, `boundaries-${Date.now()}.csv`)

    const header = 'Speed,LapDistPct,Lat,Lon,Brake,Throttle,RPM,SteeringWheelAngle,Gear,Clutch,ABSActive,DRSActive,LatAccel,LongAccel,VertAccel,Yaw,YawRate,PositionType'
    const rows = points.map((p) =>
      `${p.speed},${p.lapDistPct},${p.lat},${p.lon},${p.brake},${p.throttle},${p.rpm},${p.steeringWheelAngle},${p.gear},0,false,false,${p.latAccel},${p.longAccel},0,${p.yaw},${p.yawRate},3`
    )
    const csvContent = header + '\n' + rows.join('\n')
    writeFileSync(csvPath, csvContent, 'utf-8')

    const exeDir = is.dev
      ? join(app.getAppPath(), 'resources')
      : process.resourcesPath
    const exePath = join(exeDir, 'predict_boundaries.exe')

    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          exePath,
          ['--telemetry', csvPath, '--output', outputPath],
          { timeout: 60000 },
          (err) => {
            if (err) reject(err)
            else resolve()
          }
        )
      })

      const csvText = readFileSync(outputPath, 'utf-8')
      if (is.dev) {
        try { writeFileSync(join(getTracksDir(), 'boundaries.csv'), csvText, 'utf-8') } catch { /* ignore */ }
      }

      const lines = csvText.trim().split('\n')
      if (lines.length < 2) throw new Error('No boundary data generated')
      const hdrs = lines[0].split(',').map((h) => h.trim())
      const latLIdx = hdrs.indexOf('boundary_L_lat')
      const lonLIdx = hdrs.indexOf('boundary_L_lon')
      const latRIdx = hdrs.indexOf('boundary_R_lat')
      const lonRIdx = hdrs.indexOf('boundary_R_lon')

      const left: { lat: number; lon: number }[] = []
      const right: { lat: number; lon: number }[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',')
        if (cols.length <= Math.max(latLIdx, lonLIdx, latRIdx, lonRIdx)) continue
        const ll = parseFloat(cols[latLIdx])
        const rl = parseFloat(cols[lonLIdx])
        const rlt = parseFloat(cols[latRIdx])
        const rln = parseFloat(cols[lonRIdx])
        if (!isNaN(ll) && !isNaN(rl)) left.push({ lat: ll, lon: rl })
        if (!isNaN(rlt) && !isNaN(rln)) right.push({ lat: rlt, lon: rln })
      }

      return { left, right }
    } finally {
      try { unlinkSync(csvPath) } catch { /* ignore */ }
      try { unlinkSync(outputPath) } catch { /* ignore */ }
    }
  })

  createWindow()

  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall()
    })
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
