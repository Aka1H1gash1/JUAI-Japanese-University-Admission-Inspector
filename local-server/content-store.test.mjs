/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone HTTP regression assertions follow the shared server test convention. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { diskUsage, sha256, storeContent } from './content-store.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData, samplePdf } from './test-fixtures.mjs';

test('storeContent links identical bytes, refuses stale records and counts disk once', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-store-'));
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE document_records (id TEXT, path TEXT, sha256 TEXT); CREATE TABLE collection_sources (id TEXT, data TEXT);',
  );
  try {
    const bytes = Buffer.from('%PDF-1.4 same content');
    await mkdir(path.join(workspace, 'a'));
    await writeFile(path.join(workspace, 'a/first.pdf'), bytes);
    db.prepare('INSERT INTO collection_sources VALUES (?,?)').run(
      's1',
      JSON.stringify({ path: 'a/first.pdf', sha256: sha256(bytes) }),
    );

    const second = path.join(workspace, 'a/second.pdf');
    assert.deepEqual(
      await storeContent({ db, workspace, target: second, bytes }),
      { reused: true, digest: sha256(bytes) },
    );
    assert.equal(
      (await stat(second)).ino,
      (await stat(path.join(workspace, 'a/first.pdf'))).ino,
    );
    await assert.rejects(
      storeContent({ db, workspace, target: second, bytes }),
      { code: 'EEXIST' },
    );

    // A record whose file no longer matches its hash is never linked.
    const other = Buffer.from('%PDF-1.4 other');
    await writeFile(
      path.join(workspace, 'a/stale.pdf'),
      Buffer.from('%PDF-1.4 edited'),
    );
    db.prepare('INSERT INTO document_records VALUES (?,?,?)').run(
      'd1',
      'a/stale.pdf',
      sha256(other),
    );
    const fresh = path.join(workspace, 'a/fresh.pdf');
    assert.equal(
      (await storeContent({ db, workspace, target: fresh, bytes: other }))
        .reused,
      false,
    );
    assert.deepEqual(await readFile(fresh), other);

    // Records cannot point outside the workspace.
    db.prepare('INSERT INTO document_records VALUES (?,?,?)').run(
      'd2',
      '../outside.pdf',
      sha256(bytes),
    );
    assert.equal(
      (
        await storeContent({
          db,
          workspace,
          target: path.join(workspace, 'a/third.pdf'),
          bytes,
        })
      ).reused,
      true,
    );

    const usage = await diskUsage(workspace);
    assert.equal(usage.files, 5);
    assert.equal(
      usage.bytes,
      bytes.length + other.length + Buffer.byteLength('%PDF-1.4 edited'),
    );
  } finally {
    db.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
test('importing a downloaded PDF links the collection-cache copy instead of copying it', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-store-apply-'));
  const app = await createLocalApp({ workspace });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const origin = `http://127.0.0.1:${app.address().port}`;
  const call = async (route, method = 'GET', body) => {
    const r = await fetch(`${origin}/api/japangrad${route}`, {
      method,
      headers: {
        Origin: origin,
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  try {
    const data = structuredClone(sampleData);
    data.majors = [];
    data.labs = [];
    data.professors = [];
    let current = (await call('/workspace')).data;
    assert.equal(
      (await call('/workspace', 'PUT', { revision: current.revision, data }))
        .status,
      200,
    );
    current = (await call('/workspace')).data;
    const bytes = samplePdf();
    const cached = 'collection-cache/dedupe-job/source.pdf';
    await mkdir(path.join(workspace, 'collection-cache/dedupe-job'), {
      recursive: true,
    });
    await writeFile(path.join(workspace, cached), bytes);
    const source = {
      id: 'src1',
      jobId: 'dedupe-job',
      url: 'https://example.com/guide.pdf',
      title: '募集要项',
      kind: 'pdf',
      sha256: sha256(bytes),
      size: bytes.length,
      path: cached,
      pages: [],
      links: [],
      images: [],
      warnings: [],
      fetchedAt: new Date().toISOString(),
    };
    db.prepare('INSERT INTO collection_sources VALUES(?,?,?)').run(
      'src1',
      'dedupe-job',
      JSON.stringify(source),
    );
    const job = {
      id: 'dedupe-job',
      createdAt: new Date().toISOString(),
      status: 'review',
      ruleVersion: 2,
      urls: ['https://example.com/'],
      context: { admissionYear: 2027 },
      draft: {
        university: [],
        school: [],
        major: [],
        lab: [],
        professor: [],
        exams: [],
        warnings: [],
        admissions: { status: 'not_requested', fields: [], scope: '' },
        subject: { kind: 'major' },
        documents: [
          {
            sourceId: 'src1',
            kind: 'guidelines',
            title: '募集要项',
            year: '2027',
          },
        ],
      },
      parent: { kind: 'school', id: 's1' },
      target: { ids: { university: 'u1', school: 's1' } },
      log: [],
      warnings: [],
    };
    db.prepare('INSERT INTO collection_jobs VALUES(?,?,?)').run(
      job.id,
      job.createdAt,
      JSON.stringify(job),
    );
    const result = await call('/collection/jobs/dedupe-job/apply', 'POST', {
      confirm: true,
      revision: current.revision,
      targetKind: 'major',
      includeProfessor: false,
      entities: {
        university: { id: 'u1', fields: {} },
        school: { id: 's1', fields: {} },
        major: { fields: { name: '新专攻' } },
      },
      documents: [{ sourceId: 'src1', kind: 'guidelines', year: '2027' }],
      exams: [],
      confirmedScopes: [],
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const archived = db
      .prepare("SELECT path FROM document_records WHERE kind='guidelines'")
      .get();
    assert.ok(archived, 'guideline archived');
    const [a, b] = await Promise.all([
      stat(path.join(workspace, cached)),
      stat(path.join(workspace, archived.path)),
    ]);
    assert.equal(a.ino, b.ino, 'archive shares the cached bytes');
    assert.deepEqual(
      await readFile(path.join(workspace, archived.path)),
      bytes,
    );
  } finally {
    db.close();
    app.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('uploading the same file twice stores it once; deleting one copy keeps the other', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-store-app-'));
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/japangrad`;
  const headers = {
    'X-JapanGrad-Client': '1',
    'Content-Type': 'application/json',
  };
  const upload = (kind, title) =>
    fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: 'major',
            ownerId: 'm1',
            kind,
            year: 2027,
            title,
            filename: `${title}.pdf`,
          }),
        ),
      },
      body: samplePdf(),
    });
  try {
    assert.equal(
      (
        await fetch(`${base}/workspace`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ data: sampleData, revision: 0 }),
        })
      ).status,
      200,
    );
    const first = await (await upload('guidelines', '募集要项')).json();
    const second = await (await upload('other', '同一份文件')).json();
    const db = new DatabaseSync(path.join(workspace, 'workspace.db'), {
      readOnly: true,
    });
    const rows = db
      .prepare(
        'SELECT id,path,sha256 FROM document_records ORDER BY created_at',
      )
      .all();
    db.close();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].sha256, rows[1].sha256);
    const [a, b] = await Promise.all(
      rows.map((r) => stat(path.join(workspace, r.path))),
    );
    assert.equal(a.ino, b.ino, 'identical uploads share one stored copy');
    assert.equal(a.nlink, 2);

    assert.equal(
      (
        await fetch(`${base}/documents/${first.id}`, {
          method: 'DELETE',
          headers,
        })
      ).status,
      200,
    );
    const kept = await fetch(`${base}/documents/${second.id}/file`);
    assert.equal(kept.status, 200);
    assert.deepEqual(Buffer.from(await kept.arrayBuffer()), samplePdf());
  } finally {
    server.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
