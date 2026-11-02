/* oxlint-disable vitest/no-import-node-test -- Standalone Node tests. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  officialSearchProvider,
  searchOfficialWeb,
} from './collection-search.mjs';
const signal = () => new AbortController().signal;
const checkPublic = async (url) => {
  if (new URL(url).hostname === '127.0.0.1') throw new Error('private');
};
test('DeepSeek search preserves credential scope and rejects unsafe candidate links', async () => {
  let request;
  const result = await searchOfficialWeb({
    config: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
    apiKey: 'fixture',
    query: '募集要項',
    signal: signal(),
    checkPublic,
    fetcher: async (url, options) => {
      request = { url, options };
      return Response.json({
        results: [
          { url: 'https://example.com/guide', title: 'Guide' },
          { url: 'https://example.com/guide' },
          { url: 'http://127.0.0.1/private' },
          { url: 'javascript:alert(1)' },
        ],
      });
    },
  });
  assert.equal(request.url, 'https://api.deepseek.com/v1/tools/search');
  assert.deepEqual(JSON.parse(request.options.body), {
    query: '募集要項',
    count: 5,
    need_content: false,
  });
  assert.equal(request.options.headers.Authorization, 'Bearer fixture');
  assert.equal(result.results.length, 1);
});
test('OpenAI search uses native tool and structured source metadata, never model-written URLs', async () => {
  let body;
  const result = await searchOfficialWeb({
    config: { baseUrl: 'https://api.openai.com/v1', model: 'chosen-model' },
    apiKey: 'fixture',
    query: 'Admissions',
    signal: signal(),
    checkPublic,
    fetcher: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({
        output: [
          {
            type: 'web_search_call',
            action: {
              sources: [
                { url: 'https://example.com/official', title: 'Official' },
              ],
            },
          },
          { type: 'message', content: [{ text: 'https://invented.example/' }] },
        ],
      });
    },
  });
  assert.equal(body.model, 'chosen-model');
  assert.equal(body.store, false);
  assert.equal(body.tools[0].type, 'web_search');
  assert.equal(body.max_tool_calls, 1);
  assert.deepEqual(
    result.results.map((r) => r.url),
    ['https://example.com/official'],
  );
});
test('unsupported providers and cancelled work cannot send credentials or start a search', async () => {
  assert.equal(
    officialSearchProvider({
      baseUrl: 'https://api.deepseek.com.attacker.example',
    }),
    null,
  );
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ results: [] });
  };
  await assert.rejects(
    searchOfficialWeb({
      config: { baseUrl: 'http://localhost:8000' },
      query: 'test',
      apiKey: 'fixture',
      signal: signal(),
      fetcher,
    }),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    searchOfficialWeb({
      config: { baseUrl: 'https://api.deepseek.com' },
      query: 'test',
      apiKey: 'fixture',
      signal: controller.signal,
      fetcher,
    }),
  );
  assert.equal(calls, 0);
});
test('provider failures are explicit and an unexecuted native search is rejected', async () => {
  const common = {
    apiKey: 'fixture',
    query: 'test',
    signal: signal(),
    checkPublic,
  };
  await assert.rejects(
    searchOfficialWeb({
      ...common,
      config: { baseUrl: 'https://api.deepseek.com' },
      fetcher: async () =>
        new Response('secret provider error', { status: 403 }),
    }),
    /权限/,
  );
  await assert.rejects(
    searchOfficialWeb({
      ...common,
      config: { baseUrl: 'https://api.openai.com' },
      fetcher: async () =>
        Response.json({
          output: [{ type: 'message', content: [{ text: 'invented' }] }],
        }),
    }),
    /没有执行/,
  );
});
