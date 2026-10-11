import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import { createLocalApp } from '../local-server/server.mjs';
import path from 'node:path';

import { chromium } from 'playwright';

// A fresh browser context keeps verification data out of the user's workspace.
const servers = [];
async function localServer() {
  const workspace = await mkdtemp('/private/tmp/japangrad-ui-test-');
  const server = await createLocalApp({
    workspace,
    staticDir: path.resolve('apps/web-antd/dist'),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
const baseUrl = process.env.BASE_URL || (await localServer());
const artifactDir = process.env.ARTIFACT_DIR || '/private/tmp/japangrad-qa';
await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-background-networking', '--disable-component-update'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  const modal = () =>
    page
      .locator('.ant-modal-content:visible')
      .filter({ has: page.locator('.explorer-form') });
  const readData = () =>
    page.evaluate(() =>
      fetch('/api/japangrad/workspace')
        .then((response) => response.json())
        .then((result) => result.data),
    );
  async function capture(name) {
    await page.locator('#__app-loading__').waitFor({ state: 'hidden' });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(artifactDir, name),
      fullPage: true,
    });
  }
  async function addUniversity(name, location) {
    await page.getByRole('button', { name: '新增大学', exact: true }).click();
    await modal().locator('#entity-name').fill(name);
    await modal().locator('#entity-location').fill(location);
    await modal()
      .getByRole('button', { name: '添加大学', exact: true })
      .click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  }

  await page.goto(baseUrl);
  await page.getByRole('heading', { name: '我的大学清单。' }).waitFor();
  assert.equal(await page.locator('.university-card').count(), 0);
  assert.equal(
    await page.getByText('从一所大学开始', { exact: true }).count(),
    1,
  );
  assert.equal(await page.getByText('正式申请', { exact: true }).count(), 0);
  await capture('empty-desktop.png');
  console.log(
    'PASS: empty home without seeded universities or application widgets',
  );

  await page.getByRole('button', { name: '新增大学', exact: true }).click();
  await modal().getByRole('button', { name: '添加大学', exact: true }).click();
  await modal().getByRole('alert').waitFor();
  await modal()
    .getByRole('button', { name: /取\s*消/ })
    .click();
  await addUniversity('原型测试甲大学', '东京都');
  await addUniversity('原型测试乙大学', '京都府');
  assert.equal(await page.locator('.university-card').count(), 2);
  await page
    .getByRole('checkbox', { name: '加入对比：原型测试甲大学' })
    .check();
  await page
    .getByRole('checkbox', { name: '加入对比：原型测试乙大学' })
    .check();
  await page.getByRole('button', { name: '对比所选 (2)' }).click();
  await page.locator('.comparison-table').waitFor();
  assert.match(await page.locator('.comparison-table').innerText(), /东京都/);
  assert.match(await page.locator('.comparison-table').innerText(), /京都府/);
  await capture('comparison-desktop.png');
  await page.getByRole('button', { name: '完成对比' }).click();
  console.log(
    'PASS: create universities, required-name validation, university comparison',
  );

  await page
    .locator('.university-card')
    .filter({ hasText: '原型测试甲大学' })
    .locator('.university-card-link')
    .click();
  await page
    .getByRole('heading', { name: '原型测试甲大学', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  const logoPng = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#36594a';
      context.fillRect(0, 0, 80, 80);
      context.strokeStyle = '#f7f3df';
      context.lineWidth = 3;
      context.strokeRect(16, 16, 48, 48);
      context.fillStyle = '#f7f3df';
      context.font = 'bold 30px serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('J', 40, 42);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  async function uploadUniversityLogo() {
    const preview = modal().locator('.university-logo img');
    const previous = (await preview.count())
      ? await preview.getAttribute('src')
      : '';
    await modal().locator('#entity-logo-file').setInputFiles({
      name: 'university-logo.png',
      mimeType: 'image/png',
      buffer: logoPng,
    });
    await page.waitForFunction((previous) => {
      const image = document.querySelector(
        '.ant-modal-content .university-logo img',
      );
      return (
        image &&
        image.getAttribute('src') !== previous &&
        image.complete &&
        image.naturalWidth > 0
      );
    }, previous);
  }
  await uploadUniversityLogo();
  async function selectUniversityCategory(category) {
    await modal()
      .locator('.field')
      .filter({ has: page.locator('label[for="entity-category"]') })
      .locator('.ant-select-selector')
      .click();
    const options = page
      .locator('.ant-select-dropdown:visible')
      .filter({
        has: page
          .locator('.ant-select-item-option-content')
          .filter({ hasText: /^国立$/ }),
      })
      .locator('.ant-select-item-option-content');
    await options.first().waitFor();
    assert.deepEqual(await options.allTextContents(), [
      '国立',
      '私立',
      '公立',
      '国公立',
    ]);
    await options.filter({ hasText: new RegExp(`^${category}$`) }).click();
  }
  for (const category of ['国立', '公立', '国公立']) {
    await selectUniversityCategory(category);
    assert.equal(
      await modal().locator('#entity-admission-fee').inputValue(),
      '282000',
    );
    assert.equal(
      await modal().locator('#entity-annual-tuition').inputValue(),
      '535800',
    );
  }
  await selectUniversityCategory('私立');
  assert.equal(await modal().locator('#entity-admission-fee').inputValue(), '');
  assert.equal(
    await modal().locator('#entity-annual-tuition').inputValue(),
    '',
  );
  await modal().locator('#entity-admission-fee').fill('-1');
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '整数日元' })
    .waitFor();
  await modal().locator('#entity-admission-fee').fill('0');
  await modal().locator('#entity-annual-tuition').fill('600000');
  await modal().locator('#entity-monthly-rent').fill('40000');
  await modal().locator('#entity-monthly-living').fill('60000');
  await modal()
    .locator('.field')
    .filter({ has: page.locator('label[for="entity-dormitory-status"]') })
    .locator('.ant-select-selector')
    .click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: /^可申请$/ })
    .click();
  await modal()
    .locator('#entity-dormitory-notes')
    .fill('留学生可申请，入住一年，之后需自行租房。');
  await modal()
    .locator('#entity-dormitory-website')
    .fill('example.ac.jp/dormitory');
  await modal()
    .locator('#entity-fee-notes')
    .fill('入学金减免；确认研究科的实际学费。');
  await modal()
    .locator('#entity-notes')
    .fill('关注计算机科学与人工智能方向，继续了解研究室。');
  await selectUniversityCategory('国立');
  assert.equal(
    await modal().locator('#entity-admission-fee').inputValue(),
    '0',
  );
  assert.equal(
    await modal().locator('#entity-annual-tuition').inputValue(),
    '600000',
  );
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator('.university-fee-panel').waitFor();
  assert.match(
    await page.locator('.university-fee-totals').innerText(),
    /1,800,000/,
  );
  assert.match(
    await page.locator('.university-fee-totals').innerText(),
    /3,600,000/,
  );
  const feeRecord = (await readData()).universities.find(
    (item) => item.name === '原型测试甲大学',
  );
  assert.equal(feeRecord.admissionFee, '0');
  assert.equal(feeRecord.annualTuition, '600000');
  assert.equal(feeRecord.monthlyRent, '40000');
  assert.equal(feeRecord.monthlyLivingExpenses, '60000');
  assert.equal(feeRecord.dormitoryStatus, 'available');
  assert.match(feeRecord.logoId, /\.png$/);
  assert.equal(feeRecord.dormitoryWebsite, 'https://example.ac.jp/dormitory');
  await page.locator('.university-heading .university-logo img').waitFor();
  assert.match(
    await page.locator('.university-dormitory-info').innerText(),
    /可申请/,
  );
  assert.equal(feeRecord.feeNotes, '入学金减免；确认研究科的实际学费。');
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  await modal().getByRole('button', { name: '移除校徽', exact: true }).click();
  await modal()
    .getByRole('button', { name: /取\s*消/ })
    .click();
  assert.match(
    await page
      .locator('.university-heading .university-logo img')
      .getAttribute('src'),
    new RegExp(feeRecord.logoId),
  );
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  await modal()
    .getByRole('button', { name: '恢复默认学费', exact: true })
    .click();
  await capture('university-fees-editor.png');
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  assert.match(
    await page.locator('.university-fee-totals').innerText(),
    /2,017,800/,
  );
  assert.match(
    await page.locator('.university-fee-totals').innerText(),
    /3,753,600/,
  );
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  await uploadUniversityLogo();
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  assert.notEqual(
    (await readData()).universities.find((item) => item.id === feeRecord.id)
      .logoId,
    feeRecord.logoId,
  );
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  await modal().getByRole('button', { name: '移除校徽', exact: true }).click();
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator('.university-fee-panel').waitFor();
  assert.equal(
    await page.locator('.university-heading .university-logo img').count(),
    0,
  );
  await page.getByRole('button', { name: '编辑费用', exact: true }).click();
  await uploadUniversityLogo();
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  console.log(
    'PASS: four university types, automatic fees, private fees, custom overrides, zero, validation, persistence and restoring defaults',
  );
  console.log(
    'PASS: monthly total budgets, dormitory details, logo upload, cancellation, replacement, removal and reload persistence',
  );
  await page.getByRole('button', { name: '新增研究科', exact: true }).click();
  await modal().locator('#entity-name').fill('信息研究科');
  await modal().locator('#entity-research').fill('人工智能 / 人机交互');
  await modal()
    .getByRole('button', { name: '添加研究科', exact: true })
    .click();
  await page.locator('.school-card').filter({ hasText: '信息研究科' }).click();
  assert.equal(
    await page.getByRole('button', { name: '新增老师', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: '新增专攻', exact: true }).click();
  await modal().locator('#entity-name').fill('计算机科学专攻');
  await modal().locator('#entity-research').fill('计算与智能');
  await modal().getByRole('button', { name: '添加专攻', exact: true }).click();
  await page
    .locator('.major-card')
    .filter({ hasText: '计算机科学专攻' })
    .click();
  await page
    .getByRole('heading', { name: '计算机科学专攻', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '新增考试记录', exact: true }).click();
  await modal()
    .getByRole('button', { name: '保存考试记录', exact: true })
    .click();
  await modal()
    .locator('.form-error')
    .filter({ hasText: '四位考试年份' })
    .waitFor();
  await modal().locator('#exam-history-year').fill('2027');
  await modal().locator('#exam-history-session').fill('夏季入试');
  await modal().locator('#exam-history-writtenDate').fill('2027-08-20 09:00');
  await modal().locator('#exam-history-interviewDate').fill('2027-08-21 10:00');
  await modal().locator('#exam-history-resultDate').fill('2027-09-01');
  await modal()
    .locator('#exam-history-subjects')
    .fill('数学、专业课、英语、口试');
  await modal()
    .locator('#exam-history-source')
    .fill('https://example.ac.jp/admissions');
  await modal()
    .getByRole('button', { name: '保存考试记录', exact: true })
    .click();
  await modal().waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '新增考试记录', exact: true }).click();
  await modal().locator('#exam-history-year').fill('2026');
  await modal().locator('#exam-history-session').fill('冬季入试');
  await modal().locator('#exam-history-writtenDate').fill('2026-12-10');
  await modal().locator('#exam-history-subjects').fill('数学、专业课');
  await modal()
    .getByRole('button', { name: '保存考试记录', exact: true })
    .click();
  await modal().waitFor({ state: 'hidden' });
  assert.deepEqual(
    await page.locator('.exam-history-year strong').allTextContents(),
    ['2027', '2026'],
  );
  await page
    .getByRole('button', { name: '编辑考试记录：2027 夏季入试', exact: true })
    .click();
  await modal()
    .locator('#exam-history-subjects')
    .fill('数学、计算机专业课、英语、口试');
  await modal()
    .getByRole('button', { name: '保存考试记录', exact: true })
    .click();
  await modal().waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: '删除考试记录：2026 冬季入试', exact: true })
    .click();
  await page.getByRole('button', { name: /取\s*消/ }).click();
  assert.equal(await page.locator('.exam-history-row').count(), 2);
  await page.getByRole('button', { name: '编辑专攻', exact: true }).click();
  await modal().locator('#entity-notes').fill('核对历年科目变化。');
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator('.exam-history-row').first().waitFor();
  assert.equal(await page.locator('.exam-history-row').count(), 2);
  assert.match(
    await page.locator('.exam-history-row').first().innerText(),
    /计算机专业课/,
  );
  assert.equal((await readData()).majors[0].examHistory.length, 2);
  await capture('major-desktop.png');
  await page.getByRole('button', { name: '新增老师', exact: true }).click();
  await modal().locator('#entity-name').fill('测试老师');
  await modal()
    .locator('.field')
    .filter({ has: page.locator('label[for="entity-title"]') })
    .locator('.ant-select-selector')
    .click();
  const titleItems = page.locator(
    '.ant-select-dropdown:visible .ant-select-item-option-content',
  );
  await titleItems.first().waitFor();
  assert.deepEqual(await titleItems.allTextContents(), [
    '助教',
    '讲师',
    '副教授',
    '教授',
  ]);
  await titleItems.filter({ hasText: /^副教授$/ }).click();
  await modal().locator('#entity-research').fill('自然语言处理');
  await modal().locator('#entity-laboratory').fill('语言智能研究室');
  await modal().locator('#entity-email').fill('teacher@example.ac.jp');
  await modal()
    .locator('#entity-personal-website')
    .fill('example.ac.jp/teacher');
  await modal().locator('#entity-laboratory-website').fill('example.ac.jp/lab');
  await modal().locator('#entity-notes').fill('希望进一步了解他的研究方向。');
  await modal().getByRole('button', { name: '添加老师', exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/japangrad/workspace') &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: '标记心仪：测试老师' }).click(),
  ]);
  await page.reload();
  await page.getByRole('button', { name: '取消心仪：测试老师' }).waitFor();
  const retained = await readData();
  assert.equal(retained.professors[0].favorite, true);
  assert.equal(retained.professors[0].title, '副教授');
  assert.equal(retained.professors[0].majorId, retained.majors[0].id);
  await page.getByRole('switch', { name: '只看心仪老师' }).click();
  assert.equal(await page.locator('.professor-card').count(), 1);
  await page
    .getByRole('link', { name: '查看测试老师详情', exact: true })
    .click();
  await page.locator('.professor-details').waitFor();
  assert.match(page.url(), /\/professors\//);
  assert.equal(await page.locator('.professor-detail-drawer').count(), 0);
  await page.reload();
  await page.getByRole('heading', { name: '测试老师', exact: true }).waitFor();
  assert.match(
    await page.locator('.professor-details').innerText(),
    /原型测试甲大学 \/ 信息研究科 \/ 计算机科学专攻/,
  );
  assert.equal(
    await page
      .locator('.professor-details')
      .getByRole('link', { name: '访问个人主页' })
      .getAttribute('href'),
    'https://example.ac.jp/teacher',
  );
  assert.equal(
    await page
      .locator('.professor-details')
      .getByRole('link', { name: '访问研究室主页' })
      .getAttribute('href'),
    'https://example.ac.jp/lab',
  );
  await capture('teacher-details-desktop.png');
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await modal().locator('#entity-research').fill('自然语言处理 / 多模态学习');
  assert.equal(
    await modal().locator('#entity-personal-website').inputValue(),
    'https://example.ac.jp/teacher',
  );
  assert.equal(
    await modal().locator('#entity-laboratory-website').inputValue(),
    'https://example.ac.jp/lab',
  );
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await page
    .locator('.professor-details')
    .getByText('自然语言处理 / 多模态学习', { exact: true })
    .waitFor();
  await page
    .locator('.explorer-breadcrumb')
    .getByRole('link', { name: '计算机科学专攻', exact: true })
    .click();
  const editedData = await readData();
  assert.equal(editedData.professors[0].favorite, true);
  console.log(
    'PASS: university → graduate school → major → professor, four title options, two homepages, favorite, edit, reload persistence',
  );

  await page
    .getByRole('textbox', { name: '搜索老师', exact: true })
    .fill('不匹配的关键词');
  assert.equal(await page.locator('.professor-card').count(), 0);
  await page.getByRole('button', { name: '查看全部老师' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('teachers-mobile.png');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator('.explorer-breadcrumb')
    .getByRole('link', { name: '大学清单', exact: true })
    .click();
  await page.getByRole('heading', { name: '我的大学清单。' }).waitFor();
  await capture('universities-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await capture('universities-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole('textbox', { name: '搜索大学', exact: true })
    .fill('多模态学习');
  assert.equal(await page.locator('.university-card').count(), 1);
  assert.match(
    await page.locator('.university-card').innerText(),
    /原型测试甲大学/,
  );
  console.log('PASS: research search and responsive layouts');

  await page.getByRole('textbox', { name: '搜索大学', exact: true }).fill('');
  await page
    .locator('.university-card')
    .filter({ hasText: '原型测试乙大学' })
    .locator('.university-card-link')
    .click();
  assert.equal(await page.locator('.school-card').count(), 0);
  await page
    .locator('.explorer-breadcrumb')
    .getByRole('link', { name: '大学清单', exact: true })
    .click();
  await page
    .locator('.university-card')
    .filter({ hasText: '原型测试甲大学' })
    .locator('.university-card-link')
    .click();
  await page.locator('.university-progress-counts').waitFor();
  assert.deepEqual(
    await page.locator('.university-progress-counts strong').allTextContents(),
    ['1', '1', '1', '1'],
  );
  assert.match(
    await page.locator('.university-research-areas').innerText(),
    /人工智能/,
  );
  await capture('university-overview-mobile.png');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1080 });
  await capture('university-overview-desktop.png');
  await page.getByRole('button', { name: '删除大学', exact: true }).click();
  await page.getByRole('button', { name: /取\s*消/ }).click();
  const cancelledData = await readData();
  assert.equal(cancelledData.universities.length, 2);
  await page.getByRole('button', { name: '删除大学', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('heading', { name: '我的大学清单。' }).waitFor();
  const data = await readData();
  assert.equal(data.universities.length, 1);
  assert.equal(data.schools.length, 0);
  assert.equal(data.majors.length, 0);
  assert.equal(data.professors.length, 0);
  await page.goto(`${baseUrl}/japan-grad/universities/missing/schools/missing`);
  await page
    .getByRole('heading', { name: '这个研究科已不存在', exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: parent isolation, confirmed cascade deletion, missing route, no page errors',
  );

  const freshBase = await localServer();
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const freshPage = await fresh.newPage();
  await freshPage.goto(`${freshBase}/japan-grad`);
  await freshPage
    .getByRole('heading', { name: '从一所大学开始', exact: true })
    .waitFor();
  await freshPage.locator('#__app-loading__').waitFor({ state: 'hidden' });
  await freshPage.waitForTimeout(500);
  await freshPage.screenshot({
    path: path.join(artifactDir, 'empty-mobile.png'),
    fullPage: true,
  });
  assert.equal(
    await freshPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  console.log(
    `PASS: clean browser still starts empty; screenshots: ${artifactDir}`,
  );

  // Exercise migration in an isolated browser using actual v1-shaped data.
  const legacyBase = await localServer();
  const legacyContext = await browser.newContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.addInitScript(() => {
    const key = 'japangrad-university-explorer-v1';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        universities: [
          {
            id: 'legacy-u',
            name: '旧大学',
            japaneseName: '',
            location: '',
            category: '',
            website: '',
            notes: '',
          },
        ],
        schools: [
          {
            id: 'legacy-s',
            universityId: 'legacy-u',
            name: '旧研究科',
            japaneseName: '',
            research: '',
            website: '',
            notes: '',
          },
        ],
        professors: [
          {
            id: 'legacy-p',
            schoolId: 'legacy-s',
            name: '旧老师',
            japaneseName: '',
            title: '准教授',
            research: '机器学习',
            laboratory: '原研究室',
            email: '',
            website: 'https://example.ac.jp/old',
            notes: '保留的备注',
            favorite: true,
          },
        ],
      }),
    );
  });
  await legacyPage.goto(
    `${legacyBase}/japan-grad/universities/legacy-u/schools/legacy-s`,
  );
  await legacyPage
    .getByRole('heading', { name: '未分类专攻', exact: true })
    .waitFor();
  await legacyPage.locator('.major-card').click();
  await legacyPage
    .getByRole('link', { name: '查看旧老师详情', exact: true })
    .click();
  await legacyPage.locator('.professor-details').waitFor();
  assert.match(
    await legacyPage.locator('.professor-details').innerText(),
    /保留的备注/,
  );
  const migrated = await legacyPage.evaluate(async () => ({
    data: (await (await fetch('/api/japangrad/workspace')).json()).data,
    backup: JSON.parse(
      localStorage.getItem('japangrad-university-explorer-v1-before-v2'),
    ),
  }));
  assert.equal(migrated.data.version, 2);
  assert.equal(migrated.data.professors[0].id, 'legacy-p');
  assert.equal(migrated.data.professors[0].title, '准教授');
  assert.equal(migrated.data.professors[0].favorite, true);
  assert.equal(
    migrated.data.professors[0].personalWebsite,
    'https://example.ac.jp/old',
  );
  assert.equal(migrated.data.professors[0].laboratoryWebsite, '');
  assert.equal(migrated.backup.version, 1);
  await legacyPage.reload();
  await legacyPage
    .getByRole('heading', { name: '旧老师', exact: true })
    .waitFor();
  await legacyPage
    .locator('.explorer-breadcrumb')
    .getByRole('link', { name: '未分类专攻', exact: true })
    .click();
  await legacyPage.getByRole('button', { name: '取消心仪：旧老师' }).waitFor();
  await legacyPage
    .getByRole('button', { name: '删除专攻', exact: true })
    .click();
  await legacyPage
    .getByRole('button', { name: '确认删除', exact: true })
    .click();
  await legacyPage
    .getByRole('heading', { name: '旧研究科', exact: true })
    .waitFor();
  const removedMajor = await legacyPage.evaluate(() =>
    fetch('/api/japangrad/workspace')
      .then((response) => response.json())
      .then((result) => result.data),
  );
  assert.equal(removedMajor.majors.length, 0);
  assert.equal(removedMajor.professors.length, 0);
  assert.equal(removedMajor.schools.length, 1);
  assert.equal(removedMajor.universities.length, 1);
  console.log(
    'PASS: v1 migration, original backup, retained title/links/favorites, major cascade deletion',
  );
} finally {
  await browser.close();
  for (const server of servers) {
    server.close();
    await once(server, 'close');
  }
}
