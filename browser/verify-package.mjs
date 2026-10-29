import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const payload = path.resolve(process.argv[2] || 'browser/dist/payload');
const workspace = await mkdtemp(path.join(tmpdir(), 'juai-browser-verify-'));
const node = path.join(
  payload,
  'runtime',
  process.platform === 'win32' ? 'node.exe' : 'node',
);
const launcher = path.join(payload, 'app/launcher.mjs');
const child = spawn(node, [launcher], {
  env: {
    ...process.env,
    JAPANGRAD_WORKSPACE: workspace,
    JUAI_NO_BROWSER: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

async function waitForState() {
  const target = path.join(workspace, '.juai-browser-instance.json');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(
        `JUAI launcher exited early (${child.exitCode}).\n${output}`,
      );
    try {
      return JSON.parse(await readFile(target, 'utf8'));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`JUAI launcher did not become ready.\n${output}`);
}

try {
  const state = await waitForState();
  const runtimeResponse = await fetch(
    `${state.origin}/api/japangrad/runtime/browser`,
  );
  if (!runtimeResponse.ok)
    throw new Error(`Runtime endpoint returned ${runtimeResponse.status}.`);
  const runtime = await runtimeResponse.json();
  if (!runtime.browserMode || runtime.version !== '1.2.0')
    throw new Error(`Unexpected runtime status: ${JSON.stringify(runtime)}`);
  const workspaceResponse = await fetch(
    `${state.origin}/api/japangrad/workspace`,
  );
  if (!workspaceResponse.ok)
    throw new Error(`Workspace endpoint returned ${workspaceResponse.status}.`);
  if (runtime.mobile.available) {
    const enabled = await fetch(
      `${state.origin}/api/japangrad/runtime/mobile`,
      {
        body: JSON.stringify({ enabled: true }),
        headers: {
          'Content-Type': 'application/json',
          'X-JapanGrad-Client': '1',
        },
        method: 'POST',
      },
    );
    const mobile = await enabled.json();
    if (!enabled.ok || !mobile.enabled || !mobile.urls?.length)
      throw new Error(
        `Mobile gateway did not start: ${JSON.stringify(mobile)}`,
      );
    const unauthorized = await fetch(
      mobile.urls[0].replace(/\/_juai\/connect\?.*$/, '/welcome'),
    );
    if (unauthorized.status !== 403)
      throw new Error('Mobile gateway accepted a request without its token.');
  }
  const shutdown = await fetch(
    `${state.origin}/api/japangrad/runtime/shutdown`,
    {
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      method: 'POST',
    },
  );
  if (!shutdown.ok) throw new Error('Runtime shutdown endpoint failed.');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Launcher did not exit.')),
      5000,
    );
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code && code !== 0)
        reject(new Error(`Launcher exited with ${code}.`));
      else resolve();
    });
  });
  // oxlint-disable-next-line no-console -- Package verification reports a concise CI result.
  console.log(
    'PASS: packaged browser runtime, workspace, mobile gateway and shutdown',
  );
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await rm(workspace, { force: true, recursive: true });
}
