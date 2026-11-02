import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalApp } from './server.mjs';
import { sampleData, samplePdf } from './test-fixtures.mjs';

test('file index includes special files, questions, and shared guideline analysis retains source ownership', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-library-'));
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/japangrad`;
  const request = (url, value) =>
    fetch(
      base + url,
      value
        ? {
            method: 'POST',
            headers: {
              'X-JapanGrad-Client': '1',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(value),
          }
        : {},
    );
  try {
    const saved = await fetch(base + '/workspace', {
      method: 'PUT',
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: sampleData, revision: 0 }),
    });
    assert.equal(saved.status, 200);
    const ids = {};
    for (const kind of ['other', 'question', 'guidelines']) {
      const response = await fetch(base + '/documents', {
        method: 'POST',
        headers: {
          'X-JapanGrad-Client': '1',
          'X-JapanGrad-Metadata': encodeURIComponent(
            JSON.stringify({
              ownerType: 'major',
              ownerId: 'm1',
              kind,
              year: 2027,
              title: kind,
              filename: 'test.pdf',
            }),
          ),
        },
        body: samplePdf(),
      });
      assert.equal(response.status, 201);
      ids[kind] = (await response.json()).id;
    }
    const index = await request('/documents/index');
    assert.equal(index.status, 200);
    const rows = await index.json();
    assert.equal(rows.length, 3);
    assert.ok(rows.some((r) => r.kind === 'other'));
    const response = await request('/analysis/jobs', {
      majorId: 'm1',
      documentIds: [ids.guidelines],
      context: {
        admissionYear: 2027,
        degree: 'master',
        selectionType: '',
        notes: '',
      },
      selectedPrograms: ['新研究科 / 新专攻'],
    });
    assert.equal(response.status, 201);
    const job = await response.json();
    assert.equal(job.related.length, 1);
    const related = await (
      await request(`/analysis/jobs/${job.related[0].jobId}`)
    ).json();
    assert.equal(related.job.sources[0].majorId, 'm1');
    assert.notEqual(related.job.majorId, 'm1');
    const docs = await (await request('/documents/index')).json();
    assert.equal(docs.length, 3);
  } finally {
    server.emit('japangrad:shutdown');
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(workspace, { recursive: true, force: true });
  }
});
