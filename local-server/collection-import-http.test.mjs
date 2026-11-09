/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone Node HTTP and SQLite regression tests. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  blankCollectionEntity,
  collectionAncestors,
  collectionCollections,
} from './collection-fields.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
async function fixture(t) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'juai-v3-http-'));
  const app = await createLocalApp({ workspace });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  const call = async (url, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(
      `http://127.0.0.1:${app.address().port}/api/japangrad${url}`,
      {
        method,
        headers: {
          'X-JapanGrad-Client': '1',
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  t.after(async () => {
    db.close();
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  });
  const data = structuredClone(sampleData);
  data.majors[0].examHistory = [
    {
      id: 'existing-exam',
      year: '2027',
      session: '修士夏季',
      subjects: '',
      examDate: '',
      sourceUrl: '',
      notes: '',
    },
  ];
  data.labs = [
    {
      ...blankCollectionEntity('lab', 'l1', 'm1'),
      name: '既存研究室',
      mainProfessorId: '',
      wantApply: true,
    },
  ];
  data.professors = [
    {
      ...blankCollectionEntity('professor', 'p1', 'm1', 'l1'),
      name: '既存老师',
    },
  ];
  const initialWrite = await call('/workspace', { data, revision: 0 }, 'PUT');
  assert.equal(initialWrite.status, 200, JSON.stringify(initialWrite));
  const current = (await call('/workspace')).data;
  const rows = () =>
    Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name)
        .filter(
          (name) =>
            !/^(collection_|workspace_state$|schema_migrations$|workspace_migration_reports$)/.test(
              name,
            ),
        )
        .map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
    );
  const unchanged = (before) => {
    const after = rows();
    for (const [table, old] of Object.entries(before))
      for (const row of old)
        assert.ok(
          after[table].some((r) => JSON.stringify(r) === JSON.stringify(row)),
          table,
        );
  };
  const seed = (id, kind, create = false) => {
    const job = {
      id,
      createdAt: new Date().toISOString(),
      status: 'review',
      ruleVersion: 3,
      importPolicy: 'create_only',
      requestedKind: kind,
      urls: ['https://example.edu/'],
      warnings: [],
      log: [],
      draft: {
        university: [],
        school: [],
        major: [],
        lab: [],
        professor: [],
        documents: [],
        exams: [],
        admissions: { status: 'not_requested', scope: '', fields: [] },
        subject: { kind },
      },
    };
    const selection = {
      ruleVersion: 3,
      revision: current.revision,
      entities: {},
      resources: { exams: [], documents: [], admissions: [] },
    };
    for (const level of collectionAncestors(kind)) {
      const existing = current.data[collectionCollections[level]][0];
      const name = create ? `新增${level}` : existing.name;
      job.draft[level] = [{ field: 'name', value: name, evidence: [] }];
      selection.entities[level] = create
        ? {
            action: 'create',
            candidateKey: `${level}:primary`,
            fields: { name },
          }
        : { action: 'link', id: existing.id };
    }
    const save = () =>
      db
        .prepare(
          'INSERT INTO collection_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(id, job.createdAt, JSON.stringify(job));
    save();
    return { job, selection, save };
  };
  const plan = (id, selection) =>
    call(`/collection/jobs/${id}/import-plan`, selection);
  const apply = (id, p) =>
    call(`/collection/jobs/${id}/apply`, {
      ruleVersion: 3,
      confirm: true,
      planId: p.planId,
      planHash: p.planHash,
      baseRevision: p.baseRevision,
    });
  return { workspace, db, call, current, seed, plan, apply, rows, unchanged };
}
test('all five existing principal kinds remain byte-for-byte unchanged; link-only retries are idempotent', async (t) => {
  const f = await fixture(t);
  for (const kind of ['university', 'school', 'major', 'lab', 'professor']) {
    const id = `existing-${kind}`;
    const { selection } = f.seed(id, kind);
    const before = f.rows();
    const p = await f.plan(id, selection);
    assert.equal(p.status, 200, JSON.stringify(p));
    const result = await f.apply(id, p.data);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(
      result.data.job.resultEntities.every((e) => e.action === 'linked'),
      true,
    );
    assert.match(result.data.job.message, /无新增/);
    assert.equal((await f.apply(id, p.data)).data.alreadyApplied, true);
    assert.equal(
      f.db
        .prepare('SELECT COUNT(*) n FROM collection_history WHERE job_id=?')
        .get(id).n,
      1,
    );
    f.unchanged(before);
  }
});
test('new complete chain commits atomically, duplicate tasks become stale, tampered apply is rejected', async (t) => {
  const f = await fixture(t);
  const a = f.seed('a', 'professor', true);
  const b = f.seed('b', 'professor', true);
  const pa = await f.plan('a', a.selection);
  const pb = await f.plan('b', b.selection);
  assert.equal(pa.status, 200);
  assert.equal(pb.status, 200);
  const before = f.rows();
  assert.equal((await f.apply('a', pa.data)).status, 200);
  assert.equal((await f.apply('b', pb.data)).status, 409);
  f.unchanged(before);
  const bad = await f.call('/collection/jobs/a/apply', {
    ruleVersion: 3,
    confirm: true,
    allowReplace: true,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'CREATE_ONLY_VIOLATION');
});
test('new exam and PDF attach to an existing major without changing old rows; overlapping saves commit once', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('resources', 'major');
  const pdf = Buffer.from('%PDF-1.4\ncontrolled fixture\n%%EOF');
  const relative = 'collection-cache/resources/src.pdf';
  await mkdir(path.join(f.workspace, 'collection-cache/resources'), {
    recursive: true,
  });
  await writeFile(path.join(f.workspace, relative), pdf);
  const source = {
    id: 'src',
    jobId: job.id,
    kind: 'pdf',
    url: 'https://example.edu/guide.pdf',
    path: relative,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    pages: [],
    warnings: [],
  };
  f.db
    .prepare('INSERT INTO collection_sources VALUES(?,?,?)')
    .run('src', job.id, JSON.stringify(source));
  job.draft.exams = [
    {
      id: 'exam',
      year: '2028',
      session: '修士外国人夏季',
      fields: [{ field: 'subjects', value: '数学・面试', evidence: [] }],
    },
  ];
  job.draft.documents = [
    { sourceId: 'src', kind: 'guidelines', title: '募集要项', year: '2028' },
  ];
  save();
  selection.resources.exams = [
    {
      candidateId: 'exam',
      owner: { kind: 'major', id: 'm1' },
      year: '2028',
      session: '修士外国人夏季',
      fields: { subjects: '数学・面试' },
    },
  ];
  selection.resources.documents = [
    {
      sourceId: 'src',
      kind: 'guidelines',
      year: '2028',
      owner: { kind: 'major', id: 'm1' },
    },
  ];
  const before = f.rows();
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200, JSON.stringify(p));
  const results = await Promise.all([
    f.apply(job.id, p.data),
    f.apply(job.id, p.data),
  ]);
  results.forEach((r) => assert.equal(r.status, 200, JSON.stringify(r)));
  assert.equal(results.filter((r) => r.data.alreadyApplied).length, 1);
  f.unchanged(before);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM exam_records WHERE year='2028'").get()
      .n,
    1,
  );
  const document = f.db.prepare('SELECT * FROM document_records').get();
  assert.deepEqual(await readFile(path.join(f.workspace, document.path)), pdf);
  assert.equal(
    (await stat(path.join(f.workspace, document.path))).ino,
    (await stat(path.join(f.workspace, relative))).ino,
  );
  const saved = (await f.call('/workspace')).data;
  assert.ok(saved.data.majors[0].examHistory.some((e) => e.year === '2028'));
  assert.equal(
    (
      await f.call(
        '/workspace',
        { data: f.current.data, revision: f.current.revision },
        'PUT',
      )
    ).status,
    409,
  );
});
test('ordinary create rejects omitted/auto type and old policy before model configuration', async (t) => {
  const f = await fixture(t);
  for (const targetKind of [undefined, 'auto', 'university']) {
    const response = await f.call('/collection/jobs', {
      targetKind,
      primaryUrl: 'https://example.edu/',
      aiMode: 'api',
      browserMode: 'http',
      admissionYear: 2028,
      degree: 'master',
      notes: '',
    });
    assert.equal(response.status, 400);
    assert.equal(response.data.code, 'CREATE_ONLY_VIOLATION');
  }
});
test('old review cannot save; explicit source-preserving upgrade needs no model', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('legacy', 'university');
  job.ruleVersion = 2;
  delete job.importPolicy;
  save();
  assert.equal(
    (await f.plan(job.id, selection)).data.code,
    'LEGACY_REVIEW_REQUIRED',
  );
  assert.equal(
    (
      await f.call(`/collection/jobs/${job.id}/apply`, {
        confirm: true,
        allowReplace: true,
      })
    ).status,
    400,
  );
  const upgraded = await f.call(`/collection/jobs/${job.id}/upgrade-review`, {
    targetKind: 'university',
  });
  assert.equal(upgraded.status, 200);
  assert.deepEqual(upgraded.data.job.draft, job.draft);
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  assert.equal((await f.apply(job.id, p.data)).status, 200);
});
test('user-edited real names require a value-bound confirmation and stale previews cannot save', async (t) => {
  const f = await fixture(t);
  const { job, selection } = f.seed('manual', 'university', true);
  selection.entities.university.fields.name = '用户确认的真实大学';
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  assert.equal(p.data.state, 'needs_confirmation');
  assert.equal((await f.apply(job.id, p.data)).status, 422);
  selection.manualConfirmations = p.data.requiredConfirmations.map(
    ({ key }) => ({ key, explanation: '已查阅官方页面并核对真实名称。' }),
  );
  const confirmed = await f.plan(job.id, selection);
  assert.equal(confirmed.data.state, 'ready');
  assert.equal((await f.apply(job.id, p.data)).status, 409);
  assert.equal((await f.apply(job.id, confirmed.data)).status, 200);
});
test('existing exam duplicate is skipped without filling blanks or changing timelines', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('duplicate-exam', 'major');
  const existing = f.current.data.majors[0].examHistory[0];
  job.draft.exams = [
    {
      id: 'candidate',
      year: String(existing.year),
      session: existing.session,
      fields: [{ field: 'subjects', value: '不应回填', evidence: [] }],
    },
  ];
  save();
  selection.resources.exams = [
    {
      candidateId: 'candidate',
      owner: { kind: 'major', id: 'm1' },
      year: String(existing.year),
      session: existing.session,
      fields: { subjects: '不应回填' },
    },
  ];
  const before = f.rows();
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200, JSON.stringify(p));
  assert.equal(p.data.resources.exams[0].state, 'duplicate');
  assert.equal((await f.apply(job.id, p.data)).status, 200);
  f.unchanged(before);
});
test('scope-uncertain summaries stay in sources and cannot be labelled university-wide', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('uncertain', 'university');
  job.draft.admissions = {
    status: 'uncertain',
    scope: '仅研究科样本，非全校通用',
    fields: [{ field: 'eligibility', value: '局部要求', evidence: [] }],
  };
  save();
  selection.resources.admissions = [
    {
      owner: { kind: 'university', id: 'u1' },
      scope: job.draft.admissions.scope,
      fields: { eligibility: '局部要求' },
    },
  ];
  const before = f.rows();
  const blocked = await f.plan(job.id, selection);
  assert.equal(blocked.status, 422);
  selection.resources.admissions = [];
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  assert.equal((await f.apply(job.id, p.data)).status, 200);
  f.unchanged(before);
});
test('summary ownership is explicit, dedup is scoped, and an ancestor does not inherit a major summary', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('summary', 'major');
  job.draft.admissions = {
    status: 'found',
    scope: '2028年度修士外国人',
    fields: [{ field: 'eligibility', value: '大学毕业', evidence: [] }],
  };
  save();
  selection.resources.admissions = [
    {
      owner: { kind: 'major', id: 'm1' },
      scope: job.draft.admissions.scope,
      fields: { eligibility: '大学毕业' },
    },
  ];
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  assert.equal((await f.apply(job.id, p.data)).status, 200);
  const major = await f.call('/collection/records/major/m1');
  const university = await f.call('/collection/records/university/u1');
  assert.equal(major.data.length, 1);
  assert.equal(university.data.length, 0);
  const other = f.seed('summary-again', 'major');
  other.job.draft.admissions = job.draft.admissions;
  other.save();
  other.selection.resources.admissions = selection.resources.admissions;
  const again = await f.plan(other.job.id, other.selection);
  assert.equal(again.status, 200);
  assert.equal(again.data.resources.admissions[0].state, 'duplicate');
  assert.equal((await f.apply(other.job.id, again.data)).status, 200);
  assert.equal((await f.call('/collection/records/major/m1')).data.length, 1);
});
test('changed PDF blocks its resource, then cancellation can save the remaining valid links', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('changed-source', 'major');
  const original = Buffer.from('%PDF-1.4\noriginal');
  const relative = 'collection-cache/changed/source.pdf';
  await mkdir(path.join(f.workspace, 'collection-cache/changed'), {
    recursive: true,
  });
  await writeFile(path.join(f.workspace, relative), original);
  f.db.prepare('INSERT INTO collection_sources VALUES(?,?,?)').run(
    'source',
    job.id,
    JSON.stringify({
      id: 'source',
      jobId: job.id,
      kind: 'pdf',
      path: relative,
      url: 'https://example.edu/document.pdf',
      sha256: createHash('sha256').update(original).digest('hex'),
      pages: [],
    }),
  );
  job.draft.documents = [
    { sourceId: 'source', kind: 'guidelines', year: '2028', title: '原件' },
  ];
  save();
  selection.resources.documents = [
    {
      sourceId: 'source',
      kind: 'guidelines',
      year: '2028',
      owner: { kind: 'major', id: 'm1' },
    },
  ];
  const before = f.rows();
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  await writeFile(path.join(f.workspace, relative), '%PDF-1.4\nchanged');
  const rejected = await f.apply(job.id, p.data);
  assert.equal(rejected.status, 409);
  assert.equal(rejected.data.code, 'SOURCE_CHANGED');
  f.unchanged(before);
  selection.resources.documents = [];
  const revised = await f.plan(job.id, selection);
  assert.equal(revised.status, 200);
  assert.equal((await f.apply(job.id, revised.data)).status, 200);
  f.unchanged(before);
});
test('a database failure after file preparation rolls back all data and cleans only this attempt', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('rollback-file', 'major');
  const bytes = Buffer.from('%PDF-1.4\noriginal');
  const relative = 'collection-cache/rollback/source.pdf';
  await mkdir(path.join(f.workspace, 'collection-cache/rollback'), {
    recursive: true,
  });
  await writeFile(path.join(f.workspace, relative), bytes);
  f.db.prepare('INSERT INTO collection_sources VALUES(?,?,?)').run(
    'rollback-source',
    job.id,
    JSON.stringify({
      id: 'rollback-source',
      jobId: job.id,
      kind: 'pdf',
      path: relative,
      url: 'https://example.edu/document.pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pages: [],
    }),
  );
  job.draft.documents = [
    {
      sourceId: 'rollback-source',
      kind: 'guidelines',
      year: '2028',
      title: '原件',
    },
  ];
  save();
  selection.resources.documents = [
    {
      sourceId: 'rollback-source',
      kind: 'guidelines',
      year: '2028',
      owner: { kind: 'major', id: 'm1' },
    },
  ];
  const before = f.rows();
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  f.db.exec(
    "CREATE TRIGGER reject_document BEFORE INSERT ON document_records BEGIN SELECT RAISE(ABORT,'injected failure'); END;",
  );
  assert.equal((await f.apply(job.id, p.data)).status, 500);
  assert.equal(
    f.db.prepare('SELECT COUNT(*) n FROM document_records').get().n,
    0,
  );
  assert.equal(
    JSON.parse(
      f.db.prepare('SELECT data FROM collection_jobs WHERE id=?').get(job.id)
        .data,
    ).status,
    'review',
  );
  assert.deepEqual(await readFile(path.join(f.workspace, relative)), bytes);
  f.unchanged(before);
  const { readdir } = await import('node:fs/promises');
  const manifests = await readdir(
    path.join(f.workspace, 'collection-import-attempts'),
  );
  assert.equal(manifests.filter((name) => name.endsWith('.json')).length, 0);
  const attempts = await readdir(
    path.join(f.workspace, 'documents/collection-imports'),
  );
  for (const attempt of attempts)
    assert.equal(
      (
        await readdir(
          path.join(f.workspace, 'documents/collection-imports', attempt),
        )
      ).length,
      0,
    );
});
test('restart recovery removes only expired proven orphans and retains committed or active files', async (t) => {
  const f = await fixture(t);
  const { createCollectionImportWriter } =
    await import('./collection-import-writer.mjs');
  const { saveProjectedRecord } = await import('./workspace-records.mjs');
  const manifestDir = path.join(f.workspace, 'collection-import-attempts');
  await mkdir(manifestDir, { recursive: true });
  const paths = [];
  for (const [index, committed, expired] of [
    [1, false, true],
    [2, true, true],
    [3, false, false],
  ]) {
    const attempt = `00000000-0000-4000-8000-00000000000${index}`;
    const id = `11111111-1111-4111-8111-11111111111${index}`;
    const relative = `documents/collection-imports/${attempt}/${id}.pdf`;
    paths.push(relative);
    await mkdir(path.dirname(path.join(f.workspace, relative)), {
      recursive: true,
    });
    await writeFile(path.join(f.workspace, relative), '%PDF-1.4');
    await writeFile(
      path.join(manifestDir, `${attempt}.json`),
      JSON.stringify({
        startedAt: Date.now() - (expired ? 25 * 3_600_000 : 1000),
        paths: [relative],
      }),
    );
    if (committed)
      saveProjectedRecord(
        f.db,
        'documents',
        {
          id,
          ownerType: 'major',
          ownerId: 'm1',
          kind: 'guidelines',
          year: 2028,
          path: relative,
          title: '已提交原件',
          size: 8,
        },
        { insertOnly: true },
      );
  }
  const writer = createCollectionImportWriter({
    db: f.db,
    workspace: f.workspace,
  });
  await writer.recover();
  await assert.rejects(readFile(path.join(f.workspace, paths[0])), {
    code: 'ENOENT',
  });
  assert.equal(
    (await readFile(path.join(f.workspace, paths[1]))).toString(),
    '%PDF-1.4',
  );
  assert.equal(
    (await readFile(path.join(f.workspace, paths[2]))).toString(),
    '%PDF-1.4',
  );
});
test('archive directories cannot escape the user workspace through a symlink', async (t) => {
  const f = await fixture(t);
  const { job, selection, save } = f.seed('path-boundary', 'major');
  const { symlink, readdir } = await import('node:fs/promises');
  const outside = await mkdtemp(path.join(os.tmpdir(), 'juai-other-user-'));
  await mkdir(path.join(f.workspace, 'documents'), { recursive: true });
  await symlink(
    outside,
    path.join(f.workspace, 'documents/collection-imports'),
  );
  const bytes = Buffer.from('%PDF-1.4\ncontrolled fixture');
  const relative = 'collection-cache/path/source.pdf';
  await mkdir(path.join(f.workspace, 'collection-cache/path'), {
    recursive: true,
  });
  await writeFile(path.join(f.workspace, relative), bytes);
  f.db.prepare('INSERT INTO collection_sources VALUES(?,?,?)').run(
    'path-source',
    job.id,
    JSON.stringify({
      id: 'path-source',
      jobId: job.id,
      kind: 'pdf',
      path: relative,
      url: 'https://example.edu/document.pdf',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      pages: [],
    }),
  );
  job.draft.documents = [
    {
      sourceId: 'path-source',
      kind: 'guidelines',
      year: '2028',
      title: '原件',
    },
  ];
  save();
  selection.resources.documents = [
    {
      sourceId: 'path-source',
      kind: 'guidelines',
      year: '2028',
      owner: { kind: 'major', id: 'm1' },
    },
  ];
  const p = await f.plan(job.id, selection);
  assert.equal(p.status, 200);
  assert.equal((await f.apply(job.id, p.data)).status, 403);
  assert.deepEqual(await readdir(outside), []);
  assert.equal(
    f.db.prepare('SELECT COUNT(*) n FROM document_records').get().n,
    0,
  );
});
