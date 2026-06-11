import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? {} : {}),
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
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('read-file', (_, filePath: string) => {
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('run-coaching', async (_event, { fastPoints, slowPoints }) => {
    const tmpDir = app.getPath('temp')
    const fastPath = join(tmpDir, `coach-fast-${Date.now()}.csv`)
    const slowPath = join(tmpDir, `coach-slow-${Date.now()}.csv`)

    function pointsToCSV(points: { lapDistPct: number; speed: number; brake: number; throttle: number; steeringWheelAngle: number; rpm: number; gear: number; lat: number; lon: number }[]): string {
      const header = 'LapDistPct,Speed,Brake,Throttle,SteeringWheelAngle,RPM,Gear,Lat,Lon,LongAccel,LatAccel'
      const rows = points.map((p) =>
        `${p.lapDistPct},${p.speed},${p.brake},${p.throttle},${p.steeringWheelAngle},${p.rpm},${p.gear},${p.lat},${p.lon},0,0`
      )
      return header + '\n' + rows.join('\n')
    }

    let result: string
    try {
      writeFileSync(fastPath, pointsToCSV(fastPoints))
      writeFileSync(slowPath, pointsToCSV(slowPoints))

      const bridgePath = join(app.getAppPath(), '..', 'project', 'electron_bridge.py')
      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          'python',
          [bridgePath, fastPath, slowPath],
          { timeout: 30000 },
          (err, stdout, stderr) => {
            if (err) reject(err)
            else resolve({ stdout, stderr })
          }
        )
      })
      result = stdout
    } finally {
      try { unlinkSync(fastPath) } catch { /* ignore */ }
      try { unlinkSync(slowPath) } catch { /* ignore */ }
    }

    return JSON.parse(result)
  })

  const tracksDir = join(app.getAppPath(), 'src', 'tracks')

  ipcMain.handle('save-track-overlay', (_, trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) => {
    const trackDir = join(tracksDir, trackName, 'svg')
    mkdirSync(trackDir, { recursive: true })
    writeFileSync(join(trackDir, 'track.svg'), svgContent, 'utf-8')
    writeFileSync(join(trackDir, 'overlay.json'), JSON.stringify(overlay), 'utf-8')
  })

  ipcMain.handle('list-tracks', () => {
    if (!existsSync(tracksDir)) return []
    return readdirSync(tracksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  })

  ipcMain.handle('load-track-overlay', (_, trackName: string) => {
    const trackDir = join(tracksDir, trackName, 'svg')
    const svgContent = readFileSync(join(trackDir, 'track.svg'), 'utf-8')
    const overlay = JSON.parse(readFileSync(join(trackDir, 'overlay.json'), 'utf-8'))
    return { svgContent, overlay }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
