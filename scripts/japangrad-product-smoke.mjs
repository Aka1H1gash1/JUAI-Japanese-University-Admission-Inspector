/* oxlint-disable unicorn/no-await-expression-member -- End-to-end assertions read browser/API results. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { createLocalApp } from '../local-server/server.mjs';
import { sampleData } from '../local-server/test-fixtures.mjs';

// Only this new temporary workspace is written; fixture labels are never product data.
const workspace = await mkdtemp(
  path.join(tmpdir(), 'juai-product-acceptance-'),
);
const artifacts =
  process.env.ARTIFACT_DIR ||
  path.join(tmpdir(), 'juai-product-acceptance-artifacts');
await mkdir(artifacts, { recursive: true });
const databaseFactory = process.env.JUAI_SMOKE_DATABASE_FACTORY
  ? await import(
      pathToFileURL(path.resolve(process.env.JUAI_SMOKE_DATABASE_FACTORY))
    )
  : undefined;
const database = databaseFactory
  ? await databaseFactory.createDatabase(workspace)
  : undefined;
const app = await createLocalApp({
  workspace,
  database,
  staticDir: path.resolve('apps/web-antd/dist'),
});
app.listen(0, '127.0.0.1');
await once(app, 'listening');
const base = `http://127.0.0.1:${app.address().port}`;
async function api(route, method = 'GET', body) {
  const response = await fetch(`${base}/api/japangrad${route}`, {
    method,
    headers: { 'X-JapanGrad-Client': '1', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(response.ok, `${route}: ${response.status}`);
  return response.json();
}
const fixture = structuredClone(sampleData);
fixture.majors[0].examHistory = [
  {
    id: 'qa-exam',
    year: '2026',
    session: '隔离AI考试记录',
    subjects: '线性代数',
    writtenDate: '2026-08-20',
    interviewDate: '',
    resultDate: '',
    examDate: '',
    sourceUrl: '',
    notes: '原适用范围需要人工核对',
  },
];
await api('/workspace', 'PUT', {
  revision: 0,
  data: fixture,
});
const snapshot = await api('/workspace');
const lab = snapshot.data.labs[0];
assert.ok(lab);
lab.wantApply = true;
await api('/workspace', 'PUT', {
  revision: snapshot.revision,
  data: snapshot.data,
});
const batch = await api('/foundation/majors/m1/batches', 'POST', {
  label: '隔离验收批次',
  admissionYear: 2027,
  examType: '外国人特别入试',
  materials: '研究計画書\n成绩单',
  writtenDate: '2027-06-20',
});
const target = await api(`/applications/labs/${lab.id}`, 'POST', {
  batchId: batch.id,
});
await api(`/applications/${target.id}/seed`, 'POST', {});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined),
  args: ['--disable-background-networking', '--disable-component-update'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  // This acceptance never calls a model, mail server, or third-party website.
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  const modal = () => page.locator('.ant-modal-content:visible');
  const labPath = `/japan-grad/universities/u1/schools/s1/majors/m1/labs/${lab.id}`;
  const applicationPath = `/japan-grad/applications/labs/${lab.id}?target=${target.id}`;
  async function visit(route) {
    await page.goto(base + route);
    await page.locator('#japangrad-main h1').waitFor();
    await page.locator('#__app-loading__').waitFor({ state: 'hidden' });
  }
  async function noOverflow() {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Horizontal overflow: ${page.url()}`,
    );
  }
  await visit('/japan-grad/universities/u1/schools/s1/majors/m1');
  await page
    .getByRole('button', { name: '从已解析考试建立', exact: true })
    .click();
  await modal()
    .getByRole('button', { name: '载入并核对', exact: true })
    .click();
  assert.equal(await modal().getByRole('spinbutton').inputValue(), '');
  assert.equal(
    await modal()
      .getByRole('textbox', { name: '考试科目', exact: true })
      .inputValue(),
    '线性代数',
  );
  await modal()
    .getByRole('textbox', { name: '考试类别', exact: true })
    .fill('外国人特别入试');
  await modal()
    .getByRole('textbox', { name: '适用范围', exact: true })
    .fill('已核对：本专攻修士外国人申请');
  await modal().getByRole('checkbox').check();
  await modal()
    .getByRole('button', { name: /保存/ })
    .click();
  await modal().waitFor({ state: 'hidden' });
  const adopted = (await api('/foundation/majors/m1/batches')).find(
    (entry) => entry.label === '隔离AI考试记录',
  );
  assert.equal(adopted.admissionYear, null);
  assert.equal(adopted.examDate, '2026-08-20');
  assert.equal(adopted.consent, 'unknown');
  assert.equal((await api('/workspace')).data.majors[0].examHistory.length, 1);
  console.log(
    'PASS reviewed exam adoption, unknown admission year, retained original record',
  );
  await visit('/japan-grad/settings');
  assert.equal(
    await page.getByRole('tab', { name: '浏览器连接', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: '编辑档案', exact: true }).click();
  await modal()
    .getByRole('textbox', { name: '称呼', exact: true })
    .fill('隔离端到端验收');
  await modal()
    .getByRole('textbox', { name: '原有语言成绩原文', exact: true })
    .fill('JLPT N1');
  await modal()
    .getByRole('button', { name: '添加语言能力', exact: true })
    .click();
  await modal().getByRole('combobox').fill('TOEIC');
  await modal()
    .getByRole('textbox', { name: '等级或分数', exact: true })
    .fill('835');
  await modal().locator('input[type=date]').fill('2026-10-20');
  await modal().getByRole('button', { name: '保存档案', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  await page.reload();
  await page.getByText('2026-10-20', { exact: true }).waitFor();
  const profile = await api('/settings');
  assert.equal(profile.profile.language, 'JLPT N1');
  assert.equal(profile.profile.languageRecords[0].result, '835');
  assert.equal(profile.profile.languageRecords[0].date, '2026-10-20');
  await page.getByRole('button', { name: '编辑档案', exact: true }).click();
  await modal()
    .getByRole('textbox', { name: '称呼', exact: true })
    .fill('取消的草稿');
  await modal()
    .getByRole('button', { name: /取\s*消/ })
    .click();
  assert.equal((await api('/settings')).profile.displayName, '隔离端到端验收');
  console.log(
    'PASS profile language persistence, legacy preservation and edit cancellation',
  );

  await visit('/japan-grad/files');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await modal()
    .locator('input[type=file]')
    .setInputFiles({
      name: '隔离验收-申请.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('中文・日本語の資料'),
    });
  await modal().getByRole('button', { name: '上传文件', exact: true }).click();
  await modal().waitFor({ state: 'hidden' });
  await page
    .getByRole('link', { name: '隔离验收-申请.txt', exact: true })
    .waitFor();
  assert.equal((await api('/documents/index'))[0].ownerType, 'workspace');
  await page
    .getByRole('textbox', { name: '搜索文件', exact: true })
    .fill('无匹配的文件名');
  await page.getByText('没有符合筛选条件的文件', { exact: true }).waitFor();
  await page.getByRole('button', { name: '重置筛选', exact: true }).click();
  await page
    .getByRole('link', { name: '隔离验收-申请.txt', exact: true })
    .waitFor();
  console.log(
    'PASS ordinary file upload without a major and honest filtered empty state',
  );

  await visit(applicationPath);
  await page
    .getByRole('checkbox', { name: '完成材料：研究計画書', exact: true })
    .waitFor();
  await page.locator('.material-drop input[type=file]').setInputFiles({
    name: '研究計画書.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('申请目标独立文件'),
  });
  await page.waitForFunction(async (id) => {
    const value = await (
      await fetch(`/api/japangrad/applications/${id}`)
    ).json();
    return value.materials.some((material) => material.files.length === 1);
  }, target.id);
  let state = await api(`/applications/${target.id}`);
  const material = state.materials.find((entry) => entry.files.length);
  assert.equal(material.complete, false);
  await page
    .getByRole('checkbox', { name: `完成材料：${material.title}`, exact: true })
    .click();
  await page.waitForFunction(
    async ({ id, materialId }) => {
      const value = await (
        await fetch(`/api/japangrad/applications/${id}`)
      ).json();
      return value.materials.find((entry) => entry.id === materialId)?.complete;
    },
    { id: target.id, materialId: material.id },
  );
  await page.reload();
  await page
    .getByRole('checkbox', { name: `完成材料：${material.title}`, exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('checkbox', {
        name: `完成材料：${material.title}`,
        exact: true,
      })
      .isChecked(),
    true,
  );
  state = await api(`/applications/${target.id}`);
  assert.equal(
    state.materials.find((entry) => entry.id === material.id).files.length,
    1,
  );
  const zip = await fetch(
    `${base}/api/japangrad/applications/${target.id}/zip`,
  );
  assert.equal(zip.status, 200);
  assert.match(zip.headers.get('content-type'), /zip/);
  assert.equal(
    Buffer.from(await zip.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    'PK',
  );
  console.log(
    'PASS independent material/file completion, refresh and ZIP export',
  );

  const routes = [
    '/japan-grad/overview',
    '/japan-grad/calendar',
    '/japan-grad/universities',
    '/japan-grad/universities/u1',
    '/japan-grad/universities/u1/schools/s1',
    '/japan-grad/universities/u1/schools/s1/majors/m1',
    labPath,
    `${labPath}/professors/p1`,
    '/japan-grad/labs',
    '/japan-grad/journey',
    applicationPath,
    '/japan-grad/files',
    '/japan-grad/experiences',
    '/japan-grad/special-programs',
    '/japan-grad/settings',
    '/japan-grad/ai',
    '/japan-grad/collection',
  ];
  for (const [theme, width, height] of [
    ['light', 1440, 900],
    ['light', 390, 844],
    ['dark', 1440, 900],
  ]) {
    await page.evaluate(
      (value) => localStorage.setItem('japangrad-appearance', value),
      theme,
    );
    await page.setViewportSize({ width, height });
    for (const [index, route] of routes.entries()) {
      await visit(route);
      await noOverflow();
      assert.equal(await page.locator('#japangrad-main h1').count(), 1, route);
      if ([0, 5, 10, 11, 14].includes(index))
        await page.screenshot({
          path: path.join(artifacts, `qa-${theme}-${width}-${index}.png`),
          fullPage: true,
        });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${routes.length} routes × desktop/mobile/dark; one main heading and no overflow; zero page errors`,
  );
} finally {
  await browser.close();
  app.close();
  await once(app, 'close');
}
