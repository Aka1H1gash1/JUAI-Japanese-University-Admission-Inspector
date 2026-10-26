import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import {
  checkRelease,
  downloadRelease,
  RELEASES_URL,
} from './update-client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function createUpdateManager({ getWindow, stopService, record }) {
  const preferencesFile = path.join(
    app.getPath('userData'),
    'update-preferences.json',
  );
  let preferences = { automatic: true, channel: 'preview' };
  try {
    const saved = JSON.parse(await readFile(preferencesFile, 'utf8'));
    preferences = {
      automatic: saved.automatic !== false,
      channel: saved.channel === 'stable' ? 'stable' : 'preview',
    };
  } catch (error) {
    if (error.code !== 'ENOENT')
      record(`更新设置读取失败，使用默认值：${error.message}`);
  }
  let busy = false;
  let progressWindow;
  let controller;
  let disposed = false;
  let lastProgress;
  let started;
  let interval;
  let mustRestart = false;
  let preferencesWrite = Promise.resolve();

  function savePreferences() {
    const saved = JSON.stringify(preferences);
    preferencesWrite = preferencesWrite
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(preferencesFile), { recursive: true });
        const temporary = `${preferencesFile}.tmp`;
        await writeFile(temporary, saved, { mode: 0o600 });
        await rename(temporary, preferencesFile);
      });
    return preferencesWrite;
  }
  const message = (options) => {
    const window = getWindow();
    return window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
  };
  async function reportError(error) {
    record(`检查或下载更新失败：${error.message}`);
    await message({
      type: 'error',
      title: '更新未完成',
      message: '未安装更新，现有资料保持原样。',
      detail: error.message,
      buttons: ['知道了', '打开发布页'],
      defaultId: 0,
      cancelId: 0,
    }).then((answer) => {
      if (answer.response === 1) return shell.openExternal(RELEASES_URL);
    });
  }
  function closeProgress() {
    if (progressWindow && !progressWindow.isDestroyed())
      progressWindow.destroy();
    progressWindow = undefined;
    const parent = getWindow();
    if (parent && !parent.isDestroyed()) parent.setProgressBar(-1);
  }
  const cancel = (event) => {
    if (
      event.sender === progressWindow?.webContents &&
      event.senderFrame === progressWindow.webContents.mainFrame
    )
      controller?.abort();
  };
  ipcMain.on('juai-update:cancel', cancel);

  async function download(update) {
    controller = new AbortController();
    const requestController = controller;
    let downloading = true;
    lastProgress = undefined;
    progressWindow = new BrowserWindow({
      width: 480,
      height: 335,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      parent: getWindow(),
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(here, 'update-preload.cjs'),
      },
    });
    progressWindow.on('closed', () => {
      if (downloading) requestController.abort();
    });
    progressWindow.webContents.on('did-finish-load', () => {
      if (lastProgress)
        progressWindow?.webContents.send('juai-update:progress', lastProgress);
    });
    try {
      await progressWindow.loadFile(path.join(here, 'update-progress.html'));
      progressWindow.show();
      return await downloadRelease(update, {
        directory: path.join(
          app.getPath('userData'),
          'updates',
          update.version,
        ),
        signal: controller.signal,
        onProgress: (state) => {
          lastProgress = state;
          if (progressWindow && !progressWindow.isDestroyed())
            progressWindow.webContents.send('juai-update:progress', state);
          const window = getWindow();
          if (window && !window.isDestroyed())
            window.setProgressBar(state.percent / 100);
        },
      });
    } finally {
      downloading = false;
      closeProgress();
    }
  }

  async function install(file, update) {
    const detail =
      process.platform === 'darwin'
        ? '保存当前编辑后退出 JUAI。打开下载的 DMG，将 JUAI 拖入应用程序并选择替换，再打开新版。资料目录不变；新版本修改数据库前会先完整备份。'
        : '请先保存当前编辑。JUAI 将关闭本地服务并打开 Windows 安装向导。请覆盖安装，无需先卸载；资料目录不变，新版本修改数据库前会先完整备份。';
    const answer = await message({
      type: 'info',
      title: '更新已下载并通过校验',
      message: `JUAI ${update.version} 已准备好`,
      detail,
      buttons: [
        process.platform === 'darwin' ? '退出并打开 DMG' : '退出并安装',
        '稍后安装',
        '显示安装包',
      ],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer.response === 2) {
      shell.showItemInFolder(file);
      return;
    }
    if (answer.response !== 0) return;
    mustRestart = true;
    await stopService();
    if (process.platform === 'win32') {
      const installer = spawn(
        path.join(
          process.env.SystemRoot || String.raw`C:\Windows`,
          'System32/msiexec.exe',
        ),
        ['/i', file, '/norestart'],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        },
      );
      await new Promise((resolve, reject) => {
        installer.once('spawn', resolve);
        installer.once('error', reject);
      });
      installer.unref();
    } else {
      const error = await shell.openPath(file);
      if (error) throw new Error(error);
    }
    app.quit();
  }

  async function check(manual = true) {
    if (disposed || busy) return;
    if (!app.isPackaged) {
      if (manual)
        await message({
          title: '检查更新',
          message: '源码运行不替换开发目录，请使用已安装的桌面版检查更新。',
        });
      return;
    }
    busy = true;
    try {
      const update = await checkRelease({
        currentVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        channel: preferences.channel,
      });
      if (disposed) return;
      if (!update) {
        if (manual)
          await message({
            type: 'info',
            title: '检查更新',
            message: `当前为 JUAI ${app.getVersion()}`,
            detail: '当前更新通道暂无可用的新版本。',
            buttons: ['知道了'],
          });
        return;
      }
      const answer = await message({
        type: 'info',
        title: '发现 JUAI 新版本',
        message: `${app.getVersion()} → ${update.version}${update.prerelease ? '（预览版）' : ''}`,
        detail: `${update.notes}\n\n安装只更新软件，资料保留在本机。`,
        buttons: ['下载更新', '稍后', '查看发布说明'],
        defaultId: 0,
        cancelId: 1,
      });
      if (answer.response === 2) {
        await shell.openExternal(update.releaseUrl);
        return;
      }
      if (answer.response === 0) {
        const file = await download(update);
        if (!disposed && !controller.signal.aborted)
          await install(file, update);
      }
    } catch (error) {
      if (!disposed && !controller?.signal.aborted) {
        if (manual || controller) await reportError(error);
        else record(`自动检查更新暂未完成：${error.message}`);
        if (mustRestart) {
          app.relaunch();
          app.quit();
        }
      }
    } finally {
      controller = undefined;
      busy = false;
    }
  }

  const menu = [
    { id: 'juai-check-updates', label: '检查更新…', click: () => void check() },
    {
      label: '启动时自动检查更新',
      type: 'checkbox',
      checked: preferences.automatic,
      click: (item) => {
        preferences.automatic = item.checked;
        void savePreferences().catch(reportError);
      },
    },
    {
      label: '更新通道',
      submenu: [
        {
          label: '正式版',
          type: 'radio',
          checked: preferences.channel === 'stable',
          click: () => {
            preferences.channel = 'stable';
            void savePreferences().catch(reportError);
          },
        },
        {
          label: '正式版和预览版',
          type: 'radio',
          checked: preferences.channel === 'preview',
          click: () => {
            preferences.channel = 'preview';
            void savePreferences().catch(reportError);
          },
        },
      ],
    },
  ];
  return {
    menu,
    start() {
      started = setTimeout(() => {
        if (preferences.automatic) void check(false);
      }, 15_000);
      interval = setInterval(
        () => {
          if (preferences.automatic) void check(false);
        },
        6 * 60 * 60_000,
      );
      started.unref();
      interval.unref();
    },
    dispose() {
      disposed = true;
      clearTimeout(started);
      clearInterval(interval);
      controller?.abort();
      closeProgress();
      ipcMain.removeListener('juai-update:cancel', cancel);
    },
  };
}
