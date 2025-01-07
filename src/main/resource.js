
import { resolve } from 'path'
let resourcesPath = resolve(__dirname, '../../resources');
resourcesPath = resourcesPath.replace('app.asar', 'app.asar.unpacked');

export {
  resourcesPath
}