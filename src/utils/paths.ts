import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Direktori konfigurasi global pengguna (~/.data-studio-mcp)
 */
export function getGlobalConfigDir(): string {
  const dir = path.join(os.homedir(), '.data-studio-mcp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolusi path file sesi auth:
 * 1. process.env.DATA_STUDIO_AUTH_FILE
 * 2. ./.auth/storageState.json (jika ada di direktori kerja saat ini)
 * 3. ~/.data-studio-mcp/storageState.json (default global)
 */
export function getDefaultAuthPath(): string {
  if (process.env.DATA_STUDIO_AUTH_FILE) {
    return path.resolve(process.env.DATA_STUDIO_AUTH_FILE);
  }

  // 1. Cek direktori global user (~/.data-studio-mcp/storageState.json)
  const globalAuth = path.join(getGlobalConfigDir(), 'storageState.json');
  if (fs.existsSync(globalAuth)) {
    return globalAuth;
  }

  // 2. Cek lokal repository (.auth/storageState.json)
  const localAuth = path.resolve(process.cwd(), '.auth/storageState.json');
  if (fs.existsSync(localAuth)) {
    return localAuth;
  }

  return globalAuth;
}

/**
 * Resolusi direktori penyimpanan manifest:
 * 1. process.env.DATA_STUDIO_MANIFESTS_DIR
 * 2. ./manifests (jika ada di direktori kerja saat ini)
 * 3. ~/.data-studio-mcp/manifests (default global)
 */
export function getDefaultManifestsDir(): string {
  if (process.env.DATA_STUDIO_MANIFESTS_DIR) {
    return path.resolve(process.env.DATA_STUDIO_MANIFESTS_DIR);
  }

  const localDir = path.resolve(process.cwd(), 'manifests');
  if (fs.existsSync(localDir)) {
    return localDir;
  }

  const globalDir = path.join(getGlobalConfigDir(), 'manifests');
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }
  return globalDir;
}
