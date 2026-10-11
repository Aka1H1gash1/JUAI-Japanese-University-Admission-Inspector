import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createLocalApp } from '../local-server/server.mjs';
import { sampleData } from '../local-server/test-fixtures.mjs';

// All content in this review is fictional test data in a temporary workspace.
const phase = process.env.DESIGN_REVIEW_PHASE || 'after';
const artifacts = path.resolve(
  process.env.ARTIFACT_DIR || `/private/tmp/japangrad-design-${phase}`,
);
await mkdir(artifacts, { recursive: true });
const workspace = await mkdtemp('/private/tmp/japangrad-design-');
const server = await createLocalApp({
  workspace,
  staticDir: path.resolve('apps/web-antd/dist'),
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const data = structuredClone(sampleData);
Object.assign(data.universities[0], {
  name: '北川大学（测试）',
  japaneseName: 'Kitagawa University',
  location: '东京都',
  category: '国立',
  qsRank: '401-450',
  notes: '关注自然语言处理与人机交互，准备整理入试要求。',
  admissionFee: '282000',
  annualTuition: '535800',
  monthlyRent: '45000',
  monthlyLivingExpenses: '65000',
  dormitoryStatus: 'available',
  dormitoryNotes: '测试资料：留学生可申请，具体条件待确认。',
});
data.universities.push(
  {
    ...data.universities[0],
    id: 'u2',
    name: '南云大学（测试）',
    japaneseName: 'Nagumo University',
    location: '京都府',
    region: '近畿',
    category: '私立',
    qsRank: '',
    notes: '整理媒体设计方向与导师研究室。',
    dormitoryStatus: 'unknown',
  },
  {
    ...data.universities[0],
    id: 'u3',
    name: '青叶大学（测试）',
    japaneseName: 'Aoba University',
    location: '宫城县',
    region: '东北',
    qsRank: '251-300',
    notes: '对比计算机科学课程与研究方向。',
  },
);
Object.assign(data.schools[0], {
  name: '信息科学研究科',
  research: '计算机科学、人工智能',
  notes: '记录感兴趣的专攻与老师。',
});
Object.assign(data.majors[0], {
  name: '计算机科学专攻',
  research: '自然语言处理、人机交互',
  applicationStart: '每年 6 月 1 日',
  applicationEnd: '每年 6 月 15 日',
  applicationMaterials: '入学愿书\n研究计划书\n成绩单\n英语成绩证明',
  examHistory: [
    {
      id: 'e2026',
      year: '2026',
      session: '夏季入试',
      subjects: '数学、计算机基础、英语、口试',
      examDate: '',
      writtenDate: '2026-08-20 09:00',
      interviewDate: '2026-08-21 10:00',
      resultDate: '2026-09-01',
      notes: '测试资料：本年追加推荐信。',
      sourceUrl: '',
    },
    {
      id: 'e2025',
      year: '2025',
      session: '夏季入试',
      subjects: '数学、专业课、英语',
      examDate: '',
      writtenDate: '2025-08-19 09:00',
      interviewDate: '2025-08-20 10:00',
      resultDate: '2025-09-02',
      notes: '',
      sourceUrl: '',
    },
  ],
});
Object.assign(data.professors[0], {
  name: '林 さやか（测试）',
  title: '教授',
  laboratory: '语言与交互研究室',
  research: '对话系统、多模态学习、人机交互',
  notes: '先阅读近期论文，再准备联系邮件。',
  email: 'sample@example.ac.jp',
  personalWebsite: 'https://example.ac.jp/research',
  favorite: true,
});
data.professors.push({
  ...data.professors[0],
  id: 'p2',
  name: '高原 悠（测试）',
  title: '副教授',
  research: '机器学习、知识表示',
  laboratory: '智能计算研究室',
  favorite: false,
});
await fetch(`${base}/api/japangrad/workspace`, {
  method: 'PUT',
  headers: { 'X-JapanGrad-Client': '1', 'Content-Type': 'application/json' },
  body: JSON.stringify({ data, revision: 0 }),
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-background-networking', '--disable-component-update'],
});
const metrics = [];
const contrasts = [];
async function checkContrast(page, selector, label, placeholder = false) {
  const result = await page
    .locator(selector)
    .first()
    .evaluate((element, placeholder) => {
      const rgb = (value) => value.match(/[\d.]+/g).map(Number);
      const foreground = rgb(
        getComputedStyle(element, placeholder ? '::placeholder' : undefined)
          .color,
      );
      let background = [253, 254, 254];
      for (let parent = element; parent; parent = parent.parentElement) {
        const candidate = rgb(getComputedStyle(parent).backgroundColor);
        if (candidate.length < 4 || candidate[3] >= 0.99) {
          background = candidate;
          break;
        }
      }
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((value) => value / 255)
          .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          )
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const [low, high] = [luminance(foreground), luminance(background)].sort(
        (a, b) => a - b,
      );
      return {
        ratio: Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100,
        foreground,
        background,
      };
    }, placeholder);
  assert.ok(result.ratio >= 4.5, `${label} contrast ${result.ratio}`);
  contrasts.push({ label, ...result });
}
try {
  for (const mode of phase === 'before' ? ['light'] : ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      colorScheme: mode,
      reducedMotion: 'reduce',
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1'
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const pages = [
      ['universities', '/japan-grad'],
      ['university', '/japan-grad/universities/u1'],
      ['school', '/japan-grad/universities/u1/schools/s1'],
      ['major', '/japan-grad/universities/u1/schools/s1/majors/m1'],
      [
        'professor',
        '/japan-grad/universities/u1/schools/s1/majors/m1/professors/p1',
      ],
    ];
    for (const [name, route] of pages) {
      await page.goto(`${base}${route}`);
      await page.locator('.explorer-page').waitFor();
      await page.locator('#__app-loading__').waitFor({ state: 'hidden' });
      await page.screenshot({
        path: path.join(artifacts, `${name}-${mode}-desktop.png`),
        fullPage: true,
        animations: 'disabled',
      });
      if (phase === 'after') {
        if (name === 'professor')
          await checkContrast(
            page,
            '.ant-tabs-tab-active .ant-tabs-tab-btn',
            `${mode} selected tab`,
          );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${name} ${mode} desktop overflow`,
        );
        assert.equal(
          await page.locator('html').getAttribute('data-japangrad-theme'),
          mode,
        );
        metrics.push({
          page: name,
          mode,
          ...(await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            return {
              domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
              transferredBytes: performance
                .getEntriesByType('resource')
                .reduce((sum, resource) => sum + resource.transferSize, 0),
            };
          })),
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(artifacts, `${name}-${mode}-mobile.png`),
          fullPage: false,
          animations: 'disabled',
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${name} ${mode} mobile overflow`,
        );
        if (name === 'major') {
          const before = await page
            .locator('.major-admissions')
            .evaluate((element) => element.getBoundingClientRect().top);
          await page.evaluate(() => scrollTo(0, 900));
          const after = await page
            .locator('.major-admissions')
            .evaluate((element) => element.getBoundingClientRect().top);
          assert.ok(before - after > 800, 'mobile document scrolls normally');
          assert.equal(await page.locator('.explorer-topbar').count(), 1);
          await page.screenshot({
            path: path.join(artifacts, `${name}-${mode}-mobile-scrolled.png`),
            animations: 'disabled',
          });
          await page.evaluate(() => scrollTo(0, 0));
        }
        await page.setViewportSize({ width: 1440, height: 1080 });
      }
    }
    if (phase === 'after') {
      await page.goto(`${base}/japan-grad`);
      await page.getByRole('button', { name: '新增大学', exact: true }).click();
      await page
        .locator('.ant-modal-content:visible')
        .getByRole('button', { name: /取\s*消/ })
        .hover();
      await page.screenshot({
        path: path.join(artifacts, `editor-${mode}.png`),
        animations: 'disabled',
      });
      await checkContrast(
        page,
        '.ant-modal-content:visible .ant-btn-primary',
        `${mode} primary button`,
      );
      await checkContrast(
        page,
        '.ant-modal-content:visible .form-footer .ant-btn:not(.ant-btn-primary)',
        `${mode} hovered secondary button`,
      );
      await checkContrast(page, '#entity-notes', `${mode} placeholder`, true);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page
        .locator('.ant-modal-content:visible')
        .getByRole('button', { name: /取\s*消/ })
        .click();
      const opposite = mode === 'light' ? 'dark' : 'light';
      await page.getByRole('button', { name: /^界面主题：/ }).click();
      await page
        .getByRole('menuitem', {
          name: opposite === 'dark' ? '深色模式' : '浅色模式',
          exact: true,
        })
        .click();
      assert.equal(
        await page.locator('html').getAttribute('data-japangrad-theme'),
        opposite,
      );
      await page.reload();
      await page.locator('.university-card').first().waitFor();
      assert.equal(
        await page.locator('html').getAttribute('data-japangrad-theme'),
        opposite,
      );
      await page.getByRole('button', { name: /^界面主题：/ }).click();
      await page
        .getByRole('menuitem', { name: '跟随系统', exact: true })
        .click();
      assert.equal(
        await page.locator('html').getAttribute('data-japangrad-theme'),
        mode,
      );
      await page.locator('.workspace-location').click();
      await page.locator('.workspace-info code').waitFor();
      assert.equal(
        await page.locator('.workspace-info code').innerText(),
        workspace,
      );
      await page
        .locator('.ant-modal-content:visible')
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole('button', { name: '打开工作区导航', exact: true })
        .click();
      await page
        .locator('.workspace-nav-drawer .workspace-university-link')
        .first()
        .waitFor();
      await page.screenshot({
        path: path.join(artifacts, `navigation-${mode}-mobile.png`),
        animations: 'disabled',
      });
      await page
        .locator('.workspace-nav-drawer .workspace-university-link')
        .first()
        .click();
      await page.locator('.university-dashboard').waitFor();
      await page
        .locator('.workspace-nav-drawer .ant-drawer-body')
        .waitFor({ state: 'hidden' });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const failedPage = await context.newPage();
      await failedPage.route('**/api/japangrad/workspace', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '测试：本地服务暂时不可用。' }),
        }),
      );
      await failedPage.goto(`${base}/japan-grad`);
      await failedPage.locator('.storage-alert').waitFor();
      await failedPage.screenshot({
        path: path.join(artifacts, `connection-error-${mode}.png`),
        animations: 'disabled',
      });
      await failedPage.unroute('**/api/japangrad/workspace');
      await failedPage
        .getByRole('button', { name: '重试连接', exact: true })
        .click();
      await failedPage.locator('.university-card').first().waitFor();
      await failedPage.close();
      const loadingPage = await context.newPage();
      let release;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      await loadingPage.route('**/api/japangrad/workspace', async (route) => {
        await pending;
        await route.continue();
      });
      try {
        await loadingPage.goto(`${base}/japan-grad`, {
          waitUntil: 'domcontentloaded',
        });
        await loadingPage.locator('.workspace-skeleton').waitFor();
        await loadingPage.screenshot({
          path: path.join(artifacts, `loading-${mode}.png`),
          animations: 'disabled',
        });
      } finally {
        release();
      }
      await loadingPage.locator('.university-card').first().waitFor();
      await loadingPage.close();
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    path.join(artifacts, 'metrics.json'),
    JSON.stringify(metrics, null, 2),
  );
  await writeFile(
    path.join(artifacts, 'contrast.json'),
    JSON.stringify(contrasts, null, 2),
  );
  console.log(
    `Design ${phase}: screenshots ${artifacts}; temporary workspace ${workspace}`,
  );
} finally {
  await browser.close();
  const closed = once(server, 'close');
  server.close();
  await closed;
}
