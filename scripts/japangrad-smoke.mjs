import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

// A fresh browser context keeps verification data out of the user's workspace.
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5666';
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
      JSON.parse(localStorage.getItem('japangrad-university-explorer-v1')),
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
    .getByRole('link', { name: '查看研究科' })
    .click();
  await page
    .getByRole('heading', { name: '原型测试甲大学', exact: true })
    .waitFor();
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
  await page.getByRole('button', { name: '标记心仪：测试老师' }).click();
  await page.reload();
  await page.getByRole('button', { name: '取消心仪：测试老师' }).waitFor();
  const retained = await readData();
  assert.equal(retained.professors[0].favorite, true);
  assert.equal(retained.professors[0].title, '副教授');
  assert.equal(retained.professors[0].majorId, retained.majors[0].id);
  await page.getByRole('switch', { name: '只看心仪老师' }).click();
  assert.equal(await page.locator('.professor-card').count(), 1);
  await page.getByRole('button', { name: '测试老师', exact: true }).click();
  await page.locator('.professor-details').waitFor();
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
    .locator('.professor-card')
    .getByText('自然语言处理 / 多模态学习', { exact: true })
    .waitFor();
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
    .getByRole('link', { name: '查看研究科' })
    .click();
  assert.equal(await page.locator('.school-card').count(), 0);
  await page
    .locator('.explorer-breadcrumb')
    .getByRole('link', { name: '大学清单', exact: true })
    .click();
  await page
    .locator('.university-card')
    .filter({ hasText: '原型测试甲大学' })
    .getByRole('link', { name: '查看研究科' })
    .click();
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

  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const freshPage = await fresh.newPage();
  await freshPage.goto(`${baseUrl}/japan-grad`);
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
    `${baseUrl}/japan-grad/universities/legacy-u/schools/legacy-s`,
  );
  await legacyPage
    .getByRole('heading', { name: '未分类专攻', exact: true })
    .waitFor();
  await legacyPage.locator('.major-card').click();
  await legacyPage.getByRole('button', { name: '旧老师', exact: true }).click();
  await legacyPage.locator('.professor-details').waitFor();
  assert.match(
    await legacyPage.locator('.professor-details').innerText(),
    /保留的备注/,
  );
  const migrated = await legacyPage.evaluate(() => ({
    data: JSON.parse(localStorage.getItem('japangrad-university-explorer-v1')),
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
    JSON.parse(localStorage.getItem('japangrad-university-explorer-v1')),
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
}
