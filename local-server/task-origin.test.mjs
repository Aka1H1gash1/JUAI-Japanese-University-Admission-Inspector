/* oxlint-disable vitest/no-import-node-test -- Local-server integration suites use the built-in Node test runner. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { planningError, tagImportedTasks } from './planning-fields.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

const lab = (tasks) => ({
  id: 'l1',
  majorId: 'm1',
  name: '语言研究室',
  japaneseName: '',
  research: '',
  website: '',
  notes: '',
  examNotes: '',
  applicationNotes: '',
  wantApply: true,
  tasks,
});
const task = (overrides) => ({
  id: 't1',
  title: '研究计划书',
  kind: 'material',
  progress: 60,
  dueDate: '',
  notes: '',
  ...overrides,
});

async function start(t, workspace) {
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return async (route, method = 'GET', value, headers = {}) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/japangrad${route}`,
      {
        method,
        headers: {
          'X-JapanGrad-Client': '1',
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      },
    );
    const body = await response.json();
    assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(body)}`);
    return body;
  };
}

test('task bookkeeping fields are validated', () => {
  const check = (value) =>
    planningError({ labs: [lab([task(value)])], professors: [] });
  assert.equal(check({ progress: 100, progressBeforeDone: 60 }), '');
  assert.equal(check({ importedFrom: 'writtenDate' }), '');
  assert.notEqual(check({ progressBeforeDone: 100 }), '');
  assert.notEqual(check({ progressBeforeDone: 1.5 }), '');
  assert.notEqual(check({ importedFrom: 'somewhere' }), '');
});

test('old imported tasks are tagged from their notes only once', () => {
  const data = {
    labs: [
      lab([
        task({ id: 'a', notes: '智能导入自募集要项 · 笔试日期' }),
        task({ id: 'b', notes: '自己写的备注' }),
        task({
          id: 'c',
          notes: '很长的材料说明\n智能导入自募集要项 · 出愿材料',
        }),
        task({
          id: 'd',
          importedFrom: 'resultDate',
          notes: '智能导入自募集要项 · 笔试日期',
        }),
      ]),
    ],
  };
  assert.equal(tagImportedTasks(data), true);
  assert.deepEqual(
    data.labs[0].tasks.map((item) => item.importedFrom),
    ['writtenDate', undefined, 'applicationMaterials', 'resultDate'],
  );
  assert.equal(tagImportedTasks(data), false);
});

test('existing workspaces are tagged when the service starts', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-origin-'));
  const legacy = structuredClone(sampleData);
  legacy.labs = [
    lab([
      task({
        kind: 'todo',
        progress: 0,
        dueDate: '2027-08-20',
        notes: '智能导入自募集要项 · 笔试日期',
      }),
    ]),
  ];
  // A real pre-relational workspace, rather than editing the new schema as
  // though it still contained a JSON blob.
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,datetime('now'));
    CREATE TABLE workspace_data(id INTEGER PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE documents(id TEXT PRIMARY KEY,owner_type TEXT NOT NULL,owner_id TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX documents_owner ON documents(owner_type,owner_id);
    CREATE TABLE messages(id TEXT PRIMARY KEY,professor_id TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX messages_professor ON messages(professor_id);`);
  db.prepare('INSERT INTO workspace_data VALUES(1,?,1)').run(
    JSON.stringify(legacy),
  );
  db.close();

  const second = await start(t, workspace);
  const snapshot = await second('/workspace');
  assert.equal(snapshot.data.labs[0].tasks[0].importedFrom, 'writtenDate');
});

test('progress before ticking is saved in the workspace and kept across Agent writes', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-origin-'));
  const request = await start(t, workspace);
  const data = structuredClone(sampleData);
  data.labs = [
    lab([
      task({ progress: 100, progressBeforeDone: 60 }),
      task({
        id: 't2',
        title: '参加笔试',
        kind: 'todo',
        progress: 0,
        dueDate: '2027-08-20',
        importedFrom: 'writtenDate',
      }),
    ]),
  ];
  await request('/workspace', 'PUT', { data, revision: 0 });
  const saved = await request('/workspace');
  assert.equal(saved.data.labs[0].tasks[0].progressBeforeDone, 60);

  const created = await request('/analysis/connections', 'POST', {
    name: '测试 Agent',
    majorIds: ['m1'],
    informationAccess: 'write',
    writableKinds: ['lab'],
  });
  const auth = {
    Authorization: `Bearer ${created.config.env.JUAI_AGENT_TOKEN}`,
  };
  const current = await request(
    '/agent/information/file?path=labs/l1.json',
    'GET',
    undefined,
    auth,
  );
  const content = JSON.parse(current.content);
  // An Agent only sees the open fields and writes the task list back without them.
  content.data.tasks = content.data.tasks.map(
    ({ id, title, kind, progress, dueDate }) => ({
      id,
      title: kind === 'todo' ? '参加笔试（Agent 改了名称）' : title,
      kind,
      progress,
      dueDate,
      notes: 'Agent 写的备注',
    }),
  );
  await request(
    '/agent/information/write',
    'POST',
    {
      path: 'labs/l1.json',
      expectedHash: current.sha256,
      requestKey: 'agent-write-1',
      summary: '更新研究室任务',
      content: JSON.stringify(content),
    },
    auth,
  );
  const after = await request('/workspace');
  const [material, todo] = after.data.labs[0].tasks;
  assert.equal(material.progressBeforeDone, 60);
  assert.equal(todo.importedFrom, 'writtenDate');
  assert.equal(todo.title, '参加笔试（Agent 改了名称）');
});
