/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone Node HTTP and SQLite regression tests. */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { blankCollectionEntity } from './collection-fields.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
import { createWorkspaceRepository } from './workspace-repository.mjs';
import { CHILDREN, CORE } from './workspace-schema.mjs';
test('append preserves all retained rows, rejects stale/duplicate writes and rolls back invalid parents', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'juai-append-'));
  const app = await createLocalApp({ workspace });
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec('PRAGMA foreign_keys=ON');
  const repo = createWorkspaceRepository({
    db,
    workspace,
    fail: (message, status) => {
      throw Object.assign(new Error(message), { status });
    },
    validateExplorer: () => {},
  });
  try {
    repo.replace(
      {
        ...Object.fromEntries(Object.keys(CORE).map((name) => [name, []])),
        ...structuredClone(sampleData),
        professors: [
          {
            ...blankCollectionEntity(
              'professor',
              'existing-person',
              'm1',
              'existing-lab',
            ),
            name: '已有老师',
          },
        ],
        labs: [
          {
            ...blankCollectionEntity('lab', 'existing-lab', 'm1'),
            name: '已有研究室',
            wantApply: true,
            mainProfessorId: 'existing-person',
            tasks: [
              {
                id: 'existing-task',
                kind: 'todo',
                title: '保留待办',
                progress: 40,
              },
            ],
          },
        ],
      },
      repo.revision(),
    );
    const tables = Object.keys({ ...CORE, ...CHILDREN });
    const before = Object.fromEntries(
      tables.map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()]),
    );
    const lab = {
      ...blankCollectionEntity('lab', 'new-lab', 'm1'),
      name: '新增研究室',
    };
    const revision = repo.revision();
    assert.equal(
      repo.appendCollectionImport({ labs: [lab] }, revision),
      revision + 1,
    );
    for (const name of tables) {
      const after = db.prepare(`SELECT * FROM ${name}`).all();
      for (const row of before[name])
        assert.ok(
          after.some((item) => JSON.stringify(item) === JSON.stringify(row)),
          `${name} retained row changed`,
        );
    }
    assert.throws(
      () =>
        repo.appendCollectionImport(
          { labs: [{ ...lab, id: 'another' }] },
          revision,
        ),
      { status: 409 },
    );
    assert.throws(
      () => repo.appendCollectionImport({ labs: [lab] }, revision + 1),
      { status: 409 },
    );
    assert.throws(() =>
      repo.appendCollectionImport(
        { labs: [{ ...lab, id: 'invalid', majorId: 'missing' }] },
        revision + 1,
      ),
    );
    assert.equal(
      db.prepare('SELECT id FROM labs WHERE id=?').get('invalid'),
      undefined,
    );
    assert.equal(repo.revision(), revision + 1);
    assert.equal(repo.appendCollectionImport({}, revision + 1), revision + 1);
    db.exec('BEGIN IMMEDIATE');
    repo.appendCollectionImport(
      { labs: [{ ...lab, id: 'rolled-back' }] },
      revision + 1,
    );
    db.exec('ROLLBACK');
    assert.equal(
      db.prepare('SELECT id FROM labs WHERE id=?').get('rolled-back'),
      undefined,
    );
  } finally {
    db.close();
    app.close();
  }
});
