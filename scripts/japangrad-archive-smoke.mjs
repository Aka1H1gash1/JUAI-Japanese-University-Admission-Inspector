/* oxlint-disable unicorn/no-await-expression-member -- Compact assertions on browser/API test results. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import { createLocalApp } from '../local-server/server.mjs';
import {
  sampleData,
  sampleDocx,
  samplePdf,
} from '../local-server/test-fixtures.mjs';

const workspace = await mkdtemp('/private/tmp/japangrad-archive-test-');
const artifacts = '/private/tmp/japangrad-archive-qa';
await mkdir(artifacts, { recursive: true });
let server = await createLocalApp({
  workspace,
  staticDir: path.resolve('apps/web-antd/dist'),
});
let port;
async function listen() {
  server.listen(port || 0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
}
await listen();
const base = `http://127.0.0.1:${port}`;
async function api(route, method = 'GET', data) {
  const response = await fetch(`${base}/api/japangrad${route}`, {
    method,
    headers: { 'X-JapanGrad-Client': '1', 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  assert.equal(response.ok, true, await response.clone().text());
  return response.json();
}
await api('/workspace', 'PUT', { data: sampleData, revision: 0 });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-background-networking', '--disable-component-update'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
// The finished workbench must run with all external networking blocked.
await context.route('**/*', (route) =>
  new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue()
    : route.abort(),
);
page.setDefaultTimeout(15_000);
const modal = () => page.locator('.ant-modal-content:visible');
const japanese = samplePdf(
  [
    '情報科学専攻',
    '試験科目',
    '数学・英語',
    '出題範囲',
    '線形代数と微分積分',
    '試験日時',
    '2027年6月20日 10:00',
  ],
  true,
);
const file = (name, buffer = samplePdf()) => ({
  name,
  mimeType: 'application/pdf',
  buffer,
});
async function dropFiles(files) {
  const transfer = await page.evaluateHandle(
    (files) => {
      const data = new DataTransfer();
      for (const file of files)
        data.items.add(
          new File([new Uint8Array(file.bytes)], file.name, {
            type: file.mimeType,
          }),
        );
      return data;
    },
    files.map((entry) => ({
      name: entry.name,
      mimeType: entry.mimeType,
      bytes: Array.from(entry.buffer),
    })),
  );
  try {
    await modal()
      .locator('.archive-drop-area')
      .dispatchEvent('dragenter', { dataTransfer: transfer });
    await modal().locator('.archive-dropzone.is-dragging').waitFor();
    await modal()
      .locator('.archive-drop-area')
      .dispatchEvent('drop', { dataTransfer: transfer });
    await modal()
      .locator('.archive-dropzone.is-dragging')
      .waitFor({ state: 'hidden' });
  } finally {
    await transfer.dispose();
  }
}
async function chooseFile(payload) {
  const chooserPromise = page.waitForEvent('filechooser');
  await modal()
    .getByRole('button', { name: '拖拽或选择资料文件', exact: true })
    .click();
  const chooser = await chooserPromise;
  assert.equal(chooser.isMultiple(), false);
  await chooser.setFiles(payload);
}
async function upload(button, name, title, year, buffer) {
  await page.getByRole('button', { name: button, exact: true }).click();
  if (year) await modal().locator('#archive-year').fill(String(year));
  if (['募集要項.pdf', 'past-exam.pdf', 'paper.pdf'].includes(name))
    await dropFiles([file(name, buffer)]);
  else await chooseFile(file(name, buffer));
  await modal()
    .locator('.archive-selected-file')
    .getByText(name, { exact: true })
    .waitFor();
  await modal().locator('#archive-title').fill(title);
  await modal()
    .getByRole('button', { name: '保存到本地', exact: true })
    .click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await modal().waitFor({ state: 'hidden' });
}
const details = () => page.locator('.archive-document-details:visible');
async function closeDetails() {
  await page
    .locator('.archive-detail-drawer:visible')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await details().waitFor({ state: 'hidden' });
}
async function nativePdf(link, expected) {
  assert.equal(await link.getAttribute('target'), '_blank');
  const href = await link.getAttribute('href');
  assert.match(href, /^\/api\/japangrad\/documents\/[\w-]+\/file$/);
  const response = await fetch(`${base}${href}`);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /^inline;/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForURL(`${base}${href}`, { waitUntil: 'domcontentloaded' });
  assert.equal(popup.url(), `${base}${href}`);
  await popup.close();
}
try {
  await page.goto(`${base}/japan-grad/universities/u1`);
  await page.getByRole('heading', { name: '测试大学', exact: true }).waitFor();
  assert.match(await page.locator('.university-facts').innerText(), /关东/);
  assert.match(await page.locator('.university-facts').innerText(), /100/);
  assert.match(await page.locator('.university-facts').innerText(), /2027/);
  await page.getByRole('button', { name: '编辑大学', exact: true }).click();
  await modal()
    .locator('.field')
    .filter({ has: page.locator('label[for="entity-category"]') })
    .locator('.ant-select-selector')
    .click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .first()
    .waitFor();
  assert.deepEqual(
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
      .allTextContents(),
    ['国立', '私立', '公立', '国公立'],
  );
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: /^国公立$/ })
    .click();
  await modal().locator('#entity-qs-rank').fill('401–450');
  await modal().getByRole('button', { name: '保存修改', exact: true }).click();
  await page
    .locator('.university-facts')
    .getByText('401–450', { exact: true })
    .waitFor();
  console.log('PASS: QS, ranking year, region and four school types');

  await page.goto(`${base}/japan-grad/universities/u1/schools/s1/majors/m1`);
  await page.getByRole('heading', { name: '专攻', exact: true }).waitFor();
  await page.getByRole('button', { name: '新增募集要项', exact: true }).click();
  assert.equal(
    await modal()
      .getByRole('button', { name: '保存到本地', exact: true })
      .isDisabled(),
    true,
  );
  await dropFiles([file('first.pdf'), file('second.pdf')]);
  await modal()
    .locator('.form-error')
    .filter({ hasText: '每次只能上传一个文件' })
    .waitFor();
  assert.equal(await modal().locator('.archive-selected-file').count(), 0);
  await dropFiles([file('invalid.exe', Buffer.from('invalid'))]);
  await modal()
    .locator('.form-error')
    .filter({ hasText: 'PDF、DOC、DOCX' })
    .waitFor();
  await dropFiles([file('empty.txt', Buffer.alloc(0))]);
  await modal().locator('.form-error').filter({ hasText: '非空' }).waitFor();
  await chooseFile(file('first.pdf'));
  assert.equal(await modal().locator('#archive-title').inputValue(), 'first');
  await dropFiles([file('second.pdf')]);
  assert.equal(await modal().locator('#archive-title').inputValue(), 'second');
  await modal().locator('#archive-title').fill('我编辑的标题');
  await dropFiles([file('third.pdf')]);
  assert.equal(
    await modal().locator('#archive-title').inputValue(),
    '我编辑的标题',
  );
  await modal()
    .getByRole('button', { name: '移除已选文件', exact: true })
    .click();
  assert.equal(
    await modal()
      .getByRole('button', { name: '保存到本地', exact: true })
      .isDisabled(),
    true,
  );
  await chooseFile(file('cancelled.pdf'));
  await modal()
    .getByRole('button', { name: /取\s*消/ })
    .click();
  assert.equal((await api('/documents?ownerType=major&ownerId=m1')).length, 0);
  await page.getByRole('button', { name: '新增募集要项', exact: true }).click();
  assert.equal(await modal().locator('.archive-selected-file').count(), 0);
  assert.equal(await modal().locator('#archive-title').inputValue(), '');
  await modal()
    .getByRole('button', { name: '拖拽或选择资料文件', exact: true })
    .hover();
  await page.screenshot({
    path: path.join(artifacts, 'upload-dialog-desktop.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseFile(file('selected.pdf'));
  assert.equal(
    await modal()
      .getByRole('button', { name: '保存到本地', exact: true })
      .isEnabled(),
    true,
  );
  await page.screenshot({
    path: path.join(artifacts, 'upload-dialog-mobile.png'),
    animations: 'disabled',
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await modal()
    .getByRole('button', { name: /取\s*消/ })
    .click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  console.log(
    'PASS: click and drag selection, single-file rejection, validation, replacement, removal, cancellation and mobile upload dialog',
  );
  await upload(
    '新增募集要项',
    '募集要項.pdf',
    '2027 信息科学募集要项',
    2027,
    japanese,
  );
  const guidelines = page.locator(
    '.archive-selection-card[data-kind="guidelines"]',
  );
  assert.equal(
    await page.locator('.exam-summary, .pdf-canvas-wrap').count(),
    0,
  );
  assert.equal(
    await page.getByRole('button', { name: '重新读取', exact: true }).count(),
    0,
  );
  const savedGuidelines = await api('/documents?ownerType=major&ownerId=m1');
  assert.ok(
    savedGuidelines[0].analysis === null ||
      savedGuidelines[0].analysis === undefined,
  );
  await guidelines.click();
  await details()
    .getByRole('heading', { name: '2027 信息科学募集要项', exact: true })
    .waitFor();
  await nativePdf(
    details().getByRole('link', { name: '用浏览器打开 PDF', exact: true }),
    japanese,
  );
  await details()
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  assert.equal(await modal().locator('#exam-scope').count(), 0);
  await modal()
    .locator('#archive-notes')
    .fill('先确认出愿资格，再整理需要准备的材料。');
  await modal().getByRole('button', { name: '保存资料', exact: true }).click();
  await details()
    .getByText('先确认出愿资格，再整理需要准备的材料。', { exact: true })
    .waitFor();
  await closeDetails();
  await upload('新增过去问', 'past-exam.pdf', '2026 数学过去问', 2026);
  const question = page.locator(
    '.archive-selection-card[data-kind="question"]',
  );
  await question.click();
  await details()
    .getByRole('button', { name: '上传答案', exact: true })
    .click();
  assert.equal(await modal().locator('#archive-year').isDisabled(), true);
  assert.equal(await modal().locator('#archive-year').inputValue(), '2026');
  await modal().locator('#archive-file').setInputFiles(file('answer.pdf'));
  await modal().locator('#archive-title').fill('2026 数学参考答案');
  await modal()
    .getByRole('button', { name: '保存到本地', exact: true })
    .click();
  await details()
    .getByRole('heading', { name: '2026 数学参考答案', exact: true })
    .waitFor();
  await nativePdf(
    details().getByRole('link', { name: '用浏览器阅读答案 ↗', exact: true }),
    samplePdf(),
  );
  await page.screenshot({ path: path.join(artifacts, 'question-details.png') });
  await closeDetails();
  await upload(
    '新增募集要项',
    'scan.pdf',
    '扫描件募集要项',
    2028,
    samplePdf([]),
  );
  assert.equal(
    await page.getByText(/扫描件需要 OCR|自动读取|核对考试信息/).count(),
    0,
  );
  await page.screenshot({
    path: path.join(artifacts, 'major-card-lists.png'),
    fullPage: true,
  });
  console.log(
    'PASS: separate guideline/question card collections, detail selection, native browser PDF links, no extraction, notes and paired answers',
  );

  const textSource =
    '# 募集要项补充说明\n出愿资料请以官方说明为准。\n<script>window.textExecuted = true</script>';
  await upload(
    '新增募集要项',
    'supplement.md',
    'Markdown 募集说明',
    2027,
    Buffer.from(textSource),
  );
  await page
    .getByRole('button', {
      name: '查看募集要项：Markdown 募集说明',
      exact: true,
    })
    .click();
  const textPopupPromise = page.waitForEvent('popup');
  await details()
    .getByRole('link', { name: '浏览器阅读文本', exact: true })
    .click();
  const textPopup = await textPopupPromise;
  await textPopup.waitForLoadState('domcontentloaded');
  assert.match(
    await textPopup.locator('body').innerText(),
    /出愿资料请以官方说明为准/,
  );
  assert.equal(await textPopup.evaluate(() => window.textExecuted), undefined);
  await textPopup.close();
  await closeDetails();
  await upload(
    '新增募集要项',
    'notes.txt',
    'TXT 募集说明',
    2027,
    Buffer.from('募集说明文本'),
  );
  await upload(
    '新增募集要项',
    'guidelines.docx',
    'Word 募集说明',
    2027,
    sampleDocx(),
  );
  await page
    .getByRole('button', { name: '查看募集要项：Word 募集说明', exact: true })
    .click();
  const wordDownloadPromise = page.waitForEvent('download');
  await details()
    .getByRole('link', { name: '下载 Word 文件', exact: true })
    .click();
  const wordDownload = await wordDownloadPromise;
  assert.deepEqual(await readFile(await wordDownload.path()), sampleDocx());
  await closeDetails();
  await upload(
    '新增募集要项',
    'legacy.doc',
    'DOC 募集说明',
    2027,
    Buffer.from(String.raw`{\rtf1\ansi Legacy Word document}`),
  );
  console.log(
    'PASS: five-format uploads, safe Markdown/text reading and original Word download',
  );

  await page.getByRole('link', { name: '查看老师详情', exact: true }).click();
  await page.getByRole('tab', { name: '论文库', exact: true }).click();
  await upload('新增论文', 'paper.pdf', '自然语言处理论文', 2024);
  const paper = page.locator('.archive-selection-card[data-kind="paper"]');
  await paper.click();
  await details()
    .getByRole('button', { name: '编辑资料', exact: true })
    .click();
  await modal().locator('#paper-authors').fill('老师与合作者');
  await modal().locator('#paper-venue').fill('研究会议 2024');
  await modal()
    .locator('#archive-notes')
    .fill('论文笔记：关注实验设置和评价指标。');
  await modal().getByRole('button', { name: '保存资料', exact: true }).click();
  await details()
    .getByText('论文笔记：关注实验设置和评价指标。', { exact: true })
    .waitFor();
  await nativePdf(
    details().getByRole('link', { name: '用浏览器打开 PDF', exact: true }),
    samplePdf(),
  );
  const downloadPromise = page.waitForEvent('download');
  await details()
    .getByRole('link', { name: '下载原文件', exact: true })
    .click();
  const downloaded = await downloadPromise;
  assert.deepEqual(await readFile(await downloaded.path()), samplePdf());
  await closeDetails();
  await page.screenshot({
    path: path.join(artifacts, 'professor-paper-cards.png'),
  });

  await page.getByRole('tab', { name: '邮件往来', exact: true }).click();
  await page.getByRole('button', { name: '记录邮件', exact: true }).click();
  await modal().locator('#mail-subject').fill('研究计划书沟通');
  await modal()
    .locator('#mail-body')
    .fill(
      '老师您好，附件是研究计划书。\n<script>window.mailExecuted = true</script>\nよろしくお願いいたします。',
    );
  await modal().locator('#mail-next-action').fill('等待回复并准备面试');
  await modal().locator('#mail-followup').fill('2026-10-20');
  await modal()
    .getByRole('button', { name: '保存邮件记录', exact: true })
    .click();
  await page.locator('.mail-body').waitFor();
  assert.equal(await page.evaluate(() => window.mailExecuted), undefined);
  await page.getByRole('button', { name: '编辑邮件', exact: true }).click();
  await modal().locator('#mail-notes').fill('待回复');
  await modal()
    .getByRole('button', { name: '保存邮件记录', exact: true })
    .click();
  await page.getByText('备注：待回复', { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifacts, 'professor-mail.png'),
    fullPage: true,
  });
  console.log(
    'PASS: teacher paper library, notes, PDF download, pasted email, follow-up, editing and escaped HTML',
  );

  const majorDocuments = await api('/documents?ownerType=major&ownerId=m1');
  const paperDocuments = await api('/documents?ownerType=professor&ownerId=p1');
  for (const document of [...majorDocuments, ...paperDocuments])
    assert.ok((await stat(path.join(workspace, document.path))).size > 0);
  await context.close();
  server.close();
  await once(server, 'close');
  server = await createLocalApp({
    workspace,
    staticDir: path.resolve('apps/web-antd/dist'),
  });
  await listen();
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const nextPage = await fresh.newPage();
  await nextPage.goto(
    `${base}/japan-grad/universities/u1/schools/s1/majors/m1`,
  );
  await nextPage
    .getByText('先确认出愿资格，再整理需要准备的材料。', { exact: true })
    .waitFor();
  await nextPage
    .locator('.archive-selection-card[data-kind="question"]')
    .getByText('1 份对应答案', { exact: true })
    .waitFor();
  assert.equal(
    await nextPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await nextPage.screenshot({
    path: path.join(artifacts, 'major-mobile.png'),
    fullPage: true,
  });
  await nextPage
    .getByRole('link', { name: '查看老师详情', exact: true })
    .click();
  await nextPage.getByRole('tab', { name: '邮件往来', exact: true }).click();
  await nextPage
    .locator('.mail-subject')
    .filter({ hasText: '研究计划书沟通' })
    .waitFor();
  assert.equal((await api('/messages?professorId=p1'))[0].notes, '待回复');
  await nextPage.screenshot({
    path: path.join(artifacts, 'mail-mobile.png'),
    fullPage: true,
  });
  assert.equal(
    await nextPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: real filesystem storage, restart and fresh-browser persistence, responsive layouts, fully offline. Workspace: ${workspace}. Screenshots: ${artifacts}`,
  );
} finally {
  await browser.close();
  server.close();
  await once(server, 'close');
}
