import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceDirectory =
  process.argv[2] || path.join(here, 'resources/service');
const workspace = await mkdtemp(path.join(tmpdir(), 'juai-package-check-'));
const executable = process.platform === 'win32' ? 'node.exe' : 'node';
const child = fork(path.join(serviceDirectory, 'service.mjs'), [], {
  execPath: path.join(serviceDirectory, 'runtime', executable),
  execArgv: ['--disable-warning=ExperimentalWarning'],
  env: { ...process.env, JAPANGRAD_WORKSPACE: workspace },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
const exited = new Promise((resolve) => child.once('close', resolve));
let startupTimeout;
try {
  const origin = await new Promise((resolve, reject) => {
    startupTimeout = setTimeout(
      () => reject(new Error('Packaged service startup timed out')),
      30_000,
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`Service exited during startup: ${code}`)),
    );
    child.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(startupTimeout);
        resolve(message.origin);
      }
      if (message.type === 'startup-error') reject(new Error(message.message));
    });
  });
  const page = await fetch(`${origin}/welcome`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="app"/);
  const response = await fetch(`${origin}/api/japangrad/workspace`);
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.deepEqual(snapshot.data.universities, []);
  assert.deepEqual(snapshot.data.labs, []);
  child.send({ type: 'shutdown' });
  const code = await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Service did not stop cleanly')),
        10_000,
      ).unref(),
    ),
  ]);
  assert.equal(code, 0);
  // oxlint-disable-next-line no-console -- Report the packaged-service verification result to the release job.
  console.log(
    'Packaged runtime, SQLite, frontend and graceful shutdown verified with an empty temporary workspace.',
  );
} finally {
  clearTimeout(startupTimeout);
  if (child.exitCode === null) child.kill();
  await exited;
  await rm(workspace, { recursive: true, force: true });
}
