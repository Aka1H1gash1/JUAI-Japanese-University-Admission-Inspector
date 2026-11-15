/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Isolated HTTP integration suite. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { strFromU8, unzipSync } from 'fflate';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
async function fixture() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-application-'));
  let app, base;
  async function start() {
    app = await createLocalApp({ workspace });
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  }
  await start();
  const call = (url, method = 'GET', data) =>
    fetch(base + url, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  await call('/workspace', 'PUT', {
    revision: 0,
    data: structuredClone(sampleData),
  });
  const state = await (await call('/workspace')).json();
  return {
    workspace,
    call,
    lab: state.data.labs[0],
    async stop() {
      app.close();
      await once(app, 'close');
    },
    async restart() {
      app.close();
      await once(app, 'close');
      await start();
    },
    upload: () =>
      fetch(`${base}/documents`, {
        method: 'POST',
        headers: {
          'X-JapanGrad-Client': '1',
          'X-JapanGrad-Metadata': encodeURIComponent(
            JSON.stringify({
              ownerType: 'workspace',
              ownerId: 'workspace',
              kind: 'other',
              title: '申请资料',
              filename: '同名.txt',
              year: 2027,
            }),
          ),
        },
        body: '日本語中文の資料',
      }),
  };
}
test('independent application materials, references, bounded ZIP and tenant isolation persist', async () => {
  const a = await fixture();
  const b = await fixture();
  try {
    const batch = await (
      await a.call('/foundation/majors/m1/batches', 'POST', {
        label: '申请批次',
        materials: '成绩单\n研究計画書',
      })
    ).json();
    const t = await (
      await a.call(`/applications/labs/${a.lab.id}`, 'POST', {
        batchId: batch.id,
      })
    ).json();
    assert.ok(t.id);
    assert.equal(
      (
        await (
          await a.call(`/applications/labs/${a.lab.id}`, 'POST', {
            batchId: batch.id,
          })
        ).json()
      ).id,
      t.id,
    );
    assert.equal((await b.call(`/applications/${t.id}`)).status, 404);
    let s = await (
      await a.call(`/applications/${t.id}/seed`, 'POST', {})
    ).json();
    assert.equal(s.materials.length, 2);
    s = await (await a.call(`/applications/${t.id}/seed`, 'POST', {})).json();
    assert.equal(s.materials.length, 2);
    const doc = await (await a.upload()).json();
    assert.ok(doc.id);
    let m = s.materials[0];
    s = await (
      await a.call(`/applications/${t.id}/materials/${m.id}`, 'PUT', {
        ...m,
        documentIds: [doc.id],
      })
    ).json();
    m = s.materials[0];
    assert.equal(m.complete, false);
    assert.equal(m.files.length, 1);
    assert.equal((await a.call(`/documents/${doc.id}`, 'DELETE')).status, 409);
    const refs = await (await a.call(`/documents/${doc.id}/references`)).json();
    assert.ok(refs.some((r) => r.type === 'application_material'));
    assert.equal(
      (
        await a.call(`/applications/${t.id}/materials/${m.id}`, 'PUT', {
          ...m,
          version: 0,
        })
      ).status,
      409,
    );
    const secondDoc = await (await a.upload()).json();
    s = await (
      await a.call(`/applications/${t.id}/materials/${m.id}`, 'PUT', {
        ...m,
        documentIds: [doc.id, secondDoc.id],
      })
    ).json();
    m = s.materials[0];
    const zip = await a.call(`/applications/${t.id}/zip`);
    assert.equal(zip.status, 200);
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    assert.equal(Object.keys(files).length, 2);
    assert.equal(new Set(Object.keys(files)).size, 2);
    assert.ok(Object.keys(files).some((name) => name.endsWith('(2).txt')));
    assert.ok(Object.keys(files)[0].includes('成绩单'));
    assert.equal(strFromU8(Object.values(files)[0]), '日本語中文の資料');
    const other = await (
      await a.call(`/applications/labs/${a.lab.id}`, 'POST', {})
    ).json();
    const empty = unzipSync(
      new Uint8Array(
        await (await a.call(`/applications/${other.id}/zip`)).arrayBuffer(),
      ),
    );
    assert.equal(Object.keys(empty).length, 0);
    await a.restart();
    const persisted = await (await a.call(`/applications/${t.id}`)).json();
    assert.ok(persisted.materials[0].files.some((file) => file.id === doc.id));
    const deleted = await (
      await a.call(`/applications/${t.id}/materials/${m.id}`, 'DELETE', {
        version: m.version,
      })
    ).json();
    assert.equal(deleted.materials.length, 1);
    assert.equal((await a.call(`/documents/${doc.id}`, 'DELETE')).status, 200);
    assert.equal(
      (
        await a.call(`/applications/${other.id}/ai`, 'POST', {
          action: 'reply',
          requirements: 'draft',
        })
      ).status,
      400,
    );
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('mail AI sees only explicitly linked target mail and never sends or persists a generated reply', async () => {
  const f = await fixture();
  let db, service;
  try {
    const batch = await (
      await f.call('/foundation/majors/m1/batches', 'POST', {
        label: '另一个批次',
      })
    ).json();
    const a = await (
      await f.call(`/applications/labs/${f.lab.id}`, 'POST', {})
    ).json();
    const b = await (
      await f.call(`/applications/labs/${f.lab.id}`, 'POST', {
        batchId: batch.id,
      })
    ).json();
    const send = async (body) => {
      const response = await f.call('/messages', 'POST', {
        professorId: 'p1',
        direction: 'received',
        subject: '教授回复',
        body,
        address: 'professor@example.test',
        sender: 'professor@example.test',
        recipient: 'student@example.test',
        date: '2027-01-01T12:00',
        notes: '',
        nextAction: '',
        followUpDate: '',
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const other = await send('OTHER_TARGET_SECRET');
    const own = await send('已确认可以提交研究计划。');
    await f.call(`/applications/${a.id}/mail`, 'POST', { messageId: own.id });
    const professorState = await (await f.call('/workspace')).json();
    await f.call(`/applications/${b.id}/contacts`, 'POST', {
      version: b.version,
      professorId: 'p1',
      experienceId: professorState.data.professors[0].contact.experienceId,
    });
    await f.call(`/applications/${b.id}/mail`, 'POST', { messageId: other.id });
    const { DatabaseSync } = await import('node:sqlite');
    const { createApplicationWorkspace } =
      await import('./application-workspace.mjs');
    db = new DatabaseSync(path.join(f.workspace, 'workspace.db'));
    let calls = 0;
    let payload;
    let response;
    const fail = (message, status = 400) => {
      throw Object.assign(new Error(message), { status });
    };
    service = createApplicationWorkspace({
      db,
      fail,
      json: (res, value) => (response = value),
      jsonBody: async () => payload,
      transaction: (fn) => fn(),
      safeFile: () => {},
      ai: {
        resolve: () => ({
          provider: { protocol: 'chat_completions', model: 'isolated-fixture' },
        }),
        credentials: () => 'fixture-only',
      },
      model: async (args) => {
        calls++;
        assert.ok(!args.messages[0].content.includes('OTHER_TARGET_SECRET'));
        assert.ok(args.instructions.includes('不能把推测当作教授承诺'));
        return { text: '仅供用户修改的草稿', calls: [] };
      },
    });
    for (const action of ['mail_summary', 'progress', 'reply']) {
      payload = { action, messageId: own.id, requirements: '礼貌回应' };
      await service.handle(
        { method: 'POST' },
        {},
        `/api/japangrad/applications/${a.id}/ai`,
      );
      assert.equal(response.draft, true);
    }
    payload = {
      action: 'reply',
      messageId: other.id,
      requirements: 'wrong scope',
    };
    await assert.rejects(
      service.handle(
        { method: 'POST' },
        {},
        `/api/japangrad/applications/${a.id}/ai`,
      ),
      { status: 400 },
    );
    assert.equal(calls, 3);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get().n,
      2,
    );
  } finally {
    service?.close();
    db?.close();
    await f.stop();
  }
});

test('each application pins its own contact experience and rejects mail from another experience', async () => {
  const f = await fixture();
  try {
    const a = await (
      await f.call(`/applications/labs/${f.lab.id}`, 'POST', {})
    ).json();
    const initial = await (await f.call('/workspace')).json();
    const old = initial.data.professors[0].contact;
    const batch = await (
      await f.call('/foundation/majors/m1/batches', 'POST', {
        label: '独立联络批次',
      })
    ).json();
    const b = await (
      await f.call(`/applications/labs/${f.lab.id}`, 'POST', {
        batchId: batch.id,
      })
    ).json();
    const response = await f.call('/professors/p1/experiences', 'POST', {
      title: '新目标经历',
      labId: f.lab.id,
      expectedExperienceId: old.experienceId,
      version: old.version,
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.notEqual(created.experience.experienceId, old.experienceId);
    const bound = await f.call(`/applications/${b.id}/contacts`, 'POST', {
      version: b.version,
      professorId: 'p1',
      experienceId: created.experience.experienceId,
    });
    assert.equal(bound.status, 200);
    const first = await (await f.call(`/applications/${a.id}`)).json();
    const second = await (await f.call(`/applications/${b.id}`)).json();
    assert.equal(first.contacts[0].experience_id, old.experienceId);
    assert.equal(
      second.contacts[0].experience_id,
      created.experience.experienceId,
    );
    assert.equal(
      (
        await f.call(`/applications/${b.id}/contacts`, 'POST', {
          version: b.version,
          professorId: 'p1',
          experienceId: old.experienceId,
        })
      ).status,
      409,
    );
    const mail = await (
      await f.call('/messages', 'POST', {
        professorId: 'p1',
        experienceId: old.experienceId,
        direction: 'received',
        subject: '旧批次邮件',
        body: '不能自动带入新目标',
        address: 'professor@example.test',
        date: '2027-01-01T12:00',
        notes: '',
        nextAction: '',
        followUpDate: '',
      })
    ).json();
    assert.ok(mail.id);
    assert.equal(
      (
        await f.call(`/applications/${b.id}/mail`, 'POST', {
          messageId: mail.id,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(`/applications/${a.id}/mail`, 'POST', {
          messageId: mail.id,
        })
      ).status,
      200,
    );
  } finally {
    await f.stop();
  }
});

test('common material templates need explicit scope confirmation and preserve manual edits on regeneration', async () => {
  const f = await fixture();
  try {
    const current = await (await f.call('/workspace')).json();
    current.data.majors[0].applicationMaterials = '愿書\n成績証明書';
    assert.equal(
      (
        await f.call('/workspace', 'PUT', {
          revision: current.revision,
          data: current.data,
        })
      ).status,
      200,
    );
    const t = await (
      await f.call(`/applications/labs/${f.lab.id}`, 'POST', {})
    ).json();
    assert.equal(
      (await f.call(`/applications/${t.id}/seed`, 'POST', {})).status,
      409,
    );
    let state = await (
      await f.call(`/applications/${t.id}/seed`, 'POST', {
        confirmCommon: true,
      })
    ).json();
    assert.equal(state.materials.length, 2);
    const m = state.materials[0];
    state = await (
      await f.call(`/applications/${t.id}/materials/${m.id}`, 'PUT', {
        ...m,
        title: '用户确认的愿书',
        complete: true,
      })
    ).json();
    state = await (
      await f.call(`/applications/${t.id}/seed`, 'POST', {
        confirmCommon: true,
      })
    ).json();
    assert.equal(state.materials.length, 2);
    assert.equal(
      state.materials.find((r) => r.id === m.id).title,
      '用户确认的愿书',
    );
    assert.equal(state.materials.find((r) => r.id === m.id).complete, true);
  } finally {
    await f.stop();
  }
});
