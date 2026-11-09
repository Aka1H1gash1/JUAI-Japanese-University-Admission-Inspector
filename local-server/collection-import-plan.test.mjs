/* oxlint-disable vitest/no-import-node-test, unicorn/no-await-expression-member -- Standalone Node HTTP and SQLite regression tests. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCollectionImportPlan } from './collection-import-plan.mjs';
import { sampleData } from './test-fixtures.mjs';
function fixture() {
  return {
    job: {
      id: 'job',
      status: 'review',
      ruleVersion: 3,
      importPolicy: 'create_only',
      requestedKind: 'university',
      draft: { university: [{ field: 'name', value: '新大学' }] },
    },
    data: structuredClone(sampleData),
    revision: 1,
    selection: {
      ruleVersion: 3,
      revision: 1,
      entities: {
        university: {
          action: 'create',
          candidateKey: 'university:primary',
          fields: { name: '新大学' },
        },
      },
    },
  };
}
test('plan reserves IDs without mutating candidates or workspace', () => {
  const input = fixture();
  const before = structuredClone(input);
  const plan = buildCollectionImportPlan(input);
  assert.deepEqual(input, before);
  assert.equal(plan.counts.createdEntities, 1);
  assert.equal(plan.additions.universities[0].name, '新大学');
  assert.equal(plan.planHash.length, 64);
});
test('existing principal is linked with ID only', () => {
  const input = fixture();
  input.job.draft.university[0].value = input.data.universities[0].name;
  input.selection.entities.university = {
    action: 'link',
    id: input.data.universities[0].id,
  };
  const plan = buildCollectionImportPlan(input);
  assert.equal(plan.counts.createdEntities, 0);
  assert.equal(plan.counts.linkedEntities, 1);
  input.selection.entities.university.fields = {};
  assert.throws(() => buildCollectionImportPlan(input), {
    code: 'CREATE_ONLY_VIOLATION',
  });
});
test('rejects legacy, stale, replacement, invented values and forced duplicates', () => {
  for (const mutate of [
    (x) => {
      x.job.ruleVersion = 2;
    },
    (x) => {
      x.selection.revision = 0;
    },
    (x) => {
      x.selection.allowReplace = true;
    },
    (x) => {
      x.selection.entities.university.fields.unrecognized = 'invented';
    },
    (x) => {
      x.job.draft.university[0].value = x.data.universities[0].name;
      x.selection.entities.university.fields.name = x.data.universities[0].name;
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => buildCollectionImportPlan(input));
  }
});
test('all five requested levels create only the exact chain with full new ancestor fields', () => {
  const kinds = ['university', 'school', 'major', 'lab', 'professor'];
  for (const requestedKind of kinds) {
    const input = fixture();
    input.job.requestedKind = requestedKind;
    input.job.draft = {};
    input.selection.entities = {};
    for (const kind of kinds.slice(0, kinds.indexOf(requestedKind) + 1)) {
      const fields = { name: `新${kind}`, notes: '来自已核验来源的说明' };
      input.job.draft[kind] = Object.entries(fields).map(([field, value]) => ({
        field,
        value,
      }));
      input.selection.entities[kind] = {
        action: 'create',
        candidateKey: `${kind}:primary`,
        fields,
      };
    }
    const plan = buildCollectionImportPlan(input);
    assert.equal(plan.operations.length, kinds.indexOf(requestedKind) + 1);
    for (const op of plan.operations) assert.equal(op.action, 'created');
    assert.equal(plan.additions.universities[0].notes, '来自已核验来源的说明');
    if (requestedKind === 'professor')
      assert.equal(
        plan.additions.professors[0].labId,
        plan.additions.labs[0].id,
      );
  }
});
test('professors sharing a lab URL with different names are not the same identity', async () => {
  const { matchCollectionEntities } = await import('./collection-matching.mjs');
  const data = structuredClone(sampleData);
  data.professors = [
    {
      id: 'p-existing',
      name: '山田太郎',
      labId: 'lab-existing',
      laboratoryWebsite: 'https://example.edu/lab/',
    },
  ];
  data.labs = [{ id: 'lab-existing', name: '研究室', majorId: 'm1' }];
  const draft = {
    professor: [
      { field: 'name', value: '田中花子' },
      { field: 'laboratoryWebsite', value: 'https://example.edu/lab/' },
    ],
  };
  assert.deepEqual(matchCollectionEntities(data, { draft }).professor, []);
});
