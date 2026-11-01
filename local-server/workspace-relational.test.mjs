/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member, unicorn/prefer-set-has, unicorn/text-encoding-identifier-case -- Standalone integration fixtures use Node responses and preserve MIME charset spellings. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
import { saveProjectedRecord } from './workspace-records.mjs';

async function serve(t, workspace) {
  const server = await createLocalApp({ workspace });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      server.close();
      await once(server, 'close');
    }
  };
  t.after(close);
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
    return { status: response.status, value: await response.json() };
  };
  return { request, close };
}
const temporary = () => mkdtemp(path.join(os.tmpdir(), 'juai-relational-'));
function legacyDatabase(workspace, data, corruptOwner = false) {
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(1,datetime('now'));
    CREATE TABLE workspace_data(id INTEGER PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL);
    CREATE TABLE documents(id TEXT PRIMARY KEY,owner_type TEXT NOT NULL,owner_id TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX documents_owner ON documents(owner_type,owner_id);
    CREATE TABLE messages(id TEXT PRIMARY KEY,professor_id TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX messages_professor ON messages(professor_id);`);
  db.prepare('INSERT INTO workspace_data VALUES(1,?,3)').run(
    JSON.stringify(data),
  );
  if (corruptOwner)
    db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run(
      'orphan',
      'major',
      'missing',
      JSON.stringify({
        id: 'orphan',
        ownerType: 'major',
        ownerId: 'missing',
        kind: 'paper',
        notes: 'keep me',
      }),
    );
  db.close();
}

test('legacy upgrade creates a verified backup, splits records and is idempotent', async (t) => {
  const workspace = await temporary();
  const data = structuredClone(sampleData);
  data.universities[0].prefecture = '东京都';
  data.universities[0].customProvenance = {
    source: 'original',
    values: [1, 2],
  };
  data.majors[0].examHistory = [
    {
      id: 'exam1',
      year: '2027',
      session: '夏季',
      examDate: '',
      writtenDate: '2027-06-10',
      interviewDate: '',
      resultDate: '',
      subjects: '数学',
      sourceUrl: '',
      notes: '',
    },
  ];
  data.labs = [
    {
      id: 'l1',
      majorId: 'm1',
      name: '研究室',
      japaneseName: '',
      research: '',
      website: '',
      notes: '',
      examNotes: '',
      applicationNotes: '',
      wantApply: true,
      tasks: [
        {
          id: 'task1',
          kind: 'material',
          title: '成绩单',
          progress: 100,
          progressBeforeDone: 60,
          dueDate: '',
          notes: '',
        },
      ],
      timeline: {
        version: 2,
        events: [
          {
            id: 'ev1',
            kind: 'custom',
            title: '见学',
            start: '2027-06-01',
            end: '2027-06-01',
            at: '',
            endAt: '',
            complete: false,
            notes: '保留',
            replaces: '',
          },
        ],
        hiddenSources: ['hidden-node'],
      },
    },
  ];
  data.professors[0].labId = 'l1';
  data.professors[0].laboratory = 'stale duplicated name';
  legacyDatabase(workspace, data);
  const app = await serve(t, workspace);
  const first = await app.request('/workspace');
  assert.equal(first.status, 200);
  const actual = first.value.data;
  assert.deepEqual(
    actual.universities[0].customProvenance,
    data.universities[0].customProvenance,
  );
  assert.equal(actual.labs[0].tasks[0].progressBeforeDone, 60);
  assert.equal(actual.labs[0].timeline.events[0].notes, '保留');
  assert.deepEqual(actual.labs[0].timeline.hiddenSources, ['hidden-node']);
  assert.equal(actual.professors[0].laboratory, '研究室');
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  for (const [table, count] of [
    ['universities', 1],
    ['schools', 1],
    ['majors', 1],
    ['labs', 1],
    ['professors', 1],
    ['lab_tasks', 1],
    ['timeline_events', 1],
    ['exam_records', 1],
  ])
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
      count,
    );
  assert.equal(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_data'",
      )
      .get(),
    undefined,
  );
  assert.ok(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='workspace_data_legacy'",
      )
      .get(),
  );
  const professorColumns = db
    .prepare('PRAGMA table_info(professors)')
    .all()
    .map((row) => row.name);
  assert.ok(!professorColumns.includes('major_id'));
  assert.ok(!professorColumns.includes('laboratory'));
  const university = db
    .prepare('SELECT region_name,prefecture_name FROM universities')
    .get();
  assert.equal(university.region_name, null);
  assert.equal(university.prefecture_name, '东京都');
  assert.throws(
    () => db.prepare('UPDATE workspace_data_legacy SET revision=99').run(),
    /read-only/,
  );
  db.close();
  const backups = await readdir(`${workspace}.backups`);
  assert.equal(backups.length, 1);
  const marker = JSON.parse(
    await readFile(
      path.join(`${workspace}.backups`, backups[0], 'JUAI_BACKUP.json'),
      'utf8',
    ),
  );
  assert.equal(marker.kind, 'schema14');
  await app.close();
  const reopened = await serve(t, workspace);
  assert.deepEqual((await reopened.request('/workspace')).value, first.value);
  assert.equal((await readdir(`${workspace}.backups`)).length, 1);
});

test('failed migration rolls back its tables and preserves original metadata and backup', async () => {
  const workspace = await temporary();
  legacyDatabase(workspace, structuredClone(sampleData), true);
  await assert.rejects(createLocalApp({ workspace }), /外键|FOREIGN KEY/);
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  assert.equal(
    db.prepare('SELECT version FROM schema_migrations WHERE version=14').get(),
    undefined,
  );
  assert.ok(db.prepare('SELECT data FROM workspace_data WHERE id=1').get());
  assert.equal(
    JSON.parse(
      db.prepare('SELECT data FROM documents WHERE id=?').get('orphan').data,
    ).notes,
    'keep me',
  );
  assert.equal(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name='workspace_state'")
      .get(),
    undefined,
  );
  db.close();
  assert.equal((await readdir(`${workspace}.backups`)).length, 1);
});

test('row revisions permit edits to independent labs and reject stale edits to the same lab', async (t) => {
  const workspace = await temporary();
  const { request } = await serve(t, workspace);
  assert.equal(
    (await request('/workspace', 'PUT', { data: sampleData, revision: 0 }))
      .status,
    200,
  );
  let current = (await request('/workspace')).value;
  const copy = structuredClone(current.data.labs[0]);
  copy.id = 'l2';
  copy.name = '第二研究室';
  copy.mainProfessorId = '';
  current.data.labs.push(copy);
  assert.equal(
    (
      await request('/workspace', 'PUT', {
        data: current.data,
        revision: current.revision,
      })
    ).status,
    200,
  );
  current = (await request('/workspace')).value;
  const firstId = current.data.labs[0].id;
  const [first, second] = await Promise.all([
    request(`/workspace/labs/${firstId}`, 'PATCH', {
      revision: current.entityRevisions.labs[firstId],
      patch: { wantApply: true },
    }),
    request('/workspace/labs/l2', 'PATCH', {
      revision: current.entityRevisions.labs.l2,
      patch: { wantApply: true },
    }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const stale = await request(`/workspace/labs/${firstId}`, 'PATCH', {
    revision: current.entityRevisions.labs[firstId],
    patch: { wantApply: false },
  });
  assert.equal(stale.status, 409);
  const after = (await request('/workspace')).value;
  assert.ok(after.data.labs.every((lab) => lab.wantApply));
  const professorsBefore = current.entityRevisions.professors;
  assert.deepEqual(after.entityRevisions.professors, professorsBefore);
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO lab_tasks(lab_id,id,title,kind,progress,position,present_json,extras_json) VALUES(?,?,?,'material',0,?,?,?)",
        )
        .run('missing', 'bad', 'bad', 0, '[]', '{}'),
    /FOREIGN KEY/,
  );
  db.close();
});

test('program affiliations are derived and projected records retain native booleans', async (t) => {
  const workspace = await temporary();
  const { request } = await serve(t, workspace);
  await request('/workspace', 'PUT', { data: sampleData, revision: 0 });
  const created = await request('/special-programs', 'POST', {
    name: '国际项目',
    category: 'SGU',
    universityId: 'u1',
    schoolId: 's1',
    majorId: 'm1',
    status: 'preparing',
    degree: 'master',
    favorite: true,
  });
  assert.equal(created.status, 201);
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  const row = db
    .prepare('SELECT university_id,school_id,major_id FROM special_programs')
    .get();
  assert.equal(row.university_id, null);
  assert.equal(row.school_id, null);
  assert.equal(row.major_id, 'm1');
  const current = (await request('/workspace')).value;
  current.data.universities[0].name = '大学新名称';
  await request('/workspace', 'PUT', {
    data: current.data,
    revision: current.revision,
  });
  const list = (await request('/special-programs')).value;
  assert.equal(list[0].universityName, '大学新名称');
  assert.equal(list[0].favorite, true);
  const beforeDelete = (await request('/workspace')).value;
  const removed = await request('/workspace', 'PUT', {
    data: {
      version: 2,
      universities: [],
      schools: [],
      majors: [],
      labs: [],
      professors: [],
    },
    revision: beforeDelete.revision,
  });
  assert.equal(removed.status, 200);
  const detached = (await request('/special-programs')).value[0];
  assert.equal(detached.universityId, '');
  assert.equal(detached.institutionName, '大学新名称');
  assert.equal(
    JSON.parse(
      db.prepare('SELECT data FROM special_admission_programs').get().data,
    ).legacyAffiliation.universityName,
    '大学新名称',
  );

  assert.equal(
    db.prepare("SELECT type FROM sqlite_master WHERE name='documents'").get()
      .type,
    'view',
  );
  assert.ok(
    !db
      .prepare('PRAGMA table_info(document_records)')
      .all()
      .some((col) => col.name === 'data'),
  );
  db.close();
});

test('legacy mail, archived experiences, reader notes and source files survive normalization', async (t) => {
  const { emptyContactRecord } = await import('./planning-fields.mjs');
  const workspace = await temporary();
  const data = structuredClone(sampleData);
  const experience = (experienceId) => ({
    ...emptyContactRecord(),
    experienceId,
    experienceTitle: experienceId,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    version: 1,
  });
  data.professors[0].contact = experience('current-case');
  data.professors[0].contact.interviewQA = [
    { id: 'q1', question: '研究方向是什么？', answer: '人机交互' },
  ];
  data.professors[0].contactHistory = [experience('archived-case')];
  data.professors[0].contactHistory[0].notes = '保留旧年度联络记录';
  legacyDatabase(workspace, data);
  const doc = {
    id: 'd1',
    ownerType: 'professor',
    ownerId: 'p1',
    kind: 'consent',
    year: 2027,
    title: '内诺原文',
    filename: 'consent.txt',
    path: 'professors/p1/consent.txt',
    size: 6,
    extension: '.txt',
    mimeType: 'text/plain',
    charset: 'utf-8',
    sha256: 'old-source-hash',
    experienceId: 'archived-case',
    signed: true,
    signedDate: '2026-10-01',
    questionId: '',
    notes: '重要原文',
    authors: '',
    venue: '',
    createdAt: '2026-10-01T00:00:00Z',
    customEvidence: { quote: 'never lose this' },
  };
  const mail = {
    id: 'mail1',
    professorId: 'p1',
    experienceId: 'archived-case',
    direction: 'received',
    subject: '原邮件',
    body: '旧邮件正文',
    address: 'teacher@example.ac.jp',
    date: '2026-10-01T10:00',
    notes: '邮件笔记',
    nextAction: '',
    followUpDate: '',
    createdAt: '2026-10-01T00:00:00Z',
  };
  const old = new DatabaseSync(path.join(workspace, 'workspace.db'));
  old
    .prepare('INSERT INTO documents VALUES(?,?,?,?)')
    .run(doc.id, doc.ownerType, doc.ownerId, JSON.stringify(doc));
  old
    .prepare('INSERT INTO messages VALUES(?,?,?)')
    .run(mail.id, mail.professorId, JSON.stringify(mail));
  old.exec(`CREATE TABLE document_reader_states(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,data TEXT NOT NULL);
    CREATE TABLE document_annotations(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,data TEXT NOT NULL);
    CREATE INDEX document_annotations_document ON document_annotations(document_id);
    CREATE TABLE document_reader_text(document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,sha256 TEXT NOT NULL,parser_version TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(document_id,sha256,parser_version));
    INSERT INTO schema_migrations VALUES(8,datetime('now'));`);
  old
    .prepare('INSERT INTO document_annotations VALUES(?,?,?)')
    .run('a1', 'd1', JSON.stringify({ text: '保留批注内容' }));
  old
    .prepare('INSERT INTO document_reader_states VALUES(?,?)')
    .run('d1', JSON.stringify({ page: 3, notes: '保留阅读笔记' }));
  old.close();
  await mkdir(path.dirname(path.join(workspace, doc.path)), {
    recursive: true,
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(workspace, doc.path), 'source');
  const { request } = await serve(t, workspace);
  const docs = (await request('/documents?ownerType=professor&ownerId=p1'))
    .value;
  assert.deepEqual(docs[0], doc);
  assert.deepEqual((await request('/messages?professorId=p1')).value, [mail]);
  const after = (await request('/workspace')).value;
  assert.equal(
    after.data.professors[0].contactHistory[0].notes,
    '保留旧年度联络记录',
  );
  assert.deepEqual(after.data.professors[0].contact.interviewQA, [
    { id: 'q1', question: '研究方向是什么？', answer: '人机交互' },
  ]);
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  assert.equal(
    JSON.parse(db.prepare('SELECT data FROM document_annotations').get().data)
      .text,
    '保留批注内容',
  );
  assert.equal(
    JSON.parse(db.prepare('SELECT data FROM document_reader_states').get().data)
      .notes,
    '保留阅读笔记',
  );
  assert.ok(
    !db
      .prepare('PRAGMA table_info(mail_messages)')
      .all()
      .some((col) => col.name === 'professor_id'),
  );
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
  assert.equal(
    await readFile(path.join(workspace, doc.path), 'utf8'),
    'source',
  );
});

test('incremental task edits are atomic, reject unknown fields, and preserve provenance omitted by old pages', async (t) => {
  const workspace = await temporary();
  const { request } = await serve(t, workspace);
  await request('/workspace', 'PUT', { data: sampleData, revision: 0 });
  let current = (await request('/workspace')).value;
  const id = current.data.labs[0].id;
  current.data.majors[0].analysisHistory = [
    {
      id: 'audit1',
      documentId: 'old-doc',
      documentTitle: '募集要项',
      analyzedAt: '2026-10-01',
      adopter: '用户',
      adoptedAt: '2026-10-02',
      fields: { applicationMaterials: { value: '研究计划书', pages: [2, 3] } },
    },
  ];
  await request('/workspace', 'PUT', {
    data: current.data,
    revision: current.revision,
  });
  current = (await request('/workspace')).value;
  const invalid = await request(`/workspace/labs/${id}`, 'PATCH', {
    revision: current.entityRevisions.labs[id],
    patch: { majorId: 'missing' },
  });
  assert.equal(invalid.status, 400);
  assert.equal((await request('/workspace')).value.revision, current.revision);
  const patched = await request(`/workspace/labs/${id}`, 'PATCH', {
    revision: current.entityRevisions.labs[id],
    patch: {
      tasks: [
        {
          id: 't1',
          kind: 'material',
          title: '成绩单',
          progress: 70,
          dueDate: '',
          notes: '保留',
        },
      ],
    },
  });
  assert.equal(patched.status, 200);
  current = patched.value;
  assert.equal(current.data.labs[0].tasks[0].progress, 70);
  const old = structuredClone(current.data);
  delete old.majors[0].analysisHistory;
  delete old.labs[0].tasksVersion;
  const saved = await request('/workspace', 'PUT', {
    data: old,
    revision: current.revision,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.data.majors[0].analysisHistory[0].id, 'audit1');
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  assert.equal(
    db.prepare('SELECT title,progress FROM lab_tasks WHERE lab_id=?').get(id)
      .progress,
    70,
  );
  assert.throws(
    () =>
      db.prepare('UPDATE lab_tasks SET progress=101 WHERE lab_id=?').run(id),
    /CHECK/,
  );
  db.close();
});

test('answers inherit the question owner and year without storing duplicate attributes', async (t) => {
  const workspace = await temporary();
  const { request } = await serve(t, workspace);
  await request('/workspace', 'PUT', { data: sampleData, revision: 0 });
  const db = new DatabaseSync(path.join(workspace, 'workspace.db'));
  db.exec('PRAGMA foreign_keys=ON');
  const question = {
    id: 'q1',
    ownerType: 'major',
    ownerId: 'm1',
    kind: 'question',
    year: 2027,
    title: '过去问',
    questionId: '',
  };
  const answer = {
    id: 'a1',
    ownerType: 'major',
    ownerId: 'm1',
    kind: 'answer',
    year: 2027,
    title: '答案',
    questionId: 'q1',
  };
  saveProjectedRecord(db, 'documents', question);
  saveProjectedRecord(db, 'documents', answer);
  const raw = db
    .prepare(
      'SELECT owner_major_id,year,question_id FROM document_records WHERE id=?',
    )
    .get('a1');
  assert.equal(raw.owner_major_id, null);
  assert.equal(raw.year, null);
  assert.equal(raw.question_id, 'q1');
  const loaded = await request('/documents?ownerType=major&ownerId=m1');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.value.find((item) => item.id === 'a1').ownerId, 'm1');
  assert.equal(loaded.value.find((item) => item.id === 'a1').year, 2027);
  db.prepare('UPDATE document_records SET year=2028 WHERE id=?').run('q1');
  assert.equal(
    (await request('/documents?ownerType=major&ownerId=m1')).value.find(
      (item) => item.id === 'a1',
    ).year,
    2028,
  );
  db.close();
});
