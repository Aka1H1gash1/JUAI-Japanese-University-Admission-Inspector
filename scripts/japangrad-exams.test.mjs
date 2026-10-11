import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalApp, validateExplorer } from '../local-server/server.mjs';
import { sampleData } from '../local-server/test-fixtures.mjs';
import {
  blankExamRecord,
  normalizeExamRecord,
  parseExamPaste,
  prepareExamBatch,
  validExamHistory,
} from '../apps/web-antd/src/views/japan-grad/exam-history.ts';
import {
  admissionRangeError,
  validAdmissionFields,
} from '../apps/web-antd/src/views/japan-grad/major-admissions.ts';

const exam = {
  id: 'exam-2027-summer',
  year: '2027',
  session: '夏季入试',
  examDate: '2026-08-20 09:00 笔试\n2026-08-21 10:00 面试',
  subjects: '数学、专业课、英语、口试',
  sourceUrl: 'https://example.ac.jp/admissions',
  notes: '核对最新募集要项。',
};

test('exam history accepts old workspaces and multiple sessions, and rejects invalid or duplicate records', () => {
  assert.doesNotThrow(() => validateExplorer(structuredClone(sampleData)));
  const data = structuredClone(sampleData);
  data.majors[0].examHistory = [
    exam,
    { ...exam, id: 'exam-2027-winter', session: '冬季入试' },
  ];
  assert.equal(validExamHistory(data.majors[0].examHistory), true);
  assert.doesNotThrow(() => validateExplorer(data));
  for (const entry of [
    { ...exam, year: '1800' },
    { ...exam, year: 2027 },
    { ...exam, id: '../file' },
    { ...exam, subjects: null },
    { ...exam, examDate: 'a'.repeat(241) },
    { ...exam, writtenDate: null },
    { ...exam, interviewDate: 123 },
    { ...exam, resultDate: 'a'.repeat(241) },
  ]) {
    data.majors[0].examHistory = [entry];
    assert.equal(validExamHistory([entry]), false);
    assert.throws(() => validateExplorer(data));
  }
  data.majors[0].examHistory = [exam, exam];
  assert.equal(validExamHistory([exam, exam]), false);
  assert.throws(() => validateExplorer(data));
});

test('batch preparation ignores blank rows, validates every row and protects existing year/session records', () => {
  const legacy = normalizeExamRecord(exam);
  assert.equal(legacy.examDate, exam.examDate);
  assert.equal(legacy.writtenDate, '');
  const make = (year, session = '') => ({
    ...blankExamRecord(),
    year,
    session,
  });
  assert.equal(
    prepareExamBatch([make('2024'), blankExamRecord(), make('2023')], [])
      .length,
    2,
  );
  assert.throws(
    () => prepareExamBatch([make('2024'), make('2024')], []),
    /第 2 行/,
  );
  assert.throws(
    () => prepareExamBatch([make('2024')], [make('2024')]),
    /已有记录/,
  );
  assert.equal(
    prepareExamBatch([make('2024', '冬季入试')], [make('2024', '夏季入试')])
      .length,
    1,
  );
  assert.throws(
    () => prepareExamBatch([make('2024'), make('20')], []),
    /第 2 行/,
  );
  assert.throws(() => prepareExamBatch([blankExamRecord()], []), /至少填写/);
  assert.throws(
    () =>
      prepareExamBatch(
        Array.from({ length: 51 }, () => blankExamRecord()),
        [],
      ),
    /50/,
  );
  const pasted = parseExamPaste(
    '考试年份\t考试科目\t笔试时间\t面试时间\t结果发布时间\r\n2024\t数学、英语\t2024-08-20\t\t2024-09-01\r\n2023\t专业课\t2023-08-10\t2023-08-11\t\t冬季入试',
  );
  assert.equal(pasted.length, 2);
  assert.equal(pasted[0].interviewDate, '');
  assert.equal(pasted[0].resultDate, '2024-09-01');
  assert.equal(pasted[1].session, '冬季入试');
  assert.throws(() => parseExamPaste('wrong\t数学'), /第 1 行/);
  assert.throws(() => parseExamPaste('2024\ta\tb\tc\td\te\tf\tg'), /7 列/);
  const notes = parseExamPaste(
    '考试年份\t考试科目\t笔试时间\t面试时间\t结果发布时间\t备注\n2024\t数学\t2024-08-20\t2024-08-21\t2024-09-01\t本年追加推荐信',
  );
  assert.equal(notes[0].notes, '本年追加推荐信');
  assert.equal(notes[0].session, '');
  const withoutHeader = parseExamPaste(
    '2024\t数学\t2024-08-20\t\t\t冬季入试\t截止日提前',
  );
  assert.equal(withoutHeader[0].session, '冬季入试');
  assert.equal(withoutHeader[0].notes, '截止日提前');
});

test('admission periods and materials accept legacy, recurring periods and blank values, and validate date order', () => {
  assert.equal(validAdmissionFields({}), true);
  assert.equal(validAdmissionFields({ applicationMaterials: null }), false);
  assert.equal(
    validAdmissionFields({ applicationStart: 'x'.repeat(121) }),
    false,
  );
  assert.equal(
    validAdmissionFields({ applicationMaterials: 'x'.repeat(8001) }),
    false,
  );
  assert.equal(
    admissionRangeError({
      applicationStart: '每年 12 月',
      applicationEnd: '次年 1 月',
      applicationMaterials: '愿书\n研究计划书',
    }),
    '',
  );
  assert.match(
    admissionRangeError({
      applicationStart: '2026-06-15',
      applicationEnd: '2026-06-01',
      applicationMaterials: '',
    }),
    /不能早于/,
  );
  assert.equal(
    admissionRangeError({
      applicationStart: '',
      applicationEnd: '',
      applicationMaterials: '',
    }),
    '',
  );
  const data = structuredClone(sampleData);
  Object.assign(data.majors[0], {
    applicationStart: '2026-06-15',
    applicationEnd: '2026-06-01',
  });
  assert.throws(() => validateExplorer(data), /不能早于/);
});

test('exam history survives restart and editing, supports deletion and respects workspace revisions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-exams-'));
  let server;
  async function start() {
    server = await createLocalApp({ workspace });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}/api/japangrad/workspace`;
  }
  async function close() {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
  let url = await start();
  const save = (data, revision) =>
    fetch(url, {
      method: 'PUT',
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data, revision }),
    });
  try {
    const data = structuredClone(sampleData);
    data.majors[0].examHistory = [exam];
    Object.assign(data.majors[0], {
      applicationStart: '每年 6 月 1 日',
      applicationEnd: '每年 6 月 15 日',
      applicationMaterials: '入学愿书\n研究计划书\n成绩单（原件）',
    });
    assert.equal((await save(data, 0)).status, 200);
    await close();
    url = await start();
    const restored = await (await fetch(url)).json();
    assert.deepEqual(restored.data.majors[0].examHistory, [exam]);
    assert.equal(restored.data.majors[0].applicationStart, '每年 6 月 1 日');
    assert.equal(
      restored.data.majors[0].applicationMaterials,
      '入学愿书\n研究计划书\n成绩单（原件）',
    );
    data.majors[0].name = '更新后的专攻';
    data.majors[0].examHistory[0] = {
      ...exam,
      subjects: '数学、计算机专业课、英语、口试',
      writtenDate: '2026-08-20 09:00',
      interviewDate: '2026-08-21 10:00',
      resultDate: '2026-09-01',
    };
    assert.equal((await save(data, 1)).status, 200);
    assert.equal((await save(data, 1)).status, 409);
    assert.equal(
      (await (await fetch(url)).json()).data.majors[0].examHistory[0].subjects,
      '数学、计算机专业课、英语、口试',
    );
    const oldPageData = structuredClone(data);
    delete oldPageData.majors[0].examHistory;
    for (const key of [
      'applicationStart',
      'applicationEnd',
      'applicationMaterials',
    ])
      delete oldPageData.majors[0][key];
    assert.equal((await save(oldPageData, 2)).status, 200);
    assert.equal(
      (await (await fetch(url)).json()).data.majors[0].examHistory[0].subjects,
      '数学、计算机专业课、英语、口试',
    );
    assert.equal(
      (await (await fetch(url)).json()).data.majors[0].applicationMaterials,
      '入学愿书\n研究计划书\n成绩单（原件）',
    );
    const oldColumnsData = structuredClone(data);
    for (const key of ['writtenDate', 'interviewDate', 'resultDate'])
      delete oldColumnsData.majors[0].examHistory[0][key];
    assert.equal((await save(oldColumnsData, 3)).status, 200);
    const retained = (await (await fetch(url)).json()).data.majors[0]
      .examHistory[0];
    assert.equal(retained.writtenDate, '2026-08-20 09:00');
    assert.equal(retained.interviewDate, '2026-08-21 10:00');
    assert.equal(retained.resultDate, '2026-09-01');
    data.majors[0].examHistory[0].resultDate = '';
    assert.equal((await save(data, 4)).status, 200);
    assert.equal(
      (await (await fetch(url)).json()).data.majors[0].examHistory[0]
        .resultDate,
      '',
    );
    data.majors[0].examHistory = [];
    assert.equal((await save(data, 5)).status, 200);
    assert.deepEqual(
      (await (await fetch(url)).json()).data.majors[0].examHistory,
      [],
    );
    Object.assign(data.majors[0], {
      applicationStart: '',
      applicationEnd: '',
      applicationMaterials: '',
    });
    assert.equal((await save(data, 6)).status, 200);
    assert.equal(
      (await (await fetch(url)).json()).data.majors[0].applicationMaterials,
      '',
    );
  } finally {
    await close();
  }
});
