/* oxlint-disable vitest/no-import-node-test -- This service helper uses Node's built-in test runner. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { guidelineTodoCandidates } from './analysis-service.mjs';

test('confirmed guideline dates become separate dated todos', () => {
  assert.deepEqual(
    guidelineTodoCandidates(
      {
        applicationStart: '2027-06-01',
        applicationEnd: '2027-06-15',
        writtenDate: '2027-08-20',
        interviewDate: '2027-08-21',
        resultDate: '2027-09-01',
      },
      '2027',
      '夏期',
    ).map(({ title, dueDate }) => ({ title, dueDate })),
    [
      { title: '开始出愿手续', dueDate: '2027-06-01' },
      { title: '完成出愿提交', dueDate: '2027-06-15' },
      { title: '2027 年 · 夏期 · 参加笔试', dueDate: '2027-08-20' },
      { title: '2027 年 · 夏期 · 参加面试', dueDate: '2027-08-21' },
      { title: '2027 年 · 夏期 · 确认合格结果', dueDate: '2027-09-01' },
    ],
  );
});

test('uncertain or incomplete guideline dates are not turned into todos', () => {
  assert.deepEqual(
    guidelineTodoCandidates({
      applicationStart: '2027 年 6 月上旬',
      applicationEnd: '',
      writtenDate: '2027-08-20 或 21 日',
      interviewDate: '2027-02-30',
      resultDate: '2027-09-01',
    }).map(({ title, dueDate }) => ({ title, dueDate })),
    [{ title: '入学考试 · 确认合格结果', dueDate: '2027-09-01' }],
  );
});
