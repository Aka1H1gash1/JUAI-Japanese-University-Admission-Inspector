import { execFile, fork } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';

import { createUpdateManager } from './update-manager.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const serviceDirectory = app.isPackaged
  ? path.join(process.resourcesPath, 'service')
  : path.join(directory, 'resources/service');
let mainWindow;
let service;
let origin;
let quitting = false;
let stopped = false;
let logPath;
let updater;
let protectionWindow;
let workspaceBackup = '';
const execute = promisify(execFile);

function nodeRuntime() {
  return path.join(
    serviceDirectory,
    'runtime',
    process.platform === 'win32' ? 'node.exe' : 'node',
  );
}

async function workspacePreflight(workspace, mode) {
  const environment = { ...process.env, JAPANGRAD_WORKSPACE: workspace };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  const result = await execute(
    nodeRuntime(),
    [
      '--disable-warning=ExperimentalWarning',
      path.join(serviceDirectory, 'workspace-upgrade.mjs'),
      mode,
      app.getVersion(),
    ],
    { env: environment, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(result.stdout);
}

async function stopServiceForUpdate() {
  if (!service || stopped) return;
  quitting = true;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error('本地服务未正常关闭，已停止安装更新。请退出应用后重试。'),
        ),
      10_000,
    );
    service.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (service.connected) service.send({ type: 'shutdown' });
  });
}

function record(value) {
  if (logPath)
    appendFileSync(logPath, `${new Date().toISOString()} ${value}\n`);
}

function externalUrl(value) {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:', 'mailto:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function localUrl(value) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

async function openExternal(value) {
  if (externalUrl(value)) {
    try {
      await shell.openExternal(value);
    } catch (error) {
      record(`打开外部链接失败：${error.message}`);
    }
  }
}

const webPreferences = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
};

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!localUrl(url)) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (localUrl(url))
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { webPreferences },
      };
    void openExternal(url);
    return { action: 'deny' };
  });
});

function startService(workspace) {
  return new Promise((resolve, reject) => {
    const environment = { ...process.env, JAPANGRAD_WORKSPACE: workspace };
    delete environment.NODE_OPTIONS;
    delete environment.NODE_PATH;
    // Finder does not inherit the user's terminal PATH.
    environment.PATH = [
      path.join(serviceDirectory, 'runtime'),
      environment.PATH || '',
      ...(process.platform === 'darwin'
        ? ['/opt/homebrew/bin', '/usr/local/bin']
        : []),
    ].join(path.delimiter);
    const executable = process.platform === 'win32' ? 'node.exe' : 'node';
    service = fork(path.join(serviceDirectory, 'service.mjs'), [], {
      execPath: path.join(serviceDirectory, 'runtime', executable),
      execArgv: ['--disable-warning=ExperimentalWarning'],
      cwd: serviceDirectory,
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const timer = setTimeout(
      () => reject(new Error('本地服务启动超时。')),
      30_000,
    );
    service.stdout.on('data', (chunk) => record(chunk.toString().trim()));
    service.stderr.on('data', (chunk) => record(chunk.toString().trim()));
    service.on('message', (message) => {
      if (message?.type === 'startup-error') {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
      if (
        message?.type === 'ready' &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(message.origin)
      ) {
        clearTimeout(timer);
        resolve(message.origin);
      }
    });
    service.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    service.on('exit', (code) => {
      clearTimeout(timer);
      stopped = true;
      if (!quitting) {
        reject(new Error(`本地服务已退出（${code}）。`));
        if (mainWindow) {
          dialog.showErrorBox(
            'JUAI 本地服务已停止',
            `请重新启动应用。日志：${logPath}`,
          );
          app.quit();
        }
      }
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'JUAI · 日本大学院申请工作台',
    width: 1440,
    height: 960,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#f0f2fa',
    show: false,
    webPreferences,
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
  await mainWindow.loadURL(`${origin}/welcome`);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  updater?.dispose();
  quitting = true;
  if (!service || stopped) return;
  event.preventDefault();
  service.once('exit', () => app.quit());
  if (service.connected) service.send({ type: 'shutdown' });
  setTimeout(() => {
    if (!stopped) service.kill();
  }, 6000).unref();
});

async function initialize() {
  app.setAppUserModelId('com.juai.admission-inspector');
  app.setAboutPanelOptions({
    applicationName: 'JUAI',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 Aka1H1gash1',
  });
  const logDirectory = app.getPath('logs');
  mkdirSync(logDirectory, { recursive: true });
  logPath = path.join(logDirectory, 'juai-desktop.log');
  const workspace =
    process.env.JAPANGRAD_WORKSPACE ||
    path.join(app.getPath('documents'), 'JapanGradWorkspace');
  let markedVersion;
  try {
    markedVersion = JSON.parse(
      await readFile(
        path.join(workspace, '.juai-desktop-version.json'),
        'utf8',
      ),
    ).version;
  } catch {}
  if (
    existsSync(path.join(workspace, 'workspace.db')) &&
    markedVersion !== app.getVersion()
  ) {
    protectionWindow = new BrowserWindow({
      width: 470,
      height: 195,
      resizable: false,
      closable: false,
      autoHideMenuBar: true,
      webPreferences,
    });
    await protectionWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>JUAI · 保护本地资料</title><body><h2>正在备份现有资料</h2><p>完成后继续启动。论文和文件较多时，请稍候。</p><p>此步骤不会替换原始资料。</p></body></html>')}`,
    );
  }
  const protection = await workspacePreflight(workspace, 'prepare');
  workspaceBackup = protection.backup || '';
  if (workspaceBackup) record(`版本升级前的完整资料备份：${workspaceBackup}`);
  updater = await createUpdateManager({
    getWindow: () => mainWindow,
    stopService: stopServiceForUpdate,
    record,
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: '文件',
        submenu: [
          {
            label: '打开资料文件夹',
            click: () => void shell.openPath(workspace),
          },
          {
            label: '打开日志文件夹',
            click: () => void shell.openPath(logDirectory),
          },
          { type: 'separator' },
          { role: 'quit', label: '退出 JUAI' },
        ],
      },
      { role: 'editMenu', label: '编辑' },
      { role: 'viewMenu', label: '视图' },
      { role: 'windowMenu', label: '窗口' },
      {
        role: 'help',
        label: '帮助',
        submenu: [
          ...updater.menu,
          { type: 'separator' },
          {
            label: '使用说明与反馈',
            click: () =>
              void openExternal(
                'https://github.com/Aka1H1gash1/JUAI-Japanese-University-Admission-Inspector',
              ),
          },
        ],
      },
    ]),
  );
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) => {
      callback(
        localUrl(contents.getURL()) &&
          permission === 'clipboard-sanitized-write',
      );
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      localUrl(requestingOrigin) && permission === 'clipboard-sanitized-write',
  );
  try {
    origin = await startService(workspace);
    await workspacePreflight(workspace, 'mark');
    await createWindow();
    if (protectionWindow && !protectionWindow.isDestroyed())
      protectionWindow.destroy();
    protectionWindow = undefined;
    updater.start();
    app.on('activate', () => {
      if (!mainWindow && !quitting) void createWindow();
    });
  } catch (error) {
    record(error.stack || error.message);
    dialog.showErrorBox(
      'JUAI 启动失败',
      `${error.message}\n\n${workspaceBackup ? `升级前备份：${workspaceBackup}\n` : ''}日志：${logPath}`,
    );
    app.quit();
  }
}

// Electron waits for its ESM entry module before emitting ready; do not await it at top level.
if (app.requestSingleInstanceLock()) {
  void app
    .whenReady()
    .then(initialize)
    .catch((error) => {
      record(error.stack || error.message);
      dialog.showErrorBox('JUAI 启动失败', error.message);
      app.quit();
    });
} else app.quit();
