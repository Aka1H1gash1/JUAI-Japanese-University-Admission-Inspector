/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone HTTP migration regression. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

test('lab facts migration preserves existing records and older clients preserve confirmed composition', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-lab-facts-'));
  let app, base;
  async function start() {
    app = await createLocalApp({ workspace });
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  }
  const call = async (method = 'GET', data) => {
    const r = await fetch(`${base}/workspace`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: r.status, value: await r.json() };
  };
  try {
    await start();
    assert.equal(
      (await call('PUT', { data: structuredClone(sampleData), revision: 0 }))
        .status,
      200,
    );
    const before = (await call()).value;
    app.close();
    await once(app, 'close');
    const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
    for (const c of [
      'foreign_student_status',
      'foreign_student_source',
      'foreign_student_notes',
    ])
      db.exec(`ALTER TABLE labs DROP COLUMN ${c}`);
    db.exec('DELETE FROM schema_migrations WHERE version=16');
    db.close();
    await start();
    const current = (await call()).value;
    assert.equal(current.data.labs[0].id, before.data.labs[0].id);
    current.data.labs[0].foreignStudentStatus = 'yes';
    current.data.labs[0].foreignStudentSource = 'https://example.com/members';
    current.data.labs[0].foreignStudentNotes =
      '成员页已明确标注，2026-11核对。';
    assert.equal(
      (await call('PUT', { data: current.data, revision: current.revision }))
        .status,
      200,
    );
    const saved = (await call()).value;
    const old = structuredClone(saved.data);
    delete old.labs[0].foreignStudentStatus;
    delete old.labs[0].foreignStudentSource;
    delete old.labs[0].foreignStudentNotes;
    assert.equal(
      (await call('PUT', { data: old, revision: saved.revision })).status,
      200,
    );
    const latest = (await call()).value;
    assert.equal(latest.data.labs[0].foreignStudentStatus, 'yes');
    assert.equal(
      latest.data.labs[0].foreignStudentSource,
      'https://example.com/members',
    );
    latest.data.labs[0].foreignStudentStatus = 'maybe';
    assert.equal(
      (await call('PUT', { data: latest.data, revision: latest.revision }))
        .status,
      400,
    );
  } finally {
    if (app) {
      app.close();
      await once(app, 'close');
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
