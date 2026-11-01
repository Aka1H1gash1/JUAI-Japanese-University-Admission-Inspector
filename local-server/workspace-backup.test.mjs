/* oxlint-disable vitest/no-import-node-test -- Local-server integration suites use the built-in Node test runner. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

test('manual backup copies the database and files outside the workspace', async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'japangrad-backup-'));
  const workspace = path.join(parent, 'JapanGradWorkspace');
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (route, method = 'GET', value) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/japangrad${route}`, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });

  const saved = await request('/workspace', 'PUT', {
    data: sampleData,
    revision: 0,
  });
  assert.equal(saved.status, 200);
  await mkdir(path.join(workspace, 'majors', 'm1'), { recursive: true });
  await writeFile(path.join(workspace, 'majors', 'm1', 'note.txt'), 'kept');
  await writeFile(path.join(workspace, '.juai-browser-instance.lock'), '1');

  const infoResponse = await request('/workspace/backup');
  const info = await infoResponse.json();
  const realParent = await realpath(parent);
  assert.equal(info.root, path.join(realParent, 'JapanGradWorkspace.backups'));

  const created = await request('/workspace/backup', 'POST', {});
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.ok(result.path.startsWith(info.root));

  const names = await readdir(result.path);
  assert.ok(names.includes('workspace.db'));
  assert.ok(!names.includes('.juai-browser-instance.lock'));
  assert.equal(
    await readFile(path.join(result.path, 'majors', 'm1', 'note.txt'), 'utf8'),
    'kept',
  );
  const copy = new DatabaseSync(path.join(result.path, 'workspace.db'), {
    readOnly: true,
  });
  try {
    const row = copy
      .prepare('SELECT name FROM universities WHERE id=?')
      .get('u1');
    assert.equal(row.name, '测试大学');
    assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    copy.close();
  }
  const marker = JSON.parse(
    await readFile(path.join(result.path, 'JUAI_BACKUP.json'), 'utf8'),
  );
  assert.equal(marker.kind, 'manual');

  const missingHeader = await fetch(
    `http://127.0.0.1:${server.address().port}/api/japangrad/workspace/backup`,
    { method: 'POST' },
  );
  assert.equal(missingHeader.status, 403);
});
