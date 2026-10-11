import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import { createLocalApp } from '../local-server/server.mjs';
import { sampleData } from '../local-server/test-fixtures.mjs';
import { blankExamRecord } from '../apps/web-antd/src/views/japan-grad/exam-history.ts';

const workspace = await mkdtemp('/private/tmp/japangrad-exam-table-');
const artifacts = '/private/tmp/japangrad-exam-table-qa';
await mkdir(artifacts, { recursive: true });
let server;
let port = 0;
async function start() {
  server = await createLocalApp({
    workspace,
    staticDir: path.resolve('apps/web-antd/dist'),
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
}
async function closeServer() {
  const closed = once(server, 'close');
  server.close();
  await closed;
}
await start();
const base = `http://127.0.0.1:${port}`;
const url = `${base}/japan-grad/universities/u1/schools/s1/majors/m1`;
const snapshot = async () =>
  (await fetch(`${base}/api/japangrad/workspace`)).json();
const data = structuredClone(sampleData);
const legacy = {
  id: 'legacy-exam',
  year: '2021',
  session: '',
  examDate: '笔试：数学\n面试：专业课',
  subjects: '',
  sourceUrl: '',
  notes: '',
};
data.majors[0].examHistory = [legacy];
await fetch(`${base}/api/japangrad/workspace`, {
  method: 'PUT',
  headers: { 'X-JapanGrad-Client': '1', 'Content-Type': 'application/json' },
  body: JSON.stringify({ data, revision: 0 }),
});
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--disable-background-networking', '--disable-component-update'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  let writes = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      request.url().endsWith('/api/japangrad/workspace')
    )
      writes++;
  });
  const modal = () => page.locator('.ant-modal-content:visible');
  const batchSave = () =>
    modal().getByRole('button', { name: /^保存 \d+ 条记录$/ });
  const batchOpen = () =>
    page.getByRole('button', { name: '批量录入', exact: true }).click();
  const cancel = async () => {
    await modal()
      .getByRole('button', { name: /取\s*消/ })
      .click();
    await modal().waitFor({ state: 'hidden' });
  };
  async function saveBatch() {
    await batchSave().click();
    await modal().waitFor({ state: 'hidden' });
  }
  await page.goto(url);
  await page.locator('.exam-history-table').waitFor();
  assert.deepEqual(
    await page.locator('.exam-history-table thead th').allTextContents(),
    [
      '考试年份',
      '考试科目',
      '笔试时间',
      '面试时间',
      '结果发布时间',
      '备注',
      '操作',
    ],
  );
  assert.equal(
    await page.locator('.exam-history-table .major-admissions').count(),
    0,
  );
  await page.getByRole('button', { name: '编辑出愿信息', exact: true }).click();
  await modal().locator('#admission-start').fill('2026-06-20');
  await modal().locator('#admission-end').fill('2026-06-01');
  await modal()
    .getByRole('button', { name: '保存出愿信息', exact: true })
    .click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '不能早于' })
    .waitFor();
  assert.equal(writes, 0);
  await modal().locator('#admission-start').fill('每年 6 月 1 日');
  await modal().locator('#admission-end').fill('每年 6 月 15 日');
  await modal()
    .locator('#admission-materials')
    .fill('入学愿书\n研究计划书\n成绩单\n英语成绩证明');
  await modal()
    .getByRole('button', { name: '保存出愿信息', exact: true })
    .click();
  await modal().waitFor({ state: 'hidden' });
  assert.equal(writes, 1);
  assert.equal(await page.locator('.admission-materials li').count(), 4);
  assert.match(
    await page.locator('.admission-period').innerText(),
    /每年 6 月 15 日/,
  );
  await page.getByRole('button', { name: '编辑专攻', exact: true }).click();
  await modal().locator('#entity-notes').fill('确认出愿条件。');
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  assert.equal(writes, 2);
  assert.equal(await page.locator('.admission-materials li').count(), 4);
  await page.getByRole('button', { name: '编辑出愿信息', exact: true }).click();
  await modal().locator('#admission-materials').fill('不应保存的内容');
  await cancel();
  assert.equal(writes, 2);
  assert.equal(
    (await snapshot()).data.majors[0].applicationMaterials,
    '入学愿书\n研究计划书\n成绩单\n英语成绩证明',
  );
  assert.match(
    await page.locator('.exam-history-legacy').innerText(),
    /笔试：数学/,
  );
  await page
    .getByRole('button', { name: '编辑考试记录：2021', exact: true })
    .click();
  assert.equal(
    await modal().locator('#exam-history-date').inputValue(),
    legacy.examDate,
  );
  await modal().locator('#exam-history-subjects').fill('数学、专业课、英语');
  await modal().locator('#exam-history-writtenDate').fill('2021-08-20 09:00');
  await modal().locator('#exam-history-interviewDate').fill('2021-08-21 10:00');
  await modal().locator('#exam-history-resultDate').fill('2021-09-01');
  await modal()
    .locator('#exam-history-notes')
    .fill('本年出愿截止延至 6 月 20 日，须追加推荐信。');
  await modal()
    .getByRole('button', { name: '保存考试记录', exact: true })
    .click();
  await modal().waitFor({ state: 'hidden' });
  assert.equal(writes, 3);
  assert.match(
    await page.locator('.exam-history-note-cell').innerText(),
    /须追加推荐信/,
  );

  await batchOpen();
  await modal().locator('#exam-range-start').fill('2022');
  await modal().locator('#exam-range-end').fill('2024');
  await modal().getByRole('button', { name: '生成年份', exact: true }).click();
  assert.equal(await modal().locator('.exam-batch-row').count(), 3);
  for (let index = 1; index <= 3; index++) {
    const year = 2025 - index;
    assert.equal(
      await modal()
        .getByRole('textbox', { name: `第${index}行考试年份`, exact: true })
        .inputValue(),
      String(year),
    );
    await modal()
      .getByRole('textbox', { name: `第${index}行考试科目`, exact: true })
      .fill('数学、计算机专业课、英语');
    await modal()
      .getByRole('textbox', { name: `第${index}行笔试时间`, exact: true })
      .fill(`${year}-08-20 09:00`);
    await modal()
      .getByRole('textbox', { name: `第${index}行面试时间`, exact: true })
      .fill(`${year}-08-21 10:00`);
    await modal()
      .getByRole('textbox', { name: `第${index}行结果发布时间`, exact: true })
      .fill(`${year}-09-01`);
  }
  await modal()
    .getByRole('textbox', { name: '第1行备注', exact: true })
    .fill('本年须提交英语成绩原件。');
  await modal().getByRole('button', { name: '添加一行', exact: true }).click();
  await modal()
    .getByRole('textbox', { name: '第4行考试年份', exact: true })
    .fill('2024');
  await batchSave().click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '已有记录' })
    .waitFor();
  assert.equal(writes, 3);
  await modal().getByRole('button', { name: '移除第4行', exact: true }).click();
  await modal()
    .getByRole('textbox', { name: '第1行考试年份', exact: true })
    .fill('20');
  await batchSave().click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '四位考试年份' })
    .waitFor();
  assert.equal(writes, 3);
  await modal()
    .getByRole('textbox', { name: '第1行考试年份', exact: true })
    .fill('2024');
  await saveBatch();
  assert.equal(writes, 4);
  assert.equal((await snapshot()).data.majors[0].examHistory.length, 4);
  assert.deepEqual(
    await page.locator('.exam-history-year strong').allTextContents(),
    ['2024', '2023', '2022', '2021'],
  );
  console.log(
    'PASS: requested table columns, legacy retention, separate time fields, year generation, row validation and one-request batch save',
  );

  await batchOpen();
  await modal()
    .getByRole('textbox', { name: '第1行考试年份', exact: true })
    .fill('2020');
  await cancel();
  assert.equal(writes, 4);
  await batchOpen();
  await modal().locator('.exam-batch-paste summary').click();
  await modal()
    .locator('#exam-batch-paste')
    .fill(
      '考试年份\t考试科目\t笔试时间\t面试时间\t结果发布时间\t备注\n2020\t数学、英语\t2020-08-10\t2020-08-11\t2020-09-01\t本年新增推荐信\n2019\t专业课\t2019-08-10\t\t待公布\t',
    );
  await modal()
    .getByRole('button', { name: '追加到表格', exact: true })
    .click();
  assert.equal(await modal().locator('.exam-batch-row').count(), 2);
  assert.equal(
    await modal()
      .getByRole('textbox', { name: '第2行结果发布时间', exact: true })
      .inputValue(),
    '待公布',
  );
  await saveBatch();
  assert.equal(writes, 5);
  assert.equal(
    (await snapshot()).data.majors[0].examHistory.find(
      (record) => record.year === '2020',
    ).notes,
    '本年新增推荐信',
  );
  await batchOpen();
  await modal()
    .getByRole('textbox', { name: '第1行考试年份', exact: true })
    .fill('2024');
  await batchSave().click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '已有记录' })
    .waitFor();
  assert.equal(writes, 5);
  await modal()
    .getByRole('textbox', { name: '第1行入试批次', exact: true })
    .fill('冬季入试');
  await saveBatch();
  assert.equal(writes, 6);
  await batchOpen();
  await modal().locator('#exam-range-start').fill('2021');
  await modal().locator('#exam-range-end').fill('2024');
  await modal().getByRole('button', { name: '生成年份', exact: true }).click();
  assert.equal(await modal().locator('.exam-batch-row').count(), 0);
  assert.equal(await batchSave().isDisabled(), true);
  await cancel();

  const before = await snapshot();
  const invalid = structuredClone(before.data);
  invalid.majors[0].examHistory.push(
    { ...blankExamRecord(), id: 'valid-batch-row', year: '2018' },
    { ...blankExamRecord(), id: 'invalid-batch-row', year: 'wrong' },
  );
  const rejected = await fetch(`${base}/api/japangrad/workspace`, {
    method: 'PUT',
    headers: { 'X-JapanGrad-Client': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: invalid, revision: before.revision }),
  });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await snapshot(), before);
  console.log(
    'PASS: paste with headers and blank cells, cancellation, existing-record protection, multiple sessions and atomic server rejection',
  );

  await page.reload();
  await page.locator('.exam-history-row').first().waitFor();
  assert.equal(await page.locator('.exam-history-row').count(), 7);
  await page.locator('.major-admissions').screenshot({
    path: path.join(artifacts, 'admissions-desktop.png'),
    animations: 'disabled',
  });
  await page.locator('.exam-history').screenshot({
    path: path.join(artifacts, 'exam-table-desktop.png'),
    animations: 'disabled',
  });
  await batchOpen();
  await modal().locator('#exam-range-start').fill('2016');
  await modal().locator('#exam-range-end').fill('2018');
  await modal().getByRole('button', { name: '生成年份', exact: true }).click();
  await modal()
    .getByRole('textbox', { name: '第1行考试科目', exact: true })
    .fill('数学、专业课、英语');
  await modal().getByRole('button', { name: '生成年份', exact: true }).hover();
  await page.screenshot({
    path: path.join(artifacts, 'exam-batch-desktop.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(artifacts, 'exam-batch-mobile.png'),
    animations: 'disabled',
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await cancel();
  await page.locator('.exam-history').screenshot({
    path: path.join(artifacts, 'exam-table-mobile.png'),
    animations: 'disabled',
  });
  await page
    .locator('.major-admissions')
    .screenshot({
      path: path.join(artifacts, 'admissions-mobile.png'),
      animations: 'disabled',
    });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await page
      .locator('.exam-history-table-wrap')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    true,
  );
  await closeServer();
  await start();
  await page.reload();
  await page.locator('.exam-history-row').first().waitFor();
  assert.equal(await page.locator('.exam-history-row').count(), 7);
  const restored = (await snapshot()).data.majors[0].examHistory.find(
    (record) => record.id === 'legacy-exam',
  );
  assert.equal(restored.examDate, legacy.examDate);
  assert.equal(restored.writtenDate, '2021-08-20 09:00');
  assert.equal(restored.resultDate, '2021-09-01');
  const restoredMajor = (await snapshot()).data.majors[0];
  assert.equal(restoredMajor.applicationStart, '每年 6 月 1 日');
  assert.equal(restoredMajor.applicationEnd, '每年 6 月 15 日');
  assert.equal(
    restoredMajor.applicationMaterials,
    '入学愿书\n研究计划书\n成绩单\n英语成绩证明',
  );
  assert.equal(
    restoredMajor.examHistory.find(
      (record) => record.year === '2024' && !record.session,
    ).notes,
    '本年须提交英语成绩原件。',
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: restart persistence, responsive tables and batch dialog, no page errors. Screenshots: ${artifacts}`,
  );
} finally {
  await browser?.close();
  await closeServer();
}
