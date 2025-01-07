import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import express from 'express'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'

const server = express();
let resourcesPath = resolve(__dirname, '../../resources');
resourcesPath = resourcesPath.replace('app.asar', 'app.asar.unpacked');
const serverAddress = 'http://127.0.0.1:3000';
const urdfPath = resolve(resourcesPath, 'urdf');
const urdfAddress = `${serverAddress}/urdf`;

console.log('resourcesPath', resourcesPath);

server.use(express.static(resourcesPath));

function createWindow() {
  // 获取窗口的宽度和高度
  let { width, height } = screen.getPrimaryDisplay().workAreaSize
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.8),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })


  // 启动静态文件服务器
  server.listen(3000, () => {
    console.log('Static file server running at http://localhost:3000');
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const renderPath = join(__dirname, '../renderer');
    const htmlFilePath = join(renderPath, 'index.html');
    mainWindow.loadFile(htmlFilePath)
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
