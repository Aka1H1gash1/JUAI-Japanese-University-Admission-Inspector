/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- This standalone Node server test runs without frontend or Vitest dependencies. */
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import { createLocalApp } from './server.mjs';

import { sampleData, sampleDocx, samplePdf } from './test-fixtures.mjs';
import { request as httpRequest } from 'node:http';

test('local workspace: disk files, pairing, persistence, validation and safe deletion', async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), 'japangrad-server-test-'),
  );
  let server;
  let base;
  async function start() {
    server = await createLocalApp({ workspace });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/japangrad`;
  }
  async function close() {
    server.close();
    await once(server, 'close');
  }
  const request = (route, method = 'GET', value, headers = {}) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  const upload = (kind, year = 2027, questionId = '') =>
    fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: kind === 'paper' ? 'professor' : 'major',
            ownerId: kind === 'paper' ? 'p1' : 'm1',
            kind,
            year,
            title: kind,
            filename: '../../招生.pdf',
            questionId,
          }),
        ),
      },
      body: samplePdf(),
    });
  await start();
  try {
    assert.equal(
      (await (await request('/workspace')).json()).initialized,
      false,
    );
    assert.equal(
      (await request('/workspace', 'PUT', { data: sampleData, revision: 0 }))
        .status,
      200,
    );
    assert.equal(
      (await request('/workspace', 'PUT', { data: sampleData, revision: 0 }))
        .status,
      409,
    );
    const invalid = structuredClone(sampleData);
    invalid.majors[0].schoolId = 'missing';
    assert.equal(
      (await request('/workspace', 'PUT', { data: invalid, revision: 1 }))
        .status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/workspace`, { method: 'PUT', body: '{}' })).status,
      403,
    );
    assert.equal(
      (
        await request('/workspace', 'GET', undefined, {
          Origin: 'https://untrusted.example',
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise((resolve, reject) => {
        const request = httpRequest(
          `${base}/workspace`,
          { headers: { Host: 'untrusted.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
        request.end();
      }),
      403,
    );
    assert.equal((await upload('answer', 2027, 'missing')).status, 404);
    const question = await (await upload('question')).json();
    assert.equal(question.filename, '招生.pdf');
    assert.equal(question.path.includes('..'), false);
    assert.deepEqual(
      await readFile(path.join(workspace, question.path)),
      samplePdf(),
    );
    assert.equal((await upload('answer', 2026, question.id)).status, 400);
    const answer = await (await upload('answer', 2027, question.id)).json();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'japangrad-outside-'));
    await symlink(outside, path.join(workspace, 'majors/m1/guidelines'));
    assert.equal((await upload('guidelines', 2029)).status, 403);
    assert.deepEqual(await readdir(outside), []);
    await unlink(path.join(workspace, 'majors/m1/guidelines'));

    const paper = await (await upload('paper', 2024)).json();
    assert.equal(
      (
        await request(`/documents/${paper.id}`, 'PATCH', {
          notes: '论文笔记',
          authors: '研究者',
          venue: '会议',
        })
      ).status,
      200,
    );
    const mail = await (
      await request('/messages', 'POST', {
        professorId: 'p1',
        direction: 'received',
        subject: '回复',
        body: '原文 <script> 不应执行',
        address: 'p@example.ac.jp',
        date: '2026-10-08T12:00',
        notes: '',
        nextAction: '研究计划书',
        followUpDate: '2026-10-20',
      })
    ).json();
    assert.ok(mail.id);
    await close();
    await start();
    assert.equal(
      (await (await request('/workspace')).json()).data.universities[0].qsRank,
      '100',
    );
    assert.equal(
      (await (await request('/messages?professorId=p1')).json())[0].body,
      mail.body,
    );
    assert.equal(
      (
        await (
          await request('/documents?ownerType=professor&ownerId=p1')
        ).json()
      )[0].notes,
      '论文笔记',
    );
    assert.deepEqual(
      Buffer.from(
        await (await request(`/documents/${paper.id}/file`)).arrayBuffer(),
      ),
      samplePdf(),
    );
    // Symlink tampering must not expose files outside the workspace.
    await unlink(path.join(workspace, paper.path));
    await symlink('/etc/hosts', path.join(workspace, paper.path));
    assert.equal((await request(`/documents/${paper.id}/file`)).status, 403);
    await unlink(path.join(workspace, paper.path));
    assert.deepEqual(
      (
        await (await request(`/documents/${question.id}`, 'DELETE')).json()
      ).removed.toSorted(),
      [question.id, answer.id].toSorted(),
    );
    assert.ok(
      (await stat(path.join(workspace, '.trash', `${question.id}.pdf`))).size >
        0,
    );
    assert.ok(
      (await stat(path.join(workspace, '.trash', `${answer.id}.pdf`))).size > 0,
    );
    assert.equal((await request(`/documents/${answer.id}/file`)).status, 404);
    const parentless = structuredClone(sampleData);
    parentless.professors = [];
    assert.equal(
      (await request('/workspace', 'PUT', { data: parentless, revision: 1 }))
        .status,
      200,
    );
    assert.equal((await request(`/documents/${paper.id}`)).status, 404);
    assert.equal((await request('/messages?professorId=p1')).status, 404);
    console.log(`Verified workspace: ${workspace}`);
  } finally {
    await close();
  }
});

test('five document formats preserve original bytes and use the correct delivery mode', async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), 'japangrad-formats-test-'),
  );
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/japangrad`;
  const client = { 'X-JapanGrad-Client': '1' };
  const upload = (filename, content) =>
    fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        ...client,
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: 'major',
            ownerId: 'm1',
            kind: 'guidelines',
            year: 2027,
            title: filename,
            filename,
          }),
        ),
      },
      body: content,
    });
  try {
    await fetch(`${base}/workspace`, {
      method: 'PUT',
      headers: { ...client, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: sampleData, revision: 0 }),
    });
    const files = [
      ['募集.pdf', samplePdf(), 'application/pdf', 'inline'],
      [
        '募集.doc',
        Buffer.from(String.raw`{\rtf1\ansi Word document}`),
        'application/msword',
        'attachment',
      ],
      [
        '募集.docx',
        sampleDocx(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'attachment',
      ],
      [
        '募集.md',
        Buffer.from('# 募集要项\n<script>window.injected = true</script>'),
        'text/plain; charset=utf-8',
        'inline',
      ],
      [
        '募集.txt',
        Buffer.from('試験科目：数学、英語\n出願締切：2027年5月10日'),
        'text/plain; charset=utf-8',
        'inline',
      ],
    ];
    for (const [filename, content, mime, disposition] of files) {
      const response = await upload(filename, content);
      assert.equal(response.status, 201, await response.clone().text());
      const record = await response.json();
      assert.equal(record.filename, filename);
      assert.equal(record.sha256.length, 64);
      assert.deepEqual(
        await readFile(path.join(workspace, record.path)),
        content,
      );
      const served = await fetch(`${base}/documents/${record.id}/file`);
      assert.equal(served.headers.get('content-type'), mime);
      assert.ok(
        served.headers.get('content-disposition').startsWith(`${disposition};`),
      );
      assert.deepEqual(Buffer.from(await served.arrayBuffer()), content);
      if (filename.endsWith('.md'))
        assert.ok(
          served.headers.get('content-security-policy').includes('sandbox'),
        );
      const result = await fetch(`${base}/documents/${record.id}`, {
        method: 'DELETE',
        headers: client,
      });
      assert.equal(result.status, 200);
      assert.deepEqual(
        await readFile(
          path.join(
            workspace,
            '.trash',
            `${record.id}${path.extname(filename)}`,
          ),
        ),
        content,
      );
    }
    assert.equal((await upload('改扩展名.docx', samplePdf())).status, 400);
    assert.equal((await upload('损坏.docx', Buffer.from('PK'))).status, 400);
    assert.equal(
      (await upload('不支持.html', Buffer.from('<script>alert(1)</script>')))
        .status,
      400,
    );
    assert.equal((await upload('空.txt', Buffer.alloc(0))).status, 400);
    console.log(`Verified formats: ${workspace}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
