/* oxlint-disable vitest/no-import-node-test -- Standalone Node tests. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { admissionItems } from '../apps/web-antd/src/views/japan-grad/admission-content.ts';
import { admissionPriorityPages } from './admission-reading.mjs';
test('materials split into items without splitting parenthetical conditions or English-test alternatives', () => {
  assert.deepEqual(
    admissionItems(
      '志愿票/履历、成绩证明（原件，中国毕业者另需CHSI）、TOEIC/TOEFL/IELTS成绩单；护照复印件',
    ),
    [
      '志愿票/履历',
      '成绩证明（原件，中国毕业者另需CHSI）',
      'TOEIC/TOEFL/IELTS成绩单',
      '护照复印件',
    ],
  );
  assert.deepEqual(admissionItems('1. 成绩证明\n- 毕业证明'), [
    '成绩证明',
    '毕业证明',
  ]);
});
test('appendix subject table and material continuation outrank generic selection text', () => {
  const pages = [
    { page: 1, text: 'Application Guidelines' },
    { page: 5, text: 'Documents to be submitted: Transcript' },
    { page: 6, text: 'TOEFL score sheet. Envelope' },
    {
      page: 7,
      text: 'Selection Method. Specialized Subjects: refer to Attached Sheet 1',
    },
    {
      page: 11,
      text: 'Attached Sheet 1 Specialized Subjects Date/time Answer 3 questions. Algorithms, Artificial Intelligence',
    },
  ];
  const result = admissionPriorityPages(pages);
  assert.ok(result.includes(5));
  assert.ok(result.includes(6));
  assert.ok(result.includes(11));
  assert.ok(result.indexOf(11) < result.indexOf(7));
});
