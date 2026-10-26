import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
// oxlint-disable-next-line vitest/no-import-node-test -- Browser discovery checks run directly on the bundled Node runtime.
import { test } from 'node:test';

import {
  discoverCollectionBrowser,
  localBrowserSocket,
} from './browser-discovery.mjs';
import { createCollectionBrowser } from './collection-web.mjs';

test('Chrome inspect mode is discovered through its WebSocket descriptor even when HTTP discovery is 404', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'juai-chrome-'));
  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await writeFile(
      path.join(directory, 'DevToolsActivePort'),
      `${port}\r\n/devtools/browser/test-session-id\r\n`,
    );
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    assert.equal(response.status, 404);
    for (const configured of [0, port]) {
      const found = await discoverCollectionBrowser(configured, {
        directories: [directory],
      });
      assert.equal(
        found.endpoint,
        `ws://127.0.0.1:${port}/devtools/browser/test-session-id`,
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
test('legacy HTTP discovery still works, and remote or page-level sockets are rejected', async () => {
  const found = await discoverCollectionBrowser(9222, {
    directories: [],
    request: async () =>
      Response.json({
        Browser: 'Chrome/155',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/legacy',
      }),
  });
  assert.equal(found.endpoint, 'ws://127.0.0.1:9222/devtools/browser/legacy');
  assert.equal(
    localBrowserSocket('ws://example.com:9222/devtools/browser/id', 9222),
    undefined,
  );
  assert.equal(
    localBrowserSocket('ws://127.0.0.1:9222/devtools/page/id', 9222),
    undefined,
  );
  assert.equal(
    localBrowserSocket(
      'ws://user:pass@127.0.0.1:9222/devtools/browser/id',
      9222,
    ),
    undefined,
  );
});
test('detected ports are not reported connected until an actual browser connection succeeds', async () => {
  let connections = 0;
  let connected = true;
  const browser = createCollectionBrowser({
    discover: async () => ({
      endpoint: 'ws://127.0.0.1:9222/devtools/browser/test',
      port: 9222,
      name: 'Chrome',
    }),
    connect: async (_endpoint, options) => {
      connections++;
      assert.equal(options.noDefaults, true);
      assert.equal(options.timeout, 60_000);
      return {
        isConnected: () => connected,
        version: () => '155.0',
        close: async () => {
          connected = false;
        },
      };
    },
  });
  try {
    const before = await browser.status();
    assert.equal(before.detected, true);
    assert.equal(before.available, false);
    const after = await browser.configure(0);
    assert.equal(after.available, true);
    await browser.configure(0);
    assert.equal(
      connections,
      1,
      'Repeated checks should reuse an authorized connection',
    );
  } finally {
    await browser.close();
  }
});
