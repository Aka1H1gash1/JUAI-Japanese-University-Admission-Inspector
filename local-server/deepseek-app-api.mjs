import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { collectionUrl, publicAddresses } from './collection-web.mjs';
import { providerFetch } from './server-outbound.mjs';

// Native application APIs must never send a proxy/local provider's key to DeepSeek.
export function officialDeepseek(config) {
  try {
    const url = new URL(config?.baseUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'api.deepseek.com' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.port || url.port === '443')
    );
  } catch {
    return false;
  }
}
export const deepseekFilesSupported = (config) =>
  officialDeepseek(config) && config.model === 'deepseek-flash';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const redact = (value, key) =>
  String(value || '接口请求失败。')
    .replaceAll(key || '\0', '[已隐藏密钥]')
    .replaceAll(/Bearer\s+\S+|sk-[\w-]{8,}/gi, '[已隐藏密钥]')
    .slice(0, 500);
async function jsonResult(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('DeepSeek 没有返回内容。');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024)
        throw new Error('DeepSeek 返回内容过大，请缩小范围。');
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok || data.error) {
      const detail =
        typeof data.error?.message === 'string' ? data.error.message : '';
      throw new Error(
        `DeepSeek 接口失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
      );
    }
    return data;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function createDeepseekAppApi({
  fetcher = providerFetch,
  checkPublic = publicAddresses,
  clock = Date.now,
} = {}) {
  // Each instance belongs to one workspace. Credentials are hashed and never persisted.
  const cache = new Map();
  let cacheBytes = 0;
  function forget(key) {
    cacheBytes -= cache.get(key)?.bytes || 0;
    cache.delete(key);
  }
  const scope = (config, apiKey, bytes, purpose) =>
    hash(
      `${config.connectionId || ''}:${hash(apiKey)}:${hash(bytes)}:${purpose}`,
    );
  const cached = (key) => {
    const entry = cache.get(key);
    if (entry && entry.until > clock()) return entry.value;
    forget(key);
  };
  const remember = (key, value, until) => {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > 8 * 1024 * 1024) return value;
    forget(key);
    while (
      cache.size > 0 &&
      (cache.size >= 128 || cacheBytes + bytes > 8 * 1024 * 1024)
    )
      forget(cache.keys().next().value);
    cache.set(key, { value, until, bytes });
    cacheBytes += bytes;
    return value;
  };
  async function request(
    config,
    apiKey,
    endpoint,
    body,
    signal,
    multipart = false,
  ) {
    if (!officialDeepseek(config) || typeof apiKey !== 'string' || !apiKey)
      throw new Error('此功能需要当前用户的 DeepSeek 官方连接与密钥。');
    signal.throwIfAborted();
    try {
      const response = await fetcher(`https://api.deepseek.com${endpoint}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        },
        body: multipart ? body : JSON.stringify(body),
      });
      const result = await jsonResult(response);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (signal.aborted)
        throw new Error(
          '本次请求已停止；已提交的识别可能仍由服务商继续处理并计费。',
          { cause: error },
        );
      throw new Error(redact(error.message, apiKey), { cause: error });
    }
  }
  function form(bytes, filename, purpose, expires = false) {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > 100 * 1024 * 1024
    )
      throw new Error('识别文件必须为 1 字节至 100 MiB。');
    const body = new FormData();
    body.append('purpose', purpose);
    if (expires) {
      body.append('expires_after[anchor]', 'created_at');
      body.append('expires_after[seconds]', '3600');
    }
    body.append('file', new Blob([bytes]), filename);
    return body;
  }
  return {
    clear() {
      cache.clear();
      cacheBytes = 0;
    },
    async ocr({ config, apiKey, bytes, filename = 'page.png', signal }) {
      if (!officialDeepseek(config))
        throw new Error('OCR 需要 DeepSeek 官方连接。');
      const key = scope(config, apiKey, bytes, 'ocr');
      signal.throwIfAborted();
      const prior = cached(key);
      if (prior) return prior;
      const result = await request(
        config,
        apiKey,
        '/v1/tools/ocr',
        form(bytes, filename, 'text_recognition'),
        signal,
        true,
      );
      if (
        !Array.isArray(result.pages) ||
        result.pages.length === 0 ||
        result.pages.length > 1000 ||
        result.page_count !== result.pages.length ||
        result.pages.some(
          (p, i) =>
            p.index !== i ||
            typeof p.text !== 'string' ||
            p.finish_reason !== 'stop',
        )
      )
        throw new Error(
          'DeepSeek OCR 页码或内容不完整；请缩小范围后重新识别，不会自动重试。',
        );
      return remember(key, result.pages, clock() + 3_600_000);
    },
    async upload({ config, apiKey, bytes, filename, signal }) {
      if (!deepseekFilesSupported(config))
        throw new Error('原生文件理解需要 DeepSeek Flash 官方连接。');
      const purpose = ['.md', '.txt'].includes(
        path.extname(filename).toLowerCase(),
      )
        ? 'user_data'
        : 'rich_layout_recognition';
      if (purpose === 'user_data' && bytes.length > 32 * 1024 * 1024)
        throw new Error('文本文件不能超过 32 MiB。');
      const key = scope(config, apiKey, bytes, purpose);
      signal.throwIfAborted();
      const prior = cached(key);
      if (prior) return prior;
      const started = clock();
      const result = await request(
        config,
        apiKey,
        '/files',
        form(bytes, filename, purpose, true),
        signal,
        true,
      );
      if (
        typeof result.id !== 'string' ||
        !/^file-[\w-]{1,200}$/.test(result.id)
      )
        throw new Error('DeepSeek 没有返回有效文件标识。');
      // Leave five minutes for request/clock skew; never reuse a provider-expired file.
      return remember(
        key,
        result.id,
        Math.min(
          started + 3_300_000,
          Number.isFinite(result.expires_at)
            ? result.expires_at * 1000 - 300_000
            : Infinity,
        ),
      );
    },
    async fetchPage({ config, apiKey, url: raw, signal }) {
      const url = collectionUrl(raw);
      signal.throwIfAborted();
      await checkPublic(url);
      const result = await request(
        config,
        apiKey,
        '/v1/tools/fetch',
        { url },
        signal,
      );
      if (typeof result.content !== 'string' || !result.content.trim())
        throw new Error('DeepSeek 未读取到网页正文。');
      const links = [];
      for (const match of result.content.matchAll(
        /\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g,
      )) {
        try {
          const href = collectionUrl(match[1], url);
          if (!links.some((l) => l.url === href) && links.length < 250)
            links.push({ url: href, title: href });
        } catch {}
      }
      return {
        kind: 'web',
        url,
        via: 'deepseek-fetch',
        title: String(result.title || url).slice(0, 240),
        text: result.content.slice(0, 120_000),
        truncated: result.content.length > 120_000,
        links,
        images: [],
        warnings: [],
      };
    },
  };
}
