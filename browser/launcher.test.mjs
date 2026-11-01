/* oxlint-disable vitest/no-import-node-test -- The packaged launcher is verified with the built-in Node test runner. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startJuaiBrowser } from './launcher.mjs';

test('browser launcher proxies the workspace, reuses one instance and protects mobile access', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-browser-test-'));
  const runtime = await startJuaiBrowser({ launchBrowser: false, workspace });
  try {
    const statusResponse = await fetch(
      `${runtime.origin}/api/japangrad/runtime/browser`,
    );
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.browserMode, true);
    assert.equal(status.version, '1.3.0');
    assert.equal(status.workspace, workspace);

    const workspaceResponse = await fetch(
      `${runtime.origin}/api/japangrad/workspace`,
    );
    assert.equal(workspaceResponse.status, 200);

    const second = await startJuaiBrowser({ launchBrowser: false, workspace });
    assert.equal(second.existing, true);
    assert.equal(second.origin, runtime.origin);

    const missingMarker = await fetch(
      `${runtime.origin}/api/japangrad/runtime/mobile`,
      {
        body: JSON.stringify({ enabled: true }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    assert.equal(missingMarker.status, 403);

    if (runtime.mobileStatus().available) {
      const mobile = await runtime.startMobile();
      assert.equal(mobile.enabled, true);
      assert.ok(mobile.urls.length > 0);
      const supplied = new URL(mobile.urls[0]);
      const gateway = `http://127.0.0.1:${supplied.port}`;
      const unauthorized = await fetch(`${gateway}/welcome`);
      assert.equal(unauthorized.status, 403);

      const connected = await fetch(
        `${gateway}${supplied.pathname}${supplied.search}`,
        { redirect: 'manual' },
      );
      assert.equal(connected.status, 302);
      assert.equal(connected.headers.get('location'), '/welcome');
      const cookie = connected.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie?.startsWith('juai_mobile='));
      const mobilePage = await fetch(`${gateway}/welcome`, {
        headers: { Cookie: cookie },
      });
      assert.equal(mobilePage.status, 200);
      const mobileWorkspace = await fetch(
        `${gateway}/api/japangrad/workspace`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(mobileWorkspace.status, 200);
      const mobileRuntime = await fetch(
        `${gateway}/api/japangrad/runtime/browser`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(mobileRuntime.status, 200);
      const mobileRuntimeStatus = await mobileRuntime.json();
      assert.equal(mobileRuntimeStatus.remote, true);
      const mobileShutdown = await fetch(
        `${gateway}/api/japangrad/runtime/shutdown`,
        {
          headers: { Cookie: cookie, 'X-JapanGrad-Client': '1' },
          method: 'POST',
        },
      );
      assert.equal(mobileShutdown.status, 403);
    }
  } finally {
    await runtime.shutdown();
    await rm(workspace, { force: true, recursive: true });
  }
});

test('browser launcher prefers a stable port and falls back when it is taken', async () => {
  const first = await mkdtemp(path.join(tmpdir(), 'juai-browser-port-a-'));
  const second = await mkdtemp(path.join(tmpdir(), 'juai-browser-port-b-'));
  const preferredPort = 20_000 + Math.floor(Math.random() * 20_000);
  const a = await startJuaiBrowser({
    launchBrowser: false,
    preferredPort,
    workspace: first,
  });
  try {
    assert.equal(a.origin, `http://127.0.0.1:${preferredPort}`);
    const b = await startJuaiBrowser({
      launchBrowser: false,
      preferredPort,
      workspace: second,
    });
    try {
      assert.notEqual(b.origin, a.origin);
      const response = await fetch(`${b.origin}/api/japangrad/workspace`);
      assert.equal(response.status, 200);
    } finally {
      await b.shutdown();
    }
  } finally {
    await a.shutdown();
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test('a migrated workspace can restart with the same application version', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-browser-restart-'));
  let runtime;
  try {
    runtime = await startJuaiBrowser({
      launchBrowser: false,
      preferredPort: 0,
      workspace,
    });
    await runtime.shutdown();
    runtime = undefined;
    runtime = await startJuaiBrowser({
      launchBrowser: false,
      preferredPort: 0,
      workspace,
    });
    const response = await fetch(`${runtime.origin}/api/japangrad/workspace`);
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.ok(snapshot.entityRevisions);
  } finally {
    if (runtime) await runtime.shutdown();
    await rm(workspace, { recursive: true, force: true });
  }
});
