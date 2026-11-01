import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

async function fixture(t, shared = false) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-write-'));
  const servers = [];
  async function start() {
    const server = await createLocalApp({ workspace });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    return (route, method = 'GET', value) =>
      fetch(`http://127.0.0.1:${server.address().port}/api/japangrad${route}`, {
        method,
        headers: {
          'X-JapanGrad-Client': '1',
          'Content-Type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
  }
  t.after(async () => {
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });
  const request = await start();
  const other = shared ? await start() : request;
  const put = (client, data, revision) =>
    client('/workspace', 'PUT', { data, revision });
  return { request, other, put, workspace };
}

for (const shared of [false, true]) {
  test(`same revision permits exactly one write (${shared ? 'two server instances' : 'queued requests'})`, async (t) => {
    const { request, other, put, workspace } = await fixture(t, shared);
    // Many awaited file checks keep both instances inside validation before either commits.
    const data = structuredClone(sampleData);
    const logoId = '11111111-1111-4111-8111-111111111111.png';
    await mkdir(path.join(workspace, 'university-logos'));
    await writeFile(
      path.join(workspace, 'university-logos', logoId),
      'fixture',
    );
    data.universities = Array.from({ length: 80 }, (_, i) => ({
      ...data.universities[0],
      id: i ? `extra-${i}` : 'u1',
      logoId,
    }));
    assert.equal((await put(request, data, 0)).status, 200);
    const current = await (await request('/workspace')).json();
    const first = structuredClone(current.data);
    const second = structuredClone(current.data);
    first.universities[0].notes = 'first';
    second.universities[0].notes = 'second';
    const responses = await Promise.all([
      put(request, first, current.revision),
      put(other, second, current.revision),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const saved = await (await request('/workspace')).json();
    assert.equal(saved.revision, current.revision + 1);
    const winner = responses.findIndex((r) => r.status === 200);
    assert.deepEqual(saved.data, (await responses[winner].json()).data);
    assert.equal(
      saved.data.universities[0].notes,
      winner === 0 ? 'first' : 'second',
    );
    // A rejected request must not poison the queue.
    assert.equal((await put(request, saved.data, saved.revision)).status, 200);
  });
}

test('older pages preserve omitted admissions, contact, tasks and ranking fields', async (t) => {
  const { request, put } = await fixture(t);
  assert.equal((await put(request, sampleData, 0)).status, 200);
  let current = await (await request('/workspace')).json();
  const data = current.data;
  Object.assign(data.universities[0], {
    japanRank: '12',
    japanRankYear: '2026',
    japanRankSource: 'https://example.ac.jp/rank',
    prefecture: '东京都',
  });
  data.majors[0].examHistory = [
    {
      id: 'exam1',
      year: '2027',
      session: '',
      examDate: '',
      writtenDate: '2027-06-01',
      interviewDate: '',
      resultDate: '',
      subjects: '数学',
      sourceUrl: '',
      notes: '',
    },
  ];
  data.majors[0].applicationMaterials = '研究计划书';
  data.professors[0].contact.notes = '保留联络笔记';
  data.labs[0].tasks = [
    {
      id: 'task1',
      kind: 'material',
      title: '成绩单',
      progress: 20,
      dueDate: '',
      notes: '原件',
    },
  ];
  let response = await put(request, data, current.revision);
  assert.equal(response.status, 200, await response.clone().text());
  current = await response.json();
  const old = structuredClone(current.data);
  for (const key of [
    'japanRank',
    'japanRankYear',
    'japanRankSource',
    'prefecture',
  ])
    delete old.universities[0][key];
  for (const key of ['examHistory', 'applicationMaterials'])
    delete old.majors[0][key];
  for (const key of ['contact', 'contactHistory'])
    delete old.professors[0][key];
  for (const key of [
    'tasks',
    'timeline',
    'mainProfessorId',
    'languageRequirements',
  ])
    delete old.labs[0][key];
  old.universities[0].notes = '旧页面的新编辑';
  response = await put(request, old, current.revision);
  assert.equal(response.status, 200, await response.clone().text());
  const saved = (await response.json()).data;
  assert.deepEqual(
    saved.majors[0].examHistory,
    current.data.majors[0].examHistory,
  );
  assert.equal(saved.majors[0].applicationMaterials, '研究计划书');
  assert.deepEqual(
    saved.professors[0].contact,
    current.data.professors[0].contact,
  );
  assert.deepEqual(saved.labs[0].tasks, current.data.labs[0].tasks);
  assert.equal(saved.universities[0].japanRank, '12');
  assert.equal(saved.universities[0].prefecture, '东京都');
  assert.equal(saved.universities[0].notes, '旧页面的新编辑');
});
