import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { load } from 'cheerio';
import { chromium } from 'playwright-core';
import { Agent, fetch as request } from 'undici';

const blocked = new BlockList();
for (const [ip, mask] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
])
  blocked.addSubnet(ip, mask, 'ipv4');
for (const [ip, mask] of [
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
])
  blocked.addSubnet(ip, mask, 'ipv6');
export function collectionUrl(raw, base) {
  if (typeof raw !== 'string' || raw.length > 4096)
    throw new Error('请填写有效网页链接。');
  let url;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    throw new Error('网页链接格式不正确。');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new Error(
      '收集链接仅支持公开 HTTP / HTTPS 网页，不能包含账号密码或自定义端口。',
    );
  url.hash = '';
  if (
    /(?:^|\/)(?:logout|signout|delete|remove|unsubscribe|checkout)(?:\/|$)/i.test(
      url.pathname,
    ) ||
    ['action', 'do', 'operation'].some((key) =>
      /^(?:logout|signout|delete|remove|reset|submit)$/i.test(
        url.searchParams.get(key) || '',
      ),
    )
  )
    throw new Error('收集任务不打开退出、删除、提交等操作链接。');
  return url.toString();
}
async function publicAddresses(url) {
  const host = new URL(url).hostname.replaceAll(/^\[|\]$/g, '');
  if (/^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host))
    throw new Error('收集任务只读取公开网页。');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error('网站域名解析超时。')),
            8000,
          );
          t.unref();
        }),
      ]);
  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      family === 4
        ? blocked.check(address, 'ipv4')
        : !/^[23][\da-f]{3}:/i.test(address) || blocked.check(address, 'ipv6'),
    )
  )
    throw new Error('该链接未解析到可访问的公开网站地址。');
  return addresses;
}
function htmlResult(html, url, mime) {
  const $ = load(html);
  const title = $('title').first().text().trim().slice(0, 240) || url;
  const links = [];
  const images = [];
  $('img[src],img[data-src]').each((_, img) => {
    const alt = ($(img).attr('alt') || '').trim();
    const src = $(img).attr('src') || $(img).attr('data-src') || '';
    if (
      images.length >= 12 ||
      !/logo|emblem|crest|symbol|校章|学章|ロゴ|大学|university/i.test(
        `${alt} ${src}`,
      )
    )
      return;
    try {
      const value = collectionUrl(src, url);
      if (value.length <= 2048 && !images.some((i) => i.url === value))
        images.push({ url: value, alt: alt.slice(0, 200) });
    } catch {}
  });
  $('a[href]').each((_, a) => {
    if (links.length >= 250) return;
    try {
      const href = collectionUrl($(a).attr('href'), url);
      if (!links.some((l) => l.url === href))
        links.push({
          url: href,
          title: ($(a).text().trim() || $(a).attr('title') || href).slice(
            0,
            180,
          ),
        });
    } catch {}
  });
  const emails = $('a[href^="mailto:"]')
    .toArray()
    .map((a) => $(a).attr('href').slice(7).split('?')[0])
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    .slice(0, 20);
  $('script,style,noscript,iframe,object,svg,template').remove();
  $('br').replaceWith('\n');
  $('td,th').append(' | ');
  $('p,div,h1,h2,h3,h4,li,tr,section,article').append('\n');
  const full =
    `${title}\n\n${$('body').text() || $.root().text()}${emails.length > 0 ? `\n公开邮箱链接：${emails.join('、')}` : ''}`
      .replaceAll(/[\t \u00A0]+/g, ' ')
      .replaceAll(/\n[ \t]+/g, '\n')
      .replaceAll(/\n{3,}/g, '\n\n')
      .trim();
  return {
    kind: 'web',
    title,
    url,
    mime,
    text: full.slice(0, 120_000),
    truncated: full.length > 120_000,
    links,
    images,
  };
}
export async function fetchCollectionUrl(raw, signal, { image = false } = {}) {
  let url = collectionUrl(raw);
  for (let redirects = 0; redirects < 6; redirects++) {
    signal.throwIfAborted();
    const addresses = await publicAddresses(url);
    const dispatcher = new Agent({
      connect: {
        lookup(_hostname, options, callback) {
          options?.all
            ? callback(null, addresses)
            : callback(null, addresses[0].address, addresses[0].family);
        },
      },
    });
    try {
      const response = await request(url, {
        dispatcher,
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        headers: {
          'User-Agent': 'JUAI-Information-Collector/0.4',
          Accept: image
            ? 'image/png,image/jpeg,image/webp,image/svg+xml'
            : 'text/html,application/pdf,text/plain;q=0.8,*/*;q=0.1',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('网页跳转缺少目标链接。');
        url = collectionUrl(location, url);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`网站返回 ${response.status}，可尝试用户浏览器读取。`);
      }
      const mime = (response.headers.get('content-type') || '').toLowerCase();
      const max = (() => {
        if (image) {
          return 3 * 1024 * 1024;
        }
        if (mime.includes('pdf') || /\.pdf(?:\?|$)/i.test(url)) {
          return 40 * 1024 * 1024;
        }
        return 4 * 1024 * 1024;
      })();
      if (Number(response.headers.get('content-length')) > max) {
        await response.body?.cancel();
        throw new Error('网页或附件过大，请单独下载后上传。');
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > max) throw new Error('网页或附件超过读取大小限制。');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length === 0) throw new Error('网站未返回可读取内容。');
      if (image) return { kind: 'image', url, mime, bytes };
      let pdfTitle = new URL(url).pathname.split('/').at(-1) || '募集要项.pdf';
      try {
        pdfTitle = decodeURIComponent(pdfTitle);
      } catch {}
      if (bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
        return {
          kind: 'pdf',
          title: pdfTitle.slice(0, 240),
          url,
          mime: 'application/pdf',
          bytes,
          links: [],
        };
      if (mime && !/(?:html|text\/|xml|json)/.test(mime))
        throw new Error('此链接不是可读取网页或 PDF。');
      const head = bytes.subarray(0, 2048).toString('ascii');
      const charset =
        mime.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
        head.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ||
        'utf8';
      let html;
      try {
        html = new TextDecoder(charset).decode(bytes);
      } catch {
        html = new TextDecoder().decode(bytes);
      }
      return htmlResult(html, url, mime);
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }
  throw new Error('网页跳转次数过多。');
}

export function createCollectionBrowser() {
  let browser;
  let connecting;
  let configuredPort = 0;
  let closed = false;
  const pages = new Set();
  async function discover() {
    const dirs = (() => {
      if (process.platform === 'darwin') {
        return [
          'Library/Application Support/Google/Chrome',
          'Library/Application Support/Google/Chrome Canary',
          'Library/Application Support/Chromium',
        ].map((p) => path.join(homedir(), p));
      }
      if (process.platform === 'win32') {
        return [
          path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data'),
        ];
      }
      return [
        path.join(homedir(), '.config/google-chrome'),
        path.join(homedir(), '.config/chromium'),
      ];
    })();
    const ports = configuredPort ? [configuredPort] : [];
    if (!configuredPort)
      for (const dir of dirs) {
        try {
          const descriptor = await readFile(
            path.join(dir, 'DevToolsActivePort'),
            'utf8',
          );
          const port = Number(descriptor.split('\n')[0]);
          if (port > 0 && port <= 65_535) ports.push(port);
        } catch {}
      }
    if (!configuredPort) ports.push(9222, 9229, 9333);
    for (const port of new Set(ports))
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
          redirect: 'error',
          signal: AbortSignal.timeout(1000),
        });
        if (!response.ok) continue;
        const value = await response.json();
        const ws = new URL(value.webSocketDebuggerUrl);
        if (
          ['127.0.0.1', 'localhost'].includes(ws.hostname) &&
          Number(ws.port) === port &&
          ws.protocol === 'ws:' &&
          ws.pathname.startsWith('/devtools/browser/')
        )
          return {
            endpoint: `http://127.0.0.1:${port}`,
            name: String(value.Browser || 'Chrome').slice(0, 120),
            port,
          };
      } catch {}
    return null;
  }
  return {
    async status() {
      const value = await discover();
      return value
        ? { available: true, name: value.name, port: value.port }
        : {
            available: false,
            name: '',
            port: configuredPort,
            message:
              '请在 Chrome 的 chrome://inspect/#remote-debugging 开启远程调试，并允许本机连接。',
          };
    },
    async configure(port) {
      if (
        port !== undefined &&
        (!Number.isInteger(port) || port < 0 || port > 65_535)
      )
        throw new Error('浏览器端口格式错误。');
      if (pages.size > 0 || connecting)
        throw new Error('收集任务正在使用浏览器，请完成后再切换连接。');
      configuredPort = port || 0;
      if (browser) {
        await browser.close().catch(() => {});
        browser = undefined;
      }
      return this.status();
    },
    async read(raw, signal) {
      if (closed) throw new Error('浏览器读取服务已关闭。');
      const url = collectionUrl(raw);
      await publicAddresses(url);
      signal.throwIfAborted();
      if (!browser?.isConnected()) {
        if (!connecting)
          connecting = (async () => {
            const value = await discover();
            if (!value)
              throw new Error(
                '用户 Chrome 尚未开放连接，请先在信息收集页面连接浏览器。',
              );
            browser = await chromium.connectOverCDP(value.endpoint, {
              timeout: 12_000,
              noDefaults: true,
            });
            return browser;
          })().finally(() => {
            connecting = undefined;
          });
        await connecting;
        signal.throwIfAborted();
      }
      const context = browser.contexts()[0];
      if (!context) throw new Error('Chrome 没有可用的用户浏览器上下文。');
      const page = await context.newPage();
      pages.add(page);
      const abort = () => void page.close().catch(() => {});
      signal.addEventListener('abort', abort, { once: true });
      page.on('dialog', (dialog) => void dialog.dismiss().catch(() => {}));
      page.on('popup', (popup) => void popup.close().catch(() => {}));
      try {
        signal.throwIfAborted();
        await page.route('**/*', async (route) => {
          try {
            const target = collectionUrl(route.request().url());
            if (!['GET', 'HEAD'].includes(route.request().method()))
              return route.abort();
            await publicAddresses(target);
            await route.continue();
          } catch {
            await route.abort().catch(() => {});
          }
        });
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await page
          .waitForLoadState('networkidle', { timeout: 3500 })
          .catch(() => {});
        signal.throwIfAborted();
        const actual = collectionUrl(page.url());
        await publicAddresses(actual);
        const result = await page.evaluate(() => ({
          title: document.title,
          text: (document.body?.innerText || '').slice(0, 120_001),
          links: [...document.querySelectorAll('a[href]')]
            .map((a) => ({
              url: a.href,
              title: (a.innerText || a.title || a.href).slice(0, 180),
            }))
            .slice(0, 250),
          emails: [...document.querySelectorAll('a[href^="mailto:"]')]
            .map((a) => a.href.slice(7).split('?')[0])
            .slice(0, 20),
          images: [...document.images]
            .map((img) => ({
              url: img.currentSrc || img.src,
              alt: (img.alt || '').slice(0, 200),
            }))
            .filter((img) =>
              /logo|emblem|crest|symbol|校章|学章|ロゴ|大学|university/i.test(
                `${img.url} ${img.alt}`,
              ),
            )
            .slice(0, 12),
        }));
        const links = [];
        for (const link of result.links)
          try {
            const value = collectionUrl(link.url, actual);
            if (!links.some((l) => l.url === value))
              links.push({ url: value, title: link.title });
          } catch {}
        const full = `${result.title}\n\n${result.text}${result.emails.length > 0 ? `\n公开邮箱链接：${result.emails.join('、')}` : ''}`;
        const images = [];
        for (const img of result.images)
          try {
            const value = collectionUrl(img.url, actual);
            if (value.length <= 2048 && !images.some((i) => i.url === value))
              images.push({ url: value, alt: img.alt });
          } catch {}
        return {
          kind: 'web',
          title: result.title.slice(0, 240) || actual,
          text: full.slice(0, 120_000),
          truncated: full.length > 120_000,
          url: actual,
          links,
          images,
          via: 'browser',
        };
      } finally {
        signal.removeEventListener('abort', abort);
        pages.delete(page);
        await page.close().catch(() => {});
      }
    },
    async close() {
      closed = true;
      if (connecting) await connecting.catch(() => {});
      for (const page of pages) await page.close().catch(() => {});
      pages.clear();
      if (browser) await browser.close().catch(() => {});
      browser = undefined;
    },
  };
}
