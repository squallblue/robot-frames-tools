
import fse from 'fs-extra'
import { resourcesPath } from './resource'
import { join, resolve } from 'path'
import { ipcMain } from 'electron'
import { shell } from 'electron'

const urdfPath = resolve(resourcesPath, 'urdf');

function getAllURDF () {
  // 获取指定目录下以 .urdf 结尾的文件
  const files = fse.readdirSync(urdfPath);
  return files.filter(file => file.endsWith('.urdf'));
}

function openURDFDir () {
  // 打开文件夹
  shell.openPath(urdfPath)
}

ipcMain.handle('getAllURDF', async () => {
  return getAllURDF()
})

ipcMain.handle('openURDFDir', async () => {
  openURDFDir()
})

export { getAllURDF }