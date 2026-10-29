import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  access,
  mkdir,
  open,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.dirname(directory);

function isLoopback(address = '') {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req, limit = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求内容过大。');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function privateIpv4Addresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue;
      addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)].toSorted((left, right) => {
    const score = (value) => {
      if (value.startsWith('192.168.')) return 0;
      if (value.startsWith('10.')) return 1;
      if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(value)) return 2;
      return 3;
    };
    return score(left) - score(right) || left.localeCompare(right);
  });
}

function safeCookieValue(value) {
  return /^[A-Za-z0-9_-]{20,100}$/.test(value);
}

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function sameSecret(left, right) {
  if (!safeCookieValue(left) || !safeCookieValue(right)) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function proxyToCore(req, res, corePort) {
  const headers = { ...req.headers, host: `127.0.0.1:${corePort}` };
  if (headers.origin) headers.origin = `http://127.0.0.1:${corePort}`;
  delete headers.forwarded;
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  const outgoing = httpRequest(
    {
      headers,
      hostname: '127.0.0.1',
      method: req.method,
      path: req.url,
      port: corePort,
    },
    (incoming) => {
      res.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(res);
    },
  );
  outgoing.on('error', () => {
    if (res.headersSent) res.destroy();
    else sendJson(res, { error: '本地数据服务暂时不可用。' }, 502);
  });
  req.pipe(outgoing);
}

async function listen(server, host, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address().port;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

async function commandExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function openBrowser(url) {
  const launch = (command, args) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
  };
  if (process.platform === 'darwin') {
    for (const application of [
      '/Applications/Google Chrome.app',
      path.join(homedir(), 'Applications/Google Chrome.app'),
    ]) {
      if (await commandExists(application)) {
        launch('open', ['-a', application, url]);
        return 'Google Chrome';
      }
    }
    launch('open', [url]);
    return '默认浏览器';
  }
  if (process.platform === 'win32') {
    const roots = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
    ].filter(Boolean);
    const candidates = roots.flatMap((root) => [
      path.join(root, 'Google/Chrome/Application/chrome.exe'),
      path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
    ]);
    for (const candidate of candidates) {
      if (await commandExists(candidate)) {
        launch(candidate, ['--new-window', url]);
        return candidate.includes('Chrome')
          ? 'Google Chrome'
          : 'Microsoft Edge';
      }
    }
    launch('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
    return '默认浏览器';
  }
  launch('xdg-open', [url]);
  return '默认浏览器';
}

async function fetchRunningInstance(stateFile) {
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin)) return null;
    const response = await fetch(
      `${state.origin}/api/japangrad/runtime/browser`,
      {
        signal: AbortSignal.timeout(1500),
      },
    );
    return response.ok ? state : null;
  } catch {
    return null;
  }
}

async function applicationVersion() {
  for (const candidate of [
    path.join(directory, 'package.json'),
    path.join(applicationRoot, 'BUILD_INFO.json'),
  ]) {
    try {
      const value = JSON.parse(await readFile(candidate, 'utf8'));
      if (value.version) return value.version;
    } catch {}
  }
  return '1.2.0';
}

function staticDirectory() {
  if (process.env.JAPANGRAD_STATIC_DIR) return process.env.JAPANGRAD_STATIC_DIR;
  const packaged = path.join(applicationRoot, 'web');
  return existsSync(packaged)
    ? packaged
    : path.join(applicationRoot, 'apps/web-antd/dist');
}

function localServerModule() {
  return path.join(applicationRoot, 'local-server/server.mjs');
}

function workspaceUpgradeModule() {
  const packaged = path.join(directory, 'workspace-upgrade.mjs');
  return existsSync(packaged)
    ? packaged
    : path.join(applicationRoot, 'desktop/workspace-upgrade.mjs');
}

async function startJuaiBrowser({
  workspace = process.env.JAPANGRAD_WORKSPACE ||
    path.join(homedir(), 'Documents', 'JapanGradWorkspace'),
  launchBrowser = true,
} = {}) {
  await mkdir(workspace, { recursive: true });
  const stateFile = path.join(workspace, '.juai-browser-instance.json');
  const lockFile = path.join(workspace, '.juai-browser-instance.lock');
  const existing = await fetchRunningInstance(stateFile);
  if (existing) {
    if (launchBrowser) await openBrowser(`${existing.origin}/welcome`);
    return { existing: true, origin: existing.origin };
  }
  let lock;
  try {
    lock = await open(lockFile, 'wx');
    await lock.writeFile(String(process.pid));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let raced;
    for (let attempt = 0; attempt < 10 && !raced; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      raced = await fetchRunningInstance(stateFile);
    }
    if (raced) {
      if (launchBrowser) await openBrowser(`${raced.origin}/welcome`);
      return { existing: true, origin: raced.origin };
    }
    const owner = Number.parseInt(
      await readFile(lockFile, 'utf8').catch(() => ''),
      10,
    );
    if (processIsRunning(owner))
      throw new Error('JUAI 正在启动，请稍候再点击。', {
        cause: error,
      });
    await unlink(lockFile).catch(() => {});
    await unlink(stateFile).catch(() => {});
    lock = await open(lockFile, 'wx');
    await lock.writeFile(String(process.pid));
  }

  const version = await applicationVersion();
  const { markWorkspaceVersion, prepareWorkspace } = await import(
    pathToFileURL(workspaceUpgradeModule())
  );
  const upgrade = await prepareWorkspace(workspace, version);
  const { createLocalApp } = await import(pathToFileURL(localServerModule()));
  const core = await createLocalApp({
    staticDir: staticDirectory(),
    workspace,
  });
  const corePort = await listen(core, '127.0.0.1');
  let mobile;
  let closing = false;

  const mobileStatus = () => ({
    available: privateIpv4Addresses().length > 0,
    enabled: Boolean(mobile),
    urls: mobile?.urls ?? [],
  });

  const startMobile = async () => {
    if (mobile) return mobileStatus();
    const addresses = privateIpv4Addresses();
    if (addresses.length === 0) throw new Error('没有找到可用的局域网地址。');
    const token = randomBytes(24).toString('base64url');
    const gateway = createServer((req, res) => {
      const url = new URL(req.url, 'http://juai.local');
      if (url.pathname === '/_juai/connect' && req.method === 'GET') {
        const provided = url.searchParams.get('token') || '';
        if (!sameSecret(provided, token))
          return sendJson(res, { error: '手机访问链接已失效。' }, 403);
        res.writeHead(302, {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'Set-Cookie': `juai_mobile=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
          Location: '/welcome',
        });
        return res.end();
      }
      const provided = cookieValue(req.headers.cookie, 'juai_mobile');
      if (!sameSecret(provided, token))
        return sendJson(
          res,
          { error: '请先使用 JUAI 生成的手机访问链接。' },
          403,
        );
      if (
        url.pathname === '/api/japangrad/runtime/browser' &&
        req.method === 'GET'
      )
        return sendJson(res, {
          browserMode: true,
          mobile: { available: true, enabled: true, urls: [] },
          remote: true,
          version,
          workspace: '电脑本地工作区',
        });
      if (url.pathname.startsWith('/api/japangrad/runtime'))
        return sendJson(res, { error: '运行管理仅能在电脑上使用。' }, 403);
      proxyToCore(req, res, corePort);
    });
    const port = await listen(gateway, '0.0.0.0');
    const urls = addresses.map(
      (address) =>
        `http://${address}:${port}/_juai/connect?token=${encodeURIComponent(token)}`,
    );
    mobile = { gateway, token, urls };
    return mobileStatus();
  };

  const stopMobile = async () => {
    if (mobile) await closeServer(mobile.gateway);
    mobile = undefined;
    return mobileStatus();
  };

  let localPort;
  let localOrigin;
  const local = createServer(async (req, res) => {
    try {
      if (!isLoopback(req.socket.remoteAddress))
        return sendJson(res, { error: '仅允许本机访问。' }, 403);
      const host = req.headers.host;
      if (![`127.0.0.1:${localPort}`, `localhost:${localPort}`].includes(host))
        return sendJson(res, { error: '请求主机不受信任。' }, 403);
      const url = new URL(req.url, localOrigin);
      if (
        url.pathname === '/api/japangrad/runtime/browser' &&
        req.method === 'GET'
      )
        return sendJson(res, {
          browserMode: true,
          mobile: mobileStatus(),
          origin: localOrigin,
          backup: upgrade.backup,
          version,
          workspace,
        });
      if (
        url.pathname === '/api/japangrad/runtime/mobile' &&
        req.method === 'POST'
      ) {
        if (req.headers['x-japangrad-client'] !== '1')
          return sendJson(res, { error: '缺少本地工作台请求标识。' }, 403);
        const input = await readJsonBody(req);
        return sendJson(
          res,
          input.enabled ? await startMobile() : await stopMobile(),
        );
      }
      if (
        url.pathname === '/api/japangrad/runtime/shutdown' &&
        req.method === 'POST'
      ) {
        if (req.headers['x-japangrad-client'] !== '1')
          return sendJson(res, { error: '缺少本地工作台请求标识。' }, 403);
        sendJson(res, { closing: true });
        setTimeout(() => void shutdown(), 50).unref();
        return;
      }
      proxyToCore(req, res, corePort);
    } catch (error) {
      sendJson(res, { error: error.message || '运行管理请求失败。' }, 400);
    }
  });
  localPort = await listen(local, '127.0.0.1');
  localOrigin = `http://127.0.0.1:${localPort}`;

  async function shutdown() {
    if (closing) return;
    closing = true;
    await stopMobile().catch(() => {});
    await closeServer(local).catch(() => {});
    core.emit('japangrad:shutdown');
    await closeServer(core).catch(() => {});
    await lock.close().catch(() => {});
    await unlink(stateFile).catch(() => {});
    await unlink(lockFile).catch(() => {});
  }

  try {
    await markWorkspaceVersion(workspace, version);
    await writeFile(
      stateFile,
      JSON.stringify(
        {
          origin: localOrigin,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } catch (error) {
    await shutdown();
    throw error;
  }
  const browser = launchBrowser
    ? await openBrowser(`${localOrigin}/welcome`)
    : '未自动打开';
  const cleanup = () =>
    void shutdown().finally(() => {
      process.exitCode = 0;
    });
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  return {
    browser,
    existing: false,
    mobileStatus,
    origin: localOrigin,
    shutdown,
    startMobile,
    stopMobile,
    workspace,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startJuaiBrowser({
    launchBrowser: process.env.JUAI_NO_BROWSER !== '1',
  }).catch((error) => {
    // The native wrapper has no console, so persist startup failures beside user data.
    const message = `${new Date().toISOString()} ${error.stack || error.message}\n`;
    const workspace =
      process.env.JAPANGRAD_WORKSPACE ||
      path.join(homedir(), 'Documents', 'JapanGradWorkspace');
    mkdir(path.join(workspace, 'logs'), { recursive: true })
      .then(() =>
        import('node:fs/promises').then(({ appendFile }) =>
          appendFile(path.join(workspace, 'logs/juai-browser.log'), message),
        ),
      )
      .finally(() => {
        process.exitCode = 1;
      });
  });
}

export { openBrowser, privateIpv4Addresses, startJuaiBrowser };
