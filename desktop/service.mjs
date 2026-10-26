import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createLocalApp } from './local-server/server.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.JAPANGRAD_WORKSPACE || !process.send)
  throw new Error('请通过 JUAI 桌面应用启动服务。');

const server = await createLocalApp({
  workspace: process.env.JAPANGRAD_WORKSPACE,
  staticDir: path.join(directory, 'web'),
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.emit('japangrad:shutdown');
  server.close(() => {
    if (process.connected) process.disconnect();
  });
  server.closeAllConnections();
  // oxlint-disable-next-line unicorn/no-process-exit -- A stuck isolated service must not survive its desktop parent.
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('message', (message) => {
  if (message?.type === 'shutdown') shutdown();
});
process.on('disconnect', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.on('error', (error) => {
  process.send?.({ type: 'startup-error', message: error.message });
  shutdown();
});
server.listen(0, '127.0.0.1', () => {
  process.send?.({
    type: 'ready',
    origin: `http://127.0.0.1:${server.address().port}`,
  });
});
