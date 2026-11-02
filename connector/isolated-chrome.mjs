import { chromium } from 'playwright-core';
import WebSocket from 'ws';

// Keep Playwright away from existing tabs: only forward targets created by this
// connection. This transport stays in memory and exposes no listening endpoint.
export async function connectIsolatedChrome(endpoint, options) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('等待 Chrome 授权超时'));
    }, options.timeout || 60_000);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  const creating = new Set();
  const requests = new Map();
  const sessions = new Set();
  const targets = new Set();
  const waiting = [];
  let internalId = -1;
  const detach = (message) =>
    socket.send(
      JSON.stringify({
        id: internalId--,
        method: 'Target.detachFromTarget',
        params: { sessionId: message.params.sessionId },
      }),
    );
  const forward = (message) => transport.onmessage?.(message);
  const attach = (message) => {
    if (
      targets.has(message.params.targetInfo.targetId) ||
      sessions.has(message.sessionId)
    ) {
      sessions.add(message.params.sessionId);
      forward(message);
    } else if (creating.size > 0) waiting.push(message);
    else detach(message);
  };
  const transport = {
    send(message) {
      if (message.method === 'Target.createTarget') creating.add(message.id);
      requests.set(message.id, message.method);
      if (message.method === 'Target.setAutoAttach' && !message.sessionId)
        message = {
          ...message,
          params: { ...message.params, waitForDebuggerOnStart: false },
        };
      if (
        message.method === 'Target.closeTarget' &&
        !targets.has(message.params.targetId)
      ) {
        queueMicrotask(() =>
          forward({
            id: message.id,
            error: { code: -32_000, message: 'Not a connector tab' },
          }),
        );
        return;
      }
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    },
  };
  socket.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString());
    if (message.id < 0) return;
    if (message.id) {
      const method = requests.get(message.id);
      requests.delete(message.id);
      if (method === 'Target.createTarget') {
        creating.delete(message.id);
        if (message.result?.targetId) targets.add(message.result.targetId);
        forward(message);
        for (const event of waiting.splice(0)) attach(event);
        return;
      }
      if (method === 'Target.getTargets' && message.result)
        message.result.targetInfos = message.result.targetInfos.filter((t) =>
          targets.has(t.targetId),
        );
      forward(message);
      return;
    }
    if (message.method === 'Target.attachedToTarget') {
      attach(message);
      return;
    }
    if (message.sessionId && !sessions.has(message.sessionId)) return;
    if (
      message.method === 'Target.detachedFromTarget' &&
      !sessions.delete(message.params.sessionId)
    )
      return;
    if (
      message.params?.targetInfo &&
      !targets.has(message.params.targetInfo.targetId)
    )
      return;
    forward(message);
  });
  socket.on('close', () => transport.onclose?.());
  socket.on('error', () => transport.onclose?.('Chrome disconnected'));
  try {
    return await chromium.connectOverCDP(transport, options);
  } catch (error) {
    socket.close();
    throw error;
  }
}
