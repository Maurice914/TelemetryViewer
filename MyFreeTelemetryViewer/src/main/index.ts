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

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('run-coaching', async (_event, { fastPoints, slowPoints }) => {
    const tmpDir = join(app.getPath('temp'), 'ml-coach-frontend')
    mkdirSync(tmpDir, { recursive: true })
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

      const pythonDir = is.dev
        ? join(app.getAppPath(), 'resources', 'python')
        : join(process.resourcesPath, 'python')
      const exePath = join(pythonDir, 'electron_bridge.exe')
      const pyPath = join(pythonDir, 'electron_bridge.py')
      const bridgePath = existsSync(exePath) ? exePath : 'python'
      const bridgeArgs = existsSync(exePath) ? [] : [pyPath]
      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          bridgePath,
          [...bridgeArgs, fastPath, slowPath],
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

  const devDir = join(app.getAppPath(), 'src', 'tracks')
  const prodDir = join(process.resourcesPath, 'src', 'tracks')

  function getTracksDir(): string {
    return existsSync(devDir) ? devDir : prodDir
  }

  ipcMain.handle('save-track-overlay', (_, trackName: string, svgContent: string, overlay: { scale: number; offsetX: number; offsetY: number }) => {
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
