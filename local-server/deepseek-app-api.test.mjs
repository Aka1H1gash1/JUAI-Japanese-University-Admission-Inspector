/* oxlint-disable vitest/no-import-node-test -- Standalone Node contract tests; no real API calls. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { createAdmissionOcr } from './admission-ocr.mjs';
import { modelTurn } from './assistant-provider.mjs';
import {
  createDeepseekAppApi,
  deepseekFilesSupported,
  officialDeepseek,
} from './deepseek-app-api.mjs';
const config = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-flash',
  adapter: 'deepseek',
  protocol: 'chat_completions',
  stream: false,
  connectionId: 'one',
};
const signal = () => new AbortController().signal;
const bytes = Buffer.from('contract-fixture');
const args = () => ({
  config,
  apiKey: 'fixture-key',
  bytes,
  filename: '原件.pdf',
  signal: signal(),
});

test('native APIs accept only the official host and never forward proxy credentials', async () => {
  let count = 0;
  const app = createDeepseekAppApi({
    fetcher: async () => {
      count++;
      throw new Error('unexpected');
    },
  });
  for (const baseUrl of [
    'https://api.deepseek.com.attacker.example',
    'http://api.deepseek.com',
    'https://api.deepseek.com:444',
    'https://user:password@api.deepseek.com',
    'https://api.deepseek.com/?x=1',
  ]) {
    assert.equal(officialDeepseek({ baseUrl }), false);
    await assert.rejects(
      app.upload({ ...args(), config: { ...config, baseUrl } }),
    );
    await assert.rejects(
      app.ocr({ ...args(), config: { ...config, baseUrl } }),
    );
  }
  assert.equal(count, 0);
  assert.equal(
    deepseekFilesSupported({ ...config, model: 'deepseek-v4-pro' }),
    false,
  );
});
test('OCR multipart contains only purpose/file, preserves page indexes and caches by key and workspace', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      page_count: 1,
      pages: [{ index: 0, text: '出願期間', finish_reason: 'stop' }],
    });
  };
  const app = createDeepseekAppApi({ fetcher });
  const pages = await app.ocr(args());
  assert.equal(pages[0].text, '出願期間');
  await app.ocr(args());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.deepseek.com/v1/tools/ocr');
  assert.deepEqual([...requests[0].options.body.keys()], ['purpose', 'file']);
  assert.equal(requests[0].options.headers['Content-Type'], undefined);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture-key');
  await app.ocr({ ...args(), apiKey: 'another-key' });
  await app.ocr({ ...args(), config: { ...config, connectionId: 'two' } });
  await createDeepseekAppApi({ fetcher }).ocr(args());
  assert.equal(requests.length, 4);
});
test('OCR rejects HTTP-200 errors, partial pages, oversized bodies and abort before sending; no auto retry', async () => {
  for (const response of [
    { error: { message: 'failure fixture-key' } },
    {
      page_count: 1,
      pages: [{ index: 0, text: 'partial', finish_reason: 'length' }],
    },
    {
      page_count: 2,
      pages: [{ index: 0, text: 'missing', finish_reason: 'stop' }],
    },
  ]) {
    let count = 0;
    const app = createDeepseekAppApi({
      fetcher: async () => {
        count++;
        return Response.json(response);
      },
    });
    await assert.rejects(
      app.ocr(args()),
      (error) => !error.message.includes('fixture-key'),
    );
    assert.equal(count, 1);
  }
  let count = 0;
  const app = createDeepseekAppApi({
    fetcher: async () => {
      count++;
      return new Response('x'.repeat(8 * 1024 * 1024 + 1));
    },
  });
  await assert.rejects(app.ocr(args()), /过大/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.ocr({ ...args(), signal: controller.signal }));
  assert.equal(count, 1);
});
test('Files uses rich parsing for PDF and user_data for text; expiry, key rotation and cache clear prevent stale reuse', async () => {
  let time = 1000;
  const requests = [];
  const app = createDeepseekAppApi({
    clock: () => time,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return Response.json({ id: `file-api-${requests.length}` });
    },
  });
  assert.equal(await app.upload(args()), 'file-api-1');
  assert.equal(await app.upload(args()), 'file-api-1');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.deepseek.com/files');
  assert.deepEqual(
    [...requests[0].options.body.keys()],
    ['purpose', 'expires_after[anchor]', 'expires_after[seconds]', 'file'],
  );
  assert.equal(
    requests[0].options.body.get('purpose'),
    'rich_layout_recognition',
  );
  assert.equal(requests[0].options.body.get('expires_after[seconds]'), '3600');
  await app.upload({ ...args(), filename: '笔记.md' });
  assert.equal(requests[1].options.body.get('purpose'), 'user_data');
  time += 3_300_001;
  assert.equal(await app.upload(args()), 'file-api-3');
  await app.upload({ ...args(), apiKey: 'rotated' });
  app.clear();
  await app.upload(args());
  assert.equal(requests.length, 5);
});
test('Fetch keeps original Markdown and validates target before sending credentials', async () => {
  let count = 0;
  const app = createDeepseekAppApi({
    checkPublic: async (url) => {
      if (new URL(url).hostname === '127.0.0.1') throw new Error('private');
    },
    fetcher: async (url, options) => {
      count++;
      assert.equal(url, 'https://api.deepseek.com/v1/tools/fetch');
      assert.deepEqual(JSON.parse(options.body), {
        url: 'https://example.com/a',
      });
      return Response.json({
        title: '原文',
        content: '# 原文\n[要項](/guide.pdf) [bad](javascript:bad)',
      });
    },
  });
  const result = await app.fetchPage({
    ...args(),
    url: 'https://example.com/a',
  });
  assert.equal(result.via, 'deepseek-fetch');
  assert.equal(result.text, '# 原文\n[要項](/guide.pdf) [bad](javascript:bad)');
  assert.deepEqual(
    result.links.map((l) => l.url),
    ['https://example.com/guide.pdf'],
  );
  await assert.rejects(
    app.fetchPage({ ...args(), url: 'http://127.0.0.1/private' }),
  );
  assert.equal(count, 1);
});
test('managed OCR and model file input use the selected connection without altering conversation history', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/tools/ocr'))
      return Response.json({
        page_count: 1,
        pages: [
          {
            index: 0,
            text: '<｜ref｜>募集要項<｜/ref｜><｜box｜>[[0,0,2,2]]<｜/box｜>',
            finish_reason: 'stop',
          },
        ],
      });
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: '回答' } }],
    });
  });
  const ocr = createAdmissionOcr({
    resolve: () => ({ config, apiKey: 'fixture-key' }),
  });
  const status = await ocr.status();
  assert.match(status.name, /DeepSeek/);
  assert.equal(await ocr.read(bytes.toString('base64'), signal()), '募集要項');
  const messages = [{ role: 'user', content: '总结' }];
  const result = await modelTurn({
    config,
    apiKey: 'fixture-key',
    messages,
    files: ['file-api-fixture'],
    tools: [],
    instructions: '依据原文回答',
    signal: signal(),
    onText() {},
  });
  assert.equal(result.text, '回答');
  assert.equal(messages[0].content, '总结');
  assert.deepEqual(JSON.parse(calls[1].options.body).messages[1].content, [
    { type: 'text', text: '总结' },
    { type: 'file', file_id: 'file-api-fixture' },
  ]);
  await assert.rejects(
    modelTurn({
      config: { ...config, baseUrl: 'https://proxy.example' },
      apiKey: 'proxy',
      messages,
      files: ['file-api-fixture'],
      tools: [],
      signal: signal(),
    }),
  );
  assert.equal(calls.length, 2);
});
test('real document chat uploads only its authorized original, reuses the file, and keeps remote IDs out of saved history', async (t) => {
  const { once } = await import('node:events');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createLocalApp } = await import('./server.mjs');
  const { sampleData } = await import('./test-fixtures.mjs');
  const workspace = await mkdtemp(
    path.join(tmpdir(), 'juai-deepseek-contract-'),
  );
  const app = await createLocalApp({ workspace });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    app.close();
    await once(app, 'close');
  });
  const realFetch = globalThis.fetch;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://api.deepseek.com/'))
      return realFetch(url, options);
    requests.push({ url, options });
    if (url.endsWith('/files')) {
      assert.equal(options.body.get('purpose'), 'user_data');
      assert.equal(await options.body.get('file').text(), '契約テストの原文');
      return Response.json({ id: 'file-api-authorized' });
    }
    assert.equal(url, 'https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(options.body);
    const files = body.messages.flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.filter((part) => part.type === 'file')
        : [],
    );
    assert.equal(files.length, 1);
    assert.equal(files[0].file_id, 'file-api-authorized');
    if (requests.length === 2)
      return Response.json({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-current',
                  type: 'function',
                  function: { name: 'get_current_document', arguments: '{}' },
                },
              ],
            },
          },
        ],
      });
    return Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: '依据原文回答，未核对图表。' },
        },
      ],
    });
  });
  const base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  const call = (route, method = 'GET', body) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const parse = async (response) => {
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  await parse(
    await call('/workspace', 'PUT', {
      revision: 0,
      data: structuredClone(sampleData),
    }),
  );
  const connection = await parse(
    await call('/ai/connections', 'POST', {
      name: '测试连接',
      kind: 'deepseek',
      provider: config,
      apiKey: 'fixture-key',
    }),
  );
  await parse(
    await call('/ai/features/document_chat', 'PUT', {
      connectionId: connection.id,
      model: '',
      enabled: true,
    }),
  );
  const upload = await fetch(`${base}/documents`, {
    method: 'POST',
    headers: {
      'X-JapanGrad-Client': '1',
      'X-JapanGrad-Metadata': encodeURIComponent(
        JSON.stringify({
          ownerType: 'major',
          ownerId: 'm1',
          kind: 'guidelines',
          year: 2027,
          title: '原文',
          filename: '原件.txt',
        }),
      ),
    },
    body: '契約テストの原文',
  });
  const doc = await parse(upload);
  const info = await parse(await call(`/documents/${doc.id}/reader`));
  const session = await parse(
    await call('/assistant/sessions', 'POST', {
      document: { id: doc.id, sha256: info.sha256 },
    }),
  );
  for (let n = 0; n < 2; n++) {
    const result = await call(
      `/assistant/sessions/${session.id}/turns`,
      'POST',
      {
        message: '请解释',
        reader: { documentId: doc.id, sha256: info.sha256, page: 1 },
      },
    );
    assert.equal(result.status, 200);
    const body = await result.text();
    assert.ok(!body.includes('event: error'), body);
  }
  assert.equal(requests.filter((r) => r.url.endsWith('/files')).length, 1);
  assert.equal(requests.length, 4);
  const history = await parse(await call(`/assistant/sessions/${session.id}`));
  assert.equal(history.messages.at(-1).status, 'complete');
  assert.equal(JSON.stringify(history).includes('file-api-authorized'), false);
  assert.equal(JSON.stringify(history).includes('fixture-key'), false);
  const rejected = await call(
    `/assistant/sessions/${session.id}/turns`,
    'POST',
    {
      message: '错文件',
      reader: { documentId: 'other', sha256: info.sha256, page: 1 },
    },
  );
  assert.equal(rejected.status, 409);
  assert.equal(requests.length, 4);
});
test('admissions API renders only selected PDF pages, uses native OCR, and creates an unaccepted draft', async (t) => {
  const { once } = await import('node:events');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createLocalApp } = await import('./server.mjs');
  const { sampleData, samplePdf } = await import('./test-fixtures.mjs');
  const workspace = await mkdtemp(path.join(tmpdir(), 'juai-deepseek-ocr-'));
  const app = await createLocalApp({ workspace });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(async () => {
    app.close();
    await once(app, 'close');
  });
  const realFetch = globalThis.fetch;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://api.deepseek.com/'))
      return realFetch(url, options);
    requests.push(url);
    if (url.endsWith('/tools/ocr')) {
      assert.equal(options.body.get('file').name, 'page.png');
      return Response.json({
        page_count: 1,
        pages: [
          {
            index: 0,
            text: '出願期間は2027年6月1日から6月15日までです。',
            finish_reason: 'stop',
          },
        ],
      });
    }
    assert.equal(url, 'https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.tools, undefined);
    const prompt = JSON.parse(body.messages[1].content);
    assert.equal(prompt.pages.length, 1);
    assert.equal(prompt.pages[0].page, 1);
    assert.equal(prompt.pages[0].ocr, true);
    assert.match(prompt.pages[0].text, /出願期間/);
    return Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ fields: [], warnings: [] }) },
        },
      ],
    });
  });
  const base = `http://127.0.0.1:${app.address().port}/api/japangrad`;
  const call = (route, method = 'GET', body) =>
    fetch(`${base}${route}`, {
      method,
      headers: {
        'X-JapanGrad-Client': '1',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const parse = async (response) => {
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  await parse(
    await call('/workspace', 'PUT', {
      revision: 0,
      data: structuredClone(sampleData),
    }),
  );
  const connection = await parse(
    await call('/ai/connections', 'POST', {
      name: 'OCR测试',
      kind: 'deepseek',
      provider: config,
      apiKey: 'fixture-key',
    }),
  );
  await parse(
    await call('/ai/features/admission_extract', 'PUT', {
      connectionId: connection.id,
      model: '',
      enabled: true,
    }),
  );
  const doc = await parse(
    await fetch(`${base}/documents`, {
      method: 'POST',
      headers: {
        'X-JapanGrad-Client': '1',
        'X-JapanGrad-Metadata': encodeURIComponent(
          JSON.stringify({
            ownerType: 'major',
            ownerId: 'm1',
            kind: 'guidelines',
            year: 2027,
            title: '要項',
            filename: '要項.pdf',
          }),
        ),
      },
      body: samplePdf(),
    }),
  );
  const before = await parse(await call('/workspace'));
  const job = await parse(
    await call('/analysis/jobs', 'POST', {
      majorId: 'm1',
      documentIds: [doc.id],
      context: {
        admissionYear: 2027,
        degree: 'master',
        selectionType: '一般',
        notes: '',
      },
    }),
  );
  async function until(read, done) {
    for (let n = 0; n < 500; n++) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('test workflow timed out');
  }
  await until(
    async () => parse(await call(`/analysis/jobs/${job.id}`)),
    (value) =>
      ['awaiting_review', 'failed', 'ready'].includes(value.job.status),
  );
  await parse(
    await call(`/analysis/jobs/${job.id}/ai`, 'POST', {
      mode: 'managed',
      scanMode: 'ocr',
      ranges: { [doc.id]: '1' },
    }),
  );
  const finished = await until(
    async () => parse(await call(`/analysis/jobs/${job.id}/ai`)),
    (value) =>
      ['cancelled', 'completed', 'failed'].includes(value.runs[0]?.status),
  );
  assert.equal(finished.runs[0].status, 'completed', JSON.stringify(finished));
  assert.ok(finished.runs[0].proposalId);
  assert.deepEqual(requests, [
    'https://api.deepseek.com/v1/tools/ocr',
    'https://api.deepseek.com/v1/chat/completions',
  ]);
  const after = await parse(await call('/workspace'));
  assert.deepEqual(after.data, before.data);
});

test('server transport encodes Node-native multipart using the provider FormData brand', async () => {
  const { Request, FormData: ProviderFormData } = await import('undici');
  const { providerRequestBody } = await import('./server-outbound.mjs');
  const native = new FormData();
  native.append('purpose', 'rich_layout_recognition');
  native.append('expires_after[anchor]', 'created_at');
  native.append('expires_after[seconds]', '3600');
  native.append('file', new Blob(['synthetic PDF bytes']), '原件.pdf');
  const body = providerRequestBody(native);
  assert.ok(body instanceof ProviderFormData);
  const request = new Request('https://api.deepseek.com/files', {
    method: 'POST',
    body,
  });
  assert.match(
    request.headers.get('content-type'),
    /^multipart\/form-data; boundary=/,
  );
  const parsed = await request.formData();
  assert.deepEqual(
    [...parsed.keys()],
    ['purpose', 'expires_after[anchor]', 'expires_after[seconds]', 'file'],
  );
  assert.equal(parsed.get('file').name, '原件.pdf');
  assert.equal(await parsed.get('file').text(), 'synthetic PDF bytes');
  assert.equal(providerRequestBody(body), body);
  assert.equal(
    providerRequestBody('{"model":"fixture"}'),
    '{"model":"fixture"}',
  );
  assert.equal(providerRequestBody(undefined), undefined);
});
