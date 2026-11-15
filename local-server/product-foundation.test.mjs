/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone server integration tests. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
import { catalogMatches, universityCatalog } from './university-catalog.mjs';

async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'juai-foundation-'));
  let app, base;
  async function start() {
    app = await createLocalApp({ workspace });
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  }
  async function stop() {
    app.close();
    await once(app, 'close');
  }
  await start();
  const call = (route, method = 'GET', body) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const upload = (ownerType, ownerId) =>
    fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType,
            ownerId,
            kind: ownerType === 'workspace' ? 'other' : 'guidelines',
            year: 2027,
            title: '测试原件',
            filename: '申请.txt',
          }),
        ),
      },
      body: '原始文件字节不得改变\n',
    });
  await call('/workspace', 'PUT', {
    revision: 0,
    data: structuredClone(sampleData),
  });
  return { call, upload, stop, start, workspace };
}

test('batches, nullable membership, file references and tenant isolation persist independently of legacy workspace saves', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    const initial = await (await a.call('/workspace')).json();
    const lab = initial.data.labs[0];
    const members = `/foundation/labs/${lab.id}/members`;
    const root = `/foundation/majors/m1/batches`;
    const unknown = await (await a.call(members)).json();
    assert.equal(unknown.total, null);
    assert.equal(unknown.foreign, null);
    assert.equal(
      (
        await a.call(members, 'PUT', {
          version: 0,
          japanese: 5,
          foreign: 2,
          chinese: 3,
        })
      ).status,
      400,
    );
    const composition = await (
      await a.call(members, 'PUT', {
        version: 0,
        japanese: 5,
        foreign: 3,
        chinese: 2,
      })
    ).json();
    assert.equal(composition.total, 8);
    assert.equal(composition.otherForeign, 1);
    assert.equal(
      (await a.call(members, 'PUT', { version: 0, japanese: 6 })).status,
      409,
    );
    const first = await (
      await a.call(root, 'POST', {
        label: '秋季',
        admissionYear: 2027,
        examType: '留学生',
        scope: '修士',
        subjects: '数学',
        consent: 'required',
      })
    ).json();
    const second = await (await a.call(root, 'POST', { label: '冬季' })).json();
    assert.equal(second.admissionYear, null);
    assert.equal(second.subjects, '');
    assert.equal(second.consent, 'unknown');
    assert.deepEqual(await (await b.call(root)).json(), []);
    assert.equal(
      (await b.call(`${root}/${first.id}`, 'PUT', { ...first, label: '越权' }))
        .status,
      404,
    );
    assert.equal(
      (await a.call(`${root}/${first.id}`, 'PUT', { ...first, version: 0 }))
        .status,
      409,
    );
    const file = await (await a.upload('major', 'm1')).json();
    assert.ok(file.id);
    const linked = await (
      await a.call(`${root}/${first.id}`, 'PUT', {
        ...first,
        documentIds: [file.id],
      })
    ).json();
    assert.deepEqual(linked.documentIds, [file.id]);
    assert.equal(
      (await a.call(`/documents/${file.id}`, 'DELETE', {})).status,
      409,
    );
    const general = await (await a.upload('workspace', 'workspace')).json();
    assert.equal(general.ownerType, 'workspace');
    assert.ok(general.id);
    assert.equal(
      (
        await a.call(`${root}/${first.id}`, 'PUT', {
          ...linked,
          documentIds: [general.id],
        })
      ).status,
      403,
    );
    assert.deepEqual(
      (await (await a.call(root)).json()).find((r) => r.id === first.id)
        .documentIds,
      [file.id],
    );
    const old = await (await a.call('/workspace')).json();
    assert.equal(
      (
        await a.call('/workspace', 'PUT', {
          revision: old.revision,
          data: old.data,
        })
      ).status,
      200,
    );
    assert.ok(
      (await (await a.call('/documents/index')).json()).some(
        (d) => d.id === general.id,
      ),
    );
    const stored = await (await a.call('/settings')).json();
    stored.profile.language = 'JLPT 原始记录不可丢失';
    stored.profile.languageRecords = [
      {
        id: 'language-1',
        type: '其他考试',
        result: '合格',
        date: '2028-02-29',
      },
    ];
    const saved = await (await a.call('/settings', 'PUT', stored)).json();
    assert.equal(saved.version, 1);
    const legacy = structuredClone(saved);
    delete legacy.profile.languageRecords;
    assert.equal((await a.call('/settings', 'PUT', legacy)).status, 200);
    assert.equal(
      (await (await a.call('/settings')).json()).profile.languageRecords[0]
        .type,
      '其他考试',
    );
    const invalid = await (await a.call('/settings')).json();
    invalid.profile.languageRecords[0].date = '2027-02-29';
    assert.equal((await a.call('/settings', 'PUT', invalid)).status, 400);
    assert.equal((await a.call('/settings', 'PUT', stored)).status, 409);
    await a.stop();
    await a.start();
    assert.equal((await (await a.call(root)).json()).length, 2);
    assert.equal((await (await a.call(members)).json()).total, 8);
    assert.equal(
      (await (await a.call('/settings')).json()).profile.language,
      'JLPT 原始记录不可丢失',
    );
    assert.equal((await a.call(`/documents/${general.id}/file`)).status, 200);
    const quota = await (await a.call('/storage')).json();
    assert.ok(quota.used > 0);
    assert.equal(quota.quota, null);
    assert.equal(
      (
        await a.call(`${root}/${first.id}`, 'DELETE', {
          version: linked.version,
        })
      ).status,
      200,
    );
    assert.equal(
      (await a.call(`/documents/${file.id}`, 'DELETE', {})).status,
      200,
    );
    const db = new DatabaseSync(path.join(a.workspace, 'workspace.db'), {
      readOnly: true,
    });
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM schema_migrations WHERE version IN (17,18)',
        )
        .get().n,
      2,
    );
    db.close();
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('stable catalog identities reject duplicates and survive old-client saves', async () => {
  const a = await fixture();
  try {
    const entry = universityCatalog.find((u) => u.japaneseName === '東京大学');
    assert.ok(entry);
    assert.equal(catalogMatches(entry.japaneseName)[0].id, entry.id);
    const current = await (await a.call('/workspace')).json();
    current.data.universities[0].catalogId = entry.id;
    current.data.universities[0].schoolCode = entry.schoolCode;
    assert.equal(
      (
        await a.call('/workspace', 'PUT', {
          revision: current.revision,
          data: current.data,
        })
      ).status,
      200,
    );
    const duplicate = await (await a.call('/workspace')).json();
    duplicate.data.universities.push({
      ...duplicate.data.universities[0],
      id: 'duplicate',
    });
    assert.equal(
      (
        await a.call('/workspace', 'PUT', {
          revision: duplicate.revision,
          data: duplicate.data,
        })
      ).status,
      409,
    );
    const legacy = await (await a.call('/workspace')).json();
    delete legacy.data.universities[0].catalogId;
    delete legacy.data.universities[0].schoolCode;
    assert.equal(
      (
        await a.call('/workspace', 'PUT', {
          revision: legacy.revision,
          data: legacy.data,
        })
      ).status,
      200,
    );
    assert.equal(
      (await (await a.call('/workspace')).json()).data.universities[0]
        .catalogId,
      entry.id,
    );
    assert.equal(
      (await (await a.call('/catalog')).json()).universities.length,
      819,
    );
  } finally {
    await a.stop();
  }
});

test('configured platform quota is returned and enforced on the canonical upload path', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'juai-quota-'));
  const app = await createLocalApp({
    workspace,
    platform: {
      authorize: () => true,
      storage: async () => ({ quota: 10, used: 9, remaining: 1 }),
    },
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  try {
    const base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
    assert.deepEqual(await (await fetch(`${base}/storage`)).json(), {
      quota: 10,
      used: 9,
      remaining: 1,
    });
    const response = await fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: 'workspace',
            ownerId: 'workspace',
            kind: 'other',
            title: 'quota',
            filename: 'quota.txt',
            year: 2027,
          }),
        ),
      },
      body: 'over quota bytes',
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await (await fetch(`${base}/documents/index`)).json(), []);
  } finally {
    app.close();
    await once(app, 'close');
  }
});

test('lab description and location survive legacy saves; timeline settings do not toggle application intent', async () => {
  const f = await fixture();
  try {
    const state = await (await f.call('/workspace')).json();
    const lab = state.data.labs[0];
    lab.description = '已核实的研究室介绍';
    lab.location = '真实楼宇信息';
    assert.equal(
      (
        await f.call('/workspace', 'PUT', {
          revision: state.revision,
          data: state.data,
        })
      ).status,
      200,
    );
    const legacy = await (await f.call('/workspace')).json();
    delete legacy.data.labs[0].description;
    delete legacy.data.labs[0].location;
    assert.equal(
      (
        await f.call('/workspace', 'PUT', {
          revision: legacy.revision,
          data: legacy.data,
        })
      ).status,
      200,
    );
    const current = await (await f.call('/workspace')).json();
    assert.equal(current.data.labs[0].description, '已核实的研究室介绍');
    assert.equal(current.data.labs[0].location, '真实楼宇信息');
    const wanted = current.data.labs[0].wantApply;
    const row = current.data.labs[0];
    assert.equal(
      (
        await f.call(`/workspace/labs/${lab.id}`, 'PATCH', {
          revision: current.entityRevisions.labs[lab.id],
          patch: {
            timeline: {
              events: [],
              hiddenSources: [],
              version: 0,
              ...row.timeline,
              autoSyncExams: false,
            },
          },
        })
      ).status,
      200,
    );
    const result = await (await f.call('/workspace')).json();
    assert.equal(result.data.labs[0].wantApply, wanted);
    assert.equal(result.data.labs[0].timeline.autoSyncExams, false);
    result.data.labs[0].description = { bad: true };
    assert.equal(
      (
        await f.call('/workspace', 'PUT', {
          revision: result.revision,
          data: result.data,
        })
      ).status,
      400,
    );
  } finally {
    await f.stop();
  }
});

test('explicit parent deletion releases batch references atomically and retains original file bytes', async () => {
  const f = await fixture();
  try {
    const file = await (await f.upload('major', 'm1')).json();
    const batch = await (
      await f.call('/foundation/majors/m1/batches', 'POST', {
        label: '待删除批次',
        documentIds: [file.id],
      })
    ).json();
    assert.deepEqual(batch.documentIds, [file.id]);
    const state = await (await f.call('/workspace')).json();
    for (const key of [
      'universities',
      'schools',
      'majors',
      'labs',
      'professors',
    ])
      state.data[key] = [];
    assert.equal(
      (
        await f.call('/workspace', 'PUT', {
          revision: state.revision,
          data: state.data,
        })
      ).status,
      200,
    );
    assert.deepEqual(await (await f.call('/documents/index')).json(), []);
    const { readFile } = await import('node:fs/promises');
    assert.ok((await readFile(path.join(f.workspace, file.path))).length > 0);
    const db = new DatabaseSync(path.join(f.workspace, 'workspace.db'), {
      readOnly: true,
    });
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM document_references').get().n,
      0,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
  } finally {
    await f.stop();
  }
});

test('renaming a download preserves document identity, original bytes and references', async () => {
  const f = await fixture();
  try {
    const file = await (await f.upload('major', 'm1')).json();
    const before = await (await f.call(`/documents/${file.id}/file`)).text();
    const renamed = await (
      await f.call(`/documents/${file.id}`, 'PATCH', {
        filename: '申请资料（确认版）.txt',
        title: '新的显示标题',
      })
    ).json();
    assert.equal(renamed.id, file.id);
    assert.equal(renamed.path, file.path);
    assert.equal(renamed.sha256, file.sha256);
    const response = await f.call(`/documents/${file.id}/file`);
    assert.equal(await response.text(), before);
    assert.ok(
      response.headers
        .get('content-disposition')
        .includes(encodeURIComponent('申请资料（确认版）.txt')),
    );
    assert.equal(
      (
        await f.call(`/documents/${file.id}`, 'PATCH', {
          filename: '../other.txt',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call(`/documents/${file.id}`, 'PATCH', {
          filename: 'wrong.pdf',
        })
      ).status,
      400,
    );
  } finally {
    await f.stop();
  }
});
