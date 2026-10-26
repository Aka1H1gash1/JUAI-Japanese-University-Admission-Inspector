import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function browserProfileDirectories(
  platform = process.platform,
  home = homedir(),
  local = process.env.LOCALAPPDATA,
) {
  if (platform === 'darwin')
    return [
      'Google/Chrome',
      'Google/Chrome Beta',
      'Google/Chrome Canary',
      'Chromium',
      'Microsoft Edge',
    ].map((folder) => path.join(home, 'Library/Application Support', folder));
  if (platform === 'win32') {
    const base = local || path.join(home, 'AppData/Local');
    return [
      'Google/Chrome',
      'Google/Chrome Beta',
      'Google/Chrome SxS',
      'Chromium',
      'Microsoft/Edge',
    ].map((folder) => path.join(base, folder, 'User Data'));
  }
  return [
    'google-chrome',
    'google-chrome-beta',
    'chromium',
    'microsoft-edge',
  ].map((folder) => path.join(home, '.config', folder));
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), 800);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export function localBrowserSocket(raw, port) {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'ws:' ||
      !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
      Number(url.port) !== port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/devtools\/browser(?:\/[\w-]+)?$/.test(url.pathname)
    )
      return undefined;
    return `ws://127.0.0.1:${port}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export async function discoverCollectionBrowser(
  configuredPort = 0,
  { directories = browserProfileDirectories(), request = fetch } = {},
) {
  // Chrome's inspect-based remote debugging is WebSocket-only. /json/version may return 404.
  const discoveredPorts = [];
  for (const directory of directories) {
    try {
      const descriptor = await readFile(
        path.join(directory, 'DevToolsActivePort'),
        'utf8',
      );
      const lines = descriptor.trim().split(/\r?\n/);
      const port = Number(lines[0]);
      if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65_535 ||
        (configuredPort && port !== configuredPort)
      )
        continue;
      discoveredPorts.push(port);
      const endpoint = localBrowserSocket(
        `ws://127.0.0.1:${port}${lines[1]?.trim() || ''}`,
        port,
      );
      if (endpoint && (await listening(port)))
        return {
          endpoint,
          port,
          name: directory.includes('Edge') ? 'Microsoft Edge' : 'Chrome',
        };
    } catch {}
  }
  const ports = configuredPort
    ? [configuredPort]
    : [...discoveredPorts, 9222, 9333];
  for (const port of new Set(ports)) {
    try {
      const response = await request(`http://127.0.0.1:${port}/json/version`, {
        redirect: 'error',
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) continue;
      const value = await response.json();
      const endpoint = localBrowserSocket(value.webSocketDebuggerUrl, port);
      if (endpoint)
        return {
          endpoint,
          port,
          name: String(value.Browser || 'Chrome').slice(0, 120),
        };
    } catch {}
  }
  return null;
}
