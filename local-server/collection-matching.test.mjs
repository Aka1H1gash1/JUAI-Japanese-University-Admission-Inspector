/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone HTTP regression assertions follow the shared server test convention. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { blankCollectionEntity } from './collection-fields.mjs';
import { matchCollectionEntities } from './collection-matching.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';
const emptyDraft = () => ({
  university: [],
  school: [],
  major: [],
  lab: [],
  professor: [],
  documents: [],
  exams: [],
  warnings: [],
  admissions: { status: 'not_requested', fields: [], scope: '' },
});
test('existing ancestry survives omitted or differently translated AI names at each level', () => {
  const data = structuredClone(sampleData);
  data.labs = [];
  data.professors = [];
  for (const [parent, ids] of [
    ['university', { university: 'u1' }],
    ['school', { university: 'u1', school: 's1' }],
    ['major', { university: 'u1', school: 's1', major: 'm1' }],
  ]) {
    const job = {
      parent: { kind: parent, id: ids[parent] },
      target: { ids },
      draft: emptyDraft(),
    };
    for (const [kind, id] of Object.entries(ids))
      assert.deepEqual(matchCollectionEntities(data, job)[kind], [id]);
  }
});
test('independent imports infer existing parents through unique children and scoped aliases', () => {
  const data = structuredClone(sampleData);
  data.universities[0].name = '京都大学';
  data.schools[0].name = '情報学研究科';
  data.majors[0].name = '情報学専攻';
  const draft = emptyDraft();
  draft.major = [
    { field: 'name', value: '京都大学 大学院 情報学研究科 情報学专攻' },
  ];
  // The fully qualified major includes an intermediate university-school prefix.
  draft.major = [{ field: 'name', value: '情報学专攻' }];
  const m = matchCollectionEntities(data, { draft });
  assert.deepEqual(m.major, ['m1']);
  assert.deepEqual(m.school, ['s1']);
  assert.deepEqual(m.university, ['u1']);
  const school = emptyDraft();
  school.school = [{ field: 'name', value: '京都大学 大学院 情報学研究科' }];
  assert.deepEqual(matchCollectionEntities(data, { draft: school }).school, [
    's1',
  ]);
  data.universities.push({ ...data.universities[0], id: 'u2', name: '別大学' });
  data.schools.push({ ...data.schools[0], id: 's2', universityId: 'u2' });
  data.majors.push({ ...data.majors[0], id: 'm2', schoolId: 's2' });
  assert.deepEqual(matchCollectionEntities(data, { draft }).major, [
    'm1',
    'm2',
  ]);
  draft.university = [{ field: 'name', value: '京都大学' }];
  assert.deepEqual(matchCollectionEntities(data, { draft }).major, ['m1']);
});
test('apply reuses existing ancestors and rejects duplicate parent creation for school, major and lab', async () => {
  const workspace = await mkdtemp('/private/tmp/juai-parent-regression-');
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
  const db = new DatabaseSync(`${workspace}/workspace.db`);
  try {
    for (const kind of ['school', 'major', 'lab', 'professor']) {
      const data = structuredClone(sampleData);
      data.professors = [];
      data.labs = [];
      if (kind === 'professor')
        data.labs = [
          {
            ...blankCollectionEntity('lab', 'l1', 'm1'),
            name: '原研究室',
            mainProfessorId: '',
          },
        ];
      if (kind === 'school') {
        data.schools = [];
        data.majors = [];
      }
      if (kind === 'major') data.majors = [];
      let current = (await call('/workspace')).data;
      assert.equal(
        (await call('/workspace', 'PUT', { revision: current.revision, data }))
          .status,
        200,
      );
      current = (await call('/workspace')).data;
      const chain = {
        school: { university: 'u1' },
        major: { university: 'u1', school: 's1' },
        lab: { university: 'u1', school: 's1', major: 'm1' },
        professor: { university: 'u1', school: 's1', major: 'm1', lab: 'l1' },
      }[kind];
      const id = `parent-test-${kind}`;
      const parent = {
        school: 'university',
        major: 'school',
        lab: 'major',
        professor: 'lab',
      }[kind];
      const job = {
        id,
        createdAt: new Date().toISOString(),
        status: 'review',
        ruleVersion: 2,
        urls: ['https://example.com/'],
        context: { admissionYear: 2027 },
        draft: { ...emptyDraft(), subject: { kind } },
        parent: { kind: parent, id: chain[parent] },
        target: { ids: chain },
        log: [],
        warnings: [],
      };
      db.prepare('INSERT INTO collection_jobs VALUES(?,?,?)').run(
        id,
        job.createdAt,
        JSON.stringify(job),
      );
      const detail = (await call(`/collection/jobs/${id}`)).data;
      for (const [k, v] of Object.entries(chain))
        assert.deepEqual(detail.matches[k], [v]);
      const entities = Object.fromEntries(
        Object.entries(chain).map(([k, v]) => [
          k,
          {
            id: v,
            fields: { name: '不应覆盖的上级名称', notes: '不应覆盖上级说明' },
          },
        ]),
      );
      if (kind === 'lab') {
        job.draft.professor = [
          {
            field: 'name',
            value: '负责人老师',
            evidence: [],
            requiresScopeConfirmation: false,
          },
        ];
        db.prepare('UPDATE collection_jobs SET data=? WHERE id=?').run(
          JSON.stringify(job),
          id,
        );
        entities.professor = { fields: { name: '负责人老师' } };
      }
      entities[kind] = { fields: { name: '新对象' } };
      const payload = {
        confirm: true,
        revision: current.revision,
        targetKind: kind,
        includeProfessor: kind === 'lab',
        entities,
        documents: [],
        exams: [],
        confirmedScopes: [],
      };
      const bad = structuredClone(payload);
      bad.entities.university = { fields: { name: '重复大学' } };
      assert.equal(
        (await call(`/collection/jobs/${id}/apply`, 'POST', bad)).status,
        409,
      );
      const result = await call(
        `/collection/jobs/${id}/apply`,
        'POST',
        payload,
      );
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const saved = (await call('/workspace')).data.data;
      assert.equal(saved.universities.length, 1);
      assert.deepEqual(saved.universities, current.data.universities);
      if (kind !== 'school')
        assert.deepEqual(saved.schools, current.data.schools);
      if (kind !== 'major' && kind !== 'school')
        assert.deepEqual(saved.majors, current.data.majors);
      if (kind === 'professor') {
        assert.equal(saved.professors.length, 1);
        assert.equal(saved.professors[0].labId, 'l1');
        assert.deepEqual(saved.labs, current.data.labs);
      }
      if (kind === 'major') assert.equal(saved.majors[0].schoolId, 's1');
      if (kind === 'lab') {
        assert.equal(saved.professors.length, 1);
        assert.equal(saved.professors[0].labId, saved.labs[0].id);
        assert.equal(saved.labs[0].majorId, 'm1');
        assert.equal(saved.majors.length, 1);
      }
      if (kind === 'school') assert.equal(saved.schools[0].universityId, 'u1');
    }
  } finally {
    db.close();
    app.closeAllConnections();
    app.close();
    await once(app, 'close');
  }
});
