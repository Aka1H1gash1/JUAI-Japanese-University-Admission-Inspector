import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../local-server/package.json'));
const { _electron: electron } = require('playwright-core');
const executable = process.argv[2];
if (!executable) throw new Error('Specify the packaged JUAI executable.');
const workspace = await mkdtemp(path.join(tmpdir(), 'juai-window-check-'));
let application;
try {
  application = await electron.launch({
    executablePath: path.resolve(executable),
    env: { ...process.env, JAPANGRAD_WORKSPACE: workspace },
    timeout: 30_000,
  });
  const window = await application.firstWindow();
  await window.locator('#welcome-title').waitFor({ timeout: 30_000 });
  assert.match(window.url(), /\/welcome$/);
  await window.getByRole('link', { name: '进入工作区' }).click();
  await window.waitForURL('**/japan-grad/overview', { timeout: 30_000 });
  await window
    .getByRole('heading', { name: '申请总览。', exact: true })
    .waitFor();
  const isolation = await application.evaluate(({ BrowserWindow }) => {
    const options =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: options.sandbox,
      contextIsolation: options.contextIsolation,
      nodeIntegration: options.nodeIntegration,
    };
  });
  assert.deepEqual(isolation, {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  assert.equal(
    await application.evaluate(({ Menu }) =>
      Boolean(Menu.getApplicationMenu().getMenuItemById('juai-check-updates')),
    ),
    true,
  );
  const snapshot = await window.evaluate(async () => {
    const response = await fetch('/api/japangrad/workspace');
    return response.json();
  });
  assert.deepEqual(snapshot.data.universities, []);
  await application.close();
  application = undefined;
  // oxlint-disable-next-line no-console -- Publish the native window verification result to the release job.
  console.log(
    'Packaged Electron window, welcome navigation, overview and renderer isolation verified.',
  );
} finally {
  if (application) await application.close();
  await rm(workspace, { recursive: true, force: true });
}
