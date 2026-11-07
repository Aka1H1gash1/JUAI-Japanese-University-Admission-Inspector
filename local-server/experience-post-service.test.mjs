/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone Node integration tests. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectExperienceCandidates,
  experienceQuery,
} from './experience-post-service.mjs';
import { createLocalApp } from './server.mjs';
import { sampleData } from './test-fixtures.mjs';

test('experience posts persist, paginate, validate affiliation, dedupe and protect concurrent edits', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-post-test-'));
  let app;
  let base;
  async function start() {
    app = await createLocalApp({ workspace });
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  }
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json() };
  };
  const post = (n) => ({
    schoolId: 's1',
    majorId: 'm1',
    title: `体験記 ${n}`,
    url: `https://note.com/example/n/${n}`,
    author: '作者',
    language: '日本語',
    year: '2027',
    notes: '个人经验',
  });
  try {
    await start();
    const data = structuredClone(sampleData);
    data.schools.push({ ...data.schools[0], id: 's2' });
    data.majors.push({ ...data.majors[0], id: 'm2', schoolId: 's2' });
    data.universities.push({ ...data.universities[0], id: 'u2' });
    data.schools.push({ ...data.schools[0], id: 's3', universityId: 'u2' });
    data.majors.push({ ...data.majors[0], id: 'm3', schoolId: 's3' });
    assert.equal(
      (await call('/workspace', 'PUT', { data, revision: 0 })).status,
      200,
    );
    let first;
    for (let n = 0; n < 25; n++) {
      const result = await call('/experience-posts', 'POST', post(n));
      assert.equal(result.status, 201);
      if (!n) first = result.data;
    }
    assert.equal(
      (
        await call('/experience-posts', 'POST', {
          ...post(100),
          schoolId: 's3',
          majorId: 'm3',
        })
      ).status,
      201,
    );
    const universityPosts = (await call('/experience-posts?universityId=u1'))
      .data;
    assert.equal(universityPosts.total, 25);
    assert.ok(universityPosts.items.every((p) => p.schoolId === 's1'));
    assert.equal(
      (await call('/experience-posts?universityId=u2')).data.total,
      1,
    );
    assert.equal(
      (await call('/experience-posts?universityId=u1&majorId=m3')).status,
      400,
    );
    assert.equal(
      (await call('/experience-posts?universityId=u1&schoolId=s3')).status,
      400,
    );
    const summary = (await call('/experience-posts/summary')).data.items;
    assert.equal(summary.find((r) => r.universityId === 'u1').total, 25);
    assert.equal(summary.find((r) => r.universityId === 'u2').total, 1);
    const list = await call('/experience-posts?schoolId=s1&page=3&pageSize=12');
    assert.equal(list.data.total, 25);
    assert.equal(list.data.items.length, 1);
    assert.equal((await call('/experience-posts?schoolId=s2')).data.total, 0);
    assert.equal(
      (await call('/experience-posts?schoolId=s1&q=%25')).data.total,
      0,
    );
    assert.equal(
      (await call('/experience-posts?schoolId=s1&majorId=m2')).status,
      400,
    );
    assert.equal(
      (
        await call('/experience-posts', 'POST', {
          ...post(0),
          notes: '不应覆盖',
        })
      ).data.duplicate,
      true,
    );
    assert.equal(
      (await call('/experience-posts', 'POST', { ...post(26), majorId: 'm2' }))
        .status,
      400,
    );
    assert.equal(
      (
        await call('/experience-posts', 'POST', {
          ...post(26),
          url: 'javascript:alert(1)',
        })
      ).status,
      400,
    );
    const edited = await call(`/experience-posts/${first.id}`, 'PUT', {
      ...first,
      notes: '更新备注',
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.version, 2);
    assert.equal(
      (await call(`/experience-posts/${first.id}`, 'PUT', first)).status,
      409,
    );
    assert.equal(
      (await call('/workspace', 'PUT', { data, revision: 1 })).status,
      200,
    );
    assert.equal(
      (await call('/experience-posts?schoolId=s1')).data.total,
      25,
      'workspace refresh preserves posts',
    );
    app.close();
    await once(app, 'close');
    await start();
    assert.equal((await call('/experience-posts?schoolId=s1')).data.total, 25);
    assert.equal(
      (await call(`/experience-posts/${first.id}`, 'DELETE', { version: 1 }))
        .status,
      409,
    );
    assert.equal(
      (await call(`/experience-posts/${first.id}`, 'DELETE', { version: 2 }))
        .status,
      200,
    );
    const beforeMove = (await call('/workspace')).data.revision;
    data.majors[0].schoolId = 's2';
    assert.equal(
      (await call('/workspace', 'PUT', { data, revision: beforeMove })).status,
      200,
    );
    const retainedPosts = (await call('/experience-posts?schoolId=s1')).data;
    assert.equal(retainedPosts.total, 24);
    assert.ok(
      retainedPosts.items.every((post) => post.majorId === ''),
      'moved major does not create cross-school affiliation',
    );
    const revision = (await call('/workspace')).data.revision;
    data.universities = [];
    data.schools = [];
    data.majors = [];
    data.professors = [];
    data.labs = [];
    assert.equal(
      (await call('/workspace', 'PUT', { data, revision })).status,
      200,
    );
    assert.equal((await call('/experience-posts?schoolId=s1')).status, 404);
  } finally {
    if (app) {
      app.close();
      await once(app, 'close');
    }
    await rm(workspace, { recursive: true, force: true });
  }
});

test('experience candidate search is optional, cached and never contaminates official draft', async () => {
  const draft = {
    university: [{ field: 'name', value: '京都大学' }],
    school: [{ field: 'name', value: '情報学研究科' }],
    major: [],
    admissions: { selection: '官方科目' },
  };
  const job = { searchMode: 'auto', draft: structuredClone(draft) };
  const signal = new AbortController().signal;
  let calls = 0;
  const search = async ({ names }) => {
    calls++;
    assert.deepEqual(names, ['京都大学', '情報学研究科']);
    return {
      query: experienceQuery(names),
      provider: 'DeepSeek',
      results: [
        { title: '经验', url: 'https://example.com/post', snippet: '旧经历' },
      ],
    };
  };
  await collectExperienceCandidates({ job, signal, search });
  await collectExperienceCandidates({ job, signal, search });
  assert.equal(calls, 1);
  assert.equal(job.experienceSearch.status, 'complete');
  assert.deepEqual(job.draft, draft);
  for (const settings of [
    { searchMode: 'off' },
    { searchMode: 'auto', searchExperiences: false },
  ])
    await collectExperienceCandidates({
      job: { ...settings, draft },
      signal,
      search,
    });
  assert.equal(calls, 1);
  const failed = { searchMode: 'auto', draft };
  await collectExperienceCandidates({
    job: failed,
    signal,
    search: async () => {
      throw new Error('余额不足');
    },
  });
  assert.equal(failed.experienceSearch.status, 'failed');
  assert.deepEqual(failed.draft, draft);
  assert.ok([...experienceQuery(['长'.repeat(500)])].length <= 128);
});
