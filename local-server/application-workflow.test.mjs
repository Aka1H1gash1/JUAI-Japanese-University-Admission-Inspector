/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Isolated SQLite integration test. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  createApplicationWorkflow,
  migrateApplicationWorkflow,
} from './application-workflow.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

test('workflow migration preserves records; stages persist independently, CAS rejects stale updates, drafts never become sent mail', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-workflow-'));
  const app = await createLocalApp({ workspace });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  const call = async (url, method = 'GET', data) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const v = await r.json();
    assert.ok(r.ok, JSON.stringify(v));
    return v;
  };
  let other, target;
  try {
    await call('/workspace', 'PUT', {
      revision: 0,
      data: structuredClone(sampleData),
    });
    const state = await call('/workspace');
    const lab = state.data.labs[0];
    target = await call(`/applications/labs/${lab.id}`, 'POST', {});
    const batch = await call('/foundation/majors/m1/batches', 'POST', {
      label: '隔离批次',
      admissionYear: 2028,
      examType: '修士',
    });
    other = await call(`/applications/labs/${lab.id}`, 'POST', {
      batchId: batch.id,
    });
  } finally {
    app.close();
    await once(app, 'close');
  }
  let db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec('PRAGMA foreign_keys=ON');
  const original = db.prepare('SELECT * FROM contact_experiences').all();
  const originalTargets = db.prepare('SELECT * FROM application_targets').all();
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  const service = () =>
    createApplicationWorkflow({
      db,
      fail,
      transaction(fn) {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = fn();
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    });
  try {
    migrateApplicationWorkflow(db);
    migrateApplicationWorkflow(db);
    assert.deepEqual(
      db.prepare('SELECT * FROM application_targets').all(),
      originalTargets,
    );
    let api = service();
    assert.equal(api.read(target.id).currentStage, null);
    let state = api.update(target.id, {
      version: 0,
      stage: 'consent',
      makeCurrent: true,
      fields: { consentDate: '2026-11-18', notes: '原文待核对' },
    });
    assert.equal(state.currentStage, 'consent');
    assert.equal(state.version, 1);
    assert.throws(
      () =>
        api.update(target.id, {
          version: 0,
          stage: 'apply',
          makeCurrent: true,
        }),
      (e) => e.status === 409,
    );
    state = api.update(target.id, {
      version: 1,
      stage: 'apply',
      makeCurrent: false,
      fields: { submissionNotes: '准备寄送' },
    });
    assert.equal(state.currentStage, 'consent');
    assert.equal(state.stages.consent.notes, '原文待核对');
    assert.equal(state.stages.apply.submissionNotes, '准备寄送');
    assert.throws(() =>
      api.update(target.id, {
        version: 2,
        stage: 'apply',
        makeCurrent: true,
        fields: { consentDate: '2027-01-01' },
      }),
    );
    assert.throws(() =>
      api.update(target.id, {
        version: 2,
        stage: 'apply',
        makeCurrent: true,
        fields: { submissionDate: '2027-02-30' },
      }),
    );
    assert.equal(api.read(other.id).currentStage, null);
    const draft = api.saveDraft(target.id, {
      subject: '未发送草稿',
      body: '人工编辑内容',
      recipient: 'teacher@example.invalid',
    }).drafts[0];
    assert.equal(draft.status, 'draft');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0);
    assert.throws(
      () =>
        api.saveDraft(other.id, {
          id: draft.id,
          version: 1,
          subject: '越界',
          body: 'x',
          recipient: '',
        }),
      (e) => e.status === 404,
    );
    api.saveDraft(target.id, {
      id: draft.id,
      version: 1,
      subject: draft.subject,
      body: '修改后草稿',
      recipient: draft.recipient,
    });
    assert.throws(
      () => api.deleteDraft(target.id, draft.id, 1),
      (e) => e.status === 409,
    );
    assert.throws(
      () =>
        api.saveDraft(target.id, {
          subject: '附件',
          body: '',
          recipient: '',
          documentIds: ['missing'],
        }),
      (e) => e.status === 403,
    );
    db.close();
    db = new DatabaseSync(path.join(workspace, 'workspace.db'));
    db.exec('PRAGMA foreign_keys=ON');
    api = service();
    const restored = api.read(target.id);
    assert.equal(restored.currentStage, 'consent');
    assert.equal(restored.stages.apply.submissionNotes, '准备寄送');
    assert.equal(restored.drafts[0].body, '修改后草稿');
    api.deleteDraft(target.id, draft.id, 2);
    assert.equal(api.read(target.id).drafts.length, 0);
    assert.deepEqual(
      db.prepare('SELECT * FROM contact_experiences').all(),
      original,
    );
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    db.close();
  }
});
