/* oxlint-disable vitest/no-import-node-test -- Local-server integration suites use the built-in Node test runner. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

async function fixture(t) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-stage-'));
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = async (route, method = 'GET', value) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/japangrad${route}`,
      {
        method,
        headers: {
          'X-JapanGrad-Client': '1',
          'Content-Type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      },
    );
    const body = await response.json();
    assert.ok(response.ok, `${method} ${route}: ${JSON.stringify(body)}`);
    return body;
  };
  await request('/workspace', 'PUT', { data: sampleData, revision: 0 });
  const contact = async () => {
    const snapshot = await request('/workspace');
    return snapshot.data.professors[0].contact;
  };
  const status = async () => {
    const current = await contact();
    return current.status;
  };
  const mail = (direction, date) =>
    request('/messages', 'POST', {
      professorId: 'p1',
      direction,
      subject: direction === 'sent' ? '研究室见学のお願い' : 'Re: 见学',
      body: '正文',
      address: '',
      notes: '',
      nextAction: '',
      date,
    });
  const setStatus = async (status) => {
    const current = await contact();
    return request(
      `/professors/p1/experiences/${current.experienceId}`,
      'PATCH',
      { patch: { status }, version: current.version, base: current },
    );
  };
  return { mail, request, server, setStatus, status, workspace };
}

test('mail moves early contact stages forward', async (t) => {
  const { mail, status } = await fixture(t);
  await mail('sent', '2027-01-05T10:00');
  assert.equal(await status(), 'first_sent');
  await mail('received', '2027-01-07T10:00');
  assert.equal(await status(), 'replied');
});

test('a reply marked by hand survives mail edits and deletion', async (t) => {
  const { mail, request, setStatus, status } = await fixture(t);
  const sent = await mail('sent', '2027-01-05T10:00');
  const result = await setStatus('replied');
  assert.equal(result.experience.status, 'replied');

  await mail('sent', '2027-01-09T10:00');
  assert.equal(await status(), 'replied');

  await request(`/messages/${sent.id}`, 'DELETE');
  assert.equal(await status(), 'replied');
});

test('mail evidence still prevents moving a stage backward', async (t) => {
  const { mail, setStatus } = await fixture(t);
  await mail('sent', '2027-01-05T10:00');
  await mail('received', '2027-01-07T10:00');
  const result = await setStatus('not_contacted');
  assert.equal(result.experience.status, 'replied');
});

for (const method of ['PATCH', 'POST']) {
  test(`${method} contact requests preserve workspace edits saved while the body is arriving`, async (t) => {
    const { request, server } = await fixture(t);
    const before = await request('/workspace');
    const contact = before.data.professors[0].contact;
    const route = `/api/japangrad/professors/p1/experiences${method === 'PATCH' ? `/${contact.experienceId}` : ''}`;
    const input =
      method === 'PATCH'
        ? {
            patch: { status: 'replied' },
            version: contact.version,
            base: contact,
          }
        : {
            title: '下一年度',
            expectedExperienceId: contact.experienceId,
            version: contact.version,
          };
    const body = JSON.stringify(input);
    const received = new Promise((resolve) => {
      server.on('request', (req) => {
        if (req.url === route && req.method === method) resolve(req);
      });
    });
    let slow;
    const completed = new Promise((resolve, reject) => {
      slow = httpRequest(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: route,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-JapanGrad-Client': '1',
          },
        },
        (res) => {
          let result = '';
          res.on('data', (chunk) => {
            result += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, body: JSON.parse(result) }),
          );
        },
      );
      slow.on('error', reject);
    });
    t.after(() => slow.destroy());
    slow.write(body.slice(0, 1));
    const incoming = await received;
    // Wait until jsonBody's async iterator is actually waiting for the rest.
    // This establishes the interleaving without relying on a fixed sleep.
    const deadline = Date.now() + 2000;
    while (incoming.listenerCount('readable') === 0 && Date.now() < deadline)
      await setImmediate();
    assert.ok(
      incoming.listenerCount('readable') > 0,
      'server is waiting for the request body',
    );
    assert.equal(incoming.complete, false);
    const changed = structuredClone(before.data);
    changed.universities[0].notes = '保留另一个页面刚保存的备注';
    await request('/workspace', 'PUT', {
      data: changed,
      revision: before.revision,
    });
    slow.end(body.slice(1));
    const result = await completed;
    assert.equal(result.status, method === 'PATCH' ? 200 : 201);
    const after = await request('/workspace');
    assert.equal(
      after.data.universities[0].notes,
      changed.universities[0].notes,
    );
    assert.equal(after.revision, before.revision + 2);
    if (method === 'PATCH')
      assert.equal(after.data.professors[0].contact.status, 'replied');
    else {
      assert.equal(
        after.data.professors[0].contact.experienceTitle,
        '下一年度',
      );
      assert.equal(after.data.professors[0].contactHistory.length, 1);
    }
  });
}

test('a revision conflict rolls back the mail and its workspace changes together', async (t) => {
  const { request, server, workspace } = await fixture(t);
  const before = await request('/workspace');
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  try {
    // Force a revision change between reading the workspace and its conditional
    // update, inside the same transaction as the new mail.
    db.exec(`CREATE TRIGGER simulate_revision_conflict AFTER INSERT ON mail_messages
      BEGIN UPDATE workspace_state SET revision = revision + 1 WHERE id = 1; END;`);
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/japangrad/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JapanGrad-Client': '1',
        },
        body: JSON.stringify({
          professorId: 'p1',
          direction: 'sent',
          subject: '测试',
          body: '正文',
          address: '',
          notes: '',
          nextAction: '',
          date: '2027-01-05T10:00',
        }),
      },
    );
    assert.equal(response.status, 409);
    const after = await request('/workspace');
    assert.equal(after.revision, before.revision);
    assert.deepEqual(after.data, before.data);
    assert.deepEqual(await request('/messages?professorId=p1'), []);
  } finally {
    db.close();
  }
});
