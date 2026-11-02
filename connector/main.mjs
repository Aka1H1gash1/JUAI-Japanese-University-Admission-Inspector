import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  collectionUrl,
  createCollectionBrowser,
} from '../local-server/collection-web.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const home =
  process.env.JUAI_CONNECTOR_DATA ||
  path.join(homedir(), 'Library/Application Support/JUAIConnector');
await mkdir(home, { recursive: true, mode: 0o700 });
await chmod(home, 0o700);
const credentialFile = path.join(home, 'device.json');
let config = {
  server: process.env.JUAI_CONNECTOR_SERVER || 'https://gotojuai.online',
};
try {
  config = { ...config, ...JSON.parse(await readFile(credentialFile, 'utf8')) };
} catch {}
const bridge = createCollectionBrowser();
bridge.attachments = true;
let authorized = false;
let chromeVersion = '';
let connected = false;
let lastError = '';
let pairing;
let stopping = false;
let ws;
const active = new Map();
const approvals = new Map();
const allowed = new Set();
function emit(value) {
  if (ws?.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ ...value, protocol: 1 }));
}
async function call(route, data, headers = {}) {
  const response = await fetch(config.server + route, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || `服务器返回 ${response.status}`);
  return value;
}
function validateServer(raw) {
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(
        process.env.JUAI_CONNECTOR_DEV === '1' &&
        url.protocol === 'http:' &&
        url.hostname === '127.0.0.1'
      ))
  )
    throw new Error('请填写公网 HTTPS 服务器地址');
  return url.origin;
}
async function save() {
  await writeFile(credentialFile, JSON.stringify(config), { mode: 0o600 });
  await chmod(credentialFile, 0o600);
}
async function pair(server) {
  config = { server: validateServer(server) };
  pairing = await call('/connector/pair/start', {
    name: `${process.platform} Chrome · ${process.arch}`,
  });
  lastError = '';
}
async function connectChrome(port = 0) {
  const state = await bridge.configure(port);
  const match = state.name.match(/(\d+)\./);
  if (!match || Number(match[1]) < 144) {
    authorized = false;
    throw new Error('请升级到 Chrome 144 或更新版本，以授权连接日常浏览器');
  }
  authorized = state.available;
  chromeVersion = state.name;
  lastError = '';
  heartbeat();
}
async function heartbeat() {
  try {
    const state = await bridge.status();
    authorized = state.available;
    if (state.available) chromeVersion = state.name;
  } catch {
    authorized = false;
  }
  emit({
    type: 'status',
    version: '0.1.0',
    chromeAuthorized: authorized,
    chromeVersion,
  });
}
async function permit(origin, id, signal) {
  if (allowed.has(origin)) return;
  return new Promise((resolve, reject) => {
    const abort = () => {
      approvals.delete(id);
      reject(new Error('任务已取消'));
    };
    signal.addEventListener('abort', abort, { once: true });
    approvals.set(id, {
      origin,
      resolve: () => {
        signal.removeEventListener('abort', abort);
        allowed.add(origin);
        approvals.delete(id);
        resolve();
      },
      reject: () => {
        signal.removeEventListener('abort', abort);
        approvals.delete(id);
        reject(new Error('用户拒绝此站点'));
      },
    });
  });
}
async function readTask(task) {
  if (
    task.protocol !== 1 ||
    task.type !== 'read' ||
    typeof task.id !== 'string' ||
    typeof task.attempt !== 'string' ||
    typeof task.uploadToken !== 'string' ||
    !Array.isArray(task.allowedOrigins) ||
    task.expires < Date.now() ||
    task.expires > Date.now() + 180_000
  )
    throw new Error('任务协议或有效期不正确');
  const url = collectionUrl(task.url);
  const origin = new URL(url).origin;
  if (!task.allowedOrigins.includes(origin))
    throw new Error('任务目标不在授权范围');
  if (active.has(task.id)) return;
  const controller = new AbortController();
  active.set(task.id, controller);
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(1, task.expires - Date.now()),
  );
  emit({ type: 'ack', id: task.id, attempt: task.attempt });
  try {
    if (!authorized) throw new Error('Chrome 尚未授权');
    await permit(origin, task.id, controller.signal);
    const result = await bridge.read(url, controller.signal);
    controller.signal.throwIfAborted();
    if (new URL(result.url).origin !== origin)
      throw new Error('目标跨站跳转，需要重新确认站点');
    const bytes =
      result.kind === 'pdf'
        ? result.bytes
        : Buffer.from(
            JSON.stringify({
              title: result.title,
              text: result.text,
              links: result.links,
              truncated: result.truncated,
            }),
          );
    if (bytes.length > Math.min(task.maxBytes || 0, 40 * 1024 * 1024))
      throw new Error('任务结果超过上限');
    const response = await fetch(`${config.server}/connector/result`, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.credential}`,
        'Content-Type':
          result.kind === 'pdf' ? 'application/pdf' : 'application/json',
        'X-Upload-Token': task.uploadToken,
        'X-Result-Meta': Buffer.from(
          JSON.stringify({
            id: task.id,
            attempt: task.attempt,
            result: { kind: result.kind, url: result.url, title: result.title },
          }),
        ).toString('base64url'),
      },
      body: bytes,
    });
    if (!response.ok) throw new Error(`结果被服务器拒绝：${response.status}`);
  } catch (error) {
    lastError = error.message;
    emit({
      type: 'failed',
      id: task.id,
      attempt: task.attempt,
      error: error.message,
    });
  } finally {
    clearTimeout(timer);
    active.delete(task.id);
    approvals.delete(task.id);
  }
}
function connect() {
  if (
    stopping ||
    !config.credential ||
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  )
    return;
  const target = `${config.server.replace(/^http/, 'ws')}/connector/ws`;
  ws = new WebSocket(target, {
    headers: { Authorization: `Bearer ${config.credential}` },
    maxPayload: 65_536,
  });
  ws.on('open', () => {
    connected = true;
    lastError = '';
    heartbeat();
  });
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'hello' && m.protocol !== 1)
        throw new Error('请升级连接器');
      if (m.type === 'read')
        void readTask(m).catch((error) => {
          lastError = error.message;
        });
      if (m.type === 'cancel') active.get(m.id)?.abort();
    } catch (error) {
      lastError = error.message;
    }
  });
  ws.on('close', (code) => {
    connected = false;
    for (const c of active.values()) c.abort();
    if (code === 4003) {
      lastError = '设备已撤销，请重新配对';
      config.credential = '';
      void save();
    }
  });
  ws.on('error', (e) => {
    lastError = e.message;
  });
}
const poll = setInterval(async () => {
  try {
    if (pairing) {
      if (pairing.expires < Date.now()) {
        pairing = null;
        lastError = '配对码已过期';
        return;
      }
      const result = await call('/connector/pair/poll', {
        id: pairing.id,
        secret: pairing.secret,
      });
      if (result.credential) {
        config = { server: config.server, ...result };
        pairing = null;
        await save();
        connect();
      }
    } else connect();
    heartbeat();
  } catch (error) {
    lastError = error.message;
  }
}, 5000);
let localOrigin;
const localToken = randomBytes(24).toString('base64url');
const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JUAI Chrome 连接器</title><style>body{font:14px system-ui;background:#f2f7fb;color:#2f4359;margin:30px auto;padding:20px;max-width:650px}section{background:white;padding:24px;border:1px solid #d6e2ec;border-radius:12px;margin:16px 0}input,button{font:inherit;padding:10px;border:1px solid #c4d4e4;border-radius:8px}input{width:90%}button{background:#edf4fa;cursor:pointer;margin:8px 8px 8px 0}small{color:#6e8195;line-height:1.8}#code{font-size:36px;letter-spacing:.2em}#error{color:#a83a39}p{line-height:1.8}</style><h1>JUAI Chrome 连接器</h1><small>协议 1 · 版本 0.1.0 · macOS Apple Silicon</small><section><h2>绑定到你的账号</h2><input id="server" placeholder="https://gotojuai.online"><button id="pair">生成配对码</button><p id="code"></p><p>登录网站的“设备连接”页，输入配对码并确认账号。</p></section><section><h2>授权本机 Chrome</h2><p>需要 Chrome 144 或更新版本。在 <b>chrome://inspect/#remote-debugging</b> 开启远程调试，然后点击连接，并在 Chrome 中允许。</p><button id="chrome">连接 Chrome</button><p id="status"></p><div id="approvals"></div></section><p id="error" role="status"></p><button id="exit">退出连接器</button><script>
const token=${JSON.stringify(localToken)};let initialized=false;
async function call(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Connector-Local':token},body:JSON.stringify(data||{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function action(id,path,data){document.getElementById(id).onclick=async()=>{try{await call(path,data());}catch(e){document.getElementById('error').textContent=e.message;}};}
action('pair','/pair',()=>({server:document.getElementById('server').value}));action('chrome','/chrome',()=>({}));action('exit','/exit',()=>({}));
async function refresh(){try{const d=await (await fetch('/status',{headers:{'X-Connector-Local':token}})).json();if(!initialized){document.getElementById('server').value=d.server;initialized=true;}document.getElementById('code').textContent=d.code||'';document.getElementById('status').textContent='设备：'+(d.paired?'已绑定':'未绑定')+' · 连接器：'+(d.online?'在线':'离线')+' · Chrome：'+(d.chromeAuthorized?'已授权':'未授权')+' '+d.chromeVersion;document.getElementById('error').textContent=d.error||'';const box=document.getElementById('approvals');box.replaceChildren();for(const a of d.approvals){const p=document.createElement('p');p.textContent='本次任务请求读取：'+a.origin;const b=document.createElement('button');b.textContent='允许此站点（本次运行）';b.onclick=()=>call('/approve',{id:a.id,allow:true});const n=document.createElement('button');n.textContent='拒绝';n.onclick=()=>call('/approve',{id:a.id,allow:false});p.append(b,n);box.append(p);}}catch(e){document.getElementById('error').textContent=e.message;}}
setInterval(refresh,1500);refresh();</script></html>`;
const server = createServer(async (req, res) => {
  const reply = (data, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.headers.host !== new URL(localOrigin).host)
      throw new Error('非法本机主机');
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(
        page
          .replace(
            '<button id="chrome">',
            '<details><summary>手动调试端口（可选）</summary><label>仅用于已开启独立调试端口的 Chrome，日常 Chrome 留空<input id="port" type="number" min="1" max="65535"></label></details><button id="chrome">',
          )
          .replace(
            "action('chrome','/chrome',()=>({}));",
            "action('chrome','/chrome',()=>({port:Number(document.getElementById('port').value)||0}));",
          ),
      );
    }
    if (
      req.headers['x-connector-local'] !== localToken ||
      (req.headers.origin && req.headers.origin !== localOrigin)
    )
      throw new Error('本机请求未授权');
    if (req.url === '/status')
      return reply({
        server: config.server,
        code: pairing?.code,
        paired: !!config.credential,
        online: connected,
        chromeAuthorized: authorized,
        chromeVersion,
        error: lastError,
        approvals: [...approvals].map(([id, v]) => ({ id, origin: v.origin })),
      });
    if (req.method !== 'POST') throw new Error('只支持固定操作');
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 8192) throw new Error('请求过大');
    }
    const b = JSON.parse(text || '{}');
    if (req.url === '/pair') {
      if (connected) ws.close();
      await pair(b.server);
      return reply({ ok: true });
    }
    if (req.url === '/chrome') {
      await connectChrome(Number(b.port) || 0);
      return reply({ ok: true });
    }
    if (req.url === '/approve') {
      const approval = approvals.get(b.id);
      if (!approval) throw new Error('授权请求已过期');
      b.allow ? approval.resolve() : approval.reject();
      return reply({ ok: true });
    }
    if (req.url === '/exit') {
      reply({ ok: true });
      setTimeout(() => void shutdown(), 100);
      return;
    }
    throw new Error('操作不存在');
  } catch (error) {
    lastError = error.message;
    reply({ error: error.message }, 400);
  }
});
async function shutdown() {
  stopping = true;
  clearInterval(poll);
  for (const c of active.values()) c.abort();
  ws?.close();
  await bridge.close();
  server.close();
  server.closeAllConnections();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
server.listen(
  Number(process.env.JUAI_CONNECTOR_PORT || 5790),
  '127.0.0.1',
  () => {
    localOrigin = `http://127.0.0.1:${server.address().port}`;
    console.warn(`JUAI Connector ${localOrigin}`);
    if (process.env.JUAI_NO_BROWSER !== '1') {
      const child = spawn(
        process.platform === 'darwin' ? 'open' : 'xdg-open',
        [localOrigin],
        { stdio: 'ignore', detached: true },
      );
      child.on('error', () => {});
      child.unref();
    }
    connect();
  },
);
