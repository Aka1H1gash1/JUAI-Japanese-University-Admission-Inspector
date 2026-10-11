import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalApp, validateExplorer } from '../local-server/server.mjs';
import { sampleData } from '../local-server/test-fixtures.mjs';
import {
  formatYen,
  universityFees,
  universityFeeTotals,
  universityBudgetTotals,
} from '../apps/web-antd/src/views/japan-grad/university-fees.ts';

test('university fees: legacy defaults, private amounts, overrides, zero and incomplete totals', () => {
  for (const category of ['国立', '公立', '国公立', '国立公立']) {
    assert.deepEqual(universityFees({ category }), {
      admissionFee: '282000',
      annualTuition: '535800',
    });
    assert.deepEqual(universityFeeTotals({ category }), {
      firstYear: '817800',
      twoYears: '1353600',
    });
  }
  assert.deepEqual(universityFees({ category: '私立' }), {
    admissionFee: '',
    annualTuition: '',
  });
  assert.deepEqual(universityFeeTotals({ category: '私立' }), {
    firstYear: '',
    twoYears: '',
  });
  assert.deepEqual(
    universityFeeTotals({
      category: '国立',
      admissionFee: '300000',
      annualTuition: '600000',
    }),
    {
      firstYear: '900000',
      twoYears: '1500000',
    },
  );
  assert.deepEqual(
    universityFeeTotals({
      category: '私立',
      admissionFee: '0',
      annualTuition: '0',
    }),
    {
      firstYear: '0',
      twoYears: '0',
    },
  );
  assert.deepEqual(
    universityFees({ category: '公立', admissionFee: '', annualTuition: '0' }),
    {
      admissionFee: '',
      annualTuition: '0',
    },
  );
  assert.equal(
    universityFeeTotals({
      category: '公立',
      admissionFee: '',
      annualTuition: '535800',
    }).firstYear,
    '',
  );
  assert.equal(formatYen('282000'), '282,000');
  assert.equal(formatYen('0'), '0');
});

test('university fee validation accepts legacy records and rejects invalid amounts', () => {
  assert.doesNotThrow(() => validateExplorer(structuredClone(sampleData)));
  for (const value of [
    '-1',
    '1.5',
    '282,000',
    'NaN',
    '1000000000',
    282000,
    null,
    {},
  ]) {
    for (const field of [
      'admissionFee',
      'annualTuition',
      'monthlyRent',
      'monthlyLivingExpenses',
    ]) {
      const data = structuredClone(sampleData);
      data.universities[0][field] = value;
      assert.throws(() => validateExplorer(data));
    }
  }
  for (const value of ['', '0', '535800', '999999999']) {
    const data = structuredClone(sampleData);
    data.universities[0].annualTuition = value;
    assert.doesNotThrow(() => validateExplorer(data));
  }
});

test('total budgets include monthly rent and living costs, distinguish missing values and allow zero costs', () => {
  const complete = universityBudgetTotals({
    category: '国立',
    monthlyRent: '40000',
    monthlyLivingExpenses: '60000',
  });
  assert.equal(complete.firstYear, '2017800');
  assert.equal(complete.twoYears, '3753600');
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.missingFields, []);
  const legacy = universityBudgetTotals({ category: '国公立' });
  assert.equal(legacy.firstYear, '817800');
  assert.equal(legacy.complete, false);
  assert.deepEqual(legacy.missingFields, ['房租', '生活费']);
  const partial = universityBudgetTotals({
    category: '私立',
    monthlyRent: '40000',
  });
  assert.equal(partial.firstYear, '480000');
  assert.equal(partial.twoYears, '960000');
  assert.equal(partial.complete, false);
  assert.equal(universityBudgetTotals({ category: '私立' }).firstYear, '');
  assert.equal(
    universityBudgetTotals({
      category: '国立',
      monthlyRent: '0',
      monthlyLivingExpenses: '0',
    }).complete,
    true,
  );
  const zero = universityBudgetTotals({
    category: '私立',
    admissionFee: '0',
    annualTuition: '0',
    monthlyRent: '0',
    monthlyLivingExpenses: '0',
  });
  assert.equal(zero.firstYear, '0');
  assert.equal(zero.complete, true);
});

test('logos stay on disk and dormitory and budget data survive replacement, removal and restart', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-logos-'));
  let server;
  async function start() {
    server = await createLocalApp({ workspace });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}/api/japangrad`;
  }
  async function close() {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
  let base = await start();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const upload = (body) =>
    fetch(`${base}/university-logos`, {
      method: 'POST',
      headers: { 'X-JapanGrad-Client': '1' },
      body,
    });
  const save = (data, revision) =>
    fetch(`${base}/workspace`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      body: JSON.stringify({ data, revision }),
    });
  try {
    assert.equal(
      (
        await upload(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        )
      ).status,
      400,
    );
    assert.equal((await upload(Buffer.alloc(3 * 1024 * 1024 + 1))).status, 413);
    const uploaded = await upload(png);
    assert.equal(uploaded.status, 201);
    const { id } = await uploaded.json();
    assert.deepEqual(
      await readFile(path.join(workspace, 'university-logos', id)),
      png,
    );
    const image = await fetch(`${base}/university-logos/${id}`);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    const data = structuredClone(sampleData);
    Object.assign(data.universities[0], {
      logoId: id,
      monthlyRent: '40000',
      monthlyLivingExpenses: '60000',
      dormitoryStatus: 'available',
      dormitoryNotes: '留学生可申请，入住一年。',
      dormitoryWebsite: 'https://example.ac.jp/dormitory',
    });
    assert.equal((await save(data, 0)).status, 200);
    await close();
    base = await start();
    const restored = await (await fetch(`${base}/workspace`)).json();
    assert.deepEqual(restored.data.universities[0], data.universities[0]);
    assert.equal(
      universityBudgetTotals(restored.data.universities[0]).firstYear,
      '2017800',
    );
    const replacement = await (await upload(png)).json();
    data.universities[0].logoId = replacement.id;
    assert.equal((await save(data, 1)).status, 200);
    data.universities[0].logoId = '';
    assert.equal((await save(data, 2)).status, 200);
    assert.deepEqual(
      await readFile(path.join(workspace, 'university-logos', id)),
      png,
    );
    data.universities[0].logoId = '../workspace.db';
    assert.equal((await save(data, 3)).status, 400);
    data.universities[0].logoId = '00000000-0000-0000-0000-000000000000.png';
    assert.equal((await save(data, 3)).status, 404);
    data.universities[0].logoId = '';
    data.universities[0].dormitoryStatus = 'arbitrary';
    assert.equal((await save(data, 3)).status, 400);
  } finally {
    await close();
  }
});

test('custom fees and notes survive a local server restart', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'japangrad-fees-'));
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
  try {
    const data = structuredClone(sampleData);
    Object.assign(data.universities[0], {
      admissionFee: '0',
      annualTuition: '620000',
      feeNotes: '入学金减免；学费按研究科调整。',
    });
    const saved = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-JapanGrad-Client': '1',
      },
      body: JSON.stringify({ data, revision: 0 }),
    });
    assert.equal(saved.status, 200);
    await close();
    url = await start();
    const restored = await (await fetch(url)).json();
    assert.deepEqual(restored.data.universities[0], data.universities[0]);
    assert.deepEqual(universityFeeTotals(restored.data.universities[0]), {
      firstYear: '620000',
      twoYears: '1240000',
    });
  } finally {
    await close();
  }
});
